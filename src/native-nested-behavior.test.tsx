// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { afterEach, describe, expect, it } from "vitest";
import { NativeItems } from "./NativeItems";
import { createCanvasScope, getCanvasElement } from "./native-canvas-context";
import type { EmailSettings, MjmlAttribute } from "./types";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const entries = (values: Record<string, string>): MjmlAttribute[] =>
  Object.entries(values).map(([name, value]) => ({ name, value }));
const tags = { Navbar: "mj-navbar", Accordion: "mj-accordion" };
function view(
  name: keyof typeof tags,
  props: Record<string, unknown>,
  settings: EmailSettings = {},
) {
  const resolved = getCanvasElement(tags[name], props, createCanvasScope(settings));
  expect(resolved).toBeDefined();
  return <NativeItems name={name} props={props} {...resolved!} />;
}
async function compile(body: string, head = "") {
  const { default: mjml } = await import("mjml-browser");
  const result = await mjml(
    `<mjml><mj-head>${head}</mj-head><mj-body><mj-section><mj-column>${body}</mj-column></mj-section></mj-body></mjml>`,
    { validationLevel: "strict" },
  );
  expect(result.errors).toEqual([]);
  return load(result.html);
}

let root: Root | undefined;
let container: HTMLDivElement | undefined;
afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

describe("nested native overrides", () => {
  it.each([
    ["left", "bottom", "row-reverse", "flex-end"],
    ["right", "top", "row", "flex-start"],
  ])(
    "uses title class icons and child separators (%s, %s)",
    async (position, align, direction, alignSelf) => {
      const titleAttributes = {
        border: "4px dashed navy",
        "icon-position": position,
        "icon-align": align,
        "icon-width": "47px",
        "icon-height": "29px",
        "icon-wrapped-url": "https://example.com/open.png",
        "icon-unwrapped-url": "https://example.com/close.png",
        "icon-unwrapped-alt": "Close answer",
        "background-color": "#abcdef",
      };
      const props = {
        mjmlAttributes: entries({
          border: "2px solid red",
          "icon-position": position === "left" ? "right" : "left",
          "icon-align": "middle",
          "icon-width": "32px",
          "icon-height": "32px",
        }),
        items: [
          {
            title: <strong>Question</strong>,
            content: <p>Editable answer</p>,
            titleMjClass: "heading",
            textMjClass: "answer",
          },
        ],
      };
      const settings = {
        mjmlClasses: [
          { name: "heading", attributes: entries(titleAttributes) },
          { name: "answer", attributes: entries({ border: "5px dotted green" }) },
        ],
      };
      const $canvas = load(renderToStaticMarkup(view("Accordion", props, settings)));
      const attributes = Object.entries(titleAttributes)
        .map(([name, value]) => `${name}="${value}"`)
        .join(" ");
      const $email = await compile(
        `<mj-accordion border="2px solid red" icon-align="middle"><mj-accordion-element><mj-accordion-title mj-class="heading">Question</mj-accordion-title><mj-accordion-text mj-class="answer">Editable answer</mj-accordion-text></mj-accordion-element></mj-accordion>`,
        `<mj-attributes><mj-class name="heading" ${attributes}/><mj-class name="answer" border="5px dotted green"/></mj-attributes>`,
      );
      expect($canvas("summary").css("border-bottom")).toBe(
        $email(".mj-accordion-title > table").css("border-bottom"),
      );
      expect($canvas(".pm-accordion details > .pm-text").css("border-bottom")).toBe(
        $email(".mj-accordion-content > table").css("border-bottom"),
      );
      expect($canvas("summary").css("border-bottom")).toBe("4px dashed navy");
      expect($canvas(".pm-accordion details > .pm-text").css("border-bottom")).toBe(
        "5px dotted green",
      );
      expect($canvas("summary").css("flex-direction")).toBe(direction);
      expect($canvas("summary").css("align-items")).toBe("center");
      expect($canvas("summary > span").last().css("align-self")).toBe(alignSelf);
      expect($email(".mj-accordion-ico").css("vertical-align")).toBe(align);
      expect($email(".mj-accordion-title tr > td").first().hasClass("mj-accordion-ico")).toBe(
        position === "left",
      );
      expect($canvas("summary").css("background-color")).toBe("#abcdef");
      expect($email(".mj-accordion-ico").css("background")).toBe("#abcdef");
      for (const [canvasImage, emailImage] of [
        [$canvas("summary img"), $email(".mj-accordion-less")],
      ]) {
        expect(canvasImage.attr("src")).toBe(emailImage.attr("src"));
        expect(canvasImage.attr("alt")).toBe(emailImage.attr("alt"));
        expect(canvasImage.css("width")).toBe(emailImage.css("width"));
        expect(canvasImage.css("height")).toBe(emailImage.css("height"));
      }
      expect($canvas("summary strong").text()).toBe("Question");
      expect($canvas("details > .pm-text p").text()).toBe("Editable answer");
    },
  );

  it("uses both title-class icon states when an accordion is collapsed and reopened", () => {
    const props = {
      items: [{ title: "Question", content: "Answer", titleMjClass: "icons" }],
    };
    const settings = {
      mjmlClasses: [
        {
          name: "icons",
          attributes: entries({
            "icon-wrapped-url": "https://example.com/open.png",
            "icon-wrapped-alt": "Open answer",
            "icon-unwrapped-url": "https://example.com/close.png",
            "icon-unwrapped-alt": "Close answer",
          }),
        },
      ],
    };
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() => root!.render(view("Accordion", props, settings)));
    const details = container.querySelector("details")!;
    const icon = () => container!.querySelector("summary img")!;
    expect(icon().getAttribute("src")).toBe("https://example.com/close.png");
    act(() => {
      details.open = false;
      details.dispatchEvent(new Event("toggle"));
    });
    expect(icon().getAttribute("src")).toBe("https://example.com/open.png");
    expect(icon().getAttribute("alt")).toBe("Open answer");
    act(() => {
      details.open = true;
      details.dispatchEvent(new Event("toggle"));
    });
    expect(icon().getAttribute("src")).toBe("https://example.com/close.png");
    expect(icon().getAttribute("alt")).toBe("Close answer");
  });
});

describe("native navbar mode changes", () => {
  it("starts closed after hamburger navigation is disabled and re-enabled", async () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    const render = (hamburger: boolean) =>
      act(() =>
        root!.render(
          view("Navbar", {
            links: [{ label: "Home", href: "https://example.com" }],
            mjmlAttributes: entries({ hamburger: hamburger ? "hamburger" : "" }),
          }),
        ),
      );
    render(true);
    const trigger = () => container!.querySelector<HTMLButtonElement>(".pm-native-navbar-trigger")!;
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
    act(() => trigger().click());
    expect(trigger().getAttribute("aria-expanded")).toBe("true");
    render(false);
    expect(trigger()).toBeNull();
    render(true);
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelector("nav")?.getAttribute("data-native-navbar-open")).toBe("false");
    const $email = await compile(
      '<mj-navbar hamburger="hamburger"><mj-navbar-link href="https://example.com">Home</mj-navbar-link></mj-navbar>',
    );
    expect($email(".mj-menu-checkbox").attr("checked")).toBeUndefined();
    expect($email(".mj-menu-checkbox")).toHaveLength(1);
  });
});
