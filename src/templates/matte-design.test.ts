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
      new URL(`../../.cache/react-email-reference/02-Matte/${name}.html`, import.meta.url),
      "utf8",
    ),
  );
}
function paragraph($: CheerioAPI, text: string) {
  const found = $("p").filter((_index, node) => normalize($(node).text()) === normalize(text));
  expect(found).toHaveLength(1);
  return found;
}
const compiled = new Map<string, Promise<CheerioAPI>>();
function compile(name: string, roundTrip: boolean) {
  const key = `${name}:${roundTrip}`;
  if (!compiled.has(key))
    compiled.set(
      key,
      (async () => {
        const source = readFileSync(
          new URL(`../../templates/02-Matte/${name}.mjml`, import.meta.url),
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
  return compiled.get(key)!;
}

// Regressions derived from the immutable React Email HTML and all sixteen
// original/compiled/live-canvas desktop/mobile triptychs, not MJML snapshots.
// Browser captures remain the geometry gate; these exercise both safe paths.
describe.each([false, true])("Matte design, editor round trip: %s", (roundTrip) => {
  it.each(names)("preserves %s button label leading and content", async (name) => {
    const original = reference(name);
    const rendered = await compile(name, roundTrip);
    const originalButtons = original("a").filter((_index, node) =>
      Boolean(declarations(original(node).attr("style"))["background-color"]),
    );
    const buttons = rendered("a").filter((_index, node) =>
      Boolean(declarations(rendered(node).attr("style")).background),
    );
    expect(buttons.length).toBe(originalButtons.length);
    buttons.each((index, node) => {
      const button = rendered(node);
      const originalButton = originalButtons.eq(index);
      expect(normalize(button.text())).toBe(normalize(originalButton.text()));
      expect(button.attr("href")).toBe(originalButton.attr("href"));
      const label = originalButton
        .find("span")
        .filter(
          (_index, span) => normalize(original(span).text()) === normalize(originalButton.text()),
        );
      expect(label).toHaveLength(1);
      const leading = pixels(declarations(label.attr("style"))["line-height"], 15);
      expect(leading).toBe(18);
      expect(pixels(declarations(button.attr("style"))["line-height"], 15)).toBe(leading);
      expect(declarations(button.attr("style")).padding).toBe("14px 20px");
    });
    expect(
      rendered("img")
        .map((_index, node) => rendered(node).attr("src"))
        .get(),
    ).toEqual(
      original("img")
        .map((_index, node) => original(node).attr("src"))
        .get(),
    );
    const destinations = new Set(
      rendered("a")
        .map((_index, node) => rendered(node).attr("href"))
        .get(),
    );
    for (const href of original("a")
      .map((_index, node) => original(node).attr("href"))
      .get())
      expect(destinations.has(href), href).toBe(true);
  });

  it.each(names)("keeps %s card corners and its existing shadow unobscured", async (name) => {
    const original = reference(name);
    const rendered = await compile(name, roundTrip);
    const originalCard = original("table").filter((_index, node) =>
      Boolean(declarations(original(node).attr("style"))["box-shadow"]),
    );
    expect(originalCard).toHaveLength(1);
    expect(declarations(originalCard.attr("style"))["border-radius"]).toBe("8px");
    const card = rendered(".collage-card");
    expect(card).toHaveLength(1);
    expect(declarations(original("body").attr("style"))["background-color"]).toBe(
      "rgb(251,252,251)",
    );
    expect(declarations(rendered("body").attr("style"))["background-color"]).toBe("#FBFCFB");
    expect(declarations(card.prev().attr("style"))["background-color"]).toBe("transparent");
    expect(declarations(card.attr("style"))["border-radius"]).toBe("8px");
    expect(declarations(card.attr("style"))["box-shadow"]).toContain("rgba(193, 195, 193, 0.1)");
    const firstSection = card.find("> table > tbody > tr > td > div").first();
    expect(declarations(firstSection.attr("style"))["border-radius"]).toBe("7px 7px 0px 0px");
    // The original places 24px of transparent container padding below the card.
    // An opaque following MJML spacer painted over the shadow instead.
    const originalPadding = originalCard
      .parents("td")
      .filter(
        (_index, node) => declarations(original(node).attr("style"))["padding-bottom"] === "1.5rem",
      );
    expect(originalPadding).toHaveLength(1);
    expect(declarations(card.next().attr("style"))["background-color"]).toBe("transparent");
    expect(declarations(card.next().children("table").attr("style"))["background-color"]).toBe(
      "transparent",
    );
    expect(declarations(rendered(".collage-footer-copy > div").attr("style")).color).toBe(
      "#5F7458",
    );
  });

  it("restores the inset billing summary without stacking labels and prices", async () => {
    const original = reference("subscription-confirmation");
    const rendered = await compile("subscription-confirmation", roundTrip);
    const intro = paragraph(
      original,
      "Questions about billing or your plan? Reply to this email and we're happy to help.",
    );
    expect(pixels(declarations(intro.closest("table").attr("style"))["margin-bottom"])).toBe(48);
    const rows = rendered(".collage-confirm-total");
    expect(rows).toHaveLength(3);
    for (const [index, label] of ["Subtotal", "Tax", "Total"].entries()) {
      const originalLabel = paragraph(original, label);
      expect(originalLabel.closest("tr").children("td")).toHaveLength(2);
      const originalPadding = originalLabel
        .parents("td")
        .filter((_index, node) => declarations(original(node).attr("style")).padding === "0.75rem");
      expect(originalPadding).toHaveLength(1);
      const originalRow = originalPadding.closest("table");
      expect(declarations(originalRow.attr("style"))["margin-bottom"] ?? "0px").toBe(
        index < 2 ? "3px" : "0px",
      );
      const top = index === 0 ? 48 : 0;
      const bottom = index < 2 ? 3 : 0;
      const row = rows.eq(index);
      expect(declarations(row.find("> table > tbody > tr > td").attr("style")).padding).toBe(
        `${top}px 40px ${bottom}px`,
      );
      const className =
        index === 0
          ? "collage-confirm-total-first"
          : index === 2
            ? "collage-confirm-total-last"
            : "collage-confirm-total";
      expect(cssValue(rendered, `.${className} > table > tbody > tr > td`, "padding")).toBe(
        `${top}px 24px ${bottom}px`,
      );
      const group = row.find(".collage-confirm-total-row");
      expect(group).toHaveLength(1);
      expect(declarations(group.attr("style"))["background-color"]).toBe(
        index < 2 ? "#EDF0E9" : "#D3D9CB",
      );
      const columns = group.children("div");
      expect(columns).toHaveLength(2);
      columns.each((_index, node) => {
        expect(declarations(rendered(node).attr("style"))).toMatchObject({
          display: "inline-block",
          width: "50%",
        });
        expect(declarations(rendered(node).find("td").first().attr("style")).padding).toBe("12px");
      });
      expect(normalize(columns.first().text())).toBe(label);
      expect(normalize(columns.last().text())).toBe(index === 1 ? "$0.00" : "$29.00");
    }
  });

  it("preserves the subscription onboarding rule width cap", async () => {
    const original = reference("subscription-confirmation");
    const rendered = await compile("subscription-confirmation", roundTrip);
    expect(
      declarations(paragraph(original, "Get started").closest("table").attr("style"))["max-width"],
    ).toBe("490px");
    const rules = rendered(".collage-confirm-rule p");
    expect(rules).toHaveLength(2);
    rules.each((_index, node) => {
      expect(declarations(rendered(node).attr("style"))).toMatchObject({
        "max-width": "490px",
        "margin-left": "0",
      });
    });
  });

  it("restores welcome checklist spacing on desktop and mobile", async () => {
    const original = reference("welcome");
    const rendered = await compile("welcome", roundTrip);
    const section = paragraph(original, "Your first week in Collage")
      .parents("td")
      .filter(
        (_index, node) => declarations(original(node).attr("style"))["padding-top"] === "5rem",
      );
    expect(section).toHaveLength(1);
    expect(pixels(declarations(section.attr("style"))["padding-bottom"])).toBe(80);
    expect(pixels(cssValue(original, ".mobile_py-16imprtnt", "padding-top")!)).toBe(64);
    expect(pixels(cssValue(original, ".mobile_py-16imprtnt", "padding-bottom")!)).toBe(64);
    const lastRule = rendered(".collage-tip-rule-last");
    expect(lastRule).toHaveLength(1);
    expect(declarations(lastRule.find("> table > tbody > tr > td").attr("style")).padding).toBe(
      "0px 40px 80px",
    );
    expect(cssValue(rendered, ".collage-tip-rule-last > table > tbody > tr > td", "padding")).toBe(
      "0px 24px 64px",
    );
    expect(cssValue(rendered, ".collage-week-heading > table > tbody > tr > td", "padding")).toBe(
      "64px 24px 0px",
    );
  });

  it.each(["welcome", "feature-announcement", "product-update"])(
    "centers %s arrows beside each complete text row",
    async (name) => {
      const original = reference(name);
      const rendered = await compile(name, roundTrip);
      const selector = 'img[src$="/collage-image-9.png"]';
      const arrows = rendered(selector);
      expect(arrows).toHaveLength(3);
      original(selector).each((_index, node) => {
        expect(declarations(original(node).parent().attr("style"))["vertical-align"]).toBe(
          "middle",
        );
      });
      arrows.each((_index, node) => {
        const arrowColumn = rendered(node).closest("div");
        expect(declarations(arrowColumn.attr("style"))["vertical-align"]).toBe("middle");
        // In inline-block MJML rows, the tall sibling also needs middle alignment.
        // Keeping that sibling top aligned centers the arrow at the row's baseline.
        expect(declarations(arrowColumn.prev("div").attr("style"))["vertical-align"]).toBe(
          "middle",
        );
      });
    },
  );

  it("removes feature descriptions' desktop left inset after mobile stacking", async () => {
    const original = reference("feature-announcement");
    const rendered = await compile("feature-announcement", roundTrip);
    const originalCopy = paragraph(original, "Faster by default").parent();
    expect(pixels(declarations(originalCopy.attr("style"))["padding-left"])).toBe(16);
    expect(originalCopy.attr("class")).toContain("mobile_pl-0");
    expect(pixels(cssValue(original, ".mobile_pl-0", "padding-left")!)).toBe(0);
    const columns = rendered(".collage-feature-copy-column");
    expect(columns).toHaveLength(2);
    columns.each((_index, node) => {
      expect(declarations(rendered(node).find("td").first().attr("style")).padding).toBe(
        "0px 0px 0px 16px",
      );
    });
    expect(
      cssValue(rendered, ".collage-feature-copy-column > table > tbody > tr > td", "padding"),
    ).toBe("0px");
  });
});
