import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { compileEmail, toMjml } from "./export";
import type { EmailBlock, EmailDocument } from "./types";

beforeAll(() => vi.stubGlobal("window", globalThis));
afterAll(() => vi.unstubAllGlobals());

const documentWith = (...column: EmailBlock[]): EmailDocument => ({
  root: {
    props: {
      fontFamily: "Inter, Arial, sans-serif",
      sections: [{ type: "Section1", props: { column } }],
    },
  },
  content: [],
});

describe("compiled typography and presentation attributes", () => {
  it("preserves text typography and rich formatting with zero paragraph margins", async () => {
    const result = await compileEmail(
      documentWith({
        type: "Text",
        props: {
          content:
            '<h6>Details</h6><p style="text-align:center">Monthly roundup</p><ol start="4" type="A"><li>Release</li></ol>',
          fontFamily: "Arial, Helvetica, sans-serif",
          fontWeight: 400,
          fontSize: 48,
          lineHeight: 1,
          letterSpacing: -1.44,
          padding: "0px",
          cssClass: "matte-heading",
        },
      }),
    );
    expect(result.errors).toEqual([]);
    expect(result.html).toContain(
      "font-family:Arial, Helvetica, sans-serif;font-size:48px;font-weight:400;letter-spacing:-1.44px;line-height:1;",
    );
    expect(result.html).toContain('class="pm-email-text matte-heading"');
    expect(result.html).toMatch(/<p style="[^"]*margin: 0;[^"]*">Monthly roundup<\/p>/);
    expect(result.html).toContain("text-align: center;");
    expect(result.html).toMatch(/<h6[^>]*>Details<\/h6>/);
    expect(result.html).toContain('<ol start="4" type="A">');
  });

  it("matches canvas heading styles without removing alignment or styling raw HTML", async () => {
    const document = documentWith(
      {
        type: "Text",
        props: {
          content:
            '<h1 style="text-align:right">One</h1><h2>Two</h2><h3>Three</h3><h4>Four</h4><h5>Five</h5><h6 style="text-align:center">Six</h6>',
        },
      },
      { type: "Raw", props: { html: "<h1>Raw heading</h1>" } },
    );
    const result = await compileEmail(document, { allowRawHtml: true });
    expect(result.errors).toEqual([]);
    const headings = [
      ...result.html.matchAll(/<h([1-6]) style="([^"]*)">(One|Two|Three|Four|Five|Six)<\/h[1-6]>/g),
    ];
    expect(headings).toHaveLength(6);
    const sizes = ["1.7em", "1.3em", "1.17em", "1em", "0.83em", "0.67em"];
    headings.forEach((heading, index) => {
      expect(heading[2]).toContain(`font-size: ${sizes[index]};`);
      expect(heading[2]).toContain("font-weight: bold;");
      expect(heading[2]).toContain("margin: 0 0 0.5em;");
    });
    expect(headings[0][2]).toContain("line-height: 1.15;");
    expect(headings[0][2]).toContain("text-align: right;");
    expect(headings[1][2]).toContain("line-height: 1.2;");
    expect(headings[5][2]).toContain("text-align: center;");
    expect(headings[5][2]).toContain("margin-bottom: 0;");
    expect(result.html).toContain("<h1>Raw heading</h1>");
  });

  it("compiles square buttons with the requested typography and inner spacing", async () => {
    const result = await compileEmail(
      documentWith({
        type: "Button",
        props: {
          href: "https://example.com/",
          label: "Explore",
          fontFamily: "Inter, Arial, sans-serif",
          fontSize: 15,
          fontWeight: 500,
          lineHeight: 1.5,
          letterSpacing: -0.075,
          innerPadding: "14px 20px",
          borderRadius: "0px",
          padding: "0px",
          cssClass: "matte-button",
        },
      }),
    );
    expect(result.errors).toEqual([]);
    expect(result.html).toContain('class="matte-button"');
    expect(result.html).toContain(
      "font-size:15px;font-weight:500;line-height:1.5;letter-spacing:-0.075px;",
    );
    expect(result.html).toContain("padding:14px 20px;");
    expect(result.html).toContain("border-radius:0px;");
  });

  it("inherits document fonts and uses the declared typography defaults", async () => {
    const result = await compileEmail(
      documentWith(
        { type: "Text", props: { content: "Inherited", fontFamily: "" } },
        { type: "Button", props: { href: "https://example.com", label: "Default" } },
      ),
    );
    expect(result.errors).toEqual([]);
    expect(result.html).toContain(
      "font-family:Inter, Arial, sans-serif;font-size:16px;font-weight:400;letter-spacing:0px;line-height:1.5;",
    );
    expect(result.html).toContain("font-size:13px;font-weight:400;line-height:1.2;");
    expect(result.html).toContain("padding:10px 25px;");
    expect(result.html).toContain("border-radius:3px;");
    expect(result.mjml).not.toMatch(/<mj-text[^>]*font-family=/);
  });

  it("compiles linked, rounded images with CSS classes", async () => {
    const result = await compileEmail(
      documentWith({
        type: "Image",
        props: {
          src: "https://example.com/image.png",
          href: "https://example.com/offer?a=1&b=2",
          alt: 'A "photo"',
          borderRadius: "8px 8px 0px 0px",
          cssClass: "matte-image",
        },
      }),
    );
    expect(result.errors).toEqual([]);
    expect(result.html).toContain('href="https://example.com/offer?a=1&amp;b=2"');
    expect(result.html).toContain('class="matte-image"');
    expect(result.html).toContain("border-radius:8px 8px 0px 0px;");
    expect(result.html).toContain('alt="A &quot;photo&quot;"');
  });

  it("compiles wrapper, flexible section, group, and column styling", async () => {
    const result = await compileEmail({
      root: {
        props: {
          sections: [
            {
              type: "Wrapper",
              props: {
                border: "1px solid #D8E1D4",
                borderRadius: "8px",
                cssClass: "matte-card",
                sections: [
                  {
                    type: "Section",
                    props: {
                      border: "2px dashed #123",
                      borderRadius: "4px",
                      cssClass: "matte-section",
                      columns: [
                        {
                          type: "Group",
                          props: {
                            width: 100,
                            cssClass: "matte-group",
                            columns: [
                              {
                                type: "Column",
                                props: {
                                  width: 100,
                                  verticalAlign: "middle",
                                  cssClass: "matte-column",
                                  content: [{ type: "Text", props: { content: "Inside" } }],
                                },
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
          ],
        },
      },
      content: [],
    });
    expect(result.errors).toEqual([]);
    expect(result.html).toContain("border:1px solid #D8E1D4;");
    expect(result.html).toContain("border:2px dashed #123;");
    expect(result.html).toContain("border-radius:8px;");
    expect(result.html).toContain("border-radius:4px;");
    for (const name of ["matte-card", "matte-section", "matte-group", "matte-column"])
      expect(result.html).toContain(name);
    expect(result.html).toContain("vertical-align:middle;");
  });

  it.each(["Section1", "Section2", "Section3"])("styles %s consistently", async (type) => {
    const result = await compileEmail({
      root: {
        props: {
          sections: [
            {
              type,
              props: {
                border: "1px solid #D8E1D4",
                borderRadius: "8px",
                cssClass: "matte-section",
              },
            },
          ],
        },
      },
      content: [],
    });
    expect(result.errors).toEqual([]);
    expect(result.html).toContain("border:1px solid #D8E1D4;");
    expect(result.html).toContain("border-radius:8px;");
    expect(result.html).toContain('class="matte-section"');
  });

  it("uses custom social icons with transparent backgrounds while retaining presets", async () => {
    const result = await compileEmail(
      documentWith({
        type: "Social",
        props: {
          align: "left",
          padding: "0px",
          iconSize: 20,
          iconPadding: "0px",
          borderRadius: "0px",
          links: [
            {
              name: "x",
              href: "https://example.com/",
              src: "https://example.com/x.png",
              alt: "X",
              backgroundColor: "transparent",
              padding: "0px 32px 0px 0px",
              label: "",
            },
            {
              name: "github",
              href: "https://example.com/",
              src: "https://example.com/github.png",
              alt: "GitHub",
              label: "",
            },
            { name: "instagram", href: "https://example.com/", label: "Instagram" },
          ],
        },
      }),
    );
    expect(result.errors).toEqual([]);
    expect(result.html).toContain('src="https://example.com/x.png"');
    expect(result.html).toContain('src="https://example.com/github.png"');
    expect(result.html).toContain('alt="GitHub"');
    expect(result.html.match(/background:transparent;/g)).toHaveLength(2);
    expect(result.html).toContain("padding:0px 32px 0px 0px;");
    expect(result.html).toContain("border-radius:0px;width:20px;");
    expect(result.html).toContain("ico-social/instagram.png");
    expect(result.html).not.toContain("intent/tweet");
  });

  it("normalizes unsafe CSS and non-finite typography without compiler warnings", async () => {
    const unsafe = "0px; background-image:url(https://invalid.example/injected)";
    const document = documentWith(
      {
        type: "Text",
        props: {
          content: "Safe",
          fontFamily: unsafe,
          fontSize: Infinity,
          fontWeight: NaN,
          lineHeight: Infinity,
          letterSpacing: NaN,
          padding: "10px20px",
        },
      },
      {
        type: "Button",
        props: {
          href: "https://example.com",
          label: "Safe",
          innerPadding: unsafe,
          borderRadius: unsafe,
        },
      },
      {
        type: "Social",
        props: {
          padding: unsafe,
          iconSize: NaN,
          iconPadding: unsafe,
          borderRadius: unsafe,
          links: [
            { name: "web", href: "https://example.com", backgroundColor: unsafe, padding: unsafe },
          ],
        },
      },
    );
    Object.assign(document.root.props!.sections![0].props, {
      border: unsafe,
      borderRadius: unsafe,
    });
    const result = await compileEmail(document);
    expect(result.errors).toEqual([]);
    expect(result.mjml).not.toContain("injected");
    expect(result.html).not.toMatch(/NaN|Infinity|injected/);
    expect(result.mjml).toContain('font-weight="400" line-height="1.5" letter-spacing="0px"');
  });

  it("rejects unsafe image destinations and custom icon sources", () => {
    expect(() =>
      toMjml(
        documentWith({
          type: "Image",
          props: {
            src: "https://example.com/image.png",
            href: "javascript:alert(1)",
          },
        }),
      ),
    ).toThrow(/Image link/);
    expect(() =>
      toMjml(
        documentWith({
          type: "Social",
          props: {
            links: [{ name: "web", href: "https://example.com", src: "data:image/png;base64,a" }],
          },
        }),
      ),
    ).toThrow(/Social icon source/);
    expect(() =>
      toMjml(
        documentWith({
          type: "Button",
          props: {
            href: "https://example.com",
            cssClass: 'x" onclick="bad()',
          },
        }),
      ),
    ).toThrow(/CSS class/);
  });
});
