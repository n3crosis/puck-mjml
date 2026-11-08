import { readFileSync } from "node:fs";
import { load, type CheerioAPI } from "cheerio";
import { parse } from "postcss";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { fromMjml } from "../import";
import { toMjml } from "../export";

beforeAll(() => vi.stubGlobal("window", globalThis));
afterAll(() => vi.unstubAllGlobals());

const names = [
  "activation",
  "feature-announcement",
  "password-reset",
  "product-update",
  "subscription-confirmation",
  "subscription-update",
  "text-only",
  "welcome",
];
const normalize = (text: string) => text.replace(/\s+/g, " ").trim();
function declarations(style: string | undefined) {
  const result: Record<string, string> = {};
  parse(`element { ${style ?? ""} }`).walkDecls((declaration) => {
    result[declaration.prop] = declaration.value;
  });
  return result;
}
function pixels(value: string, size = 16) {
  if (value.endsWith("rem")) return parseFloat(value) * 16;
  if (value.endsWith("%")) return (parseFloat(value) * size) / 100;
  if (value.endsWith("px")) return parseFloat(value);
  return parseFloat(value) * size;
}
function cssValue($: CheerioAPI, selector: string, property: string) {
  let value: string | undefined;
  parse($("style").text()).walkRules((rule) => {
    if (
      rule.selector
        .split(",")
        .map((item) => item.trim())
        .includes(selector)
    ) {
      rule.walkDecls(property, (declaration) => {
        value = declaration.value;
      });
    }
  });
  return value;
}
function reference(name: string) {
  return load(
    readFileSync(
      new URL(`../../.cache/react-email-reference/03-Protocol/${name}.html`, import.meta.url),
      "utf8",
    ),
  );
}
async function compile(name: string, roundTrip: boolean) {
  const source = readFileSync(
    new URL(`../../templates/03-Protocol/${name}.mjml`, import.meta.url),
    "utf8",
  );
  expect(source).not.toMatch(/<mj-(?:raw|include)\b/);
  const imported = fromMjml(source);
  expect(imported.warnings).toEqual([]);
  const { default: mjml } = await import("mjml-browser");
  const result = await mjml(roundTrip ? toMjml(imported.document) : source, {
    validationLevel: "strict",
  });
  expect(result.errors).toEqual([]);
  return load(result.html);
}
function paragraph($: CheerioAPI, text: string) {
  const found = $("p").filter((_index, node) => normalize($(node).text()) === normalize(text));
  expect(found).toHaveLength(1);
  return found;
}

// Source-backed regressions for all 16 desktop/mobile Protocol triptychs reviewed
// at ffee2e9. Geometry comes from native MJML; no trusted HTML or renderer overrides.
describe.each([false, true])("Protocol design, editor round trip: %s", (roundTrip) => {
  it("preserves the intentional readable adaptation of the original welcome assistance color", async () => {
    const original = reference("welcome");
    const rendered = await compile("welcome", roundTrip);
    const originalCopy = original("p").filter((_index, node) =>
      normalize(original(node).text()).startsWith("If you need help getting started"),
    );
    expect(originalCopy).toHaveLength(1);
    expect(declarations(originalCopy.attr("style")).color).toBe("rgb(74,74,74)");
    expect(declarations(originalCopy.find("a").attr("style")).color).toBe("rgb(74,74,74)");
    const renderedCopy = rendered(".dither-welcome-assist-copy > div");
    expect(renderedCopy).toHaveLength(1);
    expect(normalize(renderedCopy.text())).toBe(normalize(originalCopy.text()));
    // The original muted color fails normal-text contrast on #131313. Keep the
    // accessible fg-3 adaptation; template-contrast.test.ts verifies >= 4.5:1.
    expect(declarations(renderedCopy.attr("style")).color.toLowerCase()).toBe("#818181");
    expect(declarations(renderedCopy.find("a").attr("style")).color).toBe("inherit");
  });

  it("keeps all feature benefit rows dark with vertically centered desktop columns", async () => {
    const original = reference("feature-announcement");
    const rendered = await compile("feature-announcement", roundTrip);
    const rows = rendered(".dither-feature-benefit-first, .dither-feature-benefit");
    expect(rows).toHaveLength(3);
    for (const label of ["Less manual work", "Clear focus", "Better alignment"]) {
      const text = paragraph(original, label);
      expect(declarations(text.parent().attr("style"))["vertical-align"]).toBe("middle");
      const backgrounds = text
        .parents()
        .toArray()
        .map((node) => declarations(original(node).attr("style"))["background-color"]);
      expect(backgrounds).toContain("rgb(19,19,19)");
    }
    rows.each((_index, node) => {
      const row = rendered(node);
      expect(declarations(row.attr("style")).background.toLowerCase()).toContain("#131313");
      for (const selector of [".dither-benefit-image", ".dither-benefit-copy"]) {
        expect(declarations(row.find(selector).attr("style"))["vertical-align"]).toBe("middle");
      }
    });
  });

  it.each([
    ["welcome", "welcome"],
    ["subscription-confirmation", "confirm"],
  ])("restores %s onboarding heading margins and row bottom spacing", async (name, prefix) => {
    const original = reference(name);
    const rendered = await compile(name, roundTrip);
    const rows = rendered(`.dither-${prefix}-row`);
    expect(rows).toHaveLength(2);
    for (const [index, label] of ["Set up your workspace", "Invite your team"].entries()) {
      const originalHeading = paragraph(original, label);
      const originalStyle = declarations(originalHeading.attr("style"));
      const originalRowStyle = declarations(originalHeading.parent().attr("style"));
      expect(originalStyle["margin-top"]).toBe("16px");
      expect(pixels(originalRowStyle["padding-bottom"])).toBe(40);
      const row = rows.eq(index);
      expect(declarations(row.find("table > tbody > tr > td").first().attr("style")).padding).toBe(
        "40px 24px 40px",
      );
      const heading = row.find(".pm-email-text").first();
      expect(declarations(heading.attr("style")).padding).toBe("16px 0px 0px");
    }
    const originalMobilePadding = cssValue(original, ".mobile_py-8", "padding-bottom");
    expect(pixels(originalMobilePadding!)).toBe(32);
    expect(cssValue(rendered, `.dither-${prefix}-row > table > tbody > tr > td`, "padding")).toBe(
      "32px 16px 32px",
    );
  });

  it.each(["feature-announcement", "product-update"])(
    "preserves %s Smart Tasks white emphasis and muted remainder",
    async (name) => {
      const original = reference(name);
      const rendered = await compile(name, roundTrip);
      const copy = rendered(".dither-smart-copy > div");
      expect(copy).toHaveLength(1);
      const originalCopy = paragraph(original, copy.text());
      const spans = originalCopy.find("span");
      expect(spans).toHaveLength(2);
      expect(declarations(spans.eq(0).attr("style")).color).toBe("rgb(255,255,255)");
      expect(declarations(spans.eq(1).attr("style")).color).toBe("rgb(129,129,129)");
      expect(declarations(copy.attr("style")).color).toBe("#818181");
      const emphasis = copy.find("strong");
      expect(emphasis).toHaveLength(1);
      expect(normalize(emphasis.text())).toBe(normalize(spans.eq(0).text()));
      expect(declarations(emphasis.attr("style")).color.toLowerCase()).toBe("#ffffff");
      expect(declarations(emphasis.attr("style"))["font-weight"]).toBe("inherit");
      expect(declarations(copy.attr("style"))["font-weight"]).toBe("500");
    },
  );

  it.each([
    ["text-only", "note", "490px", 5],
    ["subscription-update", "renew", "480px", 2],
    ["subscription-confirmation", "confirm", "490px", 3],
  ] as const)(
    "preserves %s paragraph width caps and mobile expansion",
    async (name, prefix, width, count) => {
      const original = reference(name);
      const rendered = await compile(name, roundTrip);
      const copies = rendered(`.dither-${prefix}-body-copy > div`);
      expect(copies).toHaveLength(count);
      copies.each((_index, node) => {
        const originalCopy = paragraph(original, rendered(node).text());
        const originalWidths = [originalCopy[0], ...originalCopy.parents().toArray()].map(
          (ancestor) => declarations(original(ancestor).attr("style"))["max-width"],
        );
        expect(originalWidths).toContain(width);
        expect(declarations(rendered(node).attr("style"))["max-width"]).toBe(width);
      });
      expect(cssValue(original, ".mobile_imprtntmax-w-full", "max-width")).toBe("100%");
      expect(cssValue(rendered, `.dither-${prefix}-body-copy > div`, "max-width")).toBe("100%");
    },
  );

  it("keeps the feature testimonial border inside the original content gutters", async () => {
    const original = reference("feature-announcement");
    const rendered = await compile("feature-announcement", roundTrip);
    const originalQuote = paragraph(
      original,
      '"Smart Tasks helps me know what to do next without thinking about it."',
    );
    expect(pixels(declarations(originalQuote.parent().attr("style"))["padding-left"])).toBe(40);
    expect(pixels(cssValue(original, ".mobile_px-6", "padding-left")!)).toBe(24);
    expect(pixels(cssValue(original, ".mobile_px-4", "padding-left")!)).toBe(16);
    const gutter = rendered(".dither-quote-gutter");
    expect(gutter).toHaveLength(1);
    expect(declarations(gutter.find("table > tbody > tr > td").first().attr("style")).padding).toBe(
      "0px 24px",
    );
    const quote = gutter.find(".dither-quote-box");
    expect(quote).toHaveLength(1);
    expect(declarations(quote.attr("style"))["max-width"]).toBe("592px");
    expect(declarations(quote.find("table > tbody > tr > td").first().attr("style")).padding).toBe(
      "80px 40px",
    );
    expect(cssValue(rendered, ".dither-quote-gutter > table > tbody > tr > td", "padding")).toBe(
      "0px 16px",
    );
    expect(cssValue(rendered, ".dither-quote-box > table > tbody > tr > td", "padding")).toBe(
      "48px 24px",
    );
  });

  it.each([
    ["activation", "Confirm Email", 1],
    ["password-reset", "Create New Password", 1],
    ["subscription-update", "Manage subscription", 1],
    ["subscription-confirmation", "Open Dither", 1],
    ["feature-announcement", "Explore Smart Tasks", 2],
  ] as const)(
    "preserves %s solid button label leading and 46px height",
    async (name, label, count) => {
      const original = reference(name);
      const rendered = await compile(name, roundTrip);
      const originalButtons = original("a").filter(
        (_index, node) =>
          normalize(original(node).text()) === label &&
          Boolean(declarations(original(node).attr("style"))["background-color"]),
      );
      const renderedButtons = rendered("a").filter(
        (_index, node) =>
          normalize(rendered(node).text()) === label &&
          Boolean(declarations(rendered(node).attr("style")).background),
      );
      expect(originalButtons).toHaveLength(count);
      expect(renderedButtons).toHaveLength(count);
      renderedButtons.each((index, node) => {
        const originalButton = originalButtons.eq(index);
        const originalLabel = originalButton
          .find("span")
          .filter((_index, span) => normalize(original(span).text()) === label);
        expect(originalLabel).toHaveLength(1);
        const originalStyle = declarations(originalButton.attr("style"));
        const labelLeading = pixels(declarations(originalLabel.attr("style"))["line-height"], 15);
        const style = declarations(rendered(node).attr("style"));
        expect(labelLeading).toBe(18);
        expect(pixels(style["line-height"], 15)).toBe(labelLeading);
        expect(style.padding).toBe("14px 20px");
        expect(
          pixels(originalStyle["padding-top"]) +
            labelLeading +
            pixels(originalStyle["padding-bottom"]),
        ).toBe(46);
      });
    },
  );

  it.each(names)("preserves %s full-width footer rule", async (name) => {
    const original = reference(name);
    const rendered = await compile(name, roundTrip);
    const originalCopy = original("p").filter((_index, node) =>
      original(node).text().startsWith("Dither helps teams"),
    );
    expect(originalCopy).toHaveLength(1);
    const originalBorder = originalCopy
      .parents("table")
      .filter(
        (_index, node) => declarations(original(node).attr("style"))["border-top-width"] === "1px",
      );
    expect(originalBorder).toHaveLength(1);
    const rule = rendered(".dither-footer-rule");
    expect(rule).toHaveLength(1);
    expect(declarations(rule.attr("style"))["max-width"]).toBe("640px");
    expect(declarations(rule.find("table > tbody > tr > td").first().attr("style")).padding).toBe(
      "0px",
    );
    expect(cssValue(rendered, ".dither-footer-rule > table > tbody > tr > td", "padding")).toBe(
      "0px",
    );
  });

  it("left-aligns the 560px product showcase image without changing its mobile fluid sizing", async () => {
    const original = reference("product-update");
    const rendered = await compile("product-update", roundTrip);
    const selector = 'img[src$="/dither-image-7.png"]';
    const originalImage = original(selector);
    const renderedImage = rendered(selector);
    expect(originalImage).toHaveLength(1);
    expect(renderedImage).toHaveLength(1);
    expect(originalImage.attr("width")).toBe("560");
    expect(renderedImage.attr("width")).toBe(originalImage.attr("width"));
    expect(declarations(originalImage.attr("style"))["margin-left"]).not.toBe("auto");
    expect(renderedImage.closest("table").parent().attr("align")).toBe("left");
    expect(cssValue(rendered, ".dither-img-fluid img", "width")).toBe("100%");
  });
});
