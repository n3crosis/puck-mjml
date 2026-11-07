import { readFileSync } from "node:fs";
import { load, type CheerioAPI } from "cheerio";
import { parse } from "postcss";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { scopeDocumentCss } from "../canvas-css";
import { fromMjml } from "../import";
import { toMjml } from "../export";

beforeAll(() => vi.stubGlobal("window", globalThis));
afterAll(() => vi.unstubAllGlobals());

function source(template: string, original = false) {
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
function rules(css: string, selector: string, property: string) {
  const values: { value: string; important: boolean; media: string }[] = [];
  parse(css).walkRules((rule) => {
    if (!rule.selectors.includes(selector)) return;
    rule.walkDecls(property, (declaration) => {
      const parent = rule.parent;
      values.push({
        value: declaration.value,
        important: Boolean(declaration.important),
        media: parent?.type === "atrule" && parent.name === "media" ? parent.params : "",
      });
    });
  });
  return values;
}
async function compile(template: string, roundTrip: boolean) {
  const input = source(template);
  const imported = fromMjml(input);
  expect(imported.warnings).toEqual([]);
  const mjml = roundTrip ? toMjml(imported.document) : input;
  expect(mjml).not.toMatch(/<mj-(?:raw|include)\b/);
  const { default: render } = await import("mjml-browser");
  const result = await render(mjml, { validationLevel: "strict" });
  expect(result.errors).toEqual([]);
  return { native: load(mjml, { xml: true }), rendered: load(result.html) };
}
function stylesheet($: CheerioAPI) {
  return $("style").text();
}

describe.each([false, true])("source image geometry, editor round trip: %s", (roundTrip) => {
  it("keeps the Apple header flush with its unpadded source container", async () => {
    const original = load(source("Community/receipts/apple-receipt", true));
    const logo = original('img[alt="Apple Logo"]');
    expect(logo.attr("width")).toBe("42");
    const container = logo
      .parents("table")
      .filter((_i, node) => original(node).css("width") === "660px");
    expect(container).toHaveLength(1);
    const cell = container.children("tbody").children("tr").children("td");
    expect(cell.css("padding-left")).toBe("0");
    expect(cell.css("padding-right")).toBe("0");
    expect(cell.css("padding-top")).toBe("20px");
    const { native, rendered } = await compile("Community/receipts/apple-receipt", roundTrip);
    expect(native('mj-group[css-class="apple-header-row"]').parent().attr("padding")).toBe(
      "20px 0px 0px",
    );
    expect(rendered(".apple-header-row").parent().css("padding")).toBe("20px 0px 0px");
    expect(rendered('img[alt="Apple Logo"]').attr("width")).toBe("42");
    expect(rules(stylesheet(rendered), "body", "padding")).toContainEqual({
      value: "8px",
      important: true,
      media: "",
    });
  });

  it("keeps Arcane cart images fixed while the desktop copy fills the remainder", async () => {
    const original = load(source("04-Arcane/abandoned-cart", true));
    const { native, rendered } = await compile("04-Arcane/abandoned-cart", roundTrip);
    for (const file of ["skin-image-2.png", "skin-image-3.png"]) {
      const image = original(`img[src$="${file}"]`);
      const column = image.closest("td");
      expect(column.css("width")).toBe("178px");
      expect(column.css("max-width")).toBe("178px");
      expect(column.next().css("width")).toBe("36px");
      expect(column.next().next().css("width")).toBeUndefined();
      expect(image.attr("width")).toBe("178");
      const port = native(`mj-image[src$="${file}"]`);
      expect(port.attr("width")).toBe("178px");
      expect(port.parent().attr("width")).toBe("178px");
      expect(port.parent().next().attr("width")).toBe("382px");
      expect(port.parent().next().attr("padding")).toBe("0px 0px 0px 36px");
      expect(rendered(`img[src$="${file}"]`).attr("width")).toBe("178");
      expect(rendered(`img[src$="${file}"]`).closest("td").css("width")).toBe("178px");
    }
    const css = stylesheet(rendered);
    const scoped = scopeDocumentCss([{ css, inline: "head" }], { scope: "source-cart" });
    for (const property of ["width", "max-width"]) {
      const expected = [
        {
          value: "calc(100% - 178px)",
          important: true,
          media: "only screen and (min-width: 601px)",
        },
      ];
      expect(rules(css, ".arcane-cart-details", property)).toEqual(expected);
      expect(rules(scoped.css, ".source-cart .arcane-cart-details", property)).toEqual(expected);
      // The live canvas uses the same iframe-viewport breakpoint.
      expect(scoped.css).toContain("min-width: 601px");
    }
    expect(rules(css, ".arcane-cart-image table", "width")).toEqual([
      { value: "100%", important: true, media: "only screen and (max-width: 600px)" },
    ]);
    expect(rules(css, ".arcane-cart-image img", "width")).toEqual([
      { value: "100%", important: true, media: "only screen and (max-width: 600px)" },
    ]);
  });
});
