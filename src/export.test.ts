import { describe, expect, it } from "vitest";
import { toMjml } from "./export";
import type { EmailDocument } from "./types";

const document: EmailDocument = {
  root: {
    props: {
      subject: "Welcome & hello",
      previewText: "A <special> offer",
      width: 640,
      backgroundColor: "#f4f4f4",
      fontFamily: "Arial, sans-serif",
      sections: [
        {
          type: "Section2",
          props: {
            id: "section-1",
            backgroundColor: "#ffffff",
            padding: "20px",
            left: [
              {
                type: "Text",
                props: {
                  id: "text-1",
                  content: "<p>Hello <strong>world</strong></p>",
                  color: "#111111",
                  fontSize: 18,
                  align: "left",
                  padding: "10px",
                },
              },
            ],
            right: [
              {
                type: "Button",
                props: {
                  id: "button-1",
                  label: "See & save",
                  href: "https://example.com/?a=1&b=2",
                  backgroundColor: "#123456",
                  color: "#ffffff",
                  align: "center",
                  padding: "10px",
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

describe("toMjml", () => {
  it("exports a complete email with nested columns and document settings", () => {
    const mjml = toMjml(document);
    expect(mjml).toContain("<mj-title>Welcome &amp; hello</mj-title>");
    expect(mjml).toContain("<mj-preview>A &lt;special&gt; offer</mj-preview>");
    expect(mjml).toContain('<mj-body width="640px" background-color="#f4f4f4">');
    expect(mjml).toContain('<mj-section background-color="#ffffff" padding="20px">');
    expect(mjml.match(/<mj-column>/g)).toHaveLength(2);
    expect(mjml).toContain("<p>Hello <strong>world</strong></p>");
    expect(mjml).toContain('href="https://example.com/?a=1&amp;b=2"');
    expect(mjml).toContain("See &amp; save</mj-button>");
  });

  it("escapes unsafe rich text but keeps supported formatting", () => {
    const content = [
      {
        type: "Section1",
        props: {
          id: "s",
          column: [
            {
              type: "Text",
              props: {
                id: "t",
                content:
                  '<p onclick="bad()">Safe <a href="javascript:alert(1)">link</a><script>alert(1)</script></p>',
              },
            },
          ],
        },
      },
    ];
    const mjml = toMjml({ root: { props: { sections: content } }, content: [] });
    expect(mjml).toContain("<p>Safe <a>link</a></p>");
    expect(mjml).not.toContain("onclick");
    expect(mjml).not.toContain("javascript:");
    expect(mjml).not.toContain("script");
  });

  it("rejects blocks in invalid positions", () => {
    expect(() =>
      toMjml({
        root: { props: { sections: [{ type: "Text", props: { id: "bad", content: "oops" } }] } },
        content: [],
      }),
    ).toThrow(/Section/);
    expect(() =>
      toMjml({
        root: { props: { sections: [] } },
        content: [{ type: "Text", props: { id: "bad", content: "oops" } }],
      }),
    ).toThrow(/sections slot/);
  });

  it("exports images and spacers inside three columns", () => {
    const mjml = toMjml({
      root: {
        props: {
          sections: [
            {
              type: "Section3",
              props: {
                id: "s",
                left: [
                  {
                    type: "Image",
                    props: {
                      id: "image",
                      src: "https://example.com/a.png",
                      alt: 'A "photo"',
                      width: 180,
                    },
                  },
                ],
                middle: [{ type: "Spacer", props: { id: "space", height: 32 } }],
                right: [{ type: "Text", props: { id: "text", content: "<p>Third</p>" } }],
              },
            },
          ],
        },
      },
      content: [],
    });
    expect(mjml.match(/<mj-column>/g)).toHaveLength(3);
    expect(mjml).toContain('src="https://example.com/a.png"');
    expect(mjml).toContain('alt="A &quot;photo&quot;"');
    expect(mjml).toContain('<mj-spacer height="32px" />');
  });

  it("rejects incomplete or unsafe image and button links", () => {
    const documentWith = (type: string, props: Record<string, unknown>): EmailDocument => ({
      root: {
        props: {
          sections: [
            {
              type: "Section1",
              props: { id: "section", column: [{ type, props: { id: "item", ...props } }] },
            },
          ],
        },
      },
      content: [],
    });
    expect(() => toMjml(documentWith("Image", { src: "javascript:alert(1)" }))).toThrow(
      /Image source/,
    );
    expect(() => toMjml(documentWith("Image", { src: "" }))).toThrow(/Image source/);
    expect(() => toMjml(documentWith("Button", { href: "https://" }))).toThrow(/Button link/);
    expect(() => toMjml(documentWith("Button", { href: "mailto:" }))).toThrow(/Button link/);
  });

  it("falls back to finite dimensions for incomplete number fields", () => {
    const mjml = toMjml({
      root: {
        props: {
          sections: [
            {
              type: "Section1",
              props: {
                id: "section",
                column: [
                  {
                    type: "Text",
                    props: { id: "text", content: "<p>Hello</p>", fontSize: Number.NaN },
                  },
                  { type: "Spacer", props: { id: "spacer", height: Number.NaN } },
                ],
              },
            },
          ],
        },
      },
      content: [],
    });
    expect(mjml).toContain('font-size="16px"');
    expect(mjml).toContain('height="24px"');
    expect(mjml).not.toContain("NaN");
  });

  it("exports divider, social, navigation, and table blocks", () => {
    const mjml = toMjml({
      root: {
        props: {
          sections: [
            {
              type: "Section1",
              props: {
                id: "section",
                column: [
                  {
                    type: "Divider",
                    props: { id: "divider", color: "#123456", width: 75, thickness: 2 },
                  },
                  {
                    type: "Social",
                    props: {
                      id: "social",
                      links: [
                        {
                          name: "instagram",
                          href: "https://example.com/social?a=1&b=2",
                          label: "Follow us",
                        },
                      ],
                    },
                  },
                  {
                    type: "Navbar",
                    props: {
                      id: "navbar",
                      links: [{ label: "Shop & save", href: "https://example.com/shop" }],
                    },
                  },
                  {
                    type: "Table",
                    props: {
                      id: "table",
                      firstHeading: "Product",
                      secondHeading: "Price",
                      rows: [{ first: "A < B", second: "$10 & tax" }],
                    },
                  },
                ],
              },
            },
          ],
        },
      },
      content: [],
    });
    expect(mjml).toContain('<mj-divider border-color="#123456" border-width="2px" width="75%"');
    expect(mjml).toContain(
      '<mj-social-element name="instagram" href="https://example.com/social?a=1&amp;b=2">Follow us</mj-social-element>',
    );
    expect(mjml).toContain(
      '<mj-navbar-link href="https://example.com/shop">Shop &amp; save</mj-navbar-link>',
    );
    expect(mjml).toMatch(
      /<tbody><tr><td[^>]*><p>A &lt; B<\/p><\/td><td[^>]*><p>\$10 &amp; tax<\/p><\/td><\/tr><\/tbody>/,
    );
  });

  it("rejects invalid links and malformed collections in new blocks", () => {
    const withBlock = (type: string, props: Record<string, unknown>) => ({
      root: {
        props: {
          sections: [
            {
              type: "Section1",
              props: { id: "section", column: [{ type, props: { id: "block", ...props } }] },
            },
          ],
        },
      },
      content: [],
    });
    expect(() =>
      toMjml(withBlock("Social", { links: [{ name: "facebook", href: "javascript:alert(1)" }] })),
    ).toThrow(/Social link/);
    expect(() => toMjml(withBlock("Navbar", { links: [{ href: "" }] }))).toThrow(/Navigation link/);
    expect(() => toMjml(withBlock("Table", { rows: "oops" }))).toThrow(/Table rows/);
  });

  it("exports a wrapper around sections and rejects invalid nesting", () => {
    const wrapper = {
      type: "Wrapper",
      props: {
        id: "wrapper",
        backgroundColor: "#eeeeee",
        padding: "24px",
        sections: [
          {
            type: "Section1",
            props: {
              id: "child",
              column: [{ type: "Text", props: { id: "text", content: "Wrapped" } }],
            },
          },
        ],
      },
    };
    const mjml = toMjml({ root: { props: { sections: [wrapper] } }, content: [] });
    expect(mjml).toContain('<mj-wrapper background-color="#eeeeee" padding="24px"><mj-section');
    expect(mjml).toContain("Wrapped</mj-text></mj-column></mj-section></mj-wrapper>");
    expect(() =>
      toMjml({
        root: {
          props: { sections: [{ ...wrapper, props: { ...wrapper.props, sections: [wrapper] } }] },
        },
        content: [],
      }),
    ).toThrow(/Top-level blocks must be Sections/);
    expect(() =>
      toMjml({
        root: { props: { sections: [{ type: "Section1", props: { id: "s", column: [null] } }] } },
        content: [],
      }),
    ).toThrow(/invalid block/);
  });

  it("uses a finite default width", () => {
    const mjml = toMjml({ root: { props: { width: Infinity, sections: [] } }, content: [] });
    expect(mjml).toContain('width="600px"');
  });

  it("exports a hero and accordion with sanitized content", () => {
    const mjml = toMjml({
      root: {
        props: {
          sections: [
            {
              type: "Hero",
              props: {
                id: "hero",
                mode: "fixed-height",
                height: 350,
                backgroundUrl: "https://example.com/hero.png",
                backgroundWidth: 600,
                backgroundHeight: 350,
                content: [{ type: "Text", props: { id: "title", content: "<p>Welcome</p>" } }],
              },
            },
            {
              type: "Section1",
              props: {
                id: "faq-section",
                column: [
                  {
                    type: "Accordion",
                    props: {
                      id: "faq",
                      items: [
                        {
                          title: "Is 2 < 3?",
                          content:
                            '<p onclick="bad()">Yes <strong>indeed</strong><script>bad()</script></p>',
                        },
                      ],
                    },
                  },
                ],
              },
            },
          ],
        },
      },
      content: [],
    });
    expect(mjml).toContain(
      '<mj-hero mode="fixed-height" background-url="https://example.com/hero.png"',
    );
    expect(mjml).toContain('height="350px"');
    expect(mjml).toContain("<mj-accordion-title>Is 2 &lt; 3?</mj-accordion-title>");
    expect(mjml).toContain(
      "<mj-accordion-text><p>Yes <strong>indeed</strong></p></mj-accordion-text>",
    );
    expect(mjml).not.toContain("onclick");
  });

  it("rejects unsafe hero backgrounds and unsupported hero children", () => {
    const hero = (props: Record<string, unknown>) => ({
      root: { props: { sections: [{ type: "Hero", props: { id: "hero", ...props } }] } },
      content: [],
    });
    expect(() => toMjml(hero({ backgroundUrl: "javascript:alert(1)" }))).toThrow(/Hero background/);
    expect(() =>
      toMjml(hero({ content: [{ type: "Section1", props: { id: "invalid", column: [] } }] })),
    ).toThrow(/Unsupported hero content/);
  });

  it("exports flexible sections with grouped percentage columns", () => {
    const mjml = toMjml({
      root: {
        props: {
          sections: [
            {
              type: "Section",
              props: {
                id: "s",
                columns: [
                  {
                    type: "Group",
                    props: {
                      id: "g",
                      width: 70,
                      columns: [
                        {
                          type: "Column",
                          props: {
                            id: "c1",
                            width: 40,
                            content: [{ type: "Text", props: { id: "t", content: "Grouped" } }],
                          },
                        },
                        { type: "Column", props: { id: "c2", width: 60, content: [] } },
                      ],
                    },
                  },
                  { type: "Column", props: { id: "c3", width: 30, content: [] } },
                ],
              },
            },
          ],
        },
      },
      content: [],
    });
    expect(mjml).toContain('<mj-group width="70%"><mj-column width="40%"');
    expect(mjml).toContain('<mj-column width="60%"');
    expect(mjml).toContain('</mj-group><mj-column width="30%"');
  });

  it("exports linked carousel images and rejects invalid layout children", () => {
    const carousel = {
      type: "Carousel",
      props: {
        id: "carousel",
        thumbnails: "visible",
        images: [
          {
            src: "https://example.com/one.png",
            alt: "First & best",
            href: "https://example.com/?a=1&b=2",
          },
          { src: "https://example.com/two.png", alt: "Second", href: "" },
        ],
      },
    };
    const section = (child: unknown) => ({
      root: { props: { sections: [{ type: "Section", props: { id: "s", columns: [child] } }] } },
      content: [],
    });
    const mjml = toMjml(section({ type: "Column", props: { id: "c", content: [carousel] } }));
    expect(mjml).toContain('<mj-carousel align="center" thumbnails="visible">');
    expect(mjml).toContain('alt="First &amp; best" href="https://example.com/?a=1&amp;b=2"');
    expect(() => toMjml(section({ type: "Text", props: { id: "bad" } }))).toThrow(
      /only Columns and Groups/,
    );
    expect(() =>
      toMjml(
        section({
          type: "Group",
          props: { id: "g", columns: [{ type: "Text", props: { id: "bad" } }] },
        }),
      ),
    ).toThrow(/only Columns/);
    expect(
      toMjml(
        section({
          type: "Column",
          props: { id: "c", content: [{ ...carousel, props: { ...carousel.props, images: [] } }] },
        }),
      ),
    ).toContain('<mj-carousel align="center" thumbnails="visible"></mj-carousel>');
    expect(() =>
      toMjml(
        section({
          type: "Column",
          props: {
            id: "c",
            content: [
              { ...carousel, props: { ...carousel.props, images: [{ src: "javascript:bad()" }] } },
            ],
          },
        }),
      ),
    ).toThrow(/Carousel image/);
  });

  it("exports breakpoint, web fonts, head styles, and a text CSS class", () => {
    const mjml = toMjml({
      root: {
        props: {
          breakpoint: 520,
          fontImports: [{ name: "Open Sans", href: "https://example.com/font.css?a=1&b=2" }],
          headStyles: [
            { css: ".promo > div { color: red; }", inline: "head" },
            { css: ".promo div { font-weight: 700; }", inline: "inline" },
          ],
          sections: [
            {
              type: "Section1",
              props: {
                id: "section",
                column: [
                  { type: "Text", props: { id: "text", content: "Sale", cssClass: "promo" } },
                ],
              },
            },
          ],
        },
      },
      content: [],
    });
    expect(mjml).toContain('<mj-breakpoint width="520px" />');
    expect(mjml).toContain(
      '<mj-font name="Open Sans" href="https://example.com/font.css?a=1&amp;b=2" />',
    );
    expect(mjml).toContain("<mj-style>.promo > div { color: red; }</mj-style>");
    expect(mjml).toContain('<mj-style inline="inline">.promo div { font-weight: 700; }</mj-style>');
    expect(mjml).toContain('css-class="pm-email-text promo"');
  });

  it("rejects unsafe head settings", () => {
    const head = (props: Record<string, unknown>) => ({
      root: { props: { ...props, sections: [] } },
      content: [],
    });
    expect(() =>
      toMjml(head({ fontImports: [{ name: "Bad", href: "javascript:bad()" }] })),
    ).toThrow(/Web font CSS/);
    expect(() =>
      toMjml(head({ fontImports: [{ name: "</mj-font>", href: "https://example.com/font.css" }] })),
    ).toThrow(/Web font name/);
    expect(() =>
      toMjml(head({ headStyles: [{ inline: "head", css: "</mj-style><mj-raw>bad</mj-raw>" }] })),
    ).toThrow(/Custom CSS/);
    expect(() => toMjml(head({ headStyles: [{ inline: "other", css: ".x{}" }] }))).toThrow(
      /Custom CSS output/,
    );
  });

  it("exports generated HTML attributes with escaped values", () => {
    const mjml = toMjml({
      root: {
        props: {
          htmlAttributes: [
            { selector: ".promo div", name: "data-id", value: 'A & "B"' },
            { selector: ".promo div", name: "aria-label", value: "Offer" },
          ],
          sections: [
            {
              type: "Section1",
              props: {
                id: "section",
                column: [
                  { type: "Text", props: { id: "text", content: "Sale", cssClass: "promo" } },
                ],
              },
            },
          ],
        },
      },
      content: [],
    });
    expect(mjml).toContain(
      '<mj-html-attributes><mj-selector path=".promo div"><mj-html-attribute name="data-id">A &amp; &quot;B&quot;</mj-html-attribute></mj-selector>',
    );
    expect(mjml).toContain('<mj-html-attribute name="aria-label">Offer</mj-html-attribute>');
  });

  it("rejects unsafe generated HTML attributes", () => {
    const withAttribute = (selector: string, name: string, value = "x") => ({
      root: { props: { htmlAttributes: [{ selector, name, value }], sections: [] } },
      content: [],
    });
    expect(() => toMjml(withAttribute(".promo", "onclick"))).toThrow(/allowRawHtml/);
    expect(() => toMjml(withAttribute(".promo", "href", "javascript:bad()"))).toThrow(/URL/);
    expect(toMjml(withAttribute(".promo", "href", "/relative"))).toContain(
      '<mj-html-attribute name="href">/relative</mj-html-attribute>',
    );
    expect(() => toMjml(withAttribute("", "data-id"))).toThrow(/selector/);
    expect(() => toMjml(withAttribute(".promo\nother", "data-id"))).toThrow(/selector/);
  });

  it("requires explicit raw HTML opt-in and preserves trusted template content", () => {
    const withRaw = (html: string): EmailDocument => ({
      root: { props: { sections: [{ type: "Raw", props: { id: "raw", html } }] } },
      content: [],
    });
    const document = withRaw("<!-- conditional markup --><p>Hello {{ name }}</p>");
    expect(() => toMjml(document)).toThrow(/allowRawHtml: true/);
    expect(toMjml(document, { allowRawHtml: true })).toContain(
      "<mj-raw><!-- conditional markup --><p>Hello {{ name }}</p></mj-raw>",
    );
    expect(() => toMjml(withRaw("</MJ-RAW><mj-section />"), { allowRawHtml: true })).toThrow(
      /mj-raw closing tag/,
    );
    expect(() =>
      toMjml({ root: { props: { rawHead: '<meta name="x" content="y" />' } }, content: [] }),
    ).toThrow(/allowRawHtml: true/);
  });
});
