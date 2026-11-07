import * as cheerio from "cheerio";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { fromMjml } from "./import";
import { toMjml } from "./export";

beforeAll(() => vi.stubGlobal("window", globalThis));
afterAll(() => vi.unstubAllGlobals());

const body =
  '<mj-section><mj-column><mj-text css-class="target" font-family="Example">Body marker</mj-text></mj-column></mj-section>';
const sourceWith = (head: string) =>
  `<mjml><mj-head>${head}</mj-head><mj-body>${body}</mj-body></mjml>`;

async function compile(source: string) {
  const { default: mjml } = await import("mjml-browser");
  const result = await mjml(source, { validationLevel: "strict" });
  expect(result.errors).toEqual([]);
  return { html: result.html, $: cheerio.load(result.html) };
}

describe("native head import precedence", () => {
  it.each([
    { first: "1200px", last: "600px", expected: "600px" },
    { first: "640.5px", last: "600px", expected: "600px" },
    { first: "0", last: "600px", expected: "600px" },
    { first: "600px", last: "1200px", expected: "1200px" },
    { first: "1200px", last: "640.5px", expected: "640.5px" },
    { first: "1200px", last: "0", expected: "0" },
    { first: "1200px", last: undefined, expected: "480px" },
    { first: "600px", last: undefined, expected: "480px" },
  ])("uses the last breakpoint, $first then $last", async ({ first, last, expected }) => {
    const source = sourceWith(
      `<mj-breakpoint width="${first}" /><mj-breakpoint${last === undefined ? "" : ` width="${last}"`} />`,
    );
    const { document, warnings } = fromMjml(source);
    expect(warnings).toEqual([]);
    const original = await compile(source);
    const roundtrip = await compile(toMjml(document));
    const mediaWidths = (html: string) => html.match(/min-width:[^)]+/g);
    expect(mediaWidths(original.html)).toEqual([`min-width:${expected}`, `min-width:${expected}`]);
    expect(mediaWidths(roundtrip.html)).toEqual(mediaWidths(original.html));
    expect(document.root.props?.breakpointWidth).toBe(
      ["1200px", "640.5px", "0"].includes(expected) ? expected : undefined,
    );
  });

  it.each(
    ["mj-title", "mj-preview"].flatMap((tag) =>
      ["New &amp; final", "", undefined].map((last) => ({ tag, last })),
    ),
  )("clears earlier HTML when $tag ends with $last", async ({ tag, last }) => {
    const source = sourceWith(
      `<${tag}><span>Old value</span></${tag}>${last === undefined ? `<${tag} />` : `<${tag}>${last}</${tag}>`}`,
    );
    const { document } = fromMjml(source);
    const key = tag === "mj-title" ? "subjectHtmlContent" : "previewHtmlContent";
    expect(document.root.props?.[key]).toBeUndefined();
    const output = toMjml(document);
    expect(output).not.toContain("Old value");
    const original = await compile(source);
    const roundtrip = await compile(output);
    expect(roundtrip.$("title").text()).toBe(original.$("title").text());
    expect(roundtrip.$("[role=article]").attr("aria-label")).toBe(
      original.$("[role=article]").attr("aria-label"),
    );
    expect(roundtrip.$("body").text()).toBe(original.$("body").text());
  });

  it.each(["mj-title", "mj-preview"])(
    "retains the trust requirement when the final %s contains HTML",
    async (tag) => {
      const source = sourceWith(
        `<${tag}>Old value</${tag}><${tag}><span>Final value</span></${tag}>`,
      );
      const { document, warnings } = fromMjml(source);
      expect(warnings).toEqual([
        `${tag} HTML content preserved; compiling it requires allowRawHtml: true.`,
      ]);
      expect(() => toMjml(document)).toThrow(/allowRawHtml/);
      const original = await compile(source);
      const roundtrip = await compile(toMjml(document, { allowRawHtml: true }));
      expect(roundtrip.$("title").text()).toBe(original.$("title").text());
      expect(roundtrip.$("body").text()).toBe(original.$("body").text());
    },
  );

  it("keeps repeated styles additive and resolves their inline cascade", async () => {
    const source = sourceWith(
      "<mj-style>.first { color: red; }</mj-style>" +
        '<mj-style inline="inline">.target div { color: red !important; font-size: 21px !important; }</mj-style>' +
        "<mj-style>.second { color: blue; }</mj-style>" +
        '<mj-style inline="inline">.target div { color: blue !important; }</mj-style>',
    );
    const { document, warnings } = fromMjml(source);
    expect(warnings).toEqual([]);
    expect(document.root.props?.headStyles).toHaveLength(4);
    const original = await compile(source);
    const roundtrip = await compile(toMjml(document));
    expect(roundtrip.$(".target div").attr("style")).toBe(original.$(".target div").attr("style"));
    for (const selector of [".first", ".second"]) {
      expect(original.$("head style").text()).toContain(selector);
      expect(roundtrip.$("head style").text()).toContain(selector);
    }
  });

  it("merges generated HTML attributes by selector and attribute name", async () => {
    const source = sourceWith(
      '<mj-html-attributes><mj-selector path=".target">' +
        '<mj-html-attribute name="data-first">First</mj-html-attribute>' +
        '<mj-html-attribute name="data-last">Old</mj-html-attribute>' +
        '</mj-selector></mj-html-attributes><mj-html-attributes><mj-selector path=".target">' +
        '<mj-html-attribute name="data-last">Final</mj-html-attribute>' +
        "</mj-selector></mj-html-attributes>",
    );
    const { document, warnings } = fromMjml(source);
    expect(warnings).toEqual([]);
    const original = await compile(source);
    const roundtrip = await compile(toMjml(document));
    expect(original.$(".target").attr("data-first")).toBe("First");
    expect(original.$(".target").attr("data-last")).toBe("Final");
    expect(roundtrip.$(".target").attr()).toEqual(original.$(".target").attr());
  });

  it("uses the last font URL for a repeated family without losing other families", async () => {
    const source = sourceWith(
      '<mj-font name="Example" href="https://example.com/old.css" />' +
        '<mj-font name="Other" href="https://example.com/other.css" />' +
        '<mj-font name="Example" href="https://example.com/final.css" />',
    ).replace("</mj-column>", '<mj-text font-family="Other">Other marker</mj-text></mj-column>');
    const { document, warnings } = fromMjml(source);
    expect(warnings).toEqual([]);
    expect(document.root.props?.fontImports).toHaveLength(3);
    const original = await compile(source);
    const roundtrip = await compile(toMjml(document));
    const hrefs = ($: cheerio.CheerioAPI) =>
      $("link")
        .map((_, node) => $(node).attr("href"))
        .get();
    expect(hrefs(original.$)).toEqual([
      "https://example.com/final.css",
      "https://example.com/other.css",
    ]);
    expect(hrefs(roundtrip.$)).toEqual(hrefs(original.$));
  });
});
