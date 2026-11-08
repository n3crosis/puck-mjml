import { templateInventory, templateSource } from "../tests/template-inventory";
import { load } from "cheerio";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { fromMjml } from "./import";
import { compileEmail, toMjml } from "./export";
import { importedRichText } from "./imported-content";
import { hasSourceWhitespaceStyles, normalizeImportedWhitespace } from "./imported-whitespace";
import { sanitizeDocumentRichText } from "./normalize";
import type { EmailBlock, EmailDocument } from "./types";

beforeAll(() => vi.stubGlobal("window", globalThis));
afterAll(() => vi.unstubAllGlobals());

const fixture = (text: string, head = "") =>
  fromMjml(
    `<mjml><mj-head>${head}</mj-head><mj-body><mj-section><mj-column><mj-text>${text}</mj-text></mj-column></mj-section></mj-body></mjml>`,
  ).document;
const textBlock = (document: EmailDocument) =>
  (document.root.props!.sections![0]!.props.column as EmailBlock[])[0]!;
function textBlocks(value: unknown): EmailBlock[] {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap(textBlocks);
  const record = value as Record<string, unknown>;
  return [
    ...(record.type === "Text" ? [record as unknown as EmailBlock] : []),
    ...Object.values(record).flatMap(textBlocks),
  ];
}

describe("imported HTML whitespace", () => {
  it("collapses formatting across inline markup without inserting or losing word spaces", () => {
    expect(
      normalizeImportedWhitespace(
        "\n  <p>\n    One <strong>two\n      three </strong>\n    <em>four</em> five.\n  </p>\n  <p>Six<br />\n    seven.</p>\n",
      ),
    ).toBe("<p>One <strong>two three </strong><em>four</em> five.</p><p>Six<br />seven.</p>");
    expect(normalizeImportedWhitespace("One<strong>two</strong>three")).toBe(
      "One<strong>two</strong>three",
    );
  });

  it("keeps deliberate pre/code whitespace, nonbreaking spaces, and line-break markup", () => {
    const source =
      "<p>  A&nbsp;&nbsp;B\n  C<br />D <code>  x\n    y\t</code> E</p>\n<pre><code>\n  const x = 1;\n    x++;\n</code></pre>";
    const normalized = normalizeImportedWhitespace(source);
    const $ = load(normalized);
    expect($("p").text()).toBe("A\u00a0\u00a0B CD   x\n    y\t E");
    expect($("p br")).toHaveLength(1);
    expect($("p code").text()).toBe("  x\n    y\t");
    expect($("pre code").text()).toBe("\n  const x = 1;\n    x++;\n");
    expect(normalizeImportedWhitespace(normalized)).toBe(normalized);
    expect(normalizeImportedWhitespace("<p>A\n  B</p><pre>\n\n  code</pre>")).toBe(
      "<p>A B</p><pre>\n\n  code</pre>",
    );
  });

  it.each(["pre", "pre-wrap", "pre-line", "break-spaces"])(
    "preserves source spacing when inline or head CSS explicitly requests %s",
    (mode) => {
      const text = "One\n      two";
      const inline = textBlock(fixture(`<p style="white-space:${mode}">${text}</p>`));
      expect(inline.props.content).toBe(`<p>${text}</p>`);
      expect(inline.props.htmlContent).toContain(`white-space:${mode}`);
      const head = textBlock(
        fixture(text, `<mj-style>.intentional, body p { white-space: ${mode}; }</mj-style>`),
      );
      expect(head.props.content).toBe(`<p>${text}</p>`);
    },
  );

  it.each([
    "white-space:normal",
    "white-space:nowrap;",
    "WHITE-SPACE : NORMAL !IMPORTANT;",
    "white-space:\n\tNoWrAp ! important",
    "white-space /* property */ : normal /* value */ !/**/important;",
    "white-space:nowrap; white-space:normal !important;",
    "white-space:normal; color:red; white-space:nowrap;",
  ])("collapses ordinary import text with safe inline or head CSS: %s", (css) => {
    const source = "One\n      two";
    const inline = `<p style="${css}">${source}</p>`;
    expect(hasSourceWhitespaceStyles(inline)).toBe(false);
    const block = textBlock(fixture(inline));
    expect(block.props.content).toBe("<p>One two</p>");
    expect(block.props.htmlContent).toBe(inline);
    for (const tag of ["style", "mj-style"]) {
      expect(hasSourceWhitespaceStyles(`<${tag}>.label { ${css} }</${tag}>`)).toBe(false);
    }
    expect(textBlock(fixture(source, `<mj-style>.label { ${css} }</mj-style>`)).props.content).toBe(
      "<p>One two</p>",
    );
  });

  it.each([
    "white-space:pre; white-space:nowrap !important;",
    "white-space:normal; white-space:pre-wrap;",
    "white-space:var(--spacing, nowrap);",
    "white-space:inherit;",
    "white-space:initial;",
    "white-space:unset;",
    "white-space:revert;",
    "white-space:revert-layer;",
    "white-space:collapse nowrap;",
    "white-space:normal unknown;",
    "white-space:'normal';",
    "white-space:no/**/wrap;",
    "white-space:normal !important important;",
    "white-space:nowrap !important/**/important;",
    "white-space:normal !im/**/portant;",
    "white-space:nowrap\u00a0;",
    "white-space:n\\6f rmal;",
    "white\\2d space:normal;",
    "white-space /**/ : pre-line;",
    "white-space-collapse:collapse;",
    "white-space-trim:none;",
    "white-space-future:normal;",
    "text-space-collapse:collapse;",
    "all:initial;",
    "all /**/ : unset;",
    "white-space:nowrap; broken declaration",
  ])("preserves spacing for unresolved inline or head CSS: %s", (css) => {
    const source = "One\n      two";
    const inline = `<p style="${css}">${source}</p>`;
    expect(hasSourceWhitespaceStyles(inline)).toBe(true);
    expect(textBlock(fixture(inline)).props.content).toBe(`<p>${source}</p>`);
    expect(textBlock(fixture(source, `<mj-style>.label { ${css} }</mj-style>`)).props.content).toBe(
      `<p>${source}</p>`,
    );
  });

  it("keeps every unresolved rule without resolving specificity, order, or conditions", () => {
    const source = "One\n      two";
    for (const [inline, head] of [
      ["white-space:normal !important", ".unmatched { white-space:pre; }"],
      ["white-space:pre-wrap", "* { white-space:nowrap !important; }"],
      ["white-space:nowrap", "@media (width:1px) { .label { white-space:pre-line; } }"],
      ["white-space:normal", "@import url(https://example.com/email.css);"],
    ]) {
      expect(
        textBlock(fixture(`<p style="${inline}">${source}</p>`, `<mj-style>${head}</mj-style>`))
          .props.content,
      ).toBe(`<p>${source}</p>`);
    }
    for (const head of [
      '<link rel="stylesheet" href="https://example.com/email.css" />',
      '<mj-include path="email.css" type="css" />',
    ]) {
      expect(hasSourceWhitespaceStyles(`<mj-head>${head}</mj-head>`)).toBe(true);
    }
  });

  it("decodes inline attribute entities without treating unknown source contexts as safe CSS", () => {
    expect(hasSourceWhitespaceStyles('<p style="white-space&#58;nowrap">A</p>')).toBe(false);
    expect(
      hasSourceWhitespaceStyles('<p style="white-space:nowrap&#59;white-space&#58;pre">A</p>'),
    ).toBe(true);
    for (const source of [
      '<mj-text white-space="nowrap">A</mj-text>',
      '<p class="whitespace-pre-wrap">A</p>',
      '<p class="whitespace-[var(--mode)]">A</p>',
      "<!--[if mso]><style>p { white-space:pre }</style><![endif]-->",
    ]) {
      expect(hasSourceWhitespaceStyles(source)).toBe(true);
    }
  });

  it("handles long ambiguous source tokens and unclosed comments conservatively", () => {
    expect(hasSourceWhitespaceStyles(`<mj-text>${"white-space-".repeat(20000)}</mj-text>`)).toBe(
      true,
    );
    expect(
      hasSourceWhitespaceStyles(`<mj-style>p { white-space:nowrap; ${"/*".repeat(20000)}`),
    ).toBe(true);
    expect(hasSourceWhitespaceStyles(`<mj-text>all /* comment */ : inherit;</mj-text>`)).toBe(true);
  });

  it("retains pre/code text while normalizing ordinary text beside safe whitespace CSS", () => {
    const source =
      '<p style="white-space:nowrap">One\n    two <code>  x\n    y\t</code> three</p><pre>\n\n  code</pre>';
    const block = textBlock(fixture(source, "<mj-style>.label { white-space:normal; }</mj-style>"));
    expect(block.props.content).toBe(
      "<p>One two <code>  x\n    y\t</code> three</p><pre>\n\n  code</pre>",
    );
    expect(block.props.htmlContent).toBe(source);
  });

  it.each([
    ".intentional { white-space-collapse: preserve; }",
    ".intentional { white-space-trim: none; }",
    ".intentional { all: inherit; }",
    ".intentional { white\\2d space: pre-wrap; }",
    ".intentional { white\\-space: pre-wrap; }",
    '@import url("https://example.com/email.css");',
  ])("does not guess whitespace semantics of a custom stylesheet: %s", (css) => {
    const block = textBlock(fixture("One\n    two", `<mj-style>${css}</mj-style>`));
    expect(block.props.content).toBe("<p>One\n    two</p>");
  });

  it("normalizes import once without changing original export, edits, or undo", async () => {
    const source = "One\n    <strong>two</strong>\n    three.";
    const css = ".label { white-space: nowrap !important; }";
    const document = fixture(source, `<mj-style>${css}</mj-style>`);
    const block = textBlock(document);
    const baseline = block.props.content;
    expect(baseline).toBe("<p>One <strong>two</strong> three.</p>");
    expect(importedRichText(block.props)).toBe(source);
    const originalExport = toMjml(document);
    const originalHtml = (await compileEmail(document)).html;
    const originalFontSize = block.props.fontSize;
    block.props.fontSize = 20;
    expect(importedRichText(block.props)).toBe(source);
    block.props.fontSize = originalFontSize;
    const edited = "<p>Edited&nbsp; text<br />Second  line</p>";
    block.props.content = edited;
    const sanitized = sanitizeDocumentRichText(document);
    expect(textBlock(sanitized).props.content).toBe("<p>Edited\u00a0 text<br />Second  line</p>");
    expect(importedRichText(block.props)).toBe("Edited\u00a0 text<br />Second  line");
    expect(toMjml(document)).not.toContain(source);
    block.props.content = baseline;
    // Undo restores the original source, not the normalized editor string.
    expect(importedRichText(block.props)).toBe(source);
    expect(toMjml(document)).toBe(originalExport);
    expect((await compileEmail(document)).html).toBe(originalHtml);
    expect(originalExport).toContain(source);
    expect(originalHtml).toContain(source);
    expect(originalExport).toContain(css);
    expect(originalHtml).toContain(css);
  });

  it("normalizes unrelated editable text while exporting original inline spacing and CSS", async () => {
    const styled = '<p style="white-space:nowrap">A\n    compact label</p>';
    const ordinary = "Review the changes,\n    then continue.";
    const source = `<mjml><mj-head><mj-style>.label { white-space:normal; }</mj-style></mj-head>
      <mj-body><mj-section><mj-column><mj-text>${styled}</mj-text><mj-text>${ordinary}</mj-text>
      </mj-column></mj-section></mj-body></mjml>`;
    const { document } = fromMjml(source);
    const [label, paragraph] = textBlocks(document);
    expect(label.props.content).toBe("<p>A compact label</p>");
    expect(paragraph.props.content).toBe("<p>Review the changes, then continue.</p>");
    expect(label.props.htmlContent).toBe(styled);
    expect(importedRichText(paragraph.props)).toBe(ordinary);
    const exported = toMjml(document, { allowRawHtml: true });
    expect(exported).toContain(styled);
    expect(exported).toContain(ordinary);
    const { default: mjml2html } = await import("mjml-browser");
    const canonical = await mjml2html(source, { validationLevel: "strict" });
    const compiled = await compileEmail(document, { allowRawHtml: true });
    expect(compiled.errors).toEqual([]);
    for (const html of [canonical.html, compiled.html]) {
      expect(html).toContain(styled);
      expect(html).toContain(ordinary);
      expect(html).toContain(".label { white-space:normal; }");
    }
  });

  it("normalizes separate formatted continuations while retaining compiled HTML text", async () => {
    const source = `<mjml><mj-body><mj-section><mj-column>
      <mj-text>Review the changes,
          then continue here:</mj-text>
      <mj-text>Otherwise discard
          this message.</mj-text>
      </mj-column></mj-section></mj-body></mjml>`;
    const { document, warnings } = fromMjml(source);
    expect(warnings).toEqual([]);
    const blocks = textBlocks(document);
    for (const [start, continuation] of [
      ["Review the changes", "then continue here:"],
      ["Otherwise discard", "this message."],
    ]) {
      const block = blocks.find((entry) => String(entry.props.content).includes(start))!;
      expect(block.props.content).toContain(` ${continuation}`);
      expect(block.props.content).not.toMatch(/[\r\n\t]| {2}/);
      expect(importedRichText(block.props)).toContain(`\n          ${continuation}`);
    }
    const { default: mjml2html } = await import("mjml-browser");
    const canonical = await mjml2html(source, { validationLevel: "strict" });
    const compiled = await compileEmail(document);
    expect(compiled.errors).toEqual([]);
    for (const start of ["Review the changes", "Otherwise discard"]) {
      const paragraph = (html: string) => {
        const $ = load(html);
        const element = $("div").filter(
          (_index, node) => $(node).text().startsWith(start) && !$(node).find("div").length,
        );
        return { content: element.html(), style: element.attr("style") };
      };
      expect(paragraph(compiled.html)).toEqual(paragraph(canonical.html));
    }
  });

  it("keeps intrinsic sizing from disabling ordinary text normalization", () => {
    const source = `<mjml><mj-head><mj-style>.chip > div { width:max-content; }</mj-style></mj-head>
      <mj-body><mj-section><mj-column><mj-text css-class="chip">A compact label</mj-text>
      <mj-text>The existing notes have provided a
          solution for this issue.</mj-text></mj-column></mj-section></mj-body></mjml>`;
    expect(hasSourceWhitespaceStyles(source)).toBe(false);
    const { document, warnings } = fromMjml(source);
    expect(warnings).toEqual([]);
    const intro = textBlocks(document).find((block) =>
      String(block.props.content).includes("The existing notes"),
    )!;
    expect(load(String(intro.props.content)).root().text()).toBe(
      "The existing notes have provided a solution for this issue.",
    );
    // Native editor text collapses source indentation; retained export stays exact.
    expect(importedRichText(intro.props)).toMatch(/provided a\s*\n\s+solution/);
  });
  it.each(templateInventory)(
    "$file removes source indentation from ordinary editable text",
    (entry) => {
      const { document, warnings } = fromMjml(templateSource(entry));
      expect(warnings).toEqual([]);
      for (const block of textBlocks(document)) {
        const $ = load(String(block.props.content));
        $("pre,code").remove();
        expect($.root().text()).not.toMatch(/[\r\n\t]| {2}/);
      }
    },
  );
});
