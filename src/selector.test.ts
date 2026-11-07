import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { compileEmail, toMjml } from "./export";
import type { EmailBlock, EmailDocument } from "./types";

beforeAll(() => vi.stubGlobal("window", globalThis));
afterAll(() => vi.unstubAllGlobals());

const documentWithSelector = (selector: string): EmailDocument => ({
  root: {
    props: {
      htmlAttributes: [{ selector, name: "data-result", value: 'A & "B"' }],
      sections: [
        {
          type: "Section1",
          props: { column: [{ type: "Text", props: { content: "Sale", cssClass: "promo" } }] },
        },
      ],
    },
  },
  content: [],
});

describe("compiled HTML attributes", () => {
  it.each([".promo > div", '[class~="promo"] > div', "[class~='promo'] > div"])(
    "preserves selector %s through MJML compilation",
    async (selector) => {
      const result = await compileEmail(documentWithSelector(selector));
      expect(result.errors).toEqual([]);
      expect(result.html).toContain('data-result="A &amp; &quot;B&quot;">Sale</div>');
    },
  );

  it.each([`[title='A "quote" & B']`, `[title="A \\"quote\\" & B"]`])(
    "preserves literal quotes and ampersands in %s",
    async (selector) => {
      const document = documentWithSelector(selector);
      document.root.props!.sections = [
        { type: "Raw", props: { html: `<div title='A "quote" & B'>Target</div>` } },
      ];
      const result = await compileEmail(document, { allowRawHtml: true });
      expect(result.errors).toEqual([]);
      expect(result.html).toContain('data-result="A &amp; &quot;B&quot;">Target</div>');
    },
  );

  it("keeps markup-looking selector text inside the path attribute", async () => {
    const document = documentWithSelector(`div[title='"><mj-raw>injected</mj-raw>']`);
    const mjml = toMjml(document);
    expect(mjml).not.toContain("<mj-raw>");
    expect(mjml).toContain("\\22 >\\3c mj-raw>injected\\3c /mj-raw>");
    const result = await compileEmail(document);
    expect(result.errors).toEqual([]);
    expect(result.html).not.toContain("injected");
  });
});

describe("compiled social profile links", () => {
  it.each(["facebook", "x", "linkedin"])("preserves the %s destination", async (name) => {
    const document: EmailDocument = {
      root: {
        props: {
          sections: [
            {
              type: "Section1",
              props: {
                column: [
                  {
                    type: "Social",
                    props: {
                      links: [{ name, href: "https://example.com/profile?a=1&b=2", label: name }],
                    },
                  },
                ],
              },
            },
          ],
        },
      },
      content: [],
    };
    const result = await compileEmail(document);
    expect(result.errors).toEqual([]);
    expect(result.mjml).toContain(`name="${name}-noshare"`);
    expect(result.html).toContain('href="https://example.com/profile?a=1&amp;b=2"');
    expect(result.html).not.toMatch(/sharer\.php|intent\/tweet|shareArticle/);
  });
});

describe("standard MJML layout content", () => {
  it.each(["constructor", "toString", "__proto__"])("rejects unsupported block %s", (type) => {
    expect(() =>
      toMjml({ root: { props: { sections: [{ type, props: {} }] } }, content: [] }),
    ).toThrow(`Top-level blocks must be Sections; received ${type}`);
  });

  const raw: EmailBlock = { type: "Raw", props: { html: '<span data-layout="raw">Marker</span>' } };
  const layouts: EmailBlock[] = [
    { type: "Wrapper", props: { sections: [raw] } },
    { type: "Section", props: { columns: [raw] } },
    {
      type: "Section",
      props: { columns: [{ type: "Group", props: { columns: [raw] } }] },
    },
    { type: "Hero", props: { content: [raw] } },
  ];

  it.each(layouts)("allows trusted Raw content in $type", async (layout) => {
    const document: EmailDocument = { root: { props: { sections: [layout] } }, content: [] };
    expect(() => toMjml(document)).toThrow(/allowRawHtml/);
    const result = await compileEmail(document, { allowRawHtml: true });
    expect(result.errors).toEqual([]);
    expect(result.html).toContain('<span data-layout="raw">Marker</span>');
  });

  it("compiles every supported content component inside a Hero", async () => {
    const content: EmailBlock[] = [
      { type: "Text", props: { content: "Hero text" } },
      { type: "Image", props: { src: "https://example.com/image.png" } },
      { type: "Button", props: { href: "https://example.com", label: "Hero link" } },
      { type: "Spacer", props: {} },
      { type: "Divider", props: {} },
      { type: "Table", props: { rows: [{ first: "Product", second: "$10" }] } },
      { type: "Social", props: { links: [{ name: "web", href: "https://example.com" }] } },
      { type: "Navbar", props: { links: [{ label: "Home", href: "https://example.com" }] } },
      { type: "Accordion", props: { items: [{ title: "Question", content: "Answer" }] } },
      { type: "Carousel", props: { images: [{ src: "https://example.com/carousel.png" }] } },
      raw,
    ];
    const result = await compileEmail(
      { root: { props: { sections: [{ type: "Hero", props: { content } }] } }, content: [] },
      { allowRawHtml: true },
    );
    expect(result.errors).toEqual([]);
    expect(result.html).toContain("Hero text");
    expect(result.html).toContain("Question");
    expect(result.html).toContain("carousel.png");
    expect(result.html).toContain('data-layout="raw"');
  });
});
