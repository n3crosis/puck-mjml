import { Render, type Data } from "@puckeditor/core";
import { Window } from "happy-dom";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createEmailConfig } from "./config";
import { compileEmail } from "./export";
import type { EmailBlock, EmailDocument, EmailSettings, MjmlAttribute } from "./types";

beforeAll(() => vi.stubGlobal("window", globalThis));
afterAll(() => vi.unstubAllGlobals());

const values = (entries: Record<string, string>): MjmlAttribute[] =>
  Object.entries(entries).map(([name, value]) => ({ name, value }));
const block = (type: string, id: string, props: EmailBlock["props"] = {}): EmailBlock => ({
  type,
  props: { id, ...props },
});
const documentWith = (sections: EmailBlock[], settings: EmailSettings = {}): EmailDocument => ({
  root: { props: { width: 600, ...settings, sections } },
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
const render = (document: EmailDocument) =>
  parse(renderToStaticMarkup(<Render config={createEmailConfig()} data={document as Data} />));
const styles = (element: { getAttribute: (name: string) => string | null } | null) => {
  expect(element).not.toBeNull();
  return element!.getAttribute("style") ?? "";
};

describe("native hero content box", () => {
  it("resolves inner background and each padding edge independently from the outer hero", async () => {
    const document = documentWith(
      [
        block("Hero", "hero", {
          mjClass: "hero-card",
          mjmlAttributes: values({
            "css-class": "hero-card",
            "background-color": "#123456",
            padding: "20px 30px",
            "inner-padding-left": "19px",
          }),
          content: [block("Text", "copy", { content: "<p>Editable hero copy</p>" })],
        }),
      ],
      {
        componentDefaults: [
          {
            tag: "mj-hero",
            attributes: values({ "inner-background-color": "#abcdef", "inner-padding": "8px" }),
          },
        ],
        mjmlClasses: [
          {
            name: "hero-card",
            attributes: values({
              "inner-padding-top": "11px",
              "inner-padding-right": "13px",
              "inner-padding-bottom": "17px",
              "inner-padding-left": "23px",
            }),
          },
        ],
      },
    );
    const canvas = render(document);
    const email = await compileEmail(document);
    expect(email.errors).toEqual([]);
    const compiled = parse(email.html);
    const inner = styles(canvas.querySelector(".hero-card > .pm-hero-content"));
    const compiledInner = styles(compiled.querySelector(".hero-card .mj-hero-content"));
    for (const declaration of [
      "background-color:#abcdef",
      "padding:8px",
      "padding-top:11px",
      "padding-right:13px",
      "padding-bottom:17px",
      "padding-left:19px",
    ]) {
      expect(inner).toContain(declaration);
      expect(compiledInner).toContain(declaration);
    }
    expect(styles(canvas.querySelector(".hero-card"))).toContain("background-color:#123456");
    expect(styles(canvas.querySelector(".hero-card"))).toContain("padding:20px 30px");
    expect(inner).not.toContain("padding:20px 30px");
    expect(canvas.querySelector(".pm-hero-content")?.textContent).toContain("Editable hero copy");
  });

  it("uses fixed height as a minimum including outer padding, leaving long content free to grow", async () => {
    const document = documentWith([
      block("Hero", "hero", {
        mjmlAttributes: values({
          "css-class": "fixed-hero",
          mode: "fixed-height",
          height: "200px",
          padding: "20px 30px",
          "padding-top": "25px",
          "padding-bottom": "35px",
          "vertical-align": "middle",
        }),
        content: Array.from({ length: 12 }, (_, index) =>
          block("Text", `copy-${index}`, { content: `<p>Hero paragraph ${index + 1}</p>` }),
        ),
      }),
    ]);
    const canvas = render(document);
    const heroStyle = styles(canvas.querySelector(".fixed-hero"));
    expect(heroStyle).toContain("min-height:200px");
    expect(heroStyle).toContain("box-sizing:border-box");
    expect(heroStyle).toContain("justify-content:center");
    expect(heroStyle).not.toMatch(/(?:^|;)height:/);
    expect(canvas.querySelectorAll(".fixed-hero .pm-text")).toHaveLength(12);

    const email = await compileEmail(document);
    expect(email.errors).toEqual([]);
    const compiled = parse(email.html);
    const cell = compiled.querySelector(".fixed-hero > table > tbody > tr > td");
    // MJML subtracts outer padding from its table cell's content height. Tables
    // can expand past that height; a canvas minimum likewise avoids clipping.
    expect(cell?.getAttribute("height")).toBe("140");
    expect(styles(cell)).toContain("height:140px");
    expect(styles(cell)).toContain("padding-top:25px");
    expect(styles(cell)).toContain("padding-bottom:35px");
    expect(cell?.textContent).toContain("Hero paragraph 12");
  });
});

describe("native group vertical alignment", () => {
  it.each([
    ["top", "flex-start"],
    ["middle", "center"],
    ["bottom", "flex-end"],
  ])("aligns %s groups alongside a taller column", async (verticalAlign, alignSelf) => {
    const document = documentWith([
      block("Section", "section", {
        columns: [
          block("Group", "group", {
            width: 50,
            mjmlAttributes: values({
              "css-class": "aligned-group",
              "vertical-align": verticalAlign,
            }),
            columns: [
              block("Column", "inner-column", {
                width: 100,
                content: [block("Text", "short", { content: "<p>Short column</p>" })],
              }),
            ],
          }),
          block("Column", "tall-column", {
            width: 50,
            content: [block("Spacer", "tall", { height: 300 })],
          }),
        ],
      }),
    ]);
    const canvas = render(document);
    expect(styles(canvas.querySelector(".aligned-group"))).toContain(`align-self:${alignSelf}`);
    const email = await compileEmail(document);
    expect(email.errors).toEqual([]);
    expect(styles(parse(email.html).querySelector(".aligned-group"))).toContain(
      `vertical-align:${verticalAlign}`,
    );
  });
});
