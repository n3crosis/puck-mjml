import * as cheerio from "cheerio";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { fromMjml } from "./import";
import { toMjml } from "./export";
import { applyNativeAttributes, createNativeContext } from "./native-cascade";
import { decodeImportedAttribute, readImportedAttributeSources } from "./imported-attribute-source";
import type { EmailBlock, EmailDocument, MjmlAttribute } from "./types";

beforeAll(() => vi.stubGlobal("window", globalThis));
afterAll(() => vi.unstubAllGlobals());

const selectorHead = (value: string, attribute = "alt", tag = "img") =>
  `<mj-html-attributes><mj-selector path="${tag}[${attribute}='${value}']"><mj-html-attribute name="data-match">Matched</mj-html-attribute></mj-selector></mj-html-attributes>`;
const wrap = (body: string, head = "", column = "") =>
  `<mjml><mj-head>${head}</mj-head><mj-body><mj-section><mj-column${column}>${body}</mj-column></mj-section></mj-body></mjml>`;
const image = (document: EmailDocument) =>
  (document.root.props!.sections![0].props.column as EmailBlock[])[0].props;
async function compile(source: string) {
  const { default: mjml } = await import("mjml-browser");
  const result = await mjml(source, { validationLevel: "strict" });
  expect(result.errors).toEqual([]);
  return cheerio.load(result.html);
}
const sourceFor = (value: string, place = "local") => {
  const definitions =
    place === "all"
      ? `<mj-all alt="${value}" />`
      : place === "component"
        ? `<mj-image alt="${value}" />`
        : place === "class"
          ? `<mj-class name="entity" alt="${value}" />`
          : place === "nested-class"
            ? `<mj-class name="entity"><mj-image alt="${value}" /></mj-class>`
            : "";
  return wrap(
    `<mj-image src="https://example.com/image.png"${place === "local" ? ` alt="${value}"` : place === "class" ? ' mj-class="entity"' : ""} />`,
    `<mj-attributes>${definitions}</mj-attributes>${selectorHead(value)}`,
    place === "nested-class" ? ' mj-class="entity"' : "",
  );
};
const spellings = [
  "&copy;",
  "&#169;",
  "&#xA9;",
  "&#x1f642;",
  "&copy",
  "&copycat",
  "&notit;",
  "&not=foo",
  "&amp;copy;",
  "&amp;amp;copy;",
  "&nbsp;",
  "&quot;",
  "&apos;",
  "&#34;",
  "&#x27;",
  "&#10;",
  "&unknown;",
];

describe("imported source spellings in generated HTML selectors", () => {
  it.each(
    spellings.flatMap((value) =>
      ["local", "all", "component", "class", "nested-class"].map((place) => ({ value, place })),
    ),
  )(
    "preserves $value from $place without changing decoded attributes",
    async ({ value, place }) => {
      const source = sourceFor(value, place);
      const { document, warnings } = fromMjml(source);
      expect(warnings).toEqual([]);
      const original = await compile(source);
      const roundtrip = await compile(toMjml(document));
      expect(original("img").attr("data-match")).toBe("Matched");
      expect(roundtrip("img").attr("data-match")).toBe("Matched");
      expect(roundtrip("img").attr("alt")).toBe(original("img").attr("alt"));
    },
  );

  it.each(["src", "href", "title"])("preserves the source spelling of %s", async (name) => {
    const value = name === "title" ? "&copy;" : "https://example.com/&copy;?a=1&#38;b=2";
    const target = name === "href" ? "a" : "img";
    const source = wrap(
      `<mj-image${name === "src" ? "" : ' src="https://example.com/image.png"'} ${name}="${value}" />`,
      selectorHead(value, name, target),
    );
    const original = await compile(source);
    const actual = await compile(toMjml(fromMjml(source).document));
    expect(original(target).attr("data-match")).toBe("Matched");
    expect(actual(target).attr("data-match")).toBe("Matched");
    expect(actual(target).attr(name)).toBe(original(target).attr(name));
  });

  it("keeps the normalized visual and canvas values while edits, saved JSON, undo and redo work", async () => {
    const original = fromMjml(sourceFor("&copy;")).document;
    expect(image(original).alt).toBe("©");
    expect(
      applyNativeAttributes("mj-image", image(original), {}, createNativeContext()).effective.alt,
    ).toBe("©");
    const saved = JSON.parse(JSON.stringify(original)) as EmailDocument;
    image(saved).width = 300;
    expect(toMjml(saved)).toContain('alt="&copy;"');
    image(saved).alt = "New & label";
    const edited = toMjml(saved);
    expect(edited).toContain('alt="New &amp; label"');
    expect((await compile(edited))("img").attr("data-match")).toBeUndefined();
    const undo = JSON.parse(JSON.stringify(original)) as EmailDocument;
    expect(toMjml(undo)).toBe(toMjml(original));
    expect((await compile(toMjml(undo)))("img").attr("data-match")).toBe("Matched");
    expect(toMjml(JSON.parse(JSON.stringify(saved)) as EmailDocument)).toBe(edited);
    image(saved).alt = "©";
    expect(toMjml(saved)).toContain('alt="&copy;"');
  });

  it("lets explicit native edits and later duplicate entries override old provenance", () => {
    const document = fromMjml(sourceFor("&copy;")).document;
    const props = image(document);
    const entry = props.mjmlAttributes!.find((entry) => entry.name === "alt")!;
    entry.value = "New & label";
    props.alt = "Visual label";
    expect(toMjml(document)).toContain('alt="New &amp; label"');
    props.mjmlAttributes!.push({ name: "alt", value: "©" });
    expect(toMjml(document)).toContain('alt="©"');
    expect(toMjml(document)).not.toContain('alt="&copy;"');
    props.mjmlAttributes!.push({ name: "alt", inherit: true });
    expect(toMjml(document)).not.toMatch(/<mj-image[^>]* alt=/);
  });

  it.each([
    {
      name: "mj-all merge",
      definitions: '<mj-all alt="&copy;" /><mj-all alt="&#169;" />',
      image: "",
      column: "",
      expected: "&#169;",
    },
    {
      name: "component merge",
      definitions: '<mj-image alt="&copy;" /><mj-image alt="&#169;" />',
      image: "",
      column: "",
      expected: "&#169;",
    },
    {
      name: "class merge",
      definitions: '<mj-class name="a" alt="&copy;" /><mj-class name="a" alt="&#169;" />',
      image: ' mj-class="a"',
      column: "",
      expected: "&#169;",
    },
    {
      name: "class order",
      definitions: '<mj-class name="a" alt="&copy;" /><mj-class name="b" alt="&#169;" />',
      image: ' mj-class="a b"',
      column: "",
      expected: "&#169;",
    },
    {
      name: "nested replacement",
      definitions:
        '<mj-class name="a"><mj-image alt="&copy;" /></mj-class><mj-class name="a"><mj-image alt="&#169;" /></mj-class>',
      image: "",
      column: ' mj-class="a"',
      expected: "&#169;",
    },
    {
      name: "plain repeated value",
      definitions: '<mj-image alt="&copy;" /><mj-image alt="©" />',
      image: "",
      column: "",
      expected: "©",
    },
    {
      name: "empty nested replacement",
      definitions:
        '<mj-all alt="&#169;" /><mj-class name="a"><mj-image alt="&copy;" /><mj-image /></mj-class>',
      image: "",
      column: ' mj-class="a"',
      expected: "&#169;",
    },
    {
      name: "full cascade local",
      definitions:
        '<mj-all alt="&copy;" /><mj-image alt="&#169;" /><mj-class name="a" alt="&#xA9;" /><mj-class name="b"><mj-image alt="&copy" /></mj-class>',
      image: ' mj-class="a" alt="&amp;copy;"',
      column: ' mj-class="b"',
      expected: "&amp;copy;",
    },
    {
      name: "full cascade ancestor",
      definitions:
        '<mj-all alt="&copy;" /><mj-image alt="&#169;" /><mj-class name="a" alt="&#xA9;" /><mj-class name="b"><mj-image alt="&copy" /></mj-class>',
      image: ' mj-class="a"',
      column: ' mj-class="b"',
      expected: "&copy",
    },
  ])("retains native precedence: $name", async ({ definitions, image, column, expected }) => {
    const source = wrap(
      `<mj-image src="https://example.com/image.png"${image} />`,
      `<mj-attributes>${definitions}</mj-attributes>${selectorHead(expected)}`,
      column,
    );
    const original = await compile(source);
    const actual = await compile(toMjml(fromMjml(source).document));
    expect(original("img").attr("data-match")).toBe("Matched");
    expect(actual("img").attr("data-match")).toBe("Matched");
    expect(actual("img").attr("alt")).toBe(original("img").attr("alt"));
  });

  it("does not apply a prior definition's source to later constructed or inherited edits", () => {
    const document = fromMjml(sourceFor("&copy;", "component")).document;
    document.root.props!.componentDefaults!.push({
      tag: "mj-image",
      attributes: [{ name: "alt", value: "©" }],
    });
    expect(toMjml(document)).toContain('<mj-image alt="©" />');
    document.root.props!.componentDefaults!.push({
      tag: "mj-image",
      attributes: [{ name: "alt", inherit: true }],
    });
    expect(toMjml(document)).not.toContain('alt="');
  });

  it("continues escaping newly constructed literal entity text", async () => {
    const document: EmailDocument = {
      root: {
        props: {
          sections: [
            {
              type: "Section1",
              props: {
                column: [
                  { type: "Image", props: { src: "https://example.com/image.png", alt: "&copy;" } },
                ],
              },
            },
          ],
        },
      },
      content: [],
    };
    expect(toMjml(document)).toContain('alt="&amp;copy;"');
    expect((await compile(toMjml(document)))("img").attr("alt")).toBe("&copy;");
  });
});

const sourceEntry = (name: string, source: string): MjmlAttribute => {
  const value = decodeImportedAttribute(source);
  return { name, value, importSource: { name, value, source } };
};

describe("untrusted attribute source provenance", () => {
  it.each([
    null,
    [],
    "bad",
    {},
    { name: "alt", value: "©", source: 12 },
    { name: "title", value: "©", source: "&copy;" },
    { name: "alt", value: "wrong", source: "&copy;" },
    { name: "alt", value: "©", source: "&reg;" },
  ])("ignores malformed or stale metadata: %j", (importSource) => {
    const entry = { name: "alt", value: "©", importSource } as MjmlAttribute;
    expect(readImportedAttributeSources("mj-image", [entry])).toEqual({ alt: null });
  });

  it.each([
    '&copy;" onerror="alert(1)',
    "&copy;<img>",
    "&copy;>text",
    "&copy;\n",
    "&copy;\u0000",
    "&copy;\u007f",
    "&copy;\u0085",
    "&copy;".repeat(3000),
  ])("does not serialize raw markup, controls, or oversized source: %j", (source) => {
    expect(readImportedAttributeSources("mj-image", [sourceEntry("alt", source)])).toEqual({
      alt: null,
    });
  });

  it.each([
    "jav&#97;script:alert(1)",
    "&amp;#106;avascript:alert(1)",
    "https://example.com/&#10;path",
    "https://user:secret@example.com/&copy;",
  ])("cannot bypass URL validation with %s", (source) => {
    const document = fromMjml(sourceFor("&copy;")).document;
    image(document).mjmlAttributes!.push(sourceEntry("href", source));
    expect(() => toMjml(document)).toThrow();
    expect(readImportedAttributeSources("mj-image", [sourceEntry("href", source)])).toEqual({
      href: null,
    });
  });

  it("does not reuse source when a URL is normalized, or a source form violates its descriptor", () => {
    expect(
      readImportedAttributeSources("mj-image", [
        sourceEntry("href", " https://example.com/&copy; "),
      ]),
    ).toEqual({ href: null });
    expect(readImportedAttributeSources("mj-image", [sourceEntry("width", "&#54;00px")])).toEqual({
      width: null,
    });
  });

  it("ignores inherited edit fields and never grants template trust", () => {
    const inherited = Object.assign(Object.create(sourceEntry("alt", "&copy;")), {
      name: "alt",
    }) as MjmlAttribute;
    const result = applyNativeAttributes(
      "mj-image",
      { mjmlAttributes: [inherited] },
      { alt: "Safe" },
      createNativeContext(),
    );
    expect(result.attributes.alt).toBe("Safe");
    expect(result.attributeSources).toEqual({});
    const template = { ...sourceEntry("alt", "&copy;"), template: true };
    expect(readImportedAttributeSources("mj-image", [template], { allowRawHtml: true })).toEqual({
      alt: null,
    });
    expect(() =>
      applyNativeAttributes("mj-image", { mjmlAttributes: [template] }, {}, createNativeContext()),
    ).toThrow(/allowRawHtml/);
  });

  it.each(["ico-open", "ico-close"])("keeps %s outside the attribute provenance path", (name) => {
    const document = fromMjml(
      wrap(`<mj-navbar hamburger="hamburger" ${name}="&amp;copy;" />`),
    ).document;
    const props = image(document);
    expect(props.mjmlAttributes!.find((entry) => entry.name === name)).not.toHaveProperty(
      "importSource",
    );
    expect(readImportedAttributeSources("mj-navbar", [sourceEntry(name, "&amp;copy;")])).toEqual({
      [name]: null,
    });
  });
});
