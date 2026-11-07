import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { compileEmail, toMjml } from "./export";
import type {
  EmailBlock,
  EmailDocument,
  EmailSettings,
  ExportOptions,
  MjmlAttribute,
} from "./types";

beforeAll(() => vi.stubGlobal("window", globalThis));
afterAll(() => vi.unstubAllGlobals());

const trusted = { allowRawHtml: true };
const template = (name: string, value: string): MjmlAttribute => ({ name, value, template: true });
const inherit = (name: string): MjmlAttribute => ({ name, inherit: true });
const doc = (column: EmailBlock[], settings: EmailSettings = {}): EmailDocument => ({
  root: { props: { sections: [{ type: "Section1", props: { column } }], ...settings } },
  content: [],
});
const text = (mjmlAttributes: MjmlAttribute[]): EmailBlock => ({
  type: "Text",
  props: { content: "<p>Template example</p>", mjmlAttributes },
});
const freeze = <T>(value: T): T => {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
};

describe("trusted native template attribute export", () => {
  it("preserves local URL, source, color, and size expressions without evaluating them", () => {
    const mjml = toMjml(
      doc([
        {
          type: "Button",
          props: { label: "Visit", mjmlAttributes: [template("href", "{{ customer.url }}")] },
        },
        { type: "Image", props: { mjmlAttributes: [template("src", "<%= imageUrl %>")] } },
        text([template("color", "{{ brand.color }}"), template("font-size", "  {{ size }}px  ")]),
      ]),
      trusted,
    );
    expect(mjml).toContain('href="{{ customer.url }}"');
    expect(mjml).toContain('src="&lt;%= imageUrl %&gt;"');
    expect(mjml).toContain('color="{{ brand.color }}"');
    expect(mjml).toContain('font-size="  {{ size }}px  "');
  });

  it("passes unresolved string URLs through the installed compiler and leaves the host document unchanged", async () => {
    const document = freeze(
      doc([
        {
          type: "Button",
          props: { label: "Visit", mjmlAttributes: [template("href", "{{ customer.url }}")] },
        },
        { type: "Image", props: { mjmlAttributes: [template("src", "{{ image_url }}")] } },
      ]),
    );
    const snapshot = structuredClone(document);
    const result = await compileEmail(document, trusted);
    expect(result.errors).toEqual([]);
    expect(result.html).toContain('href="{{ customer.url }}"');
    expect(result.html).toContain('src="{{ image_url }}"');
    expect(document).toEqual(snapshot);
  });

  it("reports native validation errors for unresolved sizes instead of claiming a resolved layout", async () => {
    const result = await compileEmail(
      doc([text([template("font-size", "{{ font_size }}")])]),
      trusted,
    );
    expect(result.mjml).toContain('font-size="{{ font_size }}"');
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tagName: "mj-text",
          message: expect.stringContaining("font-size"),
        }),
      ]),
    );
  });

  it("exports templates in body, global, component, class, implicit-column, and nested-element attributes", () => {
    const document = doc(
      [
        {
          type: "Social",
          props: {
            links: [
              {
                name: "web",
                label: "Social",
                mjmlAttributes: [template("href", "{{ social_url }}")],
              },
            ],
          },
        },
        {
          type: "Navbar",
          props: {
            links: [{ label: "Home", mjmlAttributes: [template("href", "{{ nav_url }}")] }],
          },
        },
        {
          type: "Carousel",
          props: { images: [{ mjmlAttributes: [template("src", "{{ carousel_src }}")] }] },
        },
        {
          type: "Accordion",
          props: {
            items: [
              {
                title: "Question",
                content: "<p>Answer</p>",
                mjmlAttributes: [template("background-color", "{{ accordion_background }}")],
                titleAttributes: [template("color", "{{ title_color }}")],
                textAttributes: [template("font-size", "{{ answer_size }}")],
              },
            ],
          },
        },
      ],
      {
        bodyAttributes: [template("background-color", "{{ body_background }}")],
        attributeDefaults: [template("color", "{{ global_color }}")],
        componentDefaults: [
          { tag: "mj-image", attributes: [template("src", "{{ component_src }}")] },
        ],
        mjmlClasses: [
          {
            name: "theme",
            attributes: [template("color", "{{ class_color }}")],
            components: [
              { tag: "mj-text", attributes: [template("font-size", "{{ class_size }}")] },
            ],
          },
        ],
      },
    );
    document.root.props!.sections![0].props.columnAttributes = [
      template("width", "{{ column_width }}"),
    ];
    const mjml = toMjml(freeze(document), trusted);
    for (const [tag, name, value] of [
      ["mj-body", "background-color", "{{ body_background }}"],
      ["mj-all", "color", "{{ global_color }}"],
      ["mj-image", "src", "{{ component_src }}"],
      ["mj-class", "color", "{{ class_color }}"],
      ["mj-text", "font-size", "{{ class_size }}"],
      ["mj-column", "width", "{{ column_width }}"],
      ["mj-social-element", "href", "{{ social_url }}"],
      ["mj-navbar-link", "href", "{{ nav_url }}"],
      ["mj-carousel-image", "src", "{{ carousel_src }}"],
      ["mj-accordion-element", "background-color", "{{ accordion_background }}"],
      ["mj-accordion-title", "color", "{{ title_color }}"],
      ["mj-accordion-text", "font-size", "{{ answer_size }}"],
    ]) {
      const opening = mjml.match(new RegExp(`<${tag}\\b[^>]*>`))?.[0];
      expect(opening, tag).toContain(`${name}="${value}"`);
    }
  });

  it("lets MJML compile inherited string templates from defaults and classes", async () => {
    const document = doc(
      [
        { type: "Image", props: { mjmlAttributes: [inherit("src")] } },
        {
          type: "Button",
          props: { label: "Class link", mjClass: "link", mjmlAttributes: [inherit("href")] },
        },
        text([]),
      ],
      {
        attributeDefaults: [template("font-family", "{{ email_font }}")],
        componentDefaults: [
          { tag: "mj-image", attributes: [template("src", "{{ inherited_src }}")] },
        ],
        mjmlClasses: [{ name: "link", attributes: [template("href", "{{ inherited_url }}")] }],
      },
    );
    const result = await compileEmail(document, trusted);
    expect(result.errors).toEqual([]);
    expect(result.html).toContain('src="{{ inherited_src }}"');
    expect(result.html).toContain('href="{{ inherited_url }}"');
    expect(result.html).toContain("font-family:{{ email_font }}");
  });

  it.each([undefined, false, "true", 1])(
    "requires an exact host opt-in across every template scope (%s)",
    (allowRawHtml) => {
      const expression = template("color", "{{ color }}");
      const documents = [
        doc([text([expression])]),
        doc([], { bodyAttributes: [template("background-color", "{{ color }}")] }),
        doc([], { attributeDefaults: [expression] }),
        doc([], { componentDefaults: [{ tag: "mj-text", attributes: [expression] }] }),
        doc([], { mjmlClasses: [{ name: "theme", attributes: [expression] }] }),
        doc([], {
          mjmlClasses: [
            {
              name: "theme",
              attributes: [],
              components: [{ tag: "mj-text", attributes: [expression] }],
            },
          ],
        }),
        doc([
          { type: "Navbar", props: { links: [{ label: "Home", mjmlAttributes: [expression] }] } },
        ]),
        doc([], {
          sections: [
            {
              type: "Section1",
              props: { columnAttributes: [template("width", "{{ width }}")], column: [] },
            },
          ],
        }),
      ];
      for (const document of documents) {
        expect(() => toMjml(document, { allowRawHtml } as ExportOptions)).toThrow(
          /allowRawHtml: true/,
        );
      }
    },
  );

  it("gives inheritance precedence without requiring trust for an ignored template", () => {
    const mjml = toMjml(
      doc([text([{ ...template("font-size", "{{ ignored_size }}"), inherit: true }])]),
    );
    expect(mjml).not.toContain("{{ ignored_size }}");
    expect(mjml.match(/<mj-text\b[^>]*>/)?.[0]).not.toContain("font-size=");
  });

  it("tracks the last duplicate attribute without leaking template permission to concrete values", () => {
    const expression = template("font-size", "{{ size }}");
    const concrete = { name: "font-size", value: "22px" };
    const first = toMjml(doc([text([expression, concrete])]), trusted);
    expect(first).toContain('font-size="22px"');
    expect(first).not.toContain("{{ size }}");
    expect(toMjml(doc([text([concrete, expression])]), trusted)).toContain(
      'font-size="{{ size }}"',
    );
    const lastInherited = toMjml(doc([text([expression, inherit("font-size")])]), trusted);
    expect(lastInherited.match(/<mj-text\b[^>]*>/)?.[0]).not.toContain("font-size=");
    expect(() =>
      toMjml(doc([text([expression, { name: "font-size", value: "still-invalid" }])]), trusted),
    ).toThrow(/Invalid native/);
    expect(() =>
      toMjml(doc([text([expression, { name: "color", value: "not-a-color" }])]), trusted),
    ).toThrow(/Invalid native/);
    expect(() =>
      toMjml(
        doc([
          {
            type: "Image",
            props: { src: "javascript:bad()", mjmlAttributes: [template("alt", "{{ alt }}")] },
          },
        ]),
        trusted,
      ),
    ).toThrow();
  });

  it("escapes template values as a single XML attribute and preserves the original expression", () => {
    const source = "  {{ value | default: \"A&B <tag>\" }} 'quoted'\n";
    const document = freeze(
      doc([
        {
          type: "Image",
          props: {
            src: "https://example.com/image.png",
            mjmlAttributes: [template("alt", source)],
          },
        },
      ]),
    );
    const mjml = toMjml(document, trusted);
    expect(mjml).toContain(
      'alt="  {{ value | default: &quot;A&amp;B &lt;tag&gt;&quot; }} &apos;quoted&apos;\n"',
    );
    expect(mjml).not.toContain("<tag>");
    const image = (document.root.props!.sections![0].props.column as EmailBlock[])[0];
    expect(image.props.mjmlAttributes![0].value).toBe(source);
  });

  it("still enforces attribute names, boolean flags, and XML character structure", () => {
    for (const entry of [
      template("onclick", "{{ handler }}"),
      template("color", "{{ value }}\u0000"),
      { name: "color", value: "{{ value }}", template: "true" },
    ]) {
      expect(() => toMjml(doc([text([entry as MjmlAttribute])]), trusted)).toThrow();
    }
    expect(() =>
      toMjml(doc([text([{ name: "color", value: "{{ value }}", template: false }])]), trusted),
    ).toThrow(/Native CSS/);
  });
});
