import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Render, type Data } from "@puckeditor/core";
import { load } from "cheerio";
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
    const $ = load(html);
    const group = $(".pm-flex-group");
    expect(group).toHaveLength(1);
    expect(group.attr("style")).toMatch(/(?:^|;)\s*flex-basis:\s*75%(?:;|$)/);
    const column = group.find(".pm-flex-column");
    expect(column).toHaveLength(1);
    expect(column.attr("style")).toMatch(/(?:^|;)\s*flex-basis:\s*40%(?:;|$)/);
    expect(column.find("summary")).toHaveLength(1);
    expect(column.find("summary").text()).toBe("Question");
    expect(column.find("details p")).toHaveLength(1);
    expect(column.find("details p").html()).toBe("A <strong>formatted</strong> answer.");
  });
});
