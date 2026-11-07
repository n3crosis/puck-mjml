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
const render = (document: EmailDocument, allowRaw = false) =>
  parse(
    renderToStaticMarkup(
      <Render config={createEmailConfig(undefined, allowRaw)} data={document as Data} />,
    ),
  );
function style(element: { getAttribute(name: string): string | null } | null) {
  expect(element).not.toBeNull();
  return element!.getAttribute("style") ?? "";
}

describe("native MJML 5 gutters", () => {
  it("resolves fixed-column gutters from classes outside each column's own background and padding", async () => {
    const document = documentWith(
      [
        block("Section2", "section", {
          mjClass: "spaced",
          left: [copy("Left")],
          right: [copy("Right")],
          leftAttributes: values({ "background-color": "navy", padding: "8px" }),
        }),
      ],
      { mjmlClasses: [{ name: "spaced", attributes: values({ gutter: "20px" }) }] },
    );
    const canvas = render(document);
    const columns = canvas.querySelectorAll(".pm-native-column");
    expect(columns).toHaveLength(2);
    expect(style(columns[0])).toContain("width:48.333333%");
    expect(style(columns[0])).toContain("padding:0 1.666667% 0 0%");
    expect(style(columns[1])).toContain("padding:0 0% 0 1.666667%");
    expect(style(columns[0])).toContain("--pm-gutter-mobile-padding:0% 0 1.666667% 0");
    expect(style(columns[1])).toContain("--pm-gutter-mobile-padding:1.666667% 0 0% 0");
    expect(style(columns[0])).not.toContain("background-color");
    const inner = columns[0].querySelector(".pm-native-column-content");
    expect(style(inner)).toContain("background-color:navy");
    expect(style(inner)).toContain("padding:8px");
    expect(canvas.querySelector("style[data-pm-responsive]")?.textContent).toContain(
      ".pm-native-gutter-stacked) { padding: var(--pm-gutter-mobile-padding) !important; }",
    );
    const email = await compileEmail(document);
    expect(email.errors).toEqual([]);
    expect(email.html).toContain("mj-column-per-48-333333");
    expect(style(parse(email.html).querySelector(".mj-column-per-48-333333"))).toContain(
      "padding:0% 0% 1.666667% 0%",
    );
  });

  it.each([
    ["ltr", "21px", "290px", "289px", "0 11px 0 0px", "0 0px 0 10px"],
    ["rtl", "21px", "290px", "289px", "0 0px 0 11px", "0 10px 0 0px"],
    ["ltr", "21.5px", "290px", "289px", "0 11px 0 0px", "0 0px 0 10px"],
  ])(
    "matches rounded pixel widths and %s gutter edges for %s",
    async (direction, gutter, firstWidth, lastWidth, firstPadding, lastPadding) => {
      const document = documentWith([
        block("Section", "section", {
          mjmlAttributes: values({ gutter, direction }),
          columns: ["first", "last"].map((id) =>
            block("Column", id, {
              mjmlAttributes: values({ width: "300px", "css-class": id }),
              content: [copy(`${id}-copy`)],
            }),
          ),
        }),
      ]);
      const canvas = render(document);
      expect(style(canvas.querySelector(".first"))).toContain(`width:${firstWidth}`);
      expect(style(canvas.querySelector(".last"))).toContain(`width:${lastWidth}`);
      expect(style(canvas.querySelector(".first"))).toContain(`padding:${firstPadding}`);
      expect(style(canvas.querySelector(".last"))).toContain(`padding:${lastPadding}`);
      const email = await compileEmail(document);
      expect(email.errors).toEqual([]);
      const compiled = parse(email.html);
      expect(compiled.querySelector(".first.mj-column-px-290")).not.toBeNull();
      expect(compiled.querySelector(".last.mj-column-px-289")).not.toBeNull();
    },
  );

  it("keeps grouped gutters horizontal on mobile and recalculates them within the group width", async () => {
    const document = documentWith([
      block("Section", "section", {
        mjmlAttributes: values({ gutter: "20px" }),
        columns: [
          block("Group", "group", {
            width: 50,
            columns: ["a", "b"].map((id) =>
              block("Column", id, { width: 50, cssClass: id, content: [copy(`${id}-copy`)] }),
            ),
          }),
        ],
      }),
    ]);
    const canvas = render(document);
    expect(canvas.querySelectorAll(".pm-native-gutter-stacked")).toHaveLength(0);
    expect(style(canvas.querySelector(".a"))).toContain("padding:0 3.333333% 0 0%");
    const email = await compileEmail(document);
    expect(email.errors).toEqual([]);
    const compiled = parse(email.html);
    expect(compiled.querySelector(".a.mj-column-per-46-666667")).not.toBeNull();
    expect(style(compiled.querySelector(".a"))).toContain("padding:0% 3.333333% 0% 0%");
  });

  it("uses wrapper content width but resets a wrapper gutter at the nested section", async () => {
    const document = documentWith([
      block("Wrapper", "wrapper", {
        padding: "0px 50px",
        sections: [
          block("Section2", "section", {
            mjmlAttributes: values({ gutter: "20px" }),
            left: [copy("left")],
            right: [copy("right")],
          }),
        ],
      }),
    ]);
    expect(style(render(document).querySelector(".pm-native-column"))).toContain(
      "padding:0 2% 0 0%",
    );
    const email = await compileEmail(document);
    expect(email.errors).toEqual([]);
    expect(email.html).toContain("mj-column-per-48");
    document.root.props!.sections![0].props.mjmlAttributes = values({ gutter: "20px" });
    const section = (document.root.props!.sections![0].props.sections as EmailBlock[])[0];
    section.props.mjmlAttributes = [];
    expect(render(document).querySelectorAll(".pm-native-gutter")).toHaveLength(0);
    expect((await compileEmail(document)).html).not.toContain("mj-column-gutter-");
  });

  it("counts raw siblings for gutters and keeps native default widths based on non-raw columns", async () => {
    const document = documentWith([
      block("Section", "section", {
        mjmlAttributes: values({ gutter: "10%" }),
        columns: [
          block("Column", "first", {
            mjmlAttributes: [{ name: "width", inherit: true }],
            content: [copy("first-copy")],
          }),
          block("Raw", "raw", { html: "<!-- gap marker -->" }),
          block("Column", "last", {
            mjmlAttributes: [{ name: "width", inherit: true }],
            content: [copy("last-copy")],
          }),
        ],
      }),
    ]);
    const canvas = render(document, true);
    expect(style(canvas.querySelector(".pm-flex-column"))).toContain("width:43.333333%");
    const email = await compileEmail(document, { allowRawHtml: true });
    expect(email.errors).toEqual([]);
    expect(email.html).toContain("mj-column-per-43-333333");
  });
});

describe("native fractional gutter units and clamping", () => {
  it.each([
    ["21.5px", "50%", "48.25%", "1.75%"],
    ["5.5%", "50%", "47.25%", "2.75%"],
    ["0.9px", "50%", "50%", "0%"],
    ["0.9%", "50%", "49.55%", "0.45%"],
    ["5.5%", "300px", "284px", "17px"],
    ["800px", "50%", "0%", "66.666667%"],
    ["150%", "50%", "0%", "75%"],
  ])(
    "matches compiler %s gutter with %s columns",
    async (gutter, width, expectedWidth, paddingRight) => {
      const document = documentWith([
        block("Section", "section", {
          mjmlAttributes: values({ gutter, padding: "0px" }),
          columns: ["first", "last"].map((id) =>
            block("Column", id, {
              mjmlAttributes: values({ width, "css-class": id }),
              content: [copy(`${id}-copy`)],
            }),
          ),
        }),
      ]);
      const canvas = render(document);
      expect(style(canvas.querySelector(".first"))).toContain(`width:${expectedWidth}`);
      expect(style(canvas.querySelector(".first"))).toContain(
        `padding:0 ${paddingRight} 0 0${width.endsWith("%") ? "%" : "px"}`,
      );
      const result = await compileEmail(document);
      expect(result.errors).toEqual([]);
      const compiled = parse(result.html);
      const className = [...compiled.querySelector(".first")!.classList].find((name) =>
        /^mj-column-(px|per)-/.test(name),
      )!;
      expect(result.html).toContain(
        `.${className} { width:${expectedWidth} !important; max-width: ${expectedWidth}; }`,
      );
    },
  );

  it.each(["-1px", "-0.5%"])(
    "rejects negative gutter %s rather than emitting invalid widths",
    async (gutter) => {
      const document = documentWith([
        block("Section", "section", {
          mjmlAttributes: values({ gutter }),
          columns: [block("Column", "column", { content: [] })],
        }),
      ]);
      await expect(compileEmail(document)).rejects.toThrow(/gutter|invalid|value/i);
      // Invalid drafts remain on the normal editable fallback path.
      expect(render(document).querySelector(".pm-flex-column")).not.toBeNull();
    },
  );
});
