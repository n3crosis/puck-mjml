import { describe, expect, it } from "vitest";
import {
  analyzeEmailHtml,
  clientResults,
  compatibilityData,
  mainstreamClients,
  needsReview,
  supportFor,
  supportNotes,
} from "./analyze";

const slugs = (html: string) => analyzeEmailHtml(html).detected.map((item) => item.slug);
const feature = (slug: string) => compatibilityData.features.find((item) => item.slug === slug)!;

describe("static email compatibility inspection", () => {
  it("finds properties, values, shorthand, functions and units in compiled HTML", () => {
    const result = slugs(
      `<style>@media (prefers-color-scheme:dark) { .x:hover { display: inline-flex; gap: 1rem; width: calc(100vw - 2rem) } }</style><div style="border-radius:8px; margin-top:2px; background:linear-gradient(red,blue) url('photo.webp'); max-width:500px; --brand:red; color:var(--brand)"></div>`,
    );
    expect(result).toEqual(
      expect.arrayContaining([
        "html-style",
        "css-at-media",
        "css-at-media-prefers-color-scheme",
        "css-pseudo-class-hover",
        "css-display-flex",
        "css-gap",
        "css-unit-rem",
        "css-unit-vw",
        "css-unit-calc",
        "css-border-radius",
        "css-margin",
        "css-background-image",
        "css-linear-gradient",
        "css-max-width",
        "css-variables",
        "image-webp",
      ]),
    );
  });
  it("distinguishes CSS grid, flex and none, and handles uppercase HTML styles", () => {
    expect(
      slugs('<DIV STYLE="DISPLAY:GRID;grid-template-columns:1fr 1fr;column-gap:5px"></DIV>'),
    ).toEqual(expect.arrayContaining(["css-display-grid", "css-grid-template", "css-gap"]));
    expect(slugs('<div style="display:none"></div>')).toEqual(["css-display-none"]);
    expect(slugs('<div style="display:table"></div>')).not.toContain("css-display-flex");
  });
  it("ignores absent decorative effects and comment-only markup", () => {
    expect(
      slugs(
        '<!-- <img src="ignored.svg"> --><div style="border-radius:0; box-shadow:none; background-image:none; transform:initial"></div>',
      ),
    ).toEqual([]);
  });
  it("detects HTML attributes and image formats without inspecting arbitrary text", () => {
    expect(
      slugs(
        '<a href="#footer">Jump</a><a href="https://example.com/#external">Link</a><table background="bg.gif"><tr><td><img src="img.svg?q=1" srcset="img2.svg 2x"><img src="data:image/png;base64,AAAA"><svg/><video/><form/></td></tr></table>',
      ),
    ).toEqual(
      expect.arrayContaining([
        "html-anchor-links",
        "html-background",
        "image-gif",
        "image-svg",
        "html-srcset",
        "image-base64",
        "html-svg",
        "html-video",
        "html-form",
      ]),
    );
    expect(slugs('<p>border-radius:8px and photo.svg</p><script>"display:flex"</script>')).toEqual(
      [],
    );
  });
  it("does not treat comments, string contents or an external stylesheet URL as actual declarations", () => {
    const result = analyzeEmailHtml(
      '<link rel="stylesheet" href="https://example.invalid/css-display-grid.css"><style>/* display:grid */ .x { content:"display:flex"; }</style>',
    );
    expect(result.externalStylesheets).toBe(1);
    expect(result.detected.map((item) => item.slug)).toEqual(["html-style", "html-link"]);
  });
  it("reports incomplete CSS instead of silently calling the email safe", () => {
    const result = analyzeEmailHtml(
      '<style>.x { display:grid;</style><p style="opacity:.5">Text</p>',
    );
    expect(result.cssParseErrors).toBe(1);
    expect(result.detected.map((item) => item.slug)).toContain("css-opacity");
  });
  it("exposes fallback limitations without claiming to simulate Outlook or scan conditional-only HTML", () => {
    const result = analyzeEmailHtml(
      '<!--[if mso]><v:roundrect style="display:flex"><![endif]--><img src="image.png">',
    );
    expect(result.hasOutlookFallback).toBe(true);
    expect(result.detected).toEqual([]);
  });
  it("handles repeated comment openers without scanning the remaining source for each opener", () => {
    const html = "<!--".repeat(100_000);
    const start = performance.now();
    expect(analyzeEmailHtml(html).hasOutlookFallback).toBe(false);
    // A generous guard against quadratic rescanning of arbitrary email source.
    expect(performance.now() - start).toBeLessThan(2000);
    expect(
      analyzeEmailHtml("<!--[if !mso]><!--><p>Visible</p><!--<![endif]-->").hasOutlookFallback,
    ).toBe(true);
    expect(analyzeEmailHtml("<v:rect></v:rect>").hasOutlookFallback).toBe(true);
  });
  it("deduplicates feature results and bounds sample evidence", () => {
    const result = analyzeEmailHtml(
      Array.from({ length: 20 }, (_, n) => `<p style="border-radius:${n + 1}px">x</p>`).join(""),
    );
    const radius = result.detected.find((item) => item.slug === "css-border-radius")!;
    expect(radius.occurrences).toBe(20);
    expect(radius.evidence).toHaveLength(3);
    expect(radius.evidence.every((item) => item.length <= 160)).toBe(true);
  });
});

describe("pinned Can I email data", () => {
  it("retains provenance, real tested versions and upstream note references", () => {
    expect(compatibilityData.revision).toBe("cb8109c3f8658e003aa064b47a71b232ddc28d39");
    expect(compatibilityData.features).toHaveLength(56);
    expect(feature("css-border-radius").stats["outlook/windows"]).toEqual({
      version: "2019",
      code: "n #1",
    });
    expect(supportNotes(feature("css-border-radius"), "n #1")[0]).toContain("VML");
    expect(feature("css-display-flex").stats["gmail/ios"]).toEqual({
      version: "2026-03",
      code: "a #1",
    });
    expect(feature("css-display-flex").stats["outlook/macos"]?.version).toBe("16.80");
    for (const item of compatibilityData.features)
      for (const value of Object.values(item.stats)) {
        expect(value?.version).toBeTruthy();
        for (const number of value!.code.match(/#\d+/g) ?? [])
          expect(item.notesByNumber[number.slice(1)]).toBeTruthy();
      }
  });
  it("never treats missing or unknown data as supported", () => {
    expect([undefined, "u", "unexpected"].map(supportFor)).toEqual([
      "unknown",
      "unknown",
      "unknown",
    ]);
    expect(supportFor("a #1")).toBe("partial");
    expect(supportFor("y #1")).toBe("supported");
    const missing = { ...feature("css-border-radius"), stats: {} };
    expect(clientResults(missing, "outlook/windows")[0]?.support).toBe("unknown");
    expect(needsReview(missing, "outlook/windows")).toBe(true);
  });
  it("includes supported results with caveats in Needs review", () => {
    expect(needsReview(feature("css-display-flex"), "yahoo/desktop-webmail")).toBe(true);
    expect(needsReview(feature("css-border-radius"), "apple-mail/macos")).toBe(false);
  });
  it("limits the mainstream preset to the curated client/platform combinations", () => {
    expect(mainstreamClients.map(({ id }) => id)).toEqual([
      "apple-mail/ios",
      "apple-mail/macos",
      "gmail/android",
      "gmail/desktop-webmail",
      "gmail/mobile-webmail",
      "gmail/ios",
      "outlook/android",
      "outlook/outlook-com",
      "outlook/windows",
      "outlook/ios",
      "outlook/macos",
      "samsung-email/android",
      "yahoo/android",
      "yahoo/desktop-webmail",
      "yahoo/ios",
    ]);
    expect(clientResults(feature("css-border-radius"), "mainstream").map(({ id }) => id)).toEqual(
      mainstreamClients.map(({ id }) => id),
    );
  });
  it("ignores other providers in the mainstream review filter but keeps their optional results", () => {
    const supported = {
      ...feature("css-border-radius"),
      notes: "",
      stats: Object.fromEntries(
        mainstreamClients.map(({ id }) => [id, { version: "test", code: "y" }]),
      ),
    };
    expect(needsReview(supported, "mainstream")).toBe(false);
    expect(needsReview(supported, "")).toBe(true);
    expect(clientResults(supported, "ionos-1and1/android")[0]?.support).toBe("unknown");
    for (const code of ["n", "a", "u", "y #1", "y x"]) {
      const mainstreamIssue = {
        ...supported,
        stats: { ...supported.stats, "gmail/ios": { version: "test", code } },
      };
      expect(needsReview(mainstreamIssue, "mainstream")).toBe(true);
      expect(needsReview(mainstreamIssue, "apple-mail/macos")).toBe(false);
    }
    delete supported.stats["gmail/ios"];
    expect(needsReview(supported, "mainstream")).toBe(true);
    expect(
      clientResults(supported, "mainstream").find(({ id }) => id === "gmail/ios")?.support,
    ).toBe("unknown");
  });
  it("includes every recorded client and flags any client's review needs in the all-client view", () => {
    const radius = feature("css-border-radius");
    const all = clientResults(radius, "");
    expect(all.map(({ id }) => id)).toEqual(compatibilityData.clients.map(({ id }) => id));
    expect(all).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "outlook/windows", support: "unsupported" }),
        expect.objectContaining({ id: "gmail/desktop-webmail", support: "supported" }),
        expect.objectContaining({ id: "apple-mail/macos", support: "supported" }),
      ]),
    );
    expect(needsReview(radius, "")).toBe(true);
    const supported = {
      ...radius,
      notes: "",
      stats: Object.fromEntries(
        compatibilityData.clients.map(({ id }) => [id, { version: "test", code: "y" }]),
      ),
    };
    expect(needsReview(supported, "")).toBe(false);
    for (const code of ["n", "a", "u", "y #1", "y x"]) {
      const changed = {
        ...supported,
        stats: { ...supported.stats, "gmail/ios": { version: "test", code } },
      };
      expect(needsReview(changed, "apple-mail/macos")).toBe(false);
      expect(needsReview(changed, "")).toBe(true);
    }
    delete supported.stats["gmail/ios"];
    expect(clientResults(supported, "").find(({ id }) => id === "gmail/ios")?.support).toBe(
      "unknown",
    );
    expect(needsReview(supported, "")).toBe(true);
  });
});
