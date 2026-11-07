import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { compileEmail } from "./export";
import { createEmailConfig } from "./config";
import type { EmailBlock, EmailDocument } from "./types";

// The browser bundle needs a window name at import time. No browser or DOM is started.
beforeAll(() => vi.stubGlobal("window", globalThis));
afterAll(() => vi.unstubAllGlobals());

const rawDocument: EmailDocument = {
  root: {
    props: {
      rawHead: '<meta name="host-template" content="newsletter" />',
      sections: [
        { type: "Raw", props: { id: "raw-body", html: '<div id="raw-body">{{ greeting }}</div>' } },
        {
          type: "Wrapper",
          props: {
            id: "wrapper",
            sections: [
              {
                type: "Section1",
                props: {
                  id: "fixed",
                  column: [
                    {
                      type: "Raw",
                      props: { id: "raw-fixed", html: '<p id="raw-fixed">Fixed column</p>' },
                    },
                  ],
                },
              },
            ],
          },
        },
        {
          type: "Section",
          props: {
            id: "flexible",
            columns: [
              {
                type: "Group",
                props: {
                  id: "group",
                  columns: [
                    {
                      type: "Column",
                      props: {
                        id: "column",
                        width: 100,
                        content: [
                          {
                            type: "Raw",
                            props: {
                              id: "raw-group",
                              html: '<p id="raw-group">Grouped column</p>',
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
};

describe("MJML compilation", () => {
  it.each(["Text", "Image", "Button"])("bounds %s alignment to supported values", async (type) => {
    const document: EmailDocument = {
      root: {
        props: {
          sections: [
            {
              type: "Section1",
              props: {
                id: "s",
                column: [
                  {
                    type,
                    props: {
                      id: "block",
                      align: "left; background-image:url(https://example.com/beacon)",
                      content: "<p>Text</p>",
                      label: "Button",
                      href: "https://example.com",
                      src: "https://example.com/image.png",
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
    expect(result.mjml).not.toContain("beacon");
    expect(result.html).not.toContain("beacon");
  });

  it("compiles the palette defaults in their supported layouts", async () => {
    const config = createEmailConfig(undefined, true);
    let nextId = 0;
    const block = (type: string, props: Record<string, unknown> = {}): EmailBlock => ({
      type,
      props: { ...config.components[type].defaultProps, id: `palette-${nextId++}`, ...props },
    });
    const content = [
      "Text",
      "Button",
      "Spacer",
      "Divider",
      "Social",
      "Navbar",
      "Table",
      "Accordion",
      "Carousel",
      "Raw",
    ].map((type) => block(type));
    content.push(block("Image", { src: "https://example.com/image.png" }));
    const document: EmailDocument = {
      root: {
        props: {
          sections: [
            block("Wrapper", { sections: [block("Section1", { column: content })] }),
            block("Hero", { content: [block("Text"), block("Button")] }),
            block("Section", {
              columns: [
                block("Group", {
                  columns: [block("Column", { width: 100, content: [block("Text")] })],
                }),
              ],
            }),
            block("Section2"),
            block("Section3"),
          ],
        },
      },
      content: [],
    };
    const result = await compileEmail(document, { allowRawHtml: true });
    expect(result.errors).toEqual([]);
    expect(result.html).toContain("Your text here");
    expect(result.html).toContain("Custom HTML");
  });

  it("requires host permission for raw HTML", async () => {
    await expect(compileEmail(rawDocument)).rejects.toThrow(/allowRawHtml: true/);
  });

  it("passes trusted raw head, body, and nested column HTML to MJML", async () => {
    const result = await compileEmail(rawDocument, { allowRawHtml: true });
    expect(result.errors).toEqual([]);
    expect(result.html).toContain('<meta name="host-template" content="newsletter"');
    expect(result.html).toContain('<div id="raw-body">{{ greeting }}</div>');
    expect(result.html).toContain('<p id="raw-fixed">Fixed column</p>');
    expect(result.html).toContain('<p id="raw-group">Grouped column</p>');
  });
});
