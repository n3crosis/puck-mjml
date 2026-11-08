import { load } from "cheerio";
import postcss, { type Rule } from "postcss";
import { describe, expect, it } from "vitest";
import { scopeDocumentCss } from "./canvas-css";

const scope = "pm-canvas-security";
const selectors = [
  String.raw`.escaped\(, .target`,
  String.raw`.escaped\[, .target`,
  String.raw`.escaped\", .target`,
  String.raw`.escaped\', .target`,
  String.raw`.escaped\(\[, .target`,
  String.raw`.escaped\\\(, .target`,
  String.raw`.escaped\28 , .target`,
  String.raw`.escaped\000028 , .target`,
  String.raw`[title="trailing\\"], .target`,
  String.raw`[title='trailing\\'], .target`,
  String.raw`.unused/* ( [ ' " */, .target`,
  String.raw`.unused/* \\ */, .target`,
];

const selectorFor = (selector: string) =>
  (
    postcss.parse(scopeDocumentCss([{ css: `${selector} { color:red }` }], { scope }).css)
      .first as Rule
  ).selector;

describe("untrusted CSS selector containment", () => {
  it.each(selectors)("scopes every real selector after opaque CSS tokens: %s", (source) => {
    const selector = selectorFor(source);
    const $ = load(`<div id="host" class="target"></div>
      <div class="${scope}"><div id="inside" class="target"></div></div>
      <div class="pm-canvas-other"><div id="other" class="target"></div></div>`);
    expect(
      $(selector)
        .map((_index, element) => $(element).attr("id"))
        .get(),
    ).toEqual(["inside"]);
    expect(selector).toContain(`, .${scope} .target`);
  });

  it("keeps escape sequences and their terminating whitespace intact", () => {
    expect(selectorFor(String.raw`.\31 23, .hover\:text-red:hover`)).toBe(
      String.raw`.pm-canvas-security .\31 23, .pm-canvas-security .hover\:text-red:hover`,
    );
  });

  it("maps a root following an escaped delimiter back to the canvas", () => {
    expect(selectorFor(String.raw`.escaped\(, body`)).toBe(
      String.raw`.pm-canvas-security .escaped\(, .pm-canvas-security:is(body, *)`,
    );
  });

  it.each([
    String.raw`body[title="trailing\\"] + .target`,
    String.raw`:root:not(.escaped\() ~ .target`,
    String.raw`body:not(.unused/* ( */) + .target`,
  ])("still drops root sibling selectors after opaque tokens: %s", (selector) => {
    const result = scopeDocumentCss([{ css: `${selector} { color:red }` }], { scope });
    expect(result.css).toBe("");
    expect(result.notes[0]).toContain("outside the canvas");
  });
});
