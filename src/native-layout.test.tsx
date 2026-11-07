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
const copy = (id: string) => block("Text", id, { content: `<p>${id}</p>` });
const documentWith = (sections: EmailBlock[], settings: EmailSettings = {}): EmailDocument => ({
  root: { props: { width: 700, ...settings, sections } },
  content: [],
});
const render = (document: EmailDocument) =>
  renderToStaticMarkup(<Render config={createEmailConfig()} data={document as Data} />);
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
function styles(element: { getAttribute: (name: string) => string | null } | null) {
  expect(element).not.toBeNull();
  return element!.getAttribute("style") ?? "";
}

describe("native full-width layout", () => {
  it("extends a top-level section background while constraining its padding, borders, and content", async () => {
    const document = documentWith([
      block("Section1", "section", {
        column: [copy("Full-width copy")],
        mjmlAttributes: values({
          "full-width": "full-width",
          "css-class": "wide-section",
          "background-color": "#123456",
          "background-url": "https://example.com/background.png",
          "background-size": "cover",
          padding: "12px 24px",
          border: "2px solid navy",
        }),
      }),
    ]);
    const canvas = parse(render(document));
    const email = await compileEmail(document);
    expect(email.errors).toEqual([]);
    const outer = canvas.querySelector<
      ReturnType<typeof canvas.body.cloneNode> & typeof canvas.body
    >(".wide-section")!;
    expect(styles(outer)).toContain("width:100cqw");
    expect(styles(outer)).toContain("margin-inline:calc((100% - 100cqw) / 2)");
    expect(styles(outer)).toContain("background-color:#123456");
    expect(styles(outer)).toContain("background.png");
    expect(styles(outer)).not.toContain("padding:");
    expect(styles(outer)).not.toContain("border:");
    const inner = outer.querySelector(".pm-native-layout-content")!;
    expect(styles(inner)).toContain("max-width:var(--pm-email-width, 100%)");
    expect(styles(inner)).toContain("box-sizing:border-box");
    expect(styles(inner)).toContain("padding:12px 24px");
    expect(styles(inner)).toContain("border:2px solid navy");
    expect(inner.textContent).toContain("Full-width copy");
    expect(styles(canvas.querySelector(".pm-canvas"))).toContain("container-type:inline-size");
    expect(render(document)).toContain("--pm-email-width:700px");

    const compiled = parse(email.html);
    const nativeOuter = compiled.querySelector("table.wide-section")!;
    expect(styles(nativeOuter)).toContain("width:100%");
    // The compiler emits the background shorthand once a background-url is set.
    expect(styles(nativeOuter)).toContain("background:#123456");
    expect(styles(nativeOuter.querySelector("div"))).toContain("max-width:700px");
    expect(email.html.includes("padding:12px 24px")).toBe(true);
  });

  it("keeps full-width sections inside a full-width wrapper's constrained content box", async () => {
    const document = documentWith([
      block("Wrapper", "wrapper", {
        mjmlAttributes: values({
          "full-width": "full-width",
          "css-class": "wide-wrapper",
          padding: "10px 20px",
          border: "2px solid #111111",
          "background-color": "#abcdef",
        }),
        sections: [
          block("Section1", "nested", {
            mjmlAttributes: values({
              "full-width": "full-width",
              "css-class": "nested-full",
              "background-color": "#fedcba",
            }),
            column: [copy("Nested copy")],
          }),
        ],
      }),
    ]);
    const canvas = parse(render(document));
    const outer = canvas.querySelector(".wide-wrapper")!;
    const inner = outer.querySelector(".nested-full")!;
    expect(styles(outer)).toContain("width:100cqw");
    expect(styles(inner)).toContain("width:100%");
    expect(styles(inner)).not.toContain("100cqw");
    expect(styles(inner.querySelector(".pm-native-layout-content"))).toContain("max-width:100%");
    const email = await compileEmail(document);
    expect(email.errors).toEqual([]);
    const compiled = parse(email.html);
    expect(styles(compiled.querySelector(".wide-wrapper > tbody > tr > td > div"))).toContain(
      "max-width:700px",
    );
    expect(styles(compiled.querySelector(".nested-full > tbody > tr > td > div"))).toContain(
      "max-width:656px",
    );
  });

  it("keeps nested full-width sections constrained even when their wrapper uses the legacy renderer", async () => {
    const document = documentWith([
      block("Wrapper", "legacy-wrapper", {
        padding: "10px 30px",
        sections: [
          block("Section1", "nested", {
            mjmlAttributes: values({ "full-width": "full-width", "css-class": "nested-full" }),
            column: [copy("Legacy wrapper content")],
          }),
        ],
      }),
    ]);
    const canvas = parse(render(document));
    expect(canvas.querySelector(".pm-wrapper.pm-native-full-width")).toBeNull();
    expect(styles(canvas.querySelector(".nested-full"))).toContain("width:100%");
    expect(styles(canvas.querySelector(".nested-full"))).not.toContain("100cqw");
    const email = await compileEmail(document);
    expect(email.errors).toEqual([]);
    const compiled = parse(email.html);
    expect(styles(compiled.querySelector(".nested-full > tbody > tr > td > div"))).toContain(
      "max-width:640px",
    );
  });

  it("resolves full-width from classes while explicit false keeps the regular section layout", async () => {
    const document = documentWith(
      [
        block("Section1", "inherited", {
          mjClass: "wide",
          cssClass: "inherited-full",
          column: [copy("Inherited")],
        }),
        block("Section1", "disabled", {
          mjClass: "wide",
          cssClass: "disabled-full",
          mjmlAttributes: values({ "full-width": "false" }),
          column: [copy("Disabled")],
        }),
      ],
      { mjmlClasses: [{ name: "wide", attributes: values({ "full-width": "full-width" }) }] },
    );
    const canvas = parse(render(document));
    expect(canvas.querySelector(".inherited-full.pm-native-full-width")).not.toBeNull();
    expect(canvas.querySelector(".disabled-full.pm-native-full-width")).toBeNull();
    const email = await compileEmail(document);
    expect(email.errors).toEqual([]);
    const compiled = parse(email.html);
    expect(compiled.querySelector("table.inherited-full")).not.toBeNull();
    expect(compiled.querySelector("div.disabled-full")).not.toBeNull();
  });
});

describe("native responsive images", () => {
  it("keeps desktop widths bounded and expands only fluid-on-mobile images at the native breakpoint", async () => {
    const image = (id: string, fluid: string) =>
      block("Image", id, {
        src: `https://example.com/${id}.png`,
        mjmlAttributes: values({
          "css-class": id,
          width: "150px",
          "fluid-on-mobile": fluid,
          height: "80px",
          "max-height": "70%",
        }),
      });
    const document = documentWith(
      [
        block("Section1", "section", {
          column: [
            image("fluid-image", "true"),
            image("fixed-image", "false"),
            block("Image", "fill-image", {
              src: "https://example.com/fill.png",
              mjmlAttributes: [
                { name: "width", inherit: true },
                { name: "css-class", value: "fill-image" },
              ],
            }),
          ],
        }),
      ],
      { breakpointWidth: "600px" },
    );
    const canvas = parse(render(document));
    for (const name of ["fluid-image", "fixed-image"]) {
      const wrapper = canvas.querySelector(`.${name}`)!;
      expect(styles(wrapper.querySelector("a"))).toContain("width:150px");
      expect(styles(wrapper.querySelector("a"))).toContain("max-width:100%");
      const img = wrapper.querySelector("img")!;
      expect(styles(img)).toContain("width:100%");
      expect(styles(img)).toContain("display:block");
      expect(styles(img)).toContain("height:80px");
      expect(styles(img)).toContain("max-height:70%");
    }
    expect(canvas.querySelector(".fluid-image.pm-native-image-fluid")).not.toBeNull();
    expect(canvas.querySelector(".fixed-image.pm-native-image-fluid")).toBeNull();
    expect(styles(canvas.querySelector(".fill-image > a"))).toMatch(/(?:^|;)width:680px(?:;|$)/);
    const responsive = canvas.querySelector("style[data-pm-responsive]")!.textContent;
    expect(responsive).toContain("@media (width < 600px)");
    expect(responsive).toMatch(/\.pm-native-image-fluid\s*>\s*a\s*\{\s*width:\s*100%\s*!important/);

    const email = await compileEmail(document);
    expect(email.errors).toEqual([]);
    const compiled = parse(email.html);
    expect(compiled.querySelector(".fluid-image table.mj-full-width-mobile")).not.toBeNull();
    expect(compiled.querySelector(".fixed-image table.mj-full-width-mobile")).toBeNull();
    expect(compiled.querySelector(".fixed-image img")?.getAttribute("width")).toBe("150");
    expect(compiled.querySelector(".fill-image img")?.getAttribute("width")).toBe("680");
    expect(email.html).toContain("max-width:599px");
  });
});
