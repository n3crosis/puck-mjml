import { describe, expect, it } from "vitest";
import { fromMjml } from "./import";
import { toMjml } from "./export";
import type { EmailBlock } from "./types";

const wrap = (content: string, head = "") =>
  `<mjml><mj-head>${head}</mj-head><mj-body><mj-section><mj-column>${content}</mj-column></mj-section></mj-body></mjml>`;
const content = (source: string) =>
  fromMjml(source).document.root.props!.sections![0]!.props.column as EmailBlock[];

describe("MJML import fidelity", () => {
  it("preserves native inheritance instead of injecting editor defaults", () => {
    const source = wrap(
      '<mj-text mj-class="large">Hello</mj-text><mj-spacer />',
      '<mj-attributes><mj-all font-family="Georgia" /><mj-text padding="42px" /><mj-class name="large" font-size="31px" /></mj-attributes>',
    );
    const output = toMjml(fromMjml(source).document);
    expect(output).toContain('<mj-text mj-class="large">Hello</mj-text>');
    expect(output).toContain("<mj-spacer />");
    expect(output).not.toContain('font-size="16px"');
    expect(output).not.toContain('background-color="#f5f5f5"');
  });

  it("does not override compiler defaults with a global editor font", () => {
    expect(toMjml(fromMjml(wrap("<mj-text>Hello</mj-text>")).document)).not.toContain(
      'font-family="Arial, sans-serif"',
    );
  });

  it("keeps HTML void elements from consuming following MJML siblings", () => {
    const blocks = content(
      wrap(
        '<mj-text>First<br>Second</mj-text><mj-spacer height="9px" /><mj-button href="https://example.com">Next</mj-button>',
      ),
    );
    expect(blocks.map((block) => block.type)).toEqual(["Text", "Spacer", "Button"]);
    expect(blocks[0]!.props.content).toContain("<br");
    expect(blocks[1]!.props.height).toBe(9);
  });

  it("preserves all accordion levels' attributes and classes", () => {
    const { document, warnings } = fromMjml(
      wrap(
        '<mj-accordion border="1px solid red" mj-class="accordion"><mj-accordion-element icon-width="24px" mj-class="item"><mj-accordion-title color="red" mj-class="title">Question</mj-accordion-title><mj-accordion-text padding="22px" mj-class="answer">Answer</mj-accordion-text></mj-accordion-element></mj-accordion>',
      ),
    );
    expect(warnings).toEqual([]);
    const output = toMjml(document);
    for (const attribute of [
      'border="1px solid red"',
      'icon-width="24px"',
      'color="red"',
      'padding="22px"',
      'mj-class="accordion"',
      'mj-class="item"',
      'mj-class="title"',
      'mj-class="answer"',
    ])
      expect(output).toContain(attribute);
  });

  it("keeps share-enabled and compiler-native social network names unchanged", () => {
    const { document, warnings } = fromMjml(
      wrap(
        '<mj-social><mj-social-element name="facebook" href="https://example.com">Facebook</mj-social-element><mj-social-element name="pinterest-noshare" href="https://example.com">Pin</mj-social-element></mj-social>',
      ),
    );
    expect(warnings).toEqual([]);
    const output = toMjml(document);
    expect(output).toContain('name="facebook"');
    expect(output).toContain('name="pinterest-noshare"');
  });

  it("preserves ending HTML with an explicit raw opt-in", () => {
    const source = wrap(
      '<mj-text><div data-source="kept"><img src="https://example.com/a.png">Copy</div></mj-text><mj-button href="https://example.com"><strong>Go</strong></mj-button><mj-navbar><mj-navbar-link href="https://example.com"><em>Home</em></mj-navbar-link></mj-navbar>',
    );
    const { document, warnings } = fromMjml(source);
    expect(warnings).toHaveLength(3);
    expect(() => toMjml(document)).toThrow(/allowRawHtml/);
    const output = toMjml(document, { allowRawHtml: true });
    expect(output).toContain(
      '<div data-source="kept"><img src="https://example.com/a.png">Copy</div>',
    );
    expect(output).toContain("<strong>Go</strong>");
    expect(output).toContain("<em>Home</em>");
  });

  it("preserves raw children in group, social and navbar order", () => {
    const source =
      '<mjml><mj-body><mj-section><mj-group><mj-raw><!-- group --></mj-raw><mj-column><mj-social><mj-raw><!-- social --></mj-raw><mj-social-element name="x">X</mj-social-element></mj-social><mj-navbar><mj-raw><!-- navbar --></mj-raw><mj-navbar-link href="https://example.com">Home</mj-navbar-link></mj-navbar></mj-column></mj-group></mj-section></mj-body></mjml>';
    const { document, warnings } = fromMjml(source);
    expect(warnings).toHaveLength(3);
    expect(() => toMjml(document)).toThrow(/allowRawHtml/);
    const output = toMjml(document, { allowRawHtml: true });
    for (const label of ["group", "social", "navbar"])
      expect(output).toContain(`<mj-raw><!-- ${label} --></mj-raw>`);
  });

  it("keeps nested tables as trusted source rather than duplicating inner rows", () => {
    const html = "<tr><td><table><tr><td>Nested</td></tr></table></td></tr>";
    const { document, warnings } = fromMjml(wrap(`<mj-table>${html}</mj-table>`));
    expect(warnings).toHaveLength(1);
    const table = content(wrap(`<mj-table>${html}</mj-table>`))[0]!;
    expect(table.props.bodyRows).toHaveLength(1);
    expect(table.props.htmlContent).toBe(html);
    expect(toMjml(document, { allowRawHtml: true })).toContain(html);
  });
});

describe("import review regressions", () => {
  it("treats prototype property names as unsupported attributes without crashing", () => {
    const { warnings } = fromMjml(wrap('<mj-text constructor="x" toString="y">Hello</mj-text>'));
    expect(warnings).toHaveLength(2);
    expect(warnings.every((warning) => warning.includes("Dropped unsupported attribute"))).toBe(
      true,
    );
  });

  it("preserves letter spacing and breakpoints outside visual-control bounds", () => {
    const { document, warnings } = fromMjml(
      wrap('<mj-text letter-spacing="25px">Hello</mj-text>', '<mj-breakpoint width="1200px" />'),
    );
    expect(warnings).toEqual([]);
    const output = toMjml(document);
    expect(output).toContain('letter-spacing="25px"');
    expect(output).toContain('<mj-breakpoint width="1200px" />');
  });

  it("preserves explicit empty native attributes behind the trusted-source gate", () => {
    const { document, warnings } = fromMjml(
      wrap(
        '<mj-text padding="" mj-class="">Hello</mj-text>',
        '<mj-attributes><mj-all font-family="" /></mj-attributes>',
      ),
    );
    expect(warnings).toHaveLength(1);
    expect(() => toMjml(document)).toThrow(/allowRawHtml/);
    const output = toMjml(document, { allowRawHtml: true });
    expect(output).toContain('padding=""');
    expect(output).toContain('font-family=""');
    expect(output).toContain('mj-class=""');
  });

  it.each([
    '<tr><td style="color: red">Named color</td></tr>',
    "<thead><tr><td>Non-header cell</td></tr></thead>",
    '<tbody><tr><td rowspan="0">First group</td></tr></tbody><tbody><tr><td>Second group</td></tr></tbody>',
    "<tr><td><!-- retain -->Comment</td></tr>",
    '<tr><td style="background-color: rgb(1,2,3)">RGB</td></tr>',
    '<tr><td style="width: calc(100% - 4px)">Width</td></tr>',
    '<tr><td style="vertical-align: baseline">Baseline</td></tr>',
    "<caption><strong>Title</strong></caption><tr><td>Value</td></tr>",
    '<tr style="background-color: red"><td>Row style</td></tr>',
  ])("preserves nonrepresentable table HTML: %s", (html) => {
    const { document, warnings } = fromMjml(wrap(`<mj-table>${html}</mj-table>`));
    expect(warnings).toHaveLength(1);
    expect(() => toMjml(document)).toThrow(/allowRawHtml/);
    expect(toMjml(document, { allowRawHtml: true })).toContain(html);
  });

  it("imports unusual accordion child order, duplicates, omission and raw without loss", () => {
    const source = wrap(
      '<mj-accordion><mj-raw><!-- before --></mj-raw><mj-accordion-element><mj-accordion-text>First</mj-accordion-text><mj-raw><!-- middle --></mj-raw><mj-accordion-title color="red">Title</mj-accordion-title><mj-accordion-title>Second title</mj-accordion-title></mj-accordion-element><mj-accordion-element /></mj-accordion>',
    );
    const { document, warnings } = fromMjml(source);
    expect(warnings).toHaveLength(2);
    const block = (document.root.props!.sections![0]!.props.column as EmailBlock[])[0]!;
    const items = block.props.items as Record<string, unknown>[];
    expect(items[0]).toMatchObject({ kind: "raw", html: "<!-- before -->" });
    expect((items[1]!.children as Record<string, unknown>[]).map((child) => child.kind)).toEqual([
      "text",
      "raw",
      "title",
      "title",
    ]);
    expect(items[2]!.children).toEqual([]);
    expect(() => toMjml(document)).toThrow(/allowRawHtml/);
    const output = toMjml(document, { allowRawHtml: true });
    expect(output).toContain(
      '<mj-accordion-text>First</mj-accordion-text><mj-raw><!-- middle --></mj-raw><mj-accordion-title color="red">Title</mj-accordion-title><mj-accordion-title>Second title</mj-accordion-title>',
    );
    expect(output).toContain("<mj-accordion-element></mj-accordion-element>");
  });

  it("preserves head ending-tag markup behind the trusted-source gate", () => {
    const { document, warnings } = fromMjml(
      wrap(
        "<mj-text>Hello</mj-text>",
        "<mj-title><em>Title</em></mj-title><mj-preview><strong>Preview</strong></mj-preview>",
      ),
    );
    expect(warnings).toHaveLength(2);
    expect(document.root.props!.subjectHtmlContent).toBe("<em>Title</em>");
    expect(document.root.props!.previewHtmlContent).toBe("<strong>Preview</strong>");
  });

  it("warns explicitly about unsupported structural comments and head raw attributes", () => {
    const { warnings } = fromMjml(
      wrap(
        "<!-- structural --><mj-text>Hello</mj-text>",
        '<mj-raw css-class="tracking"><meta name="x" content="y"></mj-raw>',
      ),
    );
    expect(warnings.some((warning) => warning.includes("structural comment"))).toBe(true);
    expect(warnings.some((warning) => warning.includes("Dropped css-class on head mj-raw"))).toBe(
      true,
    );
  });
});

it("keeps compiler-accepted blank strings without requiring trusted HTML", () => {
  const { document, warnings } = fromMjml(
    wrap(
      '<mj-button href="" font-family="" border="" css-class="">Label</mj-button>',
      '<mj-attributes><mj-all font-family="" /></mj-attributes>',
    ),
  );
  expect(warnings).toEqual([]);
  const output = toMjml(document);
  expect(output).toContain('href=""');
  expect(output).toContain('font-family=""');
  expect(output).toContain('border=""');
  expect(output).toContain('css-class=""');
});

it.each(['<a title="</mj-text>">Keep</a>', "<!-- </mj-text> --><p>Keep</p>"])(
  "does not terminate ending tags on closing-tag literals in attributes/comments: %s",
  (html) => {
    const { document, warnings } = fromMjml(
      wrap(`<mj-text>${html}</mj-text><mj-text>Next</mj-text>`),
    );
    const items = document.root.props!.sections![0]!.props.column as EmailBlock[];
    expect(items).toHaveLength(2);
    expect(items[0]!.props.htmlContent).toBe(html);
    expect(items[1]!.props.content).toContain("Next");
    expect(warnings.some((warning) => warning.includes("retained for review"))).toBe(true);
    expect(() => toMjml(document, { allowRawHtml: true })).toThrow(/invalid MJML closing tag/);
  },
);
