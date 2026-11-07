import { readFileSync } from "node:fs";
import { load, type CheerioAPI } from "cheerio";
import { parse } from "postcss";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { fromMjml } from "../import";
import { toMjml } from "../export";

beforeAll(() => vi.stubGlobal("window", globalThis));
afterAll(() => vi.unstubAllGlobals());

const normalize = (text: string) => text.replace(/\s+/g, " ").trim();
function read(template: string, original = false) {
  return readFileSync(
    new URL(
      original
        ? `../../tests/fixtures/react-email-reference/${template}.html`
        : `../../templates/${template}.mjml`,
      import.meta.url,
    ),
    "utf8",
  );
}
function text($: CheerioAPI, value: string) {
  const found = $("p").filter((_index, node) => normalize($(node).text()) === value);
  expect(found).toHaveLength(1);
  return found;
}
function cssRule($: CheerioAPI, selector: string, property: string) {
  const values: string[] = [];
  parse($("style").text()).walkRules((rule) => {
    if (
      rule.selector
        .split(",")
        .map((part) => part.trim())
        .includes(selector)
    )
      rule.walkDecls(property, (declaration) => {
        values.push(declaration.value);
      });
  });
  return values;
}
async function compile(template: string, roundTrip: boolean) {
  const source = read(template);
  const imported = fromMjml(source);
  expect(imported.warnings).toEqual([]);
  const input = roundTrip ? toMjml(imported.document) : source;
  expect(input).not.toMatch(/<mj-(?:raw|include)\b/);
  const { default: mjml } = await import("mjml-browser");
  const result = await mjml(input, { validationLevel: "strict" });
  expect(result.errors).toEqual([]);
  return { rendered: load(result.html), native: load(input, { xmlMode: true }) };
}

// Source contracts derived from the pinned, immutable React Email HTML and the
// f8626be original/compiled/live-editor desktop and mobile capture pairs.
// These checks do not substitute for real browser geometry and font loading.
describe.each([false, true])("dark-family source fidelity, round trip: %s", (roundTrip) => {
  it("preserves Matte activation's exact punctuation", async () => {
    const original = load(read("02-Matte/activation", true));
    const expected = "Thank you for signing up for Collage";
    text(original, expected);
    const { rendered } = await compile("02-Matte/activation", roundTrip);
    text(rendered, expected);
    expect(rendered("body").text()).not.toContain(`${expected}.`);
  });

  it("matches the subscription button's inner-label Inter 500 face", async () => {
    const original = load(read("02-Matte/subscription-confirmation", true));
    const button = original("a").filter(
      (_index, node) => normalize(original(node).text()) === "Manage subscription",
    );
    expect(button).toHaveLength(1);
    expect(button.css("font-family")).toBe("Arial,Helvetica,sans-serif");
    expect(button.css("font-weight")).toBe("500");
    const label = button
      .find("span")
      .filter((_index, node) => normalize(original(node).text()) === "Manage subscription");
    expect(label).toHaveLength(1);
    expect(label.attr("style")).not.toContain("font-family");
    // The original's universal font declaration applies directly to the inner
    // span and wins over inherited Arial from the anchor. Inter 500 is valid;
    // the original's separate broken Inter 400 face is deliberately untouched.
    expect(cssRule(original, "*", "font-family")).toContain("'Inter', Arial, sans-serif");
    const face = original("style").text();
    expect(face).toMatch(/font-weight:\s*500;[\s\S]*?format\('truetype'\)/);
    const { rendered, native } = await compile("02-Matte/subscription-confirmation", roundTrip);
    const actual = rendered("a").filter(
      (_index, node) => normalize(rendered(node).text()) === "Manage subscription",
    );
    expect(actual.css("font-family")).toBe("Inter, Arial, sans-serif");
    expect(actual.css("font-weight")).toBe("500");
    expect(actual.css("line-height")).toBe("18px");
    expect(actual.css("padding")).toBe("14px 20px");
    expect(native("mj-button").attr("font-family")).toBe("Inter, Arial, sans-serif");
  });

  it.each(["order-confirmation", "order-shipping"])(
    "preserves %s divider line box and paired middle alignment",
    async (name) => {
      const original = load(read(`04-Arcane/${name}`, true));
      const divider = original("table").filter(
        (_index, node) => original(node).text() === "\u00a0",
      );
      expect(divider).toHaveLength(1);
      expect(divider.css("margin-top")).toBe("18px");
      expect(divider.css("margin-bottom")).toBe("18px");
      expect(divider.css("border-top-width")).toBe("1px");
      const inheritedType = divider
        .parents()
        .filter((_index, node) => Boolean(original(node).css("font-size")))
        .first();
      const blankHeight =
        parseFloat(inheritedType.css("font-size")!) * parseFloat(inheritedType.css("line-height")!);
      expect(blankHeight).toBe(22.5);
      for (const [image, title] of [
        ["skin-image-2.png", "Daily C Serum"],
        ["skin-image-3.png", "Overnight Repair Cream"],
      ]) {
        expect(original(`img[src$="${image}"]`).closest("td").css("vertical-align")).toBe("middle");
        expect(text(original, title).closest("td").css("vertical-align")).toBe("middle");
      }
      const { rendered, native } = await compile(`04-Arcane/${name}`, roundTrip);
      const section = native('mj-section[css-class~="arcane-order-divider"]');
      expect(section.attr("padding")).toBe("18px 40px");
      expect(section.find("mj-divider").attr("border-width")).toBe("1px");
      expect(section.find("mj-spacer").attr("height")).toBe(`${blankHeight}px`);
      const renderedDivider = rendered(".arcane-order-divider");
      expect(renderedDivider.find('div[style*="height:22.5px"]')).toHaveLength(1);
      for (const selector of [".arcane-order-image", ".arcane-order-copy"]) {
        const columns = rendered(selector);
        expect(columns).toHaveLength(2);
        columns.each((_index, node) => expect(rendered(node).css("vertical-align")).toBe("middle"));
      }
      if (name === "order-confirmation") {
        const summary = text(original, "Subtotal")
          .parents("table")
          .filter((_index, node) => original(node).css("background-color") === "rgb(67,29,38)");
        expect(summary).toHaveLength(1);
        expect(summary.css("margin-top")).toBe("64px");
        expect(
          native('mj-section[css-class~="arcane-order-summary-section"]').attr("padding"),
        ).toBe("64px 40px 56px");
      }
    },
  );

  it("retains cart CTA mobile insets and the review's separate margin", async () => {
    const original = load(read("04-Arcane/abandoned-cart", true));
    const review = text(original, "Don’t take it from us");
    expect(review.closest("table").css("margin-top")).toBe("72px");
    expect(cssRule(original, ".mobile_pt-12", "padding-top")).toContain("3rem");
    expect(cssRule(original, ".mobile_mb-10", "margin-bottom")).toContain("2.5rem");
    expect(cssRule(original, ".mobile_pb-10", "padding-bottom")).toContain("2.5rem");
    const { rendered, native } = await compile("04-Arcane/abandoned-cart", roundTrip);
    expect(cssRule(rendered, ".arcane-cart-cta > table > tbody > tr > td", "padding-top")).toEqual([
      "40px",
    ]);
    expect(
      cssRule(rendered, ".arcane-cart-cta > table > tbody > tr > td", "padding-bottom"),
    ).toEqual(["40px"]);
    expect(
      cssRule(rendered, ".arcane-cart-review > table > tbody > tr > td", "padding-top"),
    ).toEqual(["120px"]);
    expect(native('mj-section[css-class~="arcane-cart-cta"]').attr("padding")).toBe(
      "48px 40px 56px",
    );
    expect(native('mj-section[css-class~="arcane-cart-review"]').attr("padding")).toBe(
      "72px 40px 0px",
    );
    // Preserve the independent, previously fixed join paragraph margin.
    expect(
      native("mj-text")
        .filter((_index, node) => normalize(native(node).text()) === "Join us on the journey")
        .attr("padding"),
    ).toBe("16px 0px 0px");
  });

  it("retains newsletter mobile first-tip and number-to-label spacing", async () => {
    const original = load(read("04-Arcane/newsletter", true));
    const title = text(original, "Start with a patch test");
    expect(title.closest("td").attr("class")).toContain("mobile_pl-3");
    expect(cssRule(original, ".mobile_pl-3", "padding-left")).toContain("0.75rem");
    expect(cssRule(original, ".mobile_mt-12", "margin-top")).toContain("3rem");
    const { rendered, native } = await compile("04-Arcane/newsletter", roundTrip);
    expect(cssRule(rendered, ".arcane-first-tip > table > tbody > tr > td", "padding-top")).toEqual(
      ["48px"],
    );
    expect(cssRule(rendered, ".arcane-tip td + td", "padding-left")).toEqual(["12px"]);
    expect(native('mj-section[css-class~="arcane-first-tip"]').attr("padding")).toBe(
      "88px 40px 0px",
    );
    expect(native('mj-table[css-class="arcane-tip"] td + td')).toHaveLength(3);
    native('mj-table[css-class="arcane-tip"] td + td').each((_index, node) =>
      expect(native(node).attr("style")).toContain("22px"),
    );
  });

  it.each([
    "activation",
    "abandoned-cart",
    "newsletter",
    "welcome",
    "order-confirmation",
    "order-shipping",
    "password-reset",
  ])("keeps %s logo's source-specific responsive inset", async (name) => {
    const fixed = name === "activation" || name === "abandoned-cart";
    const original = load(read(`04-Arcane/${name}`, true));
    const header = original('img[src$="logo-white.png"]').closest("td");
    expect(header.css("padding-left")).toBe("40px");
    expect((header.attr("class") ?? "").includes("mobile_px-6")).toBe(!fixed);
    const { native } = await compile(`04-Arcane/${name}`, roundTrip);
    const section = native('mj-image[src$="logo-white.png"]').closest("mj-section");
    expect(section.attr("padding")).toBe("40px 40px 24px");
    expect((section.attr("css-class") ?? "").includes("arcane-inset")).toBe(!fixed);
  });
});
