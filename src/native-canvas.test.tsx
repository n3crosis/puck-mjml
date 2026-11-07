import { Render, type Data } from "@puckeditor/core";
import { Window } from "happy-dom";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createEmailConfig } from "./config";
import { compileEmail } from "./export";
import type { EmailBlock, EmailDocument, EmailSettings, MjmlAttribute } from "./types";

beforeAll(() => vi.stubGlobal("window", globalThis));
afterAll(() => vi.unstubAllGlobals());

const values = (attributes: Record<string, string>): MjmlAttribute[] =>
  Object.entries(attributes).map(([name, value]) => ({ name, value }));
const inherit = (...names: string[]): MjmlAttribute[] =>
  names.map((name) => ({ name, inherit: true }));
const block = (type: string, id: string, props: EmailBlock["props"] = {}): EmailBlock => ({
  type,
  props: { id, ...props },
});
const doc = (sections: EmailBlock[], settings: EmailSettings = {}): EmailDocument => ({
  root: { props: { width: 600, fontFamily: "Arial, sans-serif", ...settings, sections } },
  content: [],
});
const single = (content: EmailBlock[], settings: EmailSettings = {}) =>
  doc([block("Section1", "section", { column: content })], settings);
const render = (document: EmailDocument, allowRawHtml = false) =>
  renderToStaticMarkup(
    <Render config={createEmailConfig(undefined, allowRawHtml)} data={document as Data} />,
  );

// Detached parsing only: no host DOM, script evaluation, image requests or stylesheets.
function parse(markup: string) {
  const window = new Window({
    settings: {
      enableJavaScriptEvaluation: false,
      disableJavaScriptFileLoading: true,
      disableCSSFileLoading: true,
      enableImageFileLoading: false,
      disableIframePageLoading: true,
    },
  });
  window.document.body.innerHTML = markup;
  return window.document;
}

function style(markup: string, selector: string, property: string) {
  const element = parse(markup).querySelector(selector);
  expect(element, selector).not.toBeNull();
  return element!
    .getAttribute("style")
    ?.split(";")
    .find((declaration) => declaration.trim().startsWith(`${property}:`))
    ?.split(":")
    .slice(1)
    .join(":")
    .trim();
}

describe("native canvas and compiled email parity", () => {
  it("renders advanced typography, percentage units, button borders, and padding", async () => {
    const document = single([
      block("Text", "text", {
        content: "<p>Advanced <strong>copy</strong></p>",
        cssClass: "advanced-copy",
        mjmlAttributes: values({
          color: "navy",
          "font-size": "96px",
          "line-height": "175%",
          "letter-spacing": "-0.125em",
          "font-style": "italic",
          "text-transform": "uppercase",
          padding: "3% 12px",
          "padding-left": "7px",
        }),
      }),
      block("Button", "button", {
        label: "Read more",
        href: "https://example.com/read",
        cssClass: "advanced-button",
        mjmlAttributes: values({
          width: "280px",
          border: "3px dashed navy",
          "inner-padding": "8px 17px",
          "border-radius": "16px",
          "font-size": "25px",
        }),
      }),
    ]);
    const canvas = render(document);
    const email = await compileEmail(document);
    expect(email.errors).toEqual([]);
    for (const [property, expected] of [
      ["color", "navy"],
      ["font-size", "96px"],
      ["line-height", "175%"],
      ["letter-spacing", "-0.125em"],
      ["font-style", "italic"],
      ["text-transform", "uppercase"],
    ]) {
      expect(style(canvas, ".advanced-copy", property)).toBe(expected);
      expect(style(email.html, ".advanced-copy div", property)).toBe(expected);
    }
    expect(style(canvas, ".advanced-copy", "padding")).toBe("3% 12px");
    expect(style(canvas, ".advanced-copy", "padding-left")).toBe("7px");
    expect(style(email.html, ".advanced-copy", "padding-left")).toBe("7px");
    expect(style(canvas, ".advanced-button .pm-button", "border")).toBe("3px dashed navy");
    expect(style(canvas, ".advanced-button .pm-button", "padding")).toBe("8px 17px");
    expect(style(canvas, ".advanced-button .pm-button", "width")).toBe("280px");
    expect(email.html.includes("3px dashed navy")).toBe(true);
    expect(email.html.includes("padding:8px 17px")).toBe(true);
  });

  it("carries body classes through wrappers and fixed columns, with nearest-class reset", async () => {
    const text = (id: string) =>
      block("Text", id, {
        content: `<p>${id}</p>`,
        cssClass: id,
        mjmlAttributes: inherit("color", "font-size"),
      });
    const document = doc(
      [
        block("Wrapper", "wrapper", {
          sections: [
            block("Section1", "inherited", { column: [text("inherited-copy")] }),
            block("Section1", "reset", { columnMjClass: "", column: [text("reset-copy")] }),
            block("Section1", "replaced", {
              columnMjClass: "replacement",
              column: [text("replaced-copy")],
            }),
          ],
        }),
      ],
      {
        bodyMjClass: "theme",
        bodyAttributes: values({ width: "760px", "background-color": "#eef0f2" }),
        mjmlClasses: [
          {
            name: "theme",
            attributes: [],
            components: [
              { tag: "mj-text", attributes: values({ color: "#123456", "font-size": "27px" }) },
            ],
          },
          {
            name: "replacement",
            attributes: [],
            components: [
              { tag: "mj-text", attributes: values({ color: "#654321", "font-size": "31px" }) },
            ],
          },
        ],
      },
    );
    const canvas = render(document);
    const email = await compileEmail(document);
    expect(email.errors).toEqual([]);
    expect(style(canvas, ".pm-email", "max-width")).toBe("760px");
    expect(email.html.includes("max-width:760px")).toBe(true);
    for (const [name, color, size] of [
      ["inherited-copy", "#123456", "27px"],
      ["reset-copy", "#000000", "13px"],
      ["replaced-copy", "#654321", "31px"],
    ]) {
      expect(style(canvas, `.${name}`, "color")).toBe(color);
      expect(style(canvas, `.${name}`, "font-size")).toBe(size);
      expect(style(email.html, `.${name} div`, "color")).toBe(color);
      expect(style(email.html, `.${name} div`, "font-size")).toBe(size);
    }
    expect(style(canvas, ".pm-native-columns", "display")).toBe("block");
  });

  it("uses native group and flexible-column widths and inner boxes", async () => {
    const document = doc([
      block("Section", "section", {
        mjmlAttributes: values({ direction: "rtl" }),
        columns: [
          block("Group", "group", {
            cssClass: "native-group",
            mjmlAttributes: values({ width: "72%" }),
            columns: [
              block("Column", "column", {
                cssClass: "native-column",
                mjmlAttributes: values({
                  width: "37%",
                  padding: "4px",
                  "inner-background-color": "#abcdef",
                  "inner-border": "2px dotted navy",
                  "vertical-align": "bottom",
                }),
                content: [block("Text", "copy", { content: "<p>Grouped</p>" })],
              }),
            ],
          }),
        ],
      }),
    ]);
    const canvas = render(document);
    const email = await compileEmail(document);
    expect(email.errors).toEqual([]);
    expect(style(canvas, ".native-group", "width")).toBe("72%");
    expect(style(canvas, ".native-column", "width")).toBe("37%");
    expect(style(canvas, ".native-column", "vertical-align")).toBe("bottom");
    expect(style(canvas, ".native-column > div", "background-color")).toBe("#abcdef");
    expect(style(canvas, ".native-column > div", "border")).toBe("2px dotted navy");
    expect(email.mjml).toContain('<mj-group width="72%" css-class="native-group">');
    expect(email.html.includes("mj-column-per-37")).toBe(true);
    expect(email.html.includes("2px dotted navy")).toBe(true);
  });

  it("preserves rich table cells while native attributes control the surrounding table", async () => {
    const document = single([
      block("Table", "table", {
        caption: "Revenue",
        cssClass: "native-table",
        mjmlAttributes: values({
          "font-size": "24px",
          "line-height": "160%",
          width: "85%",
          cellpadding: "9",
          cellspacing: "3",
          "table-layout": "fixed",
          border: "2px solid navy",
          "padding-left": "7px",
        }),
        headerRows: [{ cells: [{ content: "<p>Team</p>", colSpan: 2 }] }],
        bodyRows: [
          {
            cells: [
              {
                content:
                  '<p><strong>North</strong> <a href="https://example.com/report">report</a></p>',
                rowSpan: 0,
              },
              { content: "<p>42</p>" },
            ],
          },
        ],
      }),
    ]);
    const canvas = render(document);
    const email = await compileEmail(document);
    expect(email.errors).toEqual([]);
    expect(style(canvas, ".native-table .pm-table", "font-size")).toBe("24px");
    expect(style(canvas, ".native-table .pm-table", "width")).toBe("85%");
    expect(style(canvas, ".native-table .pm-table", "border-spacing")).toBe("3px");
    expect(style(canvas, ".native-table", "padding-left")).toBe("7px");
    for (const markup of [canvas, email.html]) {
      expect(markup.includes("<strong>North</strong>")).toBe(true);
      expect(markup.includes('href="https://example.com/report"')).toBe(true);
      const parsed = parse(markup);
      expect(parsed.querySelector('[colspan="2"]')).not.toBeNull();
      expect(parsed.querySelector('[rowspan="0"]')).not.toBeNull();
      expect(parsed.querySelector('[cellpadding="9"]')).not.toBeNull();
    }
  });

  it("uses concrete fallbacks for trusted templates without emitting unresolved resource URLs", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    try {
      const document = single(
        [
          block("Image", "image", {
            src: "https://example.com/fallback.png",
            alt: "Fallback image",
            mjmlAttributes: [
              { name: "src", value: "{{ image_url }}", template: true },
              { name: "href", value: "{{ destination_url }}", template: true },
            ],
          }),
          block("Text", "text", {
            content: "<p>Concrete content</p>",
            fontSize: 22,
            mjmlAttributes: [{ name: "font-size", value: "{{ copy_size }}", template: true }],
          }),
        ],
        {
          bodyAttributes: values({ width: "720px" }),
          attributeDefaults: [{ name: "font-family", value: "{{ theme_font }}", template: true }],
        },
      );
      const canvas = render(document, true);
      expect(canvas.includes("{{")).toBe(false);
      expect(parse(canvas).querySelector(".pm-image img")?.getAttribute("src")).toBe(
        "https://example.com/fallback.png",
      );
      expect(style(canvas, ".pm-text", "font-size")).toBe("22px");
      expect(style(canvas, ".pm-email", "max-width")).toBe("720px");
      expect(fetch).not.toHaveBeenCalled();
      const email = await compileEmail(document, { allowRawHtml: true });
      expect(email.mjml).toContain('src="{{ image_url }}"');
      expect(email.mjml).toContain('font-size="{{ copy_size }}"');
    } finally {
      fetch.mockRestore();
    }
  });

  it("keeps malformed sidebar drafts editable and preserves the legacy rendering path", () => {
    const legacy = single([
      block("Text", "legacy", { content: "<p>Legacy content</p>", fontSize: 21, color: "#123456" }),
    ]);
    const legacyMarkup = render(legacy);
    expect(parse(legacyMarkup).querySelector(".pm-native-columns")).toBeNull();
    expect(style(legacyMarkup, ".pm-text", "font-size")).toBe("21px");
    const draft = single(
      [
        block("Text", "draft", {
          content: "<p>Draft content</p>",
          fontSize: 21,
          mjmlAttributes: [{ name: "font-size", value: "unfinished" }],
        }),
      ],
      { componentDefaults: [{ tag: "mj-unknown", attributes: [] }] },
    );
    expect(() => render(draft)).not.toThrow();
    expect(style(render(draft), ".pm-text", "font-size")).toBe("21px");
    const trusted = single([
      block("Text", "trusted", {
        htmlContent: '<img src="https://example.com/trusted.png"><script>sideEffect()</script>',
        mjmlAttributes: values({ color: "navy" }),
      }),
    ]);
    const placeholder = render(trusted, true);
    expect(parse(placeholder).querySelector("script, img")).toBeNull();
    expect(placeholder.includes("Trusted HTML")).toBe(true);
  });

  it("leaves host globals and document data unchanged and applies document CSS only in scoped form", async () => {
    const document = single(
      [
        block("Text", "text", {
          content: "<p>Scoped canvas</p>",
          mjmlAttributes: values({ color: "navy" }),
        }),
      ],
      {
        headStyles: [
          { css: "body { background: pink; } .host-chrome { display: none; }", inline: "head" },
        ],
      },
    );
    const saved = structuredClone(document);
    const hostDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
    const hostWindow = globalThis.window;
    const canvas = render(document);
    const email = await compileEmail(document);
    expect(email.errors).toEqual([]);
    expect(document).toEqual(saved);
    expect(Object.getOwnPropertyDescriptor(globalThis, "document")).toEqual(hostDocument);
    expect(globalThis.window).toBe(hostWindow);
    const scope = parse(canvas)
      .querySelector(".pm-canvas")!
      .getAttribute("class")!
      .split(" ")
      .find((name) => name.startsWith("pm-canvas-"))!;
    const canvasCss = parse(canvas).querySelector(
      `style[data-pm-canvas-css="${scope}"]`,
    )!.textContent!;
    expect(canvasCss).toContain(`.${scope}:is(body, *) { background: pink; }`);
    expect(canvasCss).toContain(`.${scope} .host-chrome { display: none; }`);
    // An unscoped rule would reach the host page's own .host-chrome element.
    expect(canvasCss.replaceAll(`.${scope} .host-chrome`, "")).not.toContain(".host-chrome");
    expect(email.html.includes(".host-chrome")).toBe(true);
  });
});
