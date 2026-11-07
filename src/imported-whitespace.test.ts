import { readFileSync, readdirSync } from "node:fs";
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
const templates = new URL("../templates/", import.meta.url);
const dropbox = () =>
  readFileSync(new URL("Community/reset-password/dropbox-reset-password.mjml", templates), "utf8");

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
    const document = fixture(source);
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
  });

  it("fixes both Dropbox continuations while retaining canonical compiled HTML text", async () => {
    const source = dropbox();
    const { document, warnings } = fromMjml(source);
    expect(warnings).toEqual([]);
    const blocks = textBlocks(document);
    for (const [start, continuation] of [
      ["Someone recently", "you can set a new password here:"],
      ["If you don't want", "this message."],
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
    for (const start of ["Someone recently", "If you don't want"]) {
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

  const files = readdirSync(templates, { recursive: true, encoding: "utf8" }).filter((file) =>
    file.endsWith(".mjml"),
  );
  it("keeps Stack Overflow's intrinsic chip sizing from disabling ordinary text normalization", () => {
    const source = readFileSync(
      new URL("Community/newsletters/stack-overflow-tips.mjml", templates),
      "utf8",
    );
    expect(source).toMatch(/\.stack-heart > div\s*\{[^}]*width:\s*max-content/);
    expect(hasSourceWhitespaceStyles(source)).toBe(false);
    const { document, warnings } = fromMjml(source);
    expect(warnings).toEqual([]);
    const intro = textBlocks(document).find((block) =>
      String(block.props.content).includes("With more than 18 million questions"),
    )!;
    expect(load(String(intro.props.content)).root().text()).toBe(
      "With more than 18 million questions, it's possible that someone has already provided a solution to the problem you're facing.",
    );
    // Native editor text collapses source indentation; retained export stays exact.
    expect(importedRichText(intro.props)).toMatch(/provided a\s*\n\s+solution/);
  });
  it("covers all 62 canonical files", () => expect(files).toHaveLength(62));
  it.each(files)("removes source indentation from ordinary editable text in %s", (file) => {
    const { document, warnings } = fromMjml(readFileSync(new URL(file, templates), "utf8"));
    expect(warnings).toEqual([]);
    for (const block of textBlocks(document)) {
      const $ = load(String(block.props.content));
      $("pre,code").remove();
      expect($.root().text()).not.toMatch(/[\r\n\t]| {2}/);
    }
  });
});
