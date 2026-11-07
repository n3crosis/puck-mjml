import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { fromMjml } from "./import";
import { compileEmail, toMjml } from "./export";
import { createExampleDocument } from "./document";
import { emailTemplates } from "./templates/registry";
import type { EmailBlock } from "./types";

beforeAll(() => vi.stubGlobal("window", globalThis));
afterAll(() => vi.unstubAllGlobals());

function blockTree(blocks: EmailBlock[]): EmailBlock[] {
  return blocks.flatMap((block) => [
    block,
    ...Object.values(block.props).flatMap((value) =>
      Array.isArray(value) &&
      value.every((item) => item && typeof item === "object" && "type" in item && "props" in item)
        ? blockTree(value as EmailBlock[])
        : [],
    ),
  ]);
}

const MINIMAL = `<mjml lang="en" dir="ltr">
  <mj-head>
    <mj-title>Test email</mj-title>
    <mj-preview>Preview text</mj-preview>
    <mj-breakpoint width="480px" />
  </mj-head>
  <mj-body width="600px" background-color="#eeeeee">
    <mj-section background-color="#ffffff" padding="20px">
      <mj-column>
        <mj-text font-size="14px" color="#333333" align="center">Hello <strong>world</strong></mj-text>
        <mj-button href="https://example.com/">Start</mj-button>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`;

describe("fromMjml", () => {
  it("imports head settings, body width, and a single plain column as a one-column section", () => {
    const { document, warnings } = fromMjml(MINIMAL);
    expect(warnings).toEqual([]);
    const settings = document.root.props!;
    expect(settings.subject).toBe("Test email");
    expect(settings.previewText).toBe("Preview text");
    expect(settings.breakpoint).toBe(480);
    expect(settings.width).toBe(600);
    expect(settings.backgroundColor).toBe("#eeeeee");
    expect(settings.lang).toBe("en");
    expect(settings.dir).toBe("ltr");
    expect(document.content).toEqual([]);
    const section = settings.sections![0]!;
    expect(section.type).toBe("Section1");
    expect(section.props.backgroundColor).toBe("#ffffff");
    expect(section.props.padding).toBe("20px");
    const text = (section.props.column as EmailBlock[])[0]!;
    expect(text.type).toBe("Text");
    expect(text.props.content).toBe("<p>Hello <strong>world</strong></p>");
    expect(text.props.fontSize).toBe(14);
    expect(text.props.align).toBe("center");
    const button = (section.props.column as EmailBlock[])[1]!;
    expect(button.props.label).toBe("Start");
    expect(button.props.href).toBe("https://example.com/");
  });

  it("compiles the imported document back to clean MJML", async () => {
    const { document } = fromMjml(MINIMAL);
    const result = await compileEmail(document);
    expect(result.errors).toEqual([]);
    expect(result.html).toContain("Hello");
  });

  it("maps sections with explicit column attributes to flexible sections", () => {
    const { document, warnings } = fromMjml(`<mjml><mj-body>
      <mj-section>
        <mj-column width="60%" background-color="#fafafa"><mj-text>Left</mj-text></mj-column>
        <mj-column width="40%"><mj-text>Right</mj-text></mj-column>
      </mj-section>
    </mj-body></mjml>`);
    expect(warnings).toEqual([]);
    const section = document.root.props!.sections![0]!;
    expect(section.type).toBe("Section");
    const columns = section.props.columns as EmailBlock[];
    expect(columns.map((column) => column.props.width)).toEqual([60, 40]);
  });

  it("preserves pixel column widths and native missing-width inheritance", () => {
    const { document, warnings } = fromMjml(`<mjml><mj-body width="600px">
      <mj-section>
        <mj-column width="300px"><mj-text>A</mj-text></mj-column>
        <mj-column><mj-text>B</mj-text></mj-column>
      </mj-section>
    </mj-body></mjml>`);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("Pixel column width");
    const columns = document.root.props!.sections![0]!.props.columns as EmailBlock[];
    expect(columns[0]!.props.mjmlAttributes).toContainEqual(
      expect.objectContaining({
        name: "width",
        value: "300px",
        source: "import",
      }),
    );
    expect(columns[1]!.props.mjmlAttributes).toContainEqual(
      expect.objectContaining({
        name: "width",
        inherit: true,
        source: "import",
      }),
    );
    expect(toMjml(document)).toContain('width="300px"');
  });

  it("keeps unsupported attribute values through the native cascade", async () => {
    const { document, warnings } = fromMjml(`<mjml><mj-body>
      <mj-section background-url="https://example.com/bg.jpg" background-repeat="no-repeat">
        <mj-column><mj-text color="rgb(10, 20, 30)" font-size="90px">Big</mj-text></mj-column>
      </mj-section>
    </mj-body></mjml>`);
    expect(warnings).toEqual([]);
    const section = document.root.props!.sections![0]!;
    expect(section.props.mjmlAttributes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "background-url",
          value: "https://example.com/bg.jpg",
          source: "import",
        }),
        expect.objectContaining({
          name: "background-repeat",
          value: "no-repeat",
          source: "import",
        }),
      ]),
    );
    const text = (section.props.column as EmailBlock[])[0]!;
    expect(text.props.color).toBeUndefined();
    expect(text.props.fontSize).toBeUndefined();
    expect(text.props.mjmlAttributes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "color", value: "rgb(10, 20, 30)", source: "import" }),
        expect.objectContaining({ name: "font-size", value: "90px", source: "import" }),
      ]),
    );
    const result = await compileEmail(document);
    expect(result.errors).toEqual([]);
    expect(result.mjml).toContain('background-url="https://example.com/bg.jpg"');
    expect(result.mjml).toContain('color="rgb(10, 20, 30)"');
  });

  it("imports web fonts, custom CSS, breakpoint overrides, and class defaults", async () => {
    const { document, warnings } = fromMjml(`<mjml>
      <mj-head>
        <mj-font name="Inter" href="https://fonts.googleapis.com/css2?family=Inter" />
        <mj-style inline="inline">.card { box-shadow: 0 0 1px black; }</mj-style>
        <mj-style>@media (max-width: 480px) { .x { padding: 0 !important; } }</mj-style>
        <mj-attributes>
          <mj-all font-family="Arial, sans-serif" />
          <mj-class name="tight" padding="0px">
            <mj-text font-size="12px" />
          </mj-class>
        </mj-attributes>
      </mj-head>
      <mj-body><mj-section><mj-column><mj-text mj-class="tight">Hi</mj-text></mj-column></mj-section></mj-body>
    </mjml>`);
    expect(warnings).toEqual([]);
    const settings = document.root.props!;
    expect(settings.fontImports).toEqual([
      { name: "Inter", href: "https://fonts.googleapis.com/css2?family=Inter" },
    ]);
    expect(settings.headStyles).toEqual([
      { css: ".card { box-shadow: 0 0 1px black; }", inline: "inline" },
      { css: "@media (max-width: 480px) { .x { padding: 0 !important; } }", inline: "head" },
    ]);
    expect(settings.attributeDefaults).toEqual([
      expect.objectContaining({
        name: "font-family",
        value: "Arial, sans-serif",
        source: "import",
      }),
    ]);
    expect(settings.mjmlClasses).toEqual([
      {
        name: "tight",
        attributes: [{ name: "padding", value: "0px" }],
        components: [{ tag: "mj-text", attributes: [{ name: "font-size", value: "12px" }] }],
      },
    ]);
    const text = (settings.sections![0]!.props.column as EmailBlock[])[0]!;
    expect(text.props.mjClass).toBe("tight");
    const result = await compileEmail(document);
    expect(result.errors).toEqual([]);
  });

  it("imports HTML attribute selectors and non-pixel breakpoints", () => {
    const { document, warnings } = fromMjml(`<mjml><mj-head>
        <mj-breakpoint width="40em" />
        <mj-html-attributes>
          <mj-selector path=".promo div">
            <mj-html-attribute name="data-id">42</mj-html-attribute>
          </mj-selector>
        </mj-html-attributes>
      </mj-head><mj-body><mj-section><mj-column><mj-text>x</mj-text></mj-column></mj-section></mj-body></mjml>`);
    expect(warnings).toEqual([]);
    expect(document.root.props!.breakpointWidth).toBe("40em");
    expect(document.root.props!.htmlAttributes).toEqual([
      { selector: ".promo div", name: "data-id", value: "42" },
    ]);
  });

  it("imports groups, heroes, spacers, and dividers", async () => {
    const { document, warnings } = fromMjml(`<mjml><mj-body>
      <mj-hero mode="fixed-height" height="300px" background-url="https://example.com/hero.jpg" background-color="#111111">
        <mj-text color="#ffffff">Hero copy</mj-text>
      </mj-hero>
      <mj-section>
        <mj-group>
          <mj-column width="90%"><mj-text>Main</mj-text></mj-column>
          <mj-column width="10%"><mj-image src="https://example.com/i.png" width="12px" alt="arrow" /></mj-column>
        </mj-group>
      </mj-section>
      <mj-section><mj-column>
        <mj-spacer height="24px" />
        <mj-divider border-color="#dddddd" border-width="2px" width="50%" />
      </mj-column></mj-section>
    </mj-body></mjml>`);
    expect(warnings).toEqual([]);
    const sections = document.root.props!.sections!;
    expect(sections[0]!.type).toBe("Hero");
    expect(sections[0]!.props.mode).toBe("fixed-height");
    expect(sections[0]!.props.height).toBe(300);
    const group = (sections[1]!.props.columns as EmailBlock[])[0]!;
    expect(group.type).toBe("Group");
    expect((group.props.columns as EmailBlock[]).map((column) => column.props.width)).toEqual([
      90, 10,
    ]);
    const content = sections[2]!.props.column as EmailBlock[];
    expect(content[0]).toMatchObject({ type: "Spacer", props: { height: 24 } });
    expect(content[1]!.props).toMatchObject({ color: "#dddddd", thickness: 2, width: 50 });
    const result = await compileEmail(document);
    expect(result.errors).toEqual([]);
  });

  it("imports social rows, navigation bars, accordions, and carousels", async () => {
    const { document, warnings } = fromMjml(`<mjml><mj-body><mj-section><mj-column>
      <mj-social icon-size="24px">
        <mj-social-element name="x" href="https://example.com/x">X</mj-social-element>
        <mj-social-element name="tiktok" href="https://example.com/t" src="https://example.com/t.png">TikTok</mj-social-element>
      </mj-social>
      <mj-navbar>
        <mj-navbar-link href="https://example.com/home">Home</mj-navbar-link>
      </mj-navbar>
      <mj-accordion>
        <mj-accordion-element>
          <mj-accordion-title>Question</mj-accordion-title>
          <mj-accordion-text><p>Answer</p></mj-accordion-text>
        </mj-accordion-element>
      </mj-accordion>
      <mj-carousel thumbnails="hidden">
        <mj-carousel-image src="https://example.com/1.jpg" alt="One" href="https://example.com" />
        <mj-carousel-image src="https://example.com/2.jpg" alt="Two" />
      </mj-carousel>
    </mj-column></mj-section></mj-body></mjml>`);
    expect(warnings).toEqual([]);
    const content = document.root.props!.sections![0]!.props.column as EmailBlock[];
    const social = content[0]!;
    expect(social.props.iconSize).toBe(24);
    const links = social.props.links as Record<string, unknown>[];
    expect(links[0]).toMatchObject({ name: "x", label: "X" });
    expect(links[1]).toMatchObject({ name: "web", label: "TikTok" });
    expect((content[1]!.props.links as Record<string, unknown>[])[0]).toMatchObject({
      label: "Home",
      href: "https://example.com/home",
    });
    expect((content[2]!.props.items as Record<string, unknown>[])[0]).toMatchObject({
      title: "Question",
      content: "<p>Answer</p>",
    });
    const images = content[3]!.props.images as Record<string, unknown>[];
    expect(content[3]!.props.thumbnails).toBe("hidden");
    expect(images).toHaveLength(2);
    const result = await compileEmail(document);
    expect(result.errors).toEqual([]);
  });

  it("imports tables with header, body, footer, merged cells, and styled cells", async () => {
    const { document, warnings } = fromMjml(`<mjml><mj-body><mj-section><mj-column>
      <mj-table cellpadding="4" color="#222222">
        <caption>Order</caption>
        <thead>
          <tr><th scope="col">Item</th><th scope="col">Amount</th></tr>
        </thead>
        <tbody>
          <tr>
            <td colspan="2" style="padding: 8px; background-color: #f6f6f6; text-align: center">Combined</td>
          </tr>
        </tbody>
        <tfoot>
          <tr><td>Total</td><td style="text-align: right">$10</td></tr>
        </tfoot>
      </mj-table>
    </mj-column></mj-section></mj-body></mjml>`);
    expect(warnings).toEqual([]);
    const table = (document.root.props!.sections![0]!.props.column as EmailBlock[])[0]!;
    expect(table.type).toBe("Table");
    expect(table.props.caption).toBe("Order");
    expect(table.props.cellpadding).toBe(4);
    expect(
      (table.props.headerRows as { cells: Record<string, unknown>[] }[])[0]!.cells[0],
    ).toMatchObject({
      header: true,
      scope: "col",
      content: "<p>Item</p>",
    });
    const bodyCell = (table.props.bodyRows as { cells: Record<string, unknown>[] }[])[0]!.cells[0]!;
    expect(bodyCell).toMatchObject({
      colSpan: 2,
      padding: "8px",
      backgroundColor: "#f6f6f6",
      align: "center",
    });
    const footerCell = (table.props.footerRows as { cells: Record<string, unknown>[] }[])[0]!
      .cells[1]!;
    expect(footerCell.align).toBe("right");
    const result = await compileEmail(document);
    expect(result.errors).toEqual([]);
    expect(result.mjml).toContain('colspan="2"');
  });

  it("imports wrappers and flattens nested wrappers with a warning", () => {
    const { document, warnings } = fromMjml(`<mjml><mj-body>
      <mj-wrapper background-color="#f3f4f6" padding="16px">
        <mj-section><mj-column><mj-text>Inner</mj-text></mj-column></mj-section>
        <mj-wrapper><mj-section><mj-column><mj-text>Deep</mj-text></mj-column></mj-section></mj-wrapper>
      </mj-wrapper>
    </mj-body></mjml>`);
    expect(warnings).toEqual(["Flattened a nested mj-wrapper; its attributes were dropped."]);
    const wrapper = document.root.props!.sections![0]!;
    expect(wrapper.type).toBe("Wrapper");
    expect(wrapper.props.backgroundColor).toBe("#f3f4f6");
    expect(wrapper.props.sections).toHaveLength(2);
  });

  it("imports body raw HTML as raw blocks and warns", async () => {
    const { document, warnings } = fromMjml(`<mjml><mj-body>
      <mj-raw><div class="banner">Sale</div></mj-raw>
      <mj-section><mj-column><mj-text>Hi</mj-text></mj-column></mj-section>
    </mj-body></mjml>`);
    expect(warnings).toEqual([
      "Body mj-raw imported as a raw HTML block; compiling requires allowRawHtml: true.",
    ]);
    expect(document.root.props!.sections![0]!.type).toBe("Raw");
    const result = await compileEmail(document, { allowRawHtml: true });
    expect(result.errors).toEqual([]);
    expect(result.mjml).toContain('<mj-raw><div class="banner">Sale</div></mj-raw>');
  });

  it("warns for unsupported elements and attributes and drops invalid native values", () => {
    const { document, warnings } = fromMjml(`<mjml><mj-body>
      <mj-include path="./partial.mjml" />
      <mj-carousel-something />
      <mj-section data-unknown="1">
        <mj-column><mj-text line-height="bogus">Text</mj-text></mj-column>
      </mj-section>
    </mj-body></mjml>`);
    expect(warnings).toContain("Ignored unsupported element <mj-include> at the top level.");
    expect(warnings).toContain(
      "Ignored unsupported element <mj-carousel-something> at the top level.",
    );
    expect(warnings).toContain('Dropped unsupported attribute data-unknown="1" on mj-section.');
    expect(warnings).toContain('Dropped unsupported attribute line-height="bogus" on mj-text.');
    const text = (document.root.props!.sections![0]!.props.column as EmailBlock[])[0]!;
    expect(text.props.lineHeight).toBeUndefined();
    expect(text.props.content).toBe("<p>Text</p>");
  });

  it("requires an mjml root with a body", () => {
    expect(() => fromMjml("<div>nope</div>")).toThrow("must contain an <mjml> root");
    expect(() => fromMjml("<mjml><mj-head><mj-title>x</mj-title></mj-head></mjml>")).toThrow(
      "must contain an <mj-body>",
    );
  });

  it("round-trips every registered template through toMjml and back", async () => {
    for (const template of emailTemplates) {
      const source = toMjml(template.create());
      const { document, warnings } = fromMjml(source);
      expect(warnings, `${template.id}: ${warnings.join("; ")}`).toEqual([]);
      const blocks = blockTree(document.root.props!.sections!);
      const ids = blocks.map((block) => block.props.id);
      expect(new Set(ids).size).toBe(ids.length);
      const result = await compileEmail(document);
      expect(result.errors, `${template.id}: ${JSON.stringify(result.errors)}`).toEqual([]);
      expect(result.html).toContain("<body");
    }
  }, 120000);

  it("preserves the example document's content through a round-trip", async () => {
    const original = createExampleDocument();
    const { document, warnings } = fromMjml(toMjml(original));
    expect(warnings).toEqual([]);
    const result = await compileEmail(document);
    expect(result.errors).toEqual([]);
    expect(result.html).toContain("Monthly roundup");
    expect(result.html).toContain("Open Collage");
    expect(result.html).toContain("Smarter Search");
    expect(result.html).toContain("@media only screen and (max-width: 600px)");
  });
});
