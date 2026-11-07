import { Render, type Data } from "@puckeditor/core";
import { Window, type HTMLElement } from "happy-dom";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createEmailConfig } from "./config";
import { compileEmail } from "./export";
import { fromMjml } from "./import";

beforeAll(() => vi.stubGlobal("window", globalThis));
afterAll(() => vi.unstubAllGlobals());

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

async function render(source: string) {
  const { document, warnings } = fromMjml(source);
  expect(warnings).toEqual([]);
  const canvas = parse(
    renderToStaticMarkup(<Render config={createEmailConfig()} data={document as Data} />),
  );
  const result = await compileEmail(document);
  expect(result.errors).toEqual([]);
  return { canvas, compiled: parse(result.html) };
}

describe("native column inner-box rendering", () => {
  it.each([
    { name: "no padding", local: "", head: "", enabled: false },
    { name: "explicit zero", local: 'padding="0px"', head: "", enabled: true },
    { name: "one zero edge", local: 'padding-left="0px"', head: "", enabled: true },
    {
      name: "component-default zero",
      local: "",
      head: '<mj-attributes><mj-column padding="0px" /></mj-attributes>',
      enabled: true,
    },
    {
      name: "class zero",
      local: 'mj-class="padded"',
      head: '<mj-attributes><mj-class name="padded" padding="0px" /></mj-attributes>',
      enabled: true,
    },
    {
      name: "ancestor class edge",
      local: "",
      head: '<mj-attributes><mj-class name="ancestor"><mj-column padding-top="0px" /></mj-class></mj-attributes>',
      enabled: true,
      section: 'mj-class="ancestor"',
    },
  ])("matches the compiler with $name", async ({ local, head, enabled, section = "" }) => {
    const { canvas, compiled } = await render(
      `<mjml><mj-head>${head}</mj-head><mj-body><mj-section ${section}><mj-column css-class="column-case" background-color="red" inner-background-color="blue" inner-border="5px solid green" inner-border-radius="9px" ${local}><mj-text>Hello</mj-text></mj-column></mj-section></mj-body></mjml>`,
    );
    const outer = canvas.querySelector<HTMLElement>(".column-case")!;
    const inner = canvas.querySelector<HTMLElement>(".column-case > div")!;
    expect(outer.style.backgroundColor).toBe("red");
    expect(inner.style.backgroundColor).toBe(enabled ? "blue" : "");
    expect(inner.style.border).toBe(enabled ? "5px solid green" : "");
    expect(inner.style.borderRadius).toBe(enabled ? "9px" : "");
    const compiledStyles = Array.from(compiled.querySelectorAll(".column-case [style]"))
      .map((element) => element.getAttribute("style"))
      .join(";");
    expect(compiledStyles).toContain("background-color:red");
    for (const declaration of [
      "background-color:blue",
      "border:5px solid green",
      "border-radius:9px",
    ])
      expect(compiledStyles.includes(declaration), declaration).toBe(enabled);
  });

  it("does not enable the inner box merely because the section has a gutter", async () => {
    const { canvas, compiled } = await render(
      '<mjml><mj-body><mj-section gutter="20px"><mj-column css-class="column-case" inner-background-color="blue" inner-border="5px solid green"><mj-text>Hello</mj-text></mj-column><mj-column><mj-text>Next</mj-text></mj-column></mj-section></mj-body></mjml>',
    );
    expect(canvas.querySelector(".column-case.pm-native-gutter")).not.toBeNull();
    for (const document of [canvas, compiled]) {
      const markup = document.querySelector(".column-case")!.outerHTML;
      expect(markup).not.toContain("background-color:blue");
      expect(markup).not.toContain("border:5px solid green");
    }
  });
});

describe("native divider spacing", () => {
  it.each([
    ["left", "0px", "auto"],
    ["center", "auto", "auto"],
    ["right", "auto", "0px"],
  ])("removes vertical margins without changing %s alignment", async (align, left, right) => {
    const { canvas, compiled } = await render(
      `<mjml><mj-body><mj-section><mj-column><mj-divider css-class="divider-case" align="${align}" width="50%" padding="8px 12px" /></mj-column></mj-section></mj-body></mjml>`,
    );
    const canvasLine = canvas.querySelector<HTMLElement>(".divider-case > hr")!;
    const compiledLine = compiled.querySelector<HTMLElement>(".divider-case > p")!;
    expect(canvasLine.style.marginTop).toBe("0px");
    expect(canvasLine.style.marginBottom).toBe("0px");
    expect(compiledLine.style.marginTop).toBe("0px");
    expect(compiledLine.style.marginBottom).toBe("0px");
    expect(canvasLine.style.marginLeft).toBe(left);
    expect(canvasLine.style.marginRight).toBe(right);
    expect(canvasLine.style.width).toBe(compiledLine.style.width);
    expect(canvas.querySelector<HTMLElement>(".divider-case")!.style.padding).toBe(
      compiled.querySelector<HTMLElement>(".divider-case")!.style.padding,
    );
  });
});
