import { readFileSync } from "node:fs";
import { load, type CheerioAPI } from "cheerio";
import { parse } from "postcss";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { fromMjml } from "../import";
import { toMjml } from "../export";
import { scopeDocumentCss } from "../canvas-css";

beforeAll(() => vi.stubGlobal("window", globalThis));
afterAll(() => vi.unstubAllGlobals());
const names = [
  "abandoned-cart",
  "activation",
  "newsletter",
  "order-confirmation",
  "order-shipping",
  "password-reset",
  "promo",
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
function reference(family: string, name: string) {
  return load(
    readFileSync(
      new URL(`../../.cache/react-email-reference/${family}/${name}.html`, import.meta.url),
      "utf8",
    ),
  );
}
function paragraph($: CheerioAPI, text: string) {
  const found = $("p").filter((_index, node) => normalize($(node).text()) === normalize(text));
  expect(found).toHaveLength(1);
  return found;
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
const cache = new Map<string, Promise<CheerioAPI>>();
function compile(family: string, name: string, roundTrip: boolean) {
  const key = `${family}/${name}:${roundTrip}`;
  if (!cache.has(key))
    cache.set(
      key,
      (async () => {
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
      })(),
    );
  return cache.get(key)!;
}

// These checks read the immutable React Email HTML, not an MJML snapshot.
// Actual browser captures remain the layout gate; font loading is a separate lane.
describe.each([false, true])("commerce design, editor round trip: %s", (roundTrip) => {
  it.each(names)(
    "preserves Studio %s original 44px button boxes and destinations",
    async (name) => {
      const original = reference("05-Studio", name);
      const rendered = await compile("05-Studio", name, roundTrip);
      const originalButtons = original("a").filter((_index, node) =>
        Boolean(declarations(original(node).attr("style"))["background-color"]),
      );
      const buttons = rendered("a").filter((_index, node) =>
        Boolean(declarations(rendered(node).attr("style")).background),
      );
      expect(buttons.length).toBe(originalButtons.length);
      buttons.each((index, node) => {
        const actual = rendered(node),
          expected = originalButtons.eq(index);
        expect(normalize(actual.text())).toBe(normalize(expected.text()));
        expect(actual.attr("href")).toBe(expected.attr("href"));
        const label = expected
          .find("span")
          .filter(
            (_index, span) => normalize(original(span).text()) === normalize(expected.text()),
          );
        expect(label).toHaveLength(1);
        const fontSize = pixels(declarations(expected.attr("style"))["font-size"]);
        const leading = pixels(declarations(label.attr("style"))["line-height"], fontSize);
        expect(leading).toBe(18);
        expect(pixels(declarations(actual.attr("style"))["line-height"], fontSize)).toBe(leading);
        expect(actual.css("padding")).toBe("12px 20px");
        expect(actual.closest("td").css("border")).toBe("1px solid #E8E9E9");
        expect(leading + 12 * 2 + 2).toBe(44);
      });
    },
  );

  it.each(["abandoned-cart", "promo"])(
    "keeps Studio %s mobile benefits adjacent without invented gaps",
    async (name) => {
      const original = reference("05-Studio", name),
        rendered = await compile("05-Studio", name, roundTrip);
      for (const text of [
        "Try your ring risk-free 30 days",
        "Free shipping and easy returns",
        "Two-year ring warranty included",
      ]) {
        const expected = paragraph(original, text);
        expect(pixels(declarations(expected.attr("style"))["margin-bottom"])).toBe(0);
        const actual = rendered(".studio-benefit > div").filter(
          (_index, node) => normalize(rendered(node).text()) === text,
        );
        expect(actual).toHaveLength(1);
        expect(actual.css("max-width")).toBe(expected.css("max-width"));
        expect(actual.css("margin")).toBe("0 auto");
      }
      expect(cssValue(rendered, ".studio-benefit > div", "margin-bottom")).toBeUndefined();
    },
  );

  it("restores Studio newsletter's 24px mobile journal inset without changing desktop sizing", async () => {
    const original = reference("05-Studio", "newsletter"),
      rendered = await compile("05-Studio", "newsletter", roundTrip);
    const expected = paragraph(original, "Pick the right ring size online");
    const section = expected
      .parents("td")
      .filter((_index, node) => original(node).css("padding-top") === "2rem")
      .first();
    expect(section).toHaveLength(1);
    expect(pixels(section.css("padding-left")!)).toBe(24);
    expect(cssValue(rendered, ".studio-journal > table > tbody > tr > td", "padding-left")).toBe(
      "24px",
    );
    expect(cssValue(rendered, ".studio-journal > table > tbody > tr > td", "padding-right")).toBe(
      "24px",
    );
    expect(rendered(".studio-journal > table > tbody > tr > td").css("padding")).toBe(
      "32px 40px 0px",
    );
    expect(rendered('.studio-journal img[width="252"]')).toHaveLength(2);
  });

  it.each(["activation", "password-reset", "order-confirmation", "order-shipping"])(
    "restores Arcane %s heading margin and collapsed next-paragraph gap",
    async (name) => {
      const original = reference("04-Arcane", name),
        rendered = await compile("04-Arcane", name, roundTrip);
      const heading = original("p")
        .filter((_index, node) => original(node).css("font-size") === "72px")
        .first();
      const firstCopy = heading.next("p");
      expect(firstCopy).toHaveLength(1);
      const top = pixels(heading.css("margin-top")!);
      const gap = Math.max(
        pixels(heading.css("margin-bottom")!),
        pixels(firstCopy.css("margin-top")!),
      );
      expect(top).toBe(16);
      expect(gap).toBe(32);
      const actualHeading = rendered("div").filter(
        (_index, node) =>
          rendered(node).css("font-size") === "72px" &&
          normalize(rendered(node).text()) === normalize(heading.text()),
      );
      expect(actualHeading).toHaveLength(1);
      expect(actualHeading.parent().css("padding")).toBe(`${top}px 0px 0px`);
      const actualCopy = rendered("div").filter(
        (_index, node) =>
          rendered(node).css("font-size") === "15px" &&
          normalize(rendered(node).text()) === normalize(firstCopy.text()),
      );
      expect(actualCopy).toHaveLength(1);
      expect(actualCopy.parent().css("padding")).toBe(`${gap}px 0px 0px`);
    },
  );

  it.each([
    ["promo", "Use code"],
    ["promo", "Some new things"],
    ["welcome", "Some new things"],
    ["newsletter", "Tips and resources"],
  ])("preserves Arcane %s capitalization for %s", async (name, text) => {
    const original = reference("04-Arcane", name),
      rendered = await compile("04-Arcane", name, roundTrip);
    const expected = paragraph(original, text);
    expect(expected.css("text-transform")).toBe("capitalize");
    const actual = rendered("div").filter(
      (_index, node) =>
        normalize(rendered(node).text()) === text &&
        parseFloat(rendered(node).css("font-size") ?? "0") > 0,
    );
    expect(actual).toHaveLength(1);
    expect(actual.css("text-transform")).toBe(expected.css("text-transform"));
  });

  it("keeps Arcane newsletter's mobile Tips heading margin in addition to its section inset", async () => {
    const original = reference("04-Arcane", "newsletter"),
      rendered = await compile("04-Arcane", "newsletter", roundTrip);
    const heading = paragraph(original, "Tips and resources");
    expect(heading.hasClass("mobile_mt-10")).toBe(true);
    const margin = cssValue(original, ".mobile_mt-10", "margin-top");
    const inset = cssValue(original, ".mobile_pt-12", "padding-top");
    expect(pixels(margin!)).toBe(40);
    expect(pixels(inset!)).toBe(48);
    expect(
      cssValue(rendered, ".arcane-tips-section > table > tbody > tr > td", "padding-top"),
    ).toBe(`${pixels(margin!) + pixels(inset!)}px`);
    expect(rendered(".arcane-tips-section > table > tbody > tr > td").css("padding")).toBe(
      "152px 40px 0px",
    );
    expect(rendered(".arcane-tips-section").hasClass("arcane-mobile-top")).toBe(false);
    const scoped = scopeDocumentCss([{ css: rendered("style").text(), inline: "head" }], {
      scope: "commerce",
    });
    const bridgedPadding: string[] = [];
    parse(scoped.css).walkRules((rule) => {
      if (rule.selector.includes('.arcane-tips-section[data-pm-mjml-padding="self"]')) {
        rule.walkDecls("padding-top", (declaration) => {
          bridgedPadding.push(declaration.value);
        });
      }
    });
    expect(bridgedPadding).toEqual(["88px"]);
  });
});
