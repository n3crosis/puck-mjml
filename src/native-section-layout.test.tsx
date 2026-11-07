import { Render, type Data } from "@puckeditor/core";
import { Window } from "happy-dom";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createEmailConfig } from "./config";
import { compileEmail } from "./export";
import type { EmailBlock, EmailDocument, MjmlAttribute } from "./types";

beforeAll(() => vi.stubGlobal("window", globalThis));
afterAll(() => vi.unstubAllGlobals());

const attributes = (values: Record<string, string>): MjmlAttribute[] =>
  Object.entries(values).map(([name, value]) => ({ name, value }));
const block = (type: string, id: string, props: EmailBlock["props"] = {}): EmailBlock => ({
  type,
  props: { id, ...props },
});
const copy = (id: string) => block("Text", id, { content: `<p>${id}</p>` });
const documentWith = (section: EmailBlock): EmailDocument => ({
  root: { props: { width: 600, sections: [section] } },
  content: [],
});

function parse(html: string) {
  const window = new Window({
    settings: {
      enableJavaScriptEvaluation: false,
      disableCSSFileLoading: true,
      disableJavaScriptFileLoading: true,
      enableImageFileLoading: false,
      disableIframePageLoading: true,
    },
  });
  window.document.body.innerHTML = html;
  return window.document;
}
const render = (document: EmailDocument, allowRaw = false) =>
  parse(
    renderToStaticMarkup(
      <Render config={createEmailConfig(undefined, allowRaw)} data={document as Data} />,
    ),
  );
function style(element: { getAttribute: (name: string) => string | null } | null, name: string) {
  expect(element).not.toBeNull();
  return element!
    .getAttribute("style")
    ?.split(";")
    .find((entry) => entry.trim().startsWith(`${name}:`))
    ?.slice(name.length + 1)
    .trim();
}

const alignmentCases = (["Section", "Section2"] as const).flatMap((type) => [
  [type, "ltr", "left", "flex-start"],
  [type, "ltr", "center", "center"],
  [type, "ltr", "right", "flex-end"],
  [type, "rtl", "left", "flex-end"],
  [type, "rtl", "center", "center"],
  [type, "rtl", "right", "flex-start"],
]);

describe("native section alignment", () => {
  it.each(alignmentCases)(
    "aligns %s columns in %s layout to physical %s",
    async (type, direction, textAlign, justifyContent) => {
      const common = {
        cssClass: "aligned-section",
        mjmlAttributes: attributes({ direction, "text-align": textAlign }),
      };
      const document = documentWith(
        block(
          type,
          "section",
          type === "Section2"
            ? {
                ...common,
                leftAttributes: attributes({ width: "20%", "css-class": "first-column" }),
                rightAttributes: attributes({ width: "30%", "css-class": "second-column" }),
                left: [copy("first-copy")],
                right: [copy("second-copy")],
              }
            : {
                ...common,
                columns: [
                  block("Column", "first", {
                    width: 20,
                    cssClass: "first-column",
                    content: [copy("first-copy")],
                  }),
                  block("Column", "second", {
                    width: 30,
                    cssClass: "second-column",
                    content: [copy("second-copy")],
                  }),
                ],
              },
        ),
      );
      const canvas = render(document);
      const row = canvas.querySelector(
        type === "Section2" ? ".pm-native-columns" : ".pm-flex-section > div",
      );
      expect(style(row, "justify-content")).toBe(justifyContent);
      expect(style(canvas.querySelector(".aligned-section"), "direction")).toBe(direction);
      expect(style(canvas.querySelector(".first-column"), "flex-basis")).toBe("20%");
      expect(style(canvas.querySelector(".second-column"), "flex-basis")).toBe("30%");
      const result = await compileEmail(document);
      expect(result.errors).toEqual([]);
      const compiled = parse(result.html);
      const cell = compiled.querySelector(".aligned-section > table > tbody > tr > td");
      expect(style(cell, "text-align")).toBe(textAlign);
      expect(style(cell, "direction")).toBe(direction);
      expect(compiled.querySelector(".first-column.mj-column-per-20")).not.toBeNull();
      expect(compiled.querySelector(".second-column.mj-column-per-30")).not.toBeNull();
    },
  );

  it.each([
    ["ltr", "flex-start"],
    ["rtl", "flex-end"],
  ])(
    "keeps a %s group's contents left-aligned independently of its section",
    async (direction, justifyContent) => {
      const document = documentWith(
        block("Section", "section", {
          mjmlAttributes: attributes({ "text-align": "right", direction: "rtl" }),
          columns: [
            block("Group", "group", {
              width: 75,
              cssClass: "aligned-group",
              mjmlAttributes: attributes({ direction }),
              columns: [block("Column", "column", { width: 30, content: [copy("group-copy")] })],
            }),
          ],
        }),
      );
      const canvas = render(document);
      expect(style(canvas.querySelector(".pm-flex-section > div"), "justify-content")).toBe(
        "flex-start",
      );
      expect(style(canvas.querySelector(".aligned-group > div"), "justify-content")).toBe(
        justifyContent,
      );
      const result = await compileEmail(document);
      expect(result.errors).toEqual([]);
      const group = parse(result.html).querySelector(".aligned-group");
      expect(style(group, "text-align")).toBe("left");
      expect(style(group, "direction")).toBe(direction);
    },
  );
});

describe("native automatic layout widths", () => {
  it.each([false, true])(
    "divides inherited column and group widths among non-raw siblings (native parent: %s)",
    async (nativeParent) => {
      const automatic = (id: string) =>
        block("Column", id, {
          cssClass: id,
          mjmlAttributes: [{ name: "width", inherit: true }],
          content: [copy(`${id}-copy`)],
        });
      const document = documentWith(
        block("Section", "section", {
          ...(nativeParent ? { mjmlAttributes: attributes({ direction: "rtl" }) } : {}),
          columns: [
            automatic("outer-column"),
            block("Raw", "outer-raw", { html: "<!-- outer marker -->" }),
            block("Group", "group", {
              cssClass: "automatic-group",
              mjmlAttributes: [{ name: "width", inherit: true }],
              columns: [
                automatic("group-first"),
                block("Raw", "group-raw", { html: "<!-- group marker -->" }),
                automatic("group-second"),
              ],
            }),
          ],
        }),
      );
      const canvas = render(document, true);
      for (const name of ["outer-column", "automatic-group", "group-first", "group-second"]) {
        expect(style(canvas.querySelector(`.${name}`), "flex-basis")).toBe("50%");
      }
      const result = await compileEmail(document, { allowRawHtml: true });
      expect(result.errors).toEqual([]);
      const compiled = parse(result.html);
      for (const name of ["outer-column", "automatic-group", "group-first", "group-second"]) {
        expect(compiled.querySelector(`.${name}.mj-column-per-50`)).not.toBeNull();
      }
      expect(result.html).toContain("<!-- outer marker -->");
      expect(result.html).toContain("<!-- group marker -->");
    },
  );
});
