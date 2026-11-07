import * as cheerio from "cheerio";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { fromMjml } from "./import";
import { toMjml } from "./export";

beforeAll(() => vi.stubGlobal("window", globalThis));
afterAll(() => vi.unstubAllGlobals());

const sourceWith = (content: string, head = "") =>
  `<mjml><mj-head>${head}</mj-head><mj-body><mj-section><mj-column>${content}</mj-column></mj-section></mj-body></mjml>`;

async function compile(source: string) {
  const { default: mjml } = await import("mjml-browser");
  const result = await mjml(source, { validationLevel: "strict" });
  expect(result.errors).toEqual([]);
  return cheerio.load(result.html);
}

const entities = [
  { source: "&copy; &reg; &eacute;", attribute: "© ® é", text: "© ® é" },
  { source: "&#169; &#x1F642; &quot; &apos; &amp;", attribute: "© 🙂 \" ' &", text: "© 🙂 \" ' &" },
  { source: "&nbsp;Label&nbsp;", attribute: "\u00a0Label\u00a0", text: "\u00a0Label\u00a0" },
  { source: "&amp;copy;", attribute: "&copy;", text: "&copy;" },
  { source: "&amp;amp;copy;", attribute: "&amp;copy;", text: "&amp;copy;" },
  { source: "&amp;#9776;", attribute: "&#9776;", text: "&#9776;" },
  { source: "&copy", attribute: "©", text: "©" },
  { source: "&copycat", attribute: "&copycat", text: "©cat" },
  { source: "&notit;", attribute: "&notit;", text: "¬it;" },
  { source: "&not=foo", attribute: "&not=foo", text: "¬=foo" },
];

describe("native imported attribute entities", () => {
  it.each(entities)("preserves image alt and title: $source", async ({ source, attribute }) => {
    const mjml = sourceWith(
      `<mj-image src="https://example.com/image.png" alt="${source}" title="${source}" />`,
    );
    const { document, warnings } = fromMjml(mjml);
    expect(warnings).toEqual([]);
    const original = await compile(mjml);
    const roundtrip = await compile(toMjml(document));
    for (const name of ["alt", "title"]) {
      expect(original("img").attr(name)).toBe(attribute);
      expect(roundtrip("img").attr(name)).toBe(original("img").attr(name));
    }
  });

  it.each(["&copy;", "&reg;", "&#169;", "&amp;copy;", "&copycat", "&not=foo"])(
    "preserves link and asset destinations containing %s",
    async (entity) => {
      const mjml = sourceWith(
        `<mj-image src="https://example.com/${entity}.png" /><mj-button href="https://example.com/${entity}">Go</mj-button>`,
      );
      const { document, warnings } = fromMjml(mjml);
      expect(warnings).toEqual([]);
      const original = await compile(mjml);
      const roundtrip = await compile(toMjml(document));
      expect(roundtrip("img").attr("src")).toBe(original("img").attr("src"));
      expect(roundtrip("a").attr("href")).toBe(original("a").attr("href"));
    },
  );

  it.each(entities)("decodes navbar symbols exactly once: $source", async ({ source, text }) => {
    const mjml = sourceWith(
      `<mj-navbar hamburger="hamburger" ico-open="${source}" ico-close="${source}"><mj-navbar-link href="https://example.com">Go</mj-navbar-link></mj-navbar>`,
    );
    const { document, warnings } = fromMjml(mjml);
    expect(warnings).toEqual([]);
    const original = await compile(mjml);
    const roundtrip = await compile(toMjml(document));
    for (const selector of [".mj-menu-icon-open", ".mj-menu-icon-close"]) {
      // Native navbar renderers add their own ASCII indentation around the glyph.
      const content = ($: cheerio.CheerioAPI) =>
        $(selector)
          .text()
          .replace(/^[\t\n\r ]+|[\t\n\r ]+$/g, "");
      expect(content(original)).toBe(text);
      expect(content(roundtrip)).toBe(content(original));
    }
  });

  it("preserves entity-bearing component and class defaults", async () => {
    const mjml = sourceWith(
      '<mj-image src="https://example.com/image.png" mj-class="label" />' +
        '<mj-navbar hamburger="hamburger"><mj-navbar-link href="https://example.com">Go</mj-navbar-link></mj-navbar>',
      '<mj-attributes><mj-image alt="&copy;" /><mj-class name="label" title="&reg;" />' +
        '<mj-navbar ico-open="&amp;copy;" ico-close="&copycat" /></mj-attributes>',
    );
    const { document, warnings } = fromMjml(mjml);
    expect(warnings).toEqual([]);
    const original = await compile(mjml);
    const roundtrip = await compile(toMjml(document));
    expect(roundtrip("img").attr("alt")).toBe(original("img").attr("alt"));
    expect(roundtrip("img").attr("title")).toBe(original("img").attr("title"));
    expect(roundtrip(".mj-menu-icon-open").text()).toBe(original(".mj-menu-icon-open").text());
    expect(roundtrip(".mj-menu-icon-close").text()).toBe(original(".mj-menu-icon-close").text());
  });

  it.each(["  Label  ", "&nbsp;Label&nbsp;"])(
    "preserves boundary whitespace in inherited literal attributes: %s",
    async (value) => {
      const mjml = sourceWith(
        '<mj-image src="https://example.com/image.png" mj-class="label" />',
        `<mj-attributes><mj-image alt="${value}" /><mj-class name="label" title="${value}" /></mj-attributes>`,
      );
      const { document, warnings } = fromMjml(mjml);
      expect(warnings).toEqual([]);
      const original = await compile(mjml);
      const roundtrip = await compile(toMjml(document));
      expect(roundtrip("img").attr("alt")).toBe(original("img").attr("alt"));
      expect(roundtrip("img").attr("title")).toBe(original("img").attr("title"));
    },
  );

  it.each(["&amp;copy;", "&amp;amp;copy;", "&amp;#9776;"])(
    "normalizes constructed native navbar symbols only once: %s",
    async (value) => {
      const original = await compile(
        sourceWith(`<mj-navbar hamburger="hamburger" ico-open="${value}" />`),
      );
      const roundtrip = await compile(
        toMjml({
          root: {
            props: {
              sections: [
                {
                  type: "Section1",
                  props: {
                    column: [
                      {
                        type: "Navbar",
                        props: {
                          links: [],
                          mjmlAttributes: [
                            { name: "hamburger", value: "hamburger" },
                            { name: "ico-open", value },
                          ],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
          content: [],
        }),
      );
      expect(roundtrip(".mj-menu-icon-open").text()).toBe(original(".mj-menu-icon-open").text());
    },
  );

  it.each([" inline ", "&#105;nline", "&Tab;inline"])(
    "does not reinterpret the native style output token %s",
    async (inline) => {
      const mjml = sourceWith(
        '<mj-text css-class="target">Marker</mj-text>',
        `<mj-style inline="${inline}">.target div { color: red !important; }</mj-style>`,
      );
      const { document, warnings } = fromMjml(mjml);
      expect(warnings).toEqual([]);
      expect(document.root.props?.headStyles?.[0].inline).toBe("head");
      const original = await compile(mjml);
      const roundtrip = await compile(toMjml(document));
      expect(roundtrip(".target div").attr("style")).toBe(original(".target div").attr("style"));
    },
  );

  it.each([
    "javascript&colon;alert(1)",
    "jav&Tab;ascript&colon;alert(1)",
    "javascript&amp;colon;alert(1)",
    "&#106;avascript:alert(1)",
    "https://example.com/&NewLine;unsafe",
  ])("rejects unsafe encoded URLs before export: %s", (href) => {
    const { document, warnings } = fromMjml(
      sourceWith(`<mj-button href="${href}">Safe</mj-button>`),
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("Dropped unsupported attribute href");
    expect(toMjml(document)).not.toContain('href="');
  });

  it.each(["&lt;img src=x onerror=alert(1)&gt;", "&amp;lt;script&amp;gt;"])(
    "does not promote encoded navbar HTML into trusted content: %s",
    (icon) => {
      const { document, warnings } = fromMjml(
        sourceWith(`<mj-navbar hamburger="hamburger" ico-open="${icon}" />`),
      );
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain("Dropped unsupported attribute ico-open");
      const output = toMjml(document);
      expect(output).not.toContain("onerror");
      expect(output).not.toContain("script");
    },
  );
});
