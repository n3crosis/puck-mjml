import { readFileSync } from "node:fs";
import { Render, type Data } from "@puckeditor/core";
import { load } from "cheerio";
import { Window, type HTMLElement } from "happy-dom";
import { parse } from "postcss";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createEmailConfig } from "../config";
import { fromMjml } from "../import";
import { toMjml } from "../export";

beforeAll(() => vi.stubGlobal("window", globalThis));
afterAll(() => vi.unstubAllGlobals());

function declarations(style: string | undefined) {
  const result: Record<string, string> = {};
  parse(`element { ${style ?? ""} }`).walkDecls((declaration) => {
    result[declaration.prop] = declaration.value;
  });
  return result;
}

function nativeStyle(html: string, selector: string) {
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
  return window.document.querySelector<HTMLElement>(selector)!.style;
}

async function compile(name: string, roundTrip: boolean) {
  const source = readFileSync(new URL(`../../templates/${name}.mjml`, import.meta.url), "utf8");
  const imported = fromMjml(source);
  expect(imported.warnings).toEqual([]);
  const input = roundTrip ? toMjml(imported.document) : source;
  expect(input).not.toMatch(/<mj-(?:raw|include)\b/);
  const { default: mjml } = await import("mjml-browser");
  const result = await mjml(input, { validationLevel: "strict" });
  expect(result.errors).toEqual([]);
  const canvas = renderToStaticMarkup(
    <Render config={createEmailConfig()} data={imported.document as Data} />,
  );
  return { $: load(result.html), html: result.html, canvas, source };
}

// Source contracts complement the live Chromium geometry checks. These tests
// cover direct compilation and the safe editor import/export path separately.
describe.each([false, true])("reviewed light-template geometry, round trip: %s", (roundTrip) => {
  it("keeps 52px numbered slots without MJML's mobile group percentage shrink", async () => {
    const { $, source, canvas } = await compile("01-Barebone/product-update", roundTrip);
    expect(source).not.toMatch(/\bwidth="calc\(/);
    const slots = $(".bare-step-slot");
    expect(slots).toHaveLength(3);
    slots.each((_index, node) => {
      expect(declarations($(node).attr("style"))).toMatchObject({
        width: "52px",
        "flex-basis": "52px",
      });
      expect(declarations($(node).find("td").first().attr("style")).padding).toBe(
        "0px 12px 0px 0px",
      );
    });
    $(".bare-step-body").each((_index, node) => {
      expect(declarations($(node).attr("style"))).toMatchObject({
        width: "calc(100% - 52px)",
        "flex-basis": "calc(100% - 52px)",
      });
      expect(declarations($(node).find("td").first().attr("style")).padding).toBe(
        "0px 32px 0px 0px",
      );
    });
    $(".bare-step-number p").each((_index, node) => {
      expect(declarations($(node).attr("style"))).toMatchObject({
        width: "28px",
        margin: "0 auto",
      });
    });
    const editor = load(canvas);
    expect(editor(".bare-step-slot")).toHaveLength(3);
    expect(editor("style").text()).toMatch(/\.bare-step-slot\s*\{\s*width:\s*52px\s*!important/);
    expect(editor("style").text()).toContain("calc(100% - 52px)");
  });

  it("caps each feature description at 420px and restores the 16px title gap", async () => {
    const { $, canvas } = await compile("01-Barebone/feature-announcement", roundTrip);
    const descriptions = $(".bare-feature-description");
    expect(descriptions).toHaveLength(3);
    descriptions.each((_index, node) => {
      expect(declarations($(node).children("div").attr("style"))["max-width"]).toBe("420px");
      const titleCell = $(node).closest("tr").prev().find("td").first();
      expect(declarations(titleCell.attr("style")).padding).toBe("0px 0px 16px");
    });
    const editor = load(canvas);
    expect(editor(".bare-feature-description")).toHaveLength(3);
    expect(editor("style").text()).toMatch(
      /\.bare-feature-description\s*>\s*div\s*\{\s*max-width:\s*420px/,
    );
  });

  it("uses native left alignment and a shared 490px cap without replacing semantic canvas separators", async () => {
    const { $, html, canvas } = await compile("02-Matte/subscription-confirmation", roundTrip);
    const rules = $(".collage-confirm-rule p");
    expect(rules).toHaveLength(2);
    rules.each((_index, node) => {
      expect(declarations($(node).attr("style"))).toMatchObject({
        "max-width": "490px",
        width: "100%",
      });
    });
    const compiledStyle = nativeStyle(html, ".collage-confirm-rule p");
    expect(compiledStyle.marginLeft).toBe("0px");
    const editor = load(canvas);
    expect(editor(".collage-confirm-rule hr")).toHaveLength(2);
    const canvasStyle = nativeStyle(canvas, ".collage-confirm-rule hr");
    expect(canvasStyle.width).toBe("100%");
    expect(canvasStyle.marginLeft).toBe("0px");
    expect(editor("style").text()).toMatch(/\.collage-confirm-rule\s+hr\s*\{\s*max-width:\s*490px/);
    expect(declarations($(".collage-footer-copy > div").attr("style")).color).toBe("#5F7458");
  });
});
