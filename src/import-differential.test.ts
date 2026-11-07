import * as cheerio from "cheerio";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { fromMjml } from "./import";
import { toMjml } from "./export";
import type { EmailBlock } from "./types";

beforeAll(() => vi.stubGlobal("window", globalThis));
afterAll(() => vi.unstubAllGlobals());

async function compile(source: string) {
  const { default: mjml2html } = await import("mjml-browser");
  const result = await mjml2html(source, { validationLevel: "strict" });
  expect(result.errors).toEqual([]);
  return cheerio.load(result.html);
}

const wrap = (head: string, body: string) =>
  `<mjml><mj-head>${head}</mj-head><mj-body><mj-section>${body}</mj-section></mj-body></mjml>`;

describe("MJML import compiler differentials", () => {
  it.each(
    [false, true].flatMap((ordered) =>
      [
        "",
        "First\nSecond",
        "Plain answer",
        "First<br>Second",
        "&nbsp;Answer&nbsp;",
        "<p>First</p><p>Second</p>",
      ].map((content) => ({ ordered, content })),
    ),
  )(
    "preserves safe accordion answer markup, ordered=$ordered: $content",
    async ({ ordered, content }) => {
      const title = "<mj-accordion-title>Question</mj-accordion-title>";
      const answer = `<mj-accordion-text css-class="answer">${content}</mj-accordion-text>`;
      const source = wrap(
        '<mj-style inline="inline">.answer p { color: red; margin: 20px; }</mj-style>',
        `<mj-column><mj-accordion><mj-accordion-element>${ordered ? answer + title : title + answer}</mj-accordion-element></mj-accordion></mj-column>`,
      );
      const { document, warnings } = fromMjml(source);
      expect(warnings).toEqual([]);
      const original = await compile(source);
      const roundtrip = await compile(toMjml(document));
      expect(roundtrip(".answer").html()).toBe(original(".answer").html());
    },
  );

  it.each([false, true])(
    "keeps native accordion answer formatting through edits and undo, ordered=%s",
    async (ordered) => {
      const title = "<mj-accordion-title>Question</mj-accordion-title>";
      const answer = '<mj-accordion-text css-class="answer">Plain answer</mj-accordion-text>';
      const source = wrap(
        "",
        `<mj-column><mj-accordion><mj-accordion-element>${ordered ? answer + title : title + answer}</mj-accordion-element></mj-accordion></mj-column>`,
      );
      const original = fromMjml(source).document;
      const changed = structuredClone(original);
      const accordion = (changed.root.props!.sections![0]!.props.column as EmailBlock[])[0]!;
      const item = (accordion.props.items as Record<string, unknown>[])[0]!;
      const text = ordered ? (item.children as Record<string, unknown>[])[0]! : item;
      const metadata = text.importedRichText as Record<string, unknown>;
      const safeSource = metadata.source;
      metadata.source = '<script>alert(1)</script><p onclick="alert(1)">Safe</p>';
      expect(toMjml(changed)).not.toContain("alert(");
      metadata.source = safeSource;
      text.content = "<p>Edited answer</p>";
      expect((await compile(toMjml(changed)))(".answer").html()?.trim()).toBe("Edited answer");
      text.content = "<p>First</p><p>Second</p>";
      expect((await compile(toMjml(changed)))(".answer p")).toHaveLength(2);
      text.content = '<p onclick="alert(1)">Safe<script>alert(1)</script></p>';
      expect(toMjml(changed)).not.toContain("alert(");
      expect(
        (await compile(toMjml(JSON.parse(JSON.stringify(original)))))(".answer").html()?.trim(),
      ).toBe("Plain answer");
    },
  );
  it("preserves native pixel columns without a lossy-conversion warning", async () => {
    const source = wrap(
      "",
      '<mj-column css-class="target" width="56px"><mj-text>Icon</mj-text></mj-column><mj-column><mj-text>Copy</mj-text></mj-column>',
    );
    const { document, warnings } = fromMjml(source);
    expect(warnings).toEqual([]);
    const output = toMjml(document);
    expect(output).toContain('width="56px"');
    const original = await compile(source);
    const roundtrip = await compile(output);
    expect(roundtrip(".target").attr("style")).toBe(original(".target").attr("style"));
    expect(roundtrip(".target").attr("class")).toBe(original(".target").attr("class"));
  });
  it.each([
    "<p>First</p><p>Second</p>",
    "<h1>Heading</h1><h2>Subheading</h2><p>Body</p>",
    "Plain text",
    "First<br>Second<strong>Inline</strong>",
  ])("keeps unchanged safe text structure and native styles: %s", async (content) => {
    const source = wrap(
      '<mj-style inline="inline">p { color: red; font-size: 30px; }</mj-style>',
      `<mj-column><mj-text css-class="target">${content}</mj-text></mj-column>`,
    );
    const { document, warnings } = fromMjml(source);
    expect(warnings).toEqual([]);
    const original = await compile(source);
    const roundtrip = await compile(toMjml(document));
    expect(roundtrip(".target").html()).toBe(original(".target").html());
  });

  it("preserves native text styling after content edits and restores undo", () => {
    const source = wrap("", "<mj-column><mj-text><p>Original</p></mj-text></mj-column>");
    const document = fromMjml(source).document;
    const original = toMjml(document);
    const edited = structuredClone(document);
    const text = (edited.root.props!.sections![0]!.props.column as EmailBlock[])[0]!;
    text.props.color = "#ff0000";
    expect(toMjml(edited)).toContain('<mj-text color="#ff0000"><p>Original</p></mj-text>');
    text.props.content = "<p>Edited</p>";
    expect(toMjml(edited)).toContain('<mj-text color="#ff0000"><p>Edited</p></mj-text>');
    expect(toMjml(JSON.parse(JSON.stringify(document)))).toBe(original);
  });

  it.each([
    ["mj-text", '<mj-text css-class="target">&nbsp;&nbsp;Label&nbsp;&nbsp;</mj-text>'],
    ["mj-button", '<mj-button css-class="target">&nbsp;&nbsp;Label&nbsp;&nbsp;</mj-button>'],
    [
      "mj-social-element",
      '<mj-social css-class="target"><mj-social-element name="facebook">&nbsp;&nbsp;Label&nbsp;&nbsp;</mj-social-element></mj-social>',
    ],
    [
      "mj-navbar-link",
      '<mj-navbar css-class="target"><mj-navbar-link href="https://example.com">&nbsp;&nbsp;Label&nbsp;&nbsp;</mj-navbar-link></mj-navbar>',
    ],
  ])("preserves entity-encoded boundary whitespace in %s", async (_, content) => {
    const source = wrap("", `<mj-column>${content}</mj-column>`);
    const { document, warnings } = fromMjml(source);
    expect(warnings).toEqual([]);
    const original = await compile(source);
    const roundtrip = await compile(toMjml(document));
    expect(original(".target").text()).toContain("\u00a0\u00a0Label\u00a0\u00a0");
    expect(roundtrip(".target").text()).toBe(original(".target").text());
  });

  it("preserves entity-encoded spaces in title, preview, and generated HTML attributes", async () => {
    const source = wrap(
      '<mj-title>&nbsp;Subject&nbsp;</mj-title><mj-preview>&nbsp;Preview&nbsp;</mj-preview><mj-html-attributes><mj-selector path=".target"><mj-html-attribute name="data-label">&nbsp;Value&nbsp;</mj-html-attribute></mj-selector></mj-html-attributes>',
      '<mj-column><mj-text css-class="target">Text</mj-text></mj-column>',
    );
    const { document, warnings } = fromMjml(source);
    expect(warnings).toEqual([]);
    const original = await compile(source);
    const roundtrip = await compile(toMjml(document));
    expect(roundtrip("title").text()).toBe(original("title").text());
    expect(roundtrip("title").text()).toBe("\u00a0Subject\u00a0");
    expect(roundtrip("body").text()).toContain("\u00a0Preview\u00a0");
    expect(roundtrip(".target").attr("data-label")).toBe(original(".target").attr("data-label"));
  });

  it.each([
    "<tr><th>Heading</th><td>Body</td></tr>",
    "<thead><tr><th>Heading</th></tr></thead><tbody><tr><td>Body</td></tr></tbody>",
    "<tr><td><h1>Heading</h1><p>One</p><p>Two</p></td></tr>",
  ])("keeps safe native table cell structure and omissions: %s", async (content) => {
    const source = wrap(
      '<mj-style inline="inline">th { color: red; } td { border: 1px solid blue; }</mj-style>',
      `<mj-column><mj-table css-class="target">${content}</mj-table></mj-column>`,
    );
    const { document, warnings } = fromMjml(source);
    expect(warnings).toEqual([]);
    const original = await compile(source);
    const roundtrip = await compile(toMjml(document));
    expect(roundtrip(".target > table").html()).toBe(original(".target > table").html());
  });

  it("does not change native table cell defaults after text or width edits", async () => {
    const source = wrap(
      "",
      '<mj-column><mj-table css-class="target"><tr><th>Heading</th><td>Body</td></tr></mj-table></mj-column>',
    );
    const document = fromMjml(source).document;
    const table = (document.root.props!.sections![0]!.props.column as EmailBlock[])[0]!;
    const rows = table.props.bodyRows as { cells: Record<string, unknown>[] }[];
    rows[0]!.cells[0]!.content = "<p>Edited</p>";
    rows[0]!.cells[1]!.width = "60%";
    const output = await compile(toMjml(document));
    const header = output(".target th");
    expect(header.text()).toBe("Edited");
    expect(header.attr("style")).toBeUndefined();
    expect(header.attr("scope")).toBeUndefined();
    expect(header.find("p")).toHaveLength(0);
    expect(output(".target td").attr("style")).toBe("width:60%");
    rows[0]!.cells[0]!.align = "left";
    const aligned = await compile(toMjml(document));
    expect(aligned(".target th").attr("style")).toBe("text-align:left");
  });

  it("sanitizes forged imported table source and edited cell metadata", () => {
    const document = fromMjml(
      wrap("", "<mj-column><mj-table><tr><td>Safe</td></tr></mj-table></mj-column>"),
    ).document;
    const table = (document.root.props!.sections![0]!.props.column as EmailBlock[])[0]!;
    table.props.importedTableContent!.source =
      '<tr onclick="alert(1)"><td style="background:url(javascript:alert(1))"><script>alert(1)</script>Safe</td></tr>';
    expect(toMjml(document)).not.toContain("alert(");
    const cell = (table.props.bodyRows as { cells: Record<string, unknown>[] }[])[0]!.cells[0]!;
    cell.content = '<p onclick="alert(1)">Changed<script>alert(1)</script></p>';
    expect(toMjml(document)).not.toContain("alert(");
    expect(toMjml(document)).toContain("Changed");
  });

  it("does not trust stored imported-content metadata", () => {
    const document = fromMjml(wrap("", "<mj-column><mj-text>Safe</mj-text></mj-column>")).document;
    const text = (document.root.props!.sections![0]!.props.column as EmailBlock[])[0]!;
    text.props.importedRichText!.source = '<script>alert(1)</script><p onclick="alert(1)">Safe</p>';
    const output = toMjml(document);
    expect(output).toContain("<p>Safe</p>");
    expect(output).not.toContain("alert(");
  });

  it("preserves a compiler-accepted empty carousel", async () => {
    const source = wrap("", "<mj-column><mj-carousel /></mj-column>");
    const { document, warnings } = fromMjml(source);
    expect(warnings).toEqual([]);
    const original = await compile(source);
    const roundtrip = await compile(toMjml(document));
    const stable = (html: string | null) =>
      html?.replace(/mj-carousel-[\da-f]{16}/g, "mj-carousel-ID");
    expect(stable(roundtrip(".mj-carousel").html())).toBe(stable(original(".mj-carousel").html()));
  });

  it.each([
    {
      content:
        '<mj-social css-class="target" border-radius="10%"><mj-social-element name="facebook">Hello</mj-social-element></mj-social>',
      selector: ".target img",
      attribute: "style",
      fragment: "border-radius:10%",
    },
    {
      content:
        '<mj-table css-class="target" cellpadding="2.5" cellspacing="1.5"><tr><td>Hello</td></tr></mj-table>',
      selector: ".target > table",
      attribute: "cellpadding",
      fragment: "2.5",
    },
    {
      content:
        '<mj-table css-class="target" cellpadding="2.5" cellspacing="1.5"><tr><td>Hello</td></tr></mj-table>',
      selector: ".target > table",
      attribute: "cellspacing",
      fragment: "1.5",
    },
    {
      content: '<mj-text css-class="target" font-weight="450.5">Hello</mj-text>',
      selector: ".target > div",
      attribute: "style",
      fragment: "font-weight:450.5",
    },
  ])(
    "preserves native values narrowed by visual serializers: $fragment",
    async ({ content, selector, attribute, fragment }) => {
      const source = wrap("", `<mj-column>${content}</mj-column>`);
      const { document, warnings } = fromMjml(source);
      expect(warnings).toEqual([]);
      const original = await compile(source);
      const roundtrip = await compile(toMjml(document));
      expect(original(selector).attr(attribute)).toContain(fragment);
      expect(roundtrip(selector).attr(attribute)).toBe(original(selector).attr(attribute));
    },
  );

  it.each([false, true])(
    "retains empty nested class resets, separate definitions: %s",
    async (separate) => {
      const source = wrap(
        `<mj-attributes><mj-class name="reset"><mj-text color="red" />${separate ? '</mj-class><mj-class name="reset">' : ""}<mj-text /></mj-class></mj-attributes>`,
        '<mj-column mj-class="reset"><mj-text css-class="target">Hello</mj-text></mj-column>',
      );
      const { document, warnings } = fromMjml(source);
      expect(warnings).toEqual([]);
      const original = await compile(source);
      const roundtrip = await compile(toMjml(document));
      expect(original(".target > div").attr("style")).toContain("color:#000000");
      expect(roundtrip(".target > div").attr("style")).toBe(
        original(".target > div").attr("style"),
      );
    },
  );

  it("keeps entity spelling in selectors matching compiler-encoded HTML attributes", async () => {
    const source = wrap(
      `<mj-html-attributes><mj-selector path='a[href="https://example.com/?a=1&amp;b=2"]'><mj-html-attribute name="data-target">matched</mj-html-attribute></mj-selector></mj-html-attributes>`,
      '<mj-column><mj-button href="https://example.com/?a=1&amp;b=2">Hello</mj-button></mj-column>',
    );
    const { document, warnings } = fromMjml(source);
    expect(warnings).toEqual([]);
    const original = await compile(source);
    const roundtrip = await compile(toMjml(document));
    expect(original("a").attr("data-target")).toBe("matched");
    expect(roundtrip("a").attr("data-target")).toBe(original("a").attr("data-target"));
  });
});
