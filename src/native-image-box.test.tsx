import { readFileSync } from "node:fs";
import { Render, type Data } from "@puckeditor/core";
import { Window } from "happy-dom";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createEmailConfig } from "./config";
import { compileEmail, toMjml } from "./export";
import { fromMjml } from "./import";

beforeAll(() => vi.stubGlobal("window", globalThis));
afterAll(() => vi.unstubAllGlobals());

const stylesheet = readFileSync(new URL("./style.css", import.meta.url), "utf8");

function parse(html: string, canvas = false) {
  const window = new Window({
    settings: {
      enableJavaScriptEvaluation: false,
      disableCSSFileLoading: true,
      disableJavaScriptFileLoading: true,
      enableImageFileLoading: false,
      disableIframePageLoading: true,
    },
  });
  if (canvas) {
    const style = window.document.createElement("style");
    // Puck copies host styles into its iframe. The demo and many hosts reset
    // all elements, unlike a compiled email's document.
    style.textContent = `${stylesheet}\n* { box-sizing: border-box; }`;
    window.document.head.append(style);
  }
  window.document.body.innerHTML = html;
  return window.document;
}

describe("native image border boxes", () => {
  it.each([
    { border: "none", sides: "", linked: false },
    { border: "1px solid #123456", sides: "", linked: false },
    { border: "1px solid #123456", sides: "", linked: true },
    { border: "2px solid #123456", sides: 'border-right="3px solid red"', linked: true },
  ])(
    "retains content-box dimensions with $border (linked=$linked)",
    async ({ border, sides, linked }) => {
      const { document, warnings } = fromMjml(
        `<mjml><mj-body><mj-section padding="0px"><mj-column padding="0px"><mj-image css-class="image-probe" src="https://example.com/image.png" width="64px" height="64px" padding="0px" border="${border}" ${sides} ${linked ? 'href="https://example.com/image"' : ""} /></mj-column></mj-section></mj-body></mjml>`,
      );
      expect(warnings).toEqual([]);
      const before = toMjml(document);
      const canvas = parse(
        renderToStaticMarkup(<Render config={createEmailConfig()} data={document as Data} />),
        true,
      );
      const result = await compileEmail(document);
      expect(result.errors).toEqual([]);
      const compiled = parse(result.html);
      const image = canvas.querySelector(".image-probe img")!;
      const reference = compiled.querySelector(".image-probe img")!;
      const actual = canvas.defaultView!.getComputedStyle(image);
      const expected = compiled.defaultView!.getComputedStyle(reference);
      expect(actual.boxSizing).toBe("content-box");
      expect(actual.height).toBe(expected.height);
      for (const edge of ["Top", "Right", "Bottom", "Left"] as const) {
        expect(actual[`border${edge}Width`]).toBe(expected[`border${edge}Width`]);
        expect(actual[`border${edge}Style`]).toBe(expected[`border${edge}Style`]);
      }
      expect(reference.getAttribute("width")).toBe("64");
      expect(image.parentElement!.getAttribute("style")).toContain("width:64px");
      expect(toMjml(document)).toBe(before);
    },
  );

  it("allows authored box sizing to override the canvas default", async () => {
    const { document } = fromMjml(
      '<mjml><mj-head><mj-style inline="inline">img { box-sizing: border-box; }</mj-style></mj-head><mj-body><mj-section><mj-column><mj-image css-class="image-probe" src="https://example.com/image.png" width="64px" height="64px" border="1px solid red" /></mj-column></mj-section></mj-body></mjml>',
    );
    const canvas = parse(
      renderToStaticMarkup(<Render config={createEmailConfig()} data={document as Data} />),
      true,
    );
    const compiled = parse((await compileEmail(document)).html);
    for (const dom of [canvas, compiled]) {
      expect(
        dom.defaultView!.getComputedStyle(dom.querySelector(".image-probe img")!).boxSizing,
      ).toBe("border-box");
    }
  });
});
