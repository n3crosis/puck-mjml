import * as cheerio from "cheerio";
import type { AnyNode, Element } from "domhandler";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { fromMjml } from "./import";
import { toMjml } from "./export";

beforeAll(() => vi.stubGlobal("window", globalThis));
afterAll(() => vi.unstubAllGlobals());

async function compile(source: string) {
  const { default: mjml } = await import("mjml-browser");
  const result = await mjml(source, { validationLevel: "strict" });
  expect(result.errors).toEqual([]);
  return cheerio.load(result.html);
}

// Compare parsed rendered semantics, rather than source/entity spelling, style
// property order, insignificant inter-tag whitespace, or HTML serialization.
function semantics(node: AnyNode): unknown {
  if (node.type === "text") {
    const text = node.data.replace(/[\t\n\r ]+/g, " ");
    return /^[\t\n\r ]*$/.test(text) ? undefined : text;
  }
  if (node.type !== "tag" && node.type !== "style" && node.type !== "script") return undefined;
  const element = node as Element;
  const attributes = Object.fromEntries(
    Object.entries(element.attribs)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => [
        key,
        key === "style"
          ? Object.fromEntries(
              value
                .split(";")
                .filter(Boolean)
                .map((declaration) => {
                  const separator = declaration.indexOf(":");
                  return [
                    declaration.slice(0, separator).trim(),
                    declaration.slice(separator + 1).trim(),
                  ];
                })
                .sort(([a], [b]) => a.localeCompare(b)),
            )
          : key === "class"
            ? value.split(/\s+/).sort().join(" ")
            : value,
      ]),
  );
  return {
    tag: element.name,
    attributes,
    children: element.children.map(semantics).filter((child) => child !== undefined),
  };
}

const wrap = (body: string, head = "", bodyAttributes = "") =>
  `<mjml><mj-head>${head}</mj-head><mj-body ${bodyAttributes}>${body}</mj-body></mjml>`;
const section = (content: string, columnAttributes = "", sectionAttributes = "") =>
  `<mj-section ${sectionAttributes}><mj-column ${columnAttributes}>${content}</mj-column></mj-section>`;
const text = '<mj-text css-class="target">Semantic marker</mj-text>';

const inheritanceCases = [
  {
    name: "body identity and class-inherited background",
    source: wrap(
      section(text),
      '<mj-attributes><mj-class name="theme" background-color="#abcabc" /></mj-attributes>',
      'id="newsletter" css-class="campaign edition" mj-class="theme"',
    ),
  },
  {
    name: "sibling content inherits nested body class defaults",
    source: wrap(
      section(text + "<mj-button>Go</mj-button>"),
      '<mj-attributes><mj-class name="theme"><mj-text color="#123456" font-size="23px" /><mj-button background-color="#654321" font-size="19px" /></mj-class></mj-attributes>',
      'mj-class="theme"',
    ),
  },

  {
    name: "body width inherited from component defaults",
    source: wrap(
      section(text),
      '<mj-attributes><mj-body width="720px" background-color="#abcabc" /></mj-attributes>',
    ),
  },
  {
    name: "body width from named class overrides default",
    source: wrap(
      section(text),
      '<mj-attributes><mj-body width="700px" /><mj-class name="body" width="640px" background-color="#abcdef" /></mj-attributes>',
      'mj-class="body"',
    ),
  },
  {
    name: "body local width overrides class and component",
    source: wrap(
      section(text),
      '<mj-attributes><mj-body width="700px" /><mj-class name="body" width="640px" /></mj-attributes>',
      'mj-class="body" width="680px"',
    ),
  },
  {
    name: "global component multiple classes and local typography",
    source: wrap(
      section(
        '<mj-text css-class="target" mj-class="first second" color="#555555">Semantic marker</mj-text>',
      ),
      '<mj-attributes><mj-all font-family="Georgia" color="#111111" font-size="11px" /><mj-text color="#222222" font-size="17px" /><mj-class name="first" color="#333333" line-height="1.7" /><mj-class name="second" color="#444444" font-size="19px" /></mj-attributes>',
    ),
  },
  {
    name: "nested ancestor classes with local class",
    source: wrap(
      section(
        '<mj-text css-class="target" mj-class="local">Semantic marker</mj-text>',
        'mj-class="inner"',
        'mj-class="outer"',
      ),
      '<mj-attributes><mj-all color="#111111" /><mj-class name="outer"><mj-text color="#222222" font-size="19px" /></mj-class><mj-class name="inner"><mj-text color="#333333" line-height="1.8" /></mj-class><mj-class name="local" color="#444444" /></mj-attributes>',
    ),
  },
  {
    name: "repeated component defaults merge",
    source: wrap(
      section(text),
      '<mj-attributes><mj-text color="#123456" font-size="21px" /><mj-text color="#654321" /></mj-attributes>',
    ),
  },
  {
    name: "repeated global defaults merge",
    source: wrap(
      section(text),
      '<mj-attributes><mj-all color="#123456" font-size="21px" /><mj-all color="#654321" /></mj-attributes>',
    ),
  },
  {
    name: "repeated named defaults merge and replace nested maps",
    source: wrap(
      section(
        '<mj-text css-class="target" mj-class="same">Semantic marker</mj-text>',
        'mj-class="same"',
      ),
      '<mj-attributes><mj-class name="same" color="#123456" font-size="21px"><mj-text font-size="31px" color="#112233" /></mj-class><mj-class name="same" color="#654321"><mj-text line-height="1.9" /></mj-class></mj-attributes>',
    ),
  },
  {
    name: "multiple attributes head blocks",
    source: wrap(
      section(text),
      '<mj-attributes><mj-text color="#123456" font-size="21px" /></mj-attributes><mj-attributes><mj-text color="#654321" /></mj-attributes>',
    ),
  },
  {
    name: "class list order reverses cascade",
    source: wrap(
      section('<mj-text css-class="target" mj-class="second first">Semantic marker</mj-text>'),
      '<mj-attributes><mj-class name="first" color="#123456" font-size="21px" /><mj-class name="second" color="#654321" /></mj-attributes>',
    ),
  },
];

const widthCases = [
  {
    name: "fractional fixed and fractional percent columns",
    source: wrap(
      '<mj-section><mj-column width="153.5px">' +
        text +
        '</mj-column><mj-column width="37.25%">' +
        text +
        "</mj-column><mj-column>" +
        text +
        "</mj-column></mj-section>",
      "",
      'width="645px"',
    ),
  },
  {
    name: "group fixed width with percent and auto children",
    source: wrap(
      '<mj-section><mj-group width="375px"><mj-column width="25%">' +
        text +
        "</mj-column><mj-column>" +
        text +
        '</mj-column></mj-group><mj-column width="200px">' +
        text +
        "</mj-column></mj-section>",
    ),
  },
  {
    name: "class-inherited widths and explicit local override",
    source: wrap(
      '<mj-section><mj-column mj-class="column" width="120px">' +
        text +
        '</mj-column><mj-column mj-class="column">' +
        text +
        "</mj-column></mj-section>",
      '<mj-attributes><mj-class name="column" width="60%" /><mj-column width="40%" /></mj-attributes>',
    ),
  },
  {
    name: "wrapper padding and fixed image plus percent button widths",
    source: wrap(
      '<mj-wrapper padding="17px 23px"><mj-section padding="11px 19px"><mj-column width="70%" padding="7px 13px"><mj-image src="https://example.com/image.png" width="280.5px" /><mj-divider width="127.5px" /><mj-button width="75%">Go</mj-button></mj-column></mj-section></mj-wrapper>',
      "",
      'width="650px"',
    ),
  },
  {
    name: "zero widths preserve compiler handling",
    source: wrap(
      section(
        '<mj-image src="https://example.com/image.png" width="0px" /><mj-divider width="0%" /><mj-button width="0px">Go</mj-button>',
        'width="0%"',
      ),
    ),
  },
];

const entityLabels = [
  {
    name: "mixed named numeric astral and escaped entity",
    value: "&copy; &#169; &#x1F642; &amp;copy; &lt;label&gt; &apos; &quot;",
  },
  { name: "nonbreaking and em spaces", value: "&#xA0;&#8195;Label&#8195;&#160;" },
  { name: "unambiguous legacy HTML entities", value: "&copy Label &amp done" },
];
const endingCases = entityLabels.flatMap(({ name, value }) => [
  { name: `text ${name}`, source: wrap(section(`<mj-text>${value}</mj-text>`)) },
  { name: `button ${name}`, source: wrap(section(`<mj-button>${value}</mj-button>`)) },
  {
    name: `navbar ${name}`,
    source: wrap(
      section(
        `<mj-navbar><mj-navbar-link href="https://example.com">${value}</mj-navbar-link></mj-navbar>`,
      ),
    ),
  },
  {
    name: `social ${name}`,
    source: wrap(
      section(
        `<mj-social><mj-social-element name="facebook">${value}</mj-social-element></mj-social>`,
      ),
    ),
  },
  {
    name: `accordion ${name}`,
    source: wrap(
      section(
        `<mj-accordion><mj-accordion-element><mj-accordion-title>${value}</mj-accordion-title><mj-accordion-text>${value}</mj-accordion-text></mj-accordion-element></mj-accordion>`,
      ),
    ),
  },
  {
    name: `title preview ${name}`,
    source: wrap(section(text), `<mj-title>${value}</mj-title><mj-preview>${value}</mj-preview>`),
  },
]);

describe("additional native import compiler semantic edges", () => {
  it.each(["&notit;", "&copycat", "&not=foo"])(
    "diagnoses native title text/attribute entity ambiguity without requiring trust: %s",
    async (value) => {
      const source = wrap(section(text), `<mj-title>${value}</mj-title>`);
      const original = await compile(source);
      const { document, warnings } = fromMjml(source);
      expect(warnings).toEqual([
        "mj-title contains ambiguous HTML entities; its accessible label will be normalized to the displayed title text on export.",
      ]);
      expect(document.root.props?.subjectHtmlContent).toBeUndefined();
      const roundtrip = await compile(toMjml(document));
      expect(original("[role=article]").attr("aria-label")).not.toBe(original("title").text());
      expect(roundtrip("title").text()).toBe(original("title").text());
      expect(roundtrip("[role=article]").attr("aria-label")).toBe(original("title").text());
    },
  );

  it.each([...inheritanceCases, ...widthCases, ...endingCases])(
    "preserves $name",
    async ({ source }) => {
      const original = await compile(source);
      const { document, warnings } = fromMjml(source);
      expect(warnings).toEqual([]);
      const roundtrip = await compile(toMjml(document));
      expect(semantics(roundtrip("body")[0]!)).toEqual(semantics(original("body")[0]!));
      expect(roundtrip("title").text()).toBe(original("title").text());
    },
  );
});
