import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { encodeEndingWhitespace, trustedEndingContent } from "./ending-content";
import { toMjml } from "./export";
import { fromMjml } from "./import";
import { nativeCatalog } from "./native-attributes";
import type { ExportOptions } from "./types";

beforeAll(() => vi.stubGlobal("window", globalThis));
afterAll(() => vi.unstubAllGlobals());

const enabled = { allowRawHtml: true };
const endingTags = Object.entries(nativeCatalog)
  .filter(([, spec]) => spec.endingTag)
  .map(([tag]) => tag);
const html =
  '<table role="presentation"><tr><td><font color="#123456">Price<sup>1</sup></font><img src="https://example.com/icon.png" width="20" alt="Icon"></td></tr></table>';
const templates =
  "{% if customer %}{{ customer.name | escape }} &amp; &#169; <%= customer.name %>{% endif %}";
const conditional =
  '<!--[if mso]><table role="presentation"><tr><td>Outlook only</td></tr></table><![endif]-->';

async function compile(tag: string, content: string) {
  const ending = `<${tag}>${trustedEndingContent(tag, content, enabled)}</${tag}>`;
  let child = ending;
  if (tag === "mj-social-element") child = `<mj-social>${ending}</mj-social>`;
  if (tag === "mj-navbar-link") child = `<mj-navbar>${ending}</mj-navbar>`;
  if (tag === "mj-accordion-title")
    child = `<mj-accordion><mj-accordion-element>${ending}<mj-accordion-text>Answer</mj-accordion-text></mj-accordion-element></mj-accordion>`;
  if (tag === "mj-accordion-text")
    child = `<mj-accordion><mj-accordion-element><mj-accordion-title>Question</mj-accordion-title>${ending}</mj-accordion-element></mj-accordion>`;
  const head = nativeCatalog[tag].kind === "head" ? ending : "";
  const body = nativeCatalog[tag].kind === "head" ? "<mj-text>Body</mj-text>" : child;
  const mjml = `<mjml><mj-head>${head}</mj-head><mj-body><mj-section><mj-column>${body}</mj-column></mj-section></mj-body></mjml>`;
  const { default: mjml2html } = await import("mjml-browser");
  return mjml2html(mjml, { validationLevel: "soft" });
}

describe("trusted native ending content", () => {
  it.each(endingTags)("preserves literal bytes for registered ending tag %s", (tag) => {
    const value = `\n  ${html}${templates}${conditional}\t\n`;
    expect(trustedEndingContent(tag, value, enabled)).toBe(value);
    expect(trustedEndingContent(tag, "", enabled)).toBe("");
  });

  it.each([undefined, false, "true", 1, null])(
    "requires strict host opt-in, received %s",
    (allowRawHtml) => {
      expect(() =>
        trustedEndingContent("mj-text", html, { allowRawHtml } as ExportOptions),
      ).toThrow(/allowRawHtml: true/);
    },
  );

  it.each([undefined, null, 0, {}, ["HTML"]])("rejects non-string content: %s", (value) => {
    expect(() => trustedEndingContent("mj-text", value, enabled)).toThrow(/must be text/);
  });

  it.each([
    "mj-column",
    "mj-section",
    "mj-unknown",
    "constructor",
    "__proto__",
    "mj-text.*",
    "MJ-TEXT",
  ])("rejects tags outside the registered ending-tag catalog: %s", (tag) => {
    expect(() => trustedEndingContent(tag, html, enabled)).toThrow(/registered MJML ending tag/);
  });

  it.each(endingTags)("rejects matching close sequences for %s", (tag) => {
    for (const closing of [`</${tag}>`, `</${tag.toUpperCase()}>`, `< / ${tag}\t>`, `</${tag}/>`]) {
      expect(() => trustedEndingContent(tag, `before${closing}after`, enabled)).toThrow(
        /closing tag/,
      );
    }
  });

  it.each([...new Set(["mjml", "mj-head", "mj-body", ...Object.keys(nativeCatalog)])])(
    "rejects closing native tag %s before it can change the surrounding tree",
    (closingTag) => {
      for (const container of ["mj-text", "mj-raw", "mj-title"]) {
        expect(() =>
          trustedEndingContent(container, `before</${closingTag}>after`, enabled),
        ).toThrow(/MJML closing tag/);
      }
    },
  );

  it("rejects ancestor escape sequences accepted silently by the native parser", () => {
    for (const ancestor of ["mj-column", "mj-section", "mj-body"]) {
      const value = `before</${ancestor}><${ancestor}><mj-text>after`;
      expect(() => trustedEndingContent("mj-text", value, enabled)).toThrow(/MJML closing tag/);
      expect(() => trustedEndingContent("mj-raw", value, enabled)).toThrow(/MJML closing tag/);
    }
  });

  it("rejects NUL and DEL without rewriting other literal characters", () => {
    for (const character of [String.fromCharCode(0), String.fromCharCode(127)]) {
      expect(() => trustedEndingContent("mj-text", `before${character}after`, enabled)).toThrow(
        /control character/,
      );
    }
    expect(
      trustedEndingContent("mj-text", "\t\r\n &lt;/mj-text&gt; </mj-text-example>", enabled),
    ).toBe("\t\r\n &lt;/mj-text&gt; </mj-text-example>");
  });

  it.each([
    "mj-text",
    "mj-button",
    "mj-social-element",
    "mj-navbar-link",
    "mj-accordion-title",
    "mj-accordion-text",
  ])("compiles unrestricted email markup and templates in %s", async (tag) => {
    const result = await compile(tag, `${html}${templates}${conditional}`);
    expect(result.errors).toEqual([]);
    for (const fragment of [
      '<table role="presentation">',
      '<font color="#123456">',
      "<sup>1</sup>",
      'src="https://example.com/icon.png"',
      templates,
      conditional,
    ]) {
      expect(result.html.includes(fragment), `${tag}: ${fragment}`).toBe(true);
    }
  });

  it("compiles native table content with raw cell markup and spans", async () => {
    const content = `<thead><tr><th scope="col" colspan="2">Heading</th></tr></thead><tbody><tr><td rowspan="2">${html}${templates}</td><td>Second cell</td></tr><tr><td>Third cell</td></tr></tbody>`;
    const result = await compile("mj-table", content);
    expect(result.errors).toEqual([]);
    for (const fragment of [
      'scope="col" colspan="2"',
      'rowspan="2"',
      '<font color="#123456">',
      "<sup>1</sup>",
      templates,
    ])
      expect(result.html.includes(fragment), fragment).toBe(true);
  });

  it.each(["mj-title", "mj-preview"])("preserves trusted head templates in %s", async (tag) => {
    const result = await compile(tag, `${templates}<span>Trusted head content</span>`);
    expect(result.errors).toEqual([]);
    expect(result.html.includes(templates)).toBe(true);
    expect(result.html.includes("<span>Trusted head content</span>")).toBe(true);
  });
});

describe("ending-tag edge whitespace", () => {
  it("encodes each edge once and leaves interior content unchanged", () => {
    expect(encodeEndingWhitespace("")).toBe("");
    expect(encodeEndingWhitespace(" \t\n")).toBe("&#32;&#9;&#10;");
    expect(encodeEndingWhitespace(" \tleft  right\r\n")).toBe("&#32;&#9;left  right&#13;&#10;");
    expect(encodeEndingWhitespace("left  right")).toBe("left  right");
    expect(encodeEndingWhitespace("<b> hello </b>")).toBe("<b> hello </b>");
  });

  it("preserves ECMAScript Unicode whitespace and non-whitespace code points", () => {
    const edge = "\u00a0\u1680\u2000\u200a\u2028\u2029\u202f\u205f\u3000\ufeff";
    const encoded = Array.from(edge, (character) => `&#${character.codePointAt(0)};`).join("");
    expect(encodeEndingWhitespace(`${edge}x${edge}`)).toBe(`${encoded}x${encoded}`);
    expect(encodeEndingWhitespace("\u0085\u200b😀\u0085\u200b")).toBe("\u0085\u200b😀\u0085\u200b");
  });

  it("serializes long interior spaces without repeatedly rescanning them", () => {
    const content = `left${" ".repeat(80_000)}right`;
    const started = performance.now();
    const output = toMjml({ root: { props: { subject: content, sections: [] } }, content: [] });
    expect(output).toContain(`<mj-title>${content}</mj-title>`);
    const imported = fromMjml(
      `<mjml><mj-body><mj-section><mj-column><mj-text>${content}</mj-text></mj-column></mj-section></mj-body></mjml>`,
    );
    expect(imported.warnings).toEqual([]);
    expect(toMjml(imported.document)).toContain(content);
    // This is deliberately generous: the linear path takes milliseconds, while
    // the old trailing-whitespace search takes seconds for this small input.
    expect(performance.now() - started).toBeLessThan(2_000);
  });
});
