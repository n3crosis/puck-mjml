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
const documentWith = (sections: EmailBlock[]): EmailDocument => ({
  root: { props: { width: 600, sections } },
  content: [],
});
const single = (content: EmailBlock[]) =>
  documentWith([block("Section1", "section", { column: content })]);

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

function style(element: { getAttribute: (name: string) => string | null } | null, name: string) {
  expect(element).not.toBeNull();
  return element!
    .getAttribute("style")
    ?.split(";")
    .find((entry) => entry.trim().startsWith(`${name}:`))
    ?.slice(name.length + 1)
    .trim();
}

describe("native button layout", () => {
  it.each(["left", "center", "right"])(
    "keeps outer placement separate from %s inner text alignment",
    async (textAlign) => {
      const document = single([
        block("Button", "button", {
          href: "https://example.com/action",
          label: "A long button label that wraps within its fixed width",
          cssClass: "button-case",
          mjmlAttributes: attributes({
            align: "right",
            "text-align": textAlign,
            width: "260px",
          }),
        }),
      ]);
      const canvas = render(document);
      expect(style(canvas.querySelector(".button-case"), "text-align")).toBe("right");
      expect(style(canvas.querySelector(".button-case .pm-button"), "text-align")).toBe(textAlign);
      const result = await compileEmail(document);
      expect(result.errors).toEqual([]);
      const compiled = parse(result.html);
      expect(compiled.querySelector(".button-case")?.getAttribute("align")).toBe("right");
      expect(
        style(compiled.querySelector(".button-case td[role=presentation]"), "text-align"),
      ).toBe(textAlign);
    },
  );

  it("centers inner text by default even when the button is positioned on the left", async () => {
    const document = single([
      block("Button", "button", {
        label: "Centered label",
        href: "https://example.com/action",
        cssClass: "button-case",
        mjmlAttributes: attributes({ align: "left", width: "260px" }),
      }),
    ]);
    const canvas = render(document);
    expect(style(canvas.querySelector(".button-case"), "text-align")).toBe("left");
    expect(style(canvas.querySelector(".button-case .pm-button"), "text-align")).toBe("center");
    const result = await compileEmail(document);
    expect(result.errors).toEqual([]);
    expect(
      parse(result.html).querySelector(".button-case td[role=presentation]")?.getAttribute("align"),
    ).toBe("center");
  });

  it.each([
    ["top", "flex-start"],
    ["middle", "center"],
    ["bottom", "flex-end"],
  ])(
    "aligns %s content in a minimum-height button with padding and borders",
    async (verticalAlign, justifyContent) => {
      const document = single([
        block("Button", "button", {
          label: "Button content",
          href: "https://example.com/action",
          cssClass: "button-case",
          mjmlAttributes: attributes({
            width: "280px",
            height: "80px",
            border: "3px solid navy",
            "inner-padding": "12px 20px",
            "vertical-align": verticalAlign,
          }),
        }),
      ]);
      const button = render(document).querySelector(".button-case .pm-button");
      expect(style(button, "display")).toBe("inline-flex");
      expect(style(button, "flex-direction")).toBe("column");
      expect(style(button, "justify-content")).toBe(justifyContent);
      expect(style(button, "min-height")).toBe("80px");
      expect(style(button, "height")).toBeUndefined();
      expect(style(button, "box-sizing")).toBe("border-box");
      expect(style(button, "width")).toBe("280px");
      expect(style(button, "padding")).toBe("12px 20px");
      expect(style(button, "border")).toBe("3px solid navy");

      const result = await compileEmail(document);
      expect(result.errors).toEqual([]);
      const compiled = parse(result.html);
      const cell = compiled.querySelector(".button-case td[role=presentation]");
      expect(style(cell, "height")).toBe("80px");
      expect(cell?.getAttribute("valign")).toBe(verticalAlign);
      expect(style(compiled.querySelector(".button-case a"), "padding")).toBe("12px 20px");
      expect(style(compiled.querySelector(".button-case a"), "width")).toBe("234px");
    },
  );
});

describe("native image content width", () => {
  it.each([
    ["560px", "276px"],
    ["150.75px", "150px"],
    [undefined, "276px"],
  ])("clamps requested width %s to the desktop column content box", async (width, expected) => {
    const document = documentWith([
      block("Section2", "section", {
        left: [
          block("Image", "image", {
            src: "https://example.com/image.png",
            cssClass: "image-case",
            mjmlAttributes: [
              ...attributes({ padding: "10px", border: "2px solid navy" }),
              width ? { name: "width", value: width } : { name: "width", inherit: true },
            ],
          }),
        ],
        right: [],
      }),
    ]);
    const canvas = render(document);
    expect(style(canvas.querySelector(".image-case > a"), "width")).toBe(expected);
    expect(style(canvas.querySelector(".image-case > a"), "max-width")).toBe("100%");
    expect(canvas.querySelector(".image-case.pm-native-image-fluid")).toBeNull();
    const result = await compileEmail(document);
    expect(result.errors).toEqual([]);
    expect(parse(result.html).querySelector(".image-case img")?.getAttribute("width")).toBe(
      expected.replace("px", ""),
    );
  });

  it("subtracts the column's outer padding and both border boxes before clamping an image", async () => {
    const document = documentWith([
      block("Section", "section", {
        columns: [
          block("Column", "column", {
            mjmlAttributes: attributes({
              width: "300px",
              padding: "6px 12px",
              border: "2px solid navy",
              "inner-border": "3px solid navy",
            }),
            content: [
              block("Image", "image", {
                src: "https://example.com/image.png",
                cssClass: "image-case",
                mjmlAttributes: attributes({
                  width: "560px",
                  padding: "5px 10px",
                  border: "1px solid navy",
                }),
              }),
            ],
          }),
        ],
      }),
    ]);
    const canvas = render(document);
    // Column 300 - 24 padding - 4 outer borders - 6 inner borders = 266;
    // image 266 - 20 padding - 2 borders = 244px.
    expect(style(canvas.querySelector(".image-case > a"), "width")).toBe("244px");
    const result = await compileEmail(document);
    expect(result.errors).toEqual([]);
    expect(parse(result.html).querySelector(".image-case img")?.getAttribute("width")).toBe("244");
  });
});

describe("ordinary image desktop clamp", () => {
  it("matches exported image width without needing a native attribute", async () => {
    const image = block("Image", "ordinary-image", {
      src: "https://example.com/photo.png",
      width: 560,
      padding: "10px",
      alt: "Ordinary",
    });
    const doc = documentWith([block("Section2", "two-columns", { left: [image], right: [] })]);
    const canvas = render(doc);
    const result = await compileEmail(doc);
    const compiled = parse(result.html);
    const nativeWidth = compiled.querySelector('img[alt="Ordinary"]')!.getAttribute("width");
    expect(style(canvas.querySelector('img[alt="Ordinary"]')!.parentElement, "width")).toBe(
      `${nativeWidth}px`,
    );
    image.props.mjmlAttributes = attributes({ title: "Unrelated metadata" });
    const withNative = render(doc);
    expect(style(withNative.querySelector('img[alt="Ordinary"]')!.parentElement, "width")).toBe(
      `${nativeWidth}px`,
    );
  });
});
