import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Render, type Data } from "@puckeditor/core";
import { createEmailConfig } from "./config";
import { sanitizeDocumentRichText } from "./normalize";

describe("email canvas", () => {
  it("renders sanitized plain rich text without double-encoding entities", () => {
    const data = sanitizeDocumentRichText({
      root: {
        props: {
          sections: [
            {
              type: "Section1",
              props: {
                id: "section",
                column: [{ type: "Text", props: { id: "text", content: "A & B < C" } }],
              },
            },
          ],
        },
      },
      content: [],
    });
    const html = renderToStaticMarkup(<Render config={createEmailConfig()} data={data as Data} />);
    expect(html).toContain("<p>A &amp; B &lt; C</p>");
    expect(html).not.toContain("&amp;amp;");
  });
  it("shows raw source as text on the canvas and hides its palette entry by default", () => {
    const config = createEmailConfig(undefined, true);
    const data = {
      root: {
        props: {
          sections: [
            { type: "Raw", props: { id: "raw", html: '<script>alert("x")</script><p>HTML</p>' } },
          ],
        },
      },
      content: [],
    };
    const html = renderToStaticMarkup(<Render config={config} data={data as Data} />);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(createEmailConfig().categories?.Advanced.visible).toBe(false);
    expect(config.categories?.Advanced.visible).toBe(true);
  });
  it("keeps text editing on the canvas and style controls in the sidebar", () => {
    const config = createEmailConfig();
    expect(config.components.Text.fields?.content).toMatchObject({
      type: "richtext",
      contentEditable: true,
      visible: false,
    });
    expect(config.components.Text.fields?.fontSize).toMatchObject({ type: "number" });
    expect(config.components.Button.fields?.label).toMatchObject({
      type: "text",
      contentEditable: true,
      visible: false,
    });
  });
  it("renders flexible columns, groups, and carousel images", () => {
    const data = {
      root: {
        props: {
          sections: [
            {
              type: "Section",
              props: {
                id: "section",
                columns: [
                  {
                    type: "Group",
                    props: {
                      id: "group",
                      width: 100,
                      columns: [
                        {
                          type: "Column",
                          props: {
                            id: "column",
                            width: 50,
                            content: [
                              {
                                type: "Carousel",
                                props: {
                                  id: "carousel",
                                  images: [
                                    {
                                      src: "https://example.com/photo.png",
                                      alt: "Photo",
                                      href: "",
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
          ],
        },
      },
      content: [],
    };
    const html = renderToStaticMarkup(<Render config={createEmailConfig()} data={data as Data} />);
    expect(html).toContain("pm-flex-section");
    expect(html).toContain("pm-flex-group");
    expect(html).toContain("pm-carousel-main");
    expect(html).toContain("Photo");
  });
});
