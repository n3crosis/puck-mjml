import { readFileSync } from "node:fs";
import { load, type CheerioAPI } from "cheerio";
import { parse } from "postcss";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { scopeDocumentCss } from "../canvas-css";
import { toMjml } from "../export";
import { fromMjml } from "../import";

beforeAll(() => vi.stubGlobal("window", globalThis));
afterAll(() => vi.unstubAllGlobals());

const normalize = (text: string) => text.replace(/\s+/g, " ").trim();
const pixels = (value: string) => parseFloat(value) * (value.endsWith("rem") ? 16 : 1);

function reference(family: string, name: string) {
  return load(
    readFileSync(
      new URL(`../../.cache/react-email-reference/${family}/${name}.html`, import.meta.url),
      "utf8",
    ),
  );
}

function text($: CheerioAPI, selector: string, content: string) {
  const found = $(selector).filter((_index, node) => normalize($(node).text()) === content);
  expect(found).toHaveLength(1);
  return found;
}

function mobileCss($: CheerioAPI, selector: string, property: string) {
  const values: string[] = [];
  parse($("style").text()).walkAtRules("media", (media) => {
    if (!/max-width:\s*600px/.test(media.params)) return;
    media.walkRules((rule) => {
      if (rule.selectors.includes(selector))
        rule.walkDecls(property, (declaration) => {
          values.push(declaration.value);
        });
    });
  });
  expect(values.length).toBeLessThanOrEqual(1);
  return values[0];
}

function paddingBridge($: CheerioAPI, className: string, property: string, expected: number) {
  const scoped = scopeDocumentCss([{ css: $("style").text(), inline: "head" }], {
    scope: "commerce-spacing",
  });
  const values: string[] = [];
  parse(scoped.css).walkRules((rule) => {
    if (rule.selector.includes(`.${className}[data-pm-mjml-padding="self"]`))
      rule.walkDecls(property, (declaration) => {
        values.push(declaration.value);
      });
  });
  expect(values).toEqual([`${expected}px`]);
}

async function compile(family: string, name: string, roundTrip: boolean) {
  const source = readFileSync(
    new URL(`../../templates/${family}/${name}.mjml`, import.meta.url),
    "utf8",
  );
  const imported = fromMjml(source);
  expect(imported.warnings).toEqual([]);
  const input = roundTrip ? toMjml(imported.document) : source;
  expect(input).not.toMatch(/<mj-(?:raw|include)\b/);
  const { default: mjml } = await import("mjml-browser");
  const result = await mjml(input, { validationLevel: "strict" });
  expect(result.errors).toEqual([]);
  return load(result.html);
}

// Geometry comes from the pinned, immutable React Email HTML, not an updated MJML snapshot.
describe.each([false, true])("commerce source spacing, editor round trip: %s", (roundTrip) => {
  it.each(["welcome", "promo"])("keeps Studio %s mobile headline edge-to-edge", async (name) => {
    const original = reference("05-Studio", name);
    const rendered = await compile("05-Studio", name, roundTrip);
    const heading = original("p").filter(
      (_index, node) => original(node).css("font-size") === "48px",
    );
    expect(heading).toHaveLength(1);
    expect(heading.css("max-width")).toBe("440px");
    expect(pixels(heading.closest("td").css("padding-left")!)).toBe(0);
    const selector = ".studio-headline-section > table > tbody > tr > td";
    expect(rendered(selector).css("padding")).toBe("0px 24px 80px");
    for (const edge of ["left", "right"]) {
      expect(mobileCss(rendered, selector, `padding-${edge}`)).toBe("0px");
      paddingBridge(rendered, "studio-headline-section", `padding-${edge}`, 0);
    }
    expect(rendered(".studio-headline > div").css("max-width")).toBe(heading.css("max-width"));
  });

  it("keeps Studio welcome lower content at the source 32px mobile inset", async () => {
    const original = reference("05-Studio", "welcome");
    const rendered = await compile("05-Studio", "welcome", roundTrip);
    const heading = text(original, "p", "Your personal AI companion, wrapped around your finger.");
    const outer = heading
      .parents("td")
      .filter((_index, node) => original(node).css("padding-left") === "2rem");
    expect(outer).toHaveLength(1);
    const inset = pixels(outer.css("padding-left")!);
    expect(inset).toBe(32);
    const selector = ".studio-welcome-content > table > tbody > tr > td";
    expect(rendered(selector).css("padding")).toBe("32px 86px 96px");
    for (const edge of ["left", "right"]) {
      expect(mobileCss(rendered, selector, `padding-${edge}`)).toBe(`${inset}px`);
      paddingBridge(rendered, "studio-welcome-content", `padding-${edge}`, inset);
    }
  });

  it("keeps Studio cart's distinct 48px intro/product, 16px review and 24px card insets", async () => {
    const original = reference("05-Studio", "abandoned-cart");
    const rendered = await compile("05-Studio", "abandoned-cart", roundTrip);
    const copy =
      "Your cart still holds your Halo ring—we saved your size and finish. Check out soon before inventory shifts or your hold window expires.";
    const expected = text(original, "p", copy);
    expect(
      expected
        .parents("td")
        .toArray()
        .some((node) => pixels(original(node).css("padding-left") ?? "0") === 48),
    ).toBe(true);
    const actual = text(rendered, ".studio-wide-copy > div", copy);
    const intro = actual
      .parents("div")
      .filter(
        (_index, node) =>
          rendered(node)
            .children("table")
            .children("tbody")
            .children("tr")
            .children("td")
            .css("padding") === "0px 48px 64px",
      );
    expect(intro).toHaveLength(1);
    expect(intro.hasClass("studio-mobile-inset")).toBe(false);
    expect(rendered(".studio-product-wrap > table > tbody > tr > td").css("padding")).toBe(
      "0px 48px 24px",
    );
    expect(
      mobileCss(rendered, ".studio-product-wrap > table > tbody > tr > td", "padding-left"),
    ).toBeUndefined();
    expect(pixels(mobileCss(original, ".mobile_px-4", "padding-left")!)).toBe(16);
    expect(
      mobileCss(rendered, ".studio-review-section > table > tbody > tr > td", "padding-left"),
    ).toBe("16px");
    expect(rendered(".studio-review-section > table > tbody > tr > td").css("padding")).toBe(
      "40px 32px 0px",
    );
    expect(
      mobileCss(rendered, ".studio-mobile-card > table > tbody > tr > td", "padding-left"),
    ).toBe("24px");
    paddingBridge(rendered, "studio-review-section", "padding-left", 16);
  });

  it("preserves Studio shipping FAQ's combined 24px outer and 8px inner mobile inset", async () => {
    const original = reference("05-Studio", "order-shipping");
    const rendered = await compile("05-Studio", "order-shipping", roundTrip);
    const heading = text(original, "p", "Common questions");
    expect(heading.closest("td").hasClass("mobile_px-2")).toBe(true);
    const innerInset = pixels(mobileCss(original, ".mobile_px-2", "padding-left")!);
    const outer = heading
      .closest("td")
      .parents("td")
      .filter((_index, node) => original(node).css("padding-left") === "1.5rem");
    expect(outer).toHaveLength(1);
    const inset = pixels(outer.css("padding-left")!) + innerInset;
    expect(inset).toBe(32);
    const selector = ".studio-faq-section > table > tbody > tr > td";
    expect(rendered(selector).css("padding")).toBe("0px 48px 56px");
    expect(mobileCss(rendered, selector, "padding-left")).toBe(`${inset}px`);
    expect(mobileCss(rendered, selector, "padding-right")).toBe(`${inset}px`);
    paddingBridge(rendered, "studio-faq-section", "padding-left", inset);
    // The border belongs to the outer section, before its extra copy inset.
    expect(heading.closest("table").css("border-top-width")).toBe("1px");
    expect(pixels(heading.closest("td").css("padding-top")!)).toBe(48);
    expect(rendered(".studio-faq-divider > table > tbody > tr > td").css("padding")).toBe(
      "0px 24px",
    );
    expect(rendered(".studio-faq-divider p").parent().css("padding")).toBe("48px 0px");
    expect(
      mobileCss(rendered, ".studio-faq-divider > table > tbody > tr > td", "padding-left"),
    ).toBeUndefined();
  });

  it.each(["welcome", "promo"])(
    "restores Arcane %s asymmetric feature gaps and additive join spacing",
    async (name) => {
      const original = reference("04-Arcane", name);
      const rendered = await compile("04-Arcane", name, roundTrip);
      const first = text(
        original,
        "p",
        name === "welcome" ? "Build your ritual" : "Bright morning serum",
      );
      const second = text(
        original,
        "p",
        name === "welcome" ? "Restocks & drops" : "Barrier night cream",
      );
      expect(first.closest("td").hasClass("mobile_py-6")).toBe(true);
      expect(first.parents("td").eq(1).hasClass("mobile_pt-8")).toBe(true);
      expect(second.parents("td").eq(1).hasClass("mobile_pt-8")).toBe(false);
      expect(original('img[src$="skin-image-7.png"]').closest("td").hasClass("mobile_pt-8")).toBe(
        true,
      );
      const inner = pixels(mobileCss(original, ".mobile_py-6", "padding-top")!);
      const outer = pixels(mobileCss(original, ".mobile_pt-8", "padding-top")!);
      expect([inner, outer]).toEqual([24, 32]);
      expect(
        mobileCss(rendered, ".arcane-feature-text > table > tbody > tr > td", "padding-top"),
      ).toBe("24px");
      expect(
        mobileCss(rendered, ".arcane-feature-text > table > tbody > tr > td", "padding-bottom"),
      ).toBe("24px");
      for (const [className, edge, desktop] of [
        ["arcane-feature-after-image", "top", "40px 0px 40px 24px"],
        ["arcane-feature-before-image", "bottom", "40px 24px 40px 0px"],
      ]) {
        const selector = `.${className} > table > tbody > tr > td`;
        expect(mobileCss(rendered, selector, `padding-${edge}`)).toBe(`${inner + outer}px`);
        expect(rendered(selector).css("padding")).toBe(desktop);
        paddingBridge(rendered, className, `padding-${edge}`, inner + outer);
      }
      const join = text(original, "p", "Join us on the journey");
      const outerSection = join.parents("table").eq(1);
      expect(pixels(outerSection.css("margin-top")!)).toBe(80);
      expect(
        outerSection.children("tbody").children("tr").children("td").hasClass("mobile_pt-12"),
      ).toBe(true);
      const top = 80 + pixels(mobileCss(original, ".mobile_pt-12", "padding-top")!);
      expect(top).toBe(128);
      const selector = ".arcane-join-section > table > tbody > tr > td";
      expect(mobileCss(rendered, selector, "padding-top")).toBe(`${top}px`);
      expect(mobileCss(rendered, selector, "padding-bottom")).toBe("40px");
      expect(rendered(selector).css("padding")).toBe("80px 40px 0px");
      paddingBridge(rendered, "arcane-join-section", "padding-top", top);
    },
  );

  it.each(["welcome", "promo", "abandoned-cart"])(
    "keeps Arcane %s join heading margin without doubling the collapsed body gap",
    async (name) => {
      const original = reference("04-Arcane", name);
      const rendered = await compile("04-Arcane", name, roundTrip);
      const heading = text(original, "p", "Join us on the journey");
      const margin = pixels(heading.css("margin-top")!);
      expect(margin).toBe(16);
      expect(pixels(heading.closest("td").css("padding-top")!) + margin).toBe(96);
      const gap = Math.max(
        pixels(heading.css("margin-bottom")!),
        pixels(heading.next("p").css("margin-top")!),
      );
      expect(gap).toBe(24);
      const actual = text(rendered, ".arcane-join div", "Join us on the journey");
      expect(actual.parent().css("padding")).toBe(`${margin}px 0px 0px`);
      const body = text(rendered, ".arcane-join div", normalize(heading.next("p").text()));
      expect(body.parent().css("padding")).toBe(`${gap}px 0px 0px`);
      expect(rendered(".arcane-join > table > tbody > tr > td").css("padding")).toBe("80px 40px");
    },
  );
});
