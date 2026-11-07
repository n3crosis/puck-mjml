import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Render, type Data } from "@puckeditor/core";
import { createEmailConfig } from "./config";

describe("nested email content", () => {
  it("renders formatted accordion answers inside grouped flexible columns", () => {
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
                      width: 75,
                      columns: [
                        {
                          type: "Column",
                          props: {
                            id: "column",
                            width: 40,
                            content: [
                              {
                                type: "Accordion",
                                props: {
                                  id: "accordion",
                                  items: [
                                    {
                                      title: "Question",
                                      content: "<p>A <strong>formatted</strong> answer.</p>",
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
    expect(html).toContain('class="pm-flex-group" style="flex-basis:75%"');
    expect(html).toContain('class="pm-flex-column" style="flex-basis:40%"');
    expect(html).toContain("<summary>Question</summary>");
    expect(html).toContain("<p>A <strong>formatted</strong> answer.</p>");
  });
});
