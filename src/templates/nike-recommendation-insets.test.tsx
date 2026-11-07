import { readFileSync } from "node:fs";
import { Render, type Data } from "@puckeditor/core";
import { load } from "cheerio";
import { Window } from "happy-dom";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createEmailConfig } from "../config";
import { fromMjml } from "../import";
import { toMjml } from "../export";
import type { EmailBlock } from "../types";

const source = readFileSync("templates/Community/receipts/nike-receipt.mjml", "utf8");
const original = load(
  readFileSync("tests/fixtures/react-email-reference/Community/receipts/nike-receipt.html", "utf8"),
);
const attributes = load(source, { xml: true });
const sourceImages = original('img[src*="/nike-recomendation-"]');
const paddings = ["0px 2px 24px 4px", "0px 2px 24px", "0px 2px 24px", "0px 4px 24px 2px"];
const style = (value: string | undefined) =>
  Object.fromEntries(
    (value ?? "").split(";").flatMap((part) => {
      const split = part.indexOf(":");
      return split < 0 ? [] : [[part.slice(0, split).trim(), part.slice(split + 1).trim()]];
    }),
  );
const blocks = (value: unknown): EmailBlock[] => {
  if (!value || typeof value !== "object") return [];
  const entry = value as Record<string, unknown>;
  return [
    ...(typeof entry.type === "string" && entry.props ? [entry as unknown as EmailBlock] : []),
    ...Object.values(entry).flatMap(blocks),
  ];
};
beforeAll(() => vi.stubGlobal("window", globalThis));
afterAll(() => vi.unstubAllGlobals());

it("derives recommendation insets from the immutable source, not measured card widths", () => {
  expect(sourceImages).toHaveLength(4);
  const table = sourceImages.first().closest("table");
  expect(style(table.attr("style"))["padding-left"]).toBeUndefined();
  const cards = attributes('mj-column[css-class="nike-recommendation-card"]');
  cards.each((index, card) => {
    const cell = sourceImages.eq(index).parent("td");
    const expected = style(cell.attr("style"));
    expect(expected["padding-left"]).toBe(index === 0 ? "4px" : "2px");
    expect(expected["padding-right"]).toBe(index === 3 ? "4px" : "2px");
    expect(expected.width).toBeUndefined();
    expect(sourceImages.eq(index).attr("width")).toBe("100%");
    expect(attributes(card).attr("width")).toBe("50%");
    expect(attributes(card).attr("padding")).toBe(paddings[index]);
    expect(attributes(card).find("mj-image").attr("width")).toBeUndefined();
    cell.children("p").each((_, paragraph) => {
      expect(style(original(paragraph).attr("style"))["padding-left"]).toBe("10px");
      expect(style(original(paragraph).attr("style"))["padding-right"]).toBe("10px");
    });
  });
  expect(attributes('mj-section[css-class="nike-recommendations"]').attr("padding")).toBe(
    "20px 0px 0px",
  );
  // The source auto-layout gives the second cell more room. Native equal pairs
  // intentionally do not encode widths measured from a particular viewport.
  expect(source).toContain("approximation of the source auto-layout cell widths");
});

describe.each([false, true])("Nike native inset contract, editor roundtrip: %s", (roundTrip) => {
  it("stacks only the tracking row before its source-width button outgrows a half-column", async () => {
    const input = roundTrip ? toMjml(fromMjml(source).document) : source;
    const document = fromMjml(input).document;
    const { default: mjml } = await import("mjml-browser");
    const compiled = await mjml(input, { validationLevel: "strict" });
    expect(compiled.errors).toEqual([]);
    const native = renderToStaticMarkup(
      <Render config={createEmailConfig()} data={document as Data} />,
    );
    for (const width of [390, 479, 480, 537, 538, 800]) {
      for (const [kind, html] of [
        ["native", native],
        ["compiled", compiled.html],
      ] as const) {
        const window = new Window({
          settings: { disableCSSFileLoading: true, enableImageFileLoading: false },
        });
        window.happyDOM.setWindowSize({ width, height: 900 });
        window.document.write(html);
        const columns = window.document.querySelectorAll(".nike-tracking-column");
        expect(columns, `${kind}/${width}`).toHaveLength(2);
        for (const column of columns)
          expect(window.getComputedStyle(column).width, `${kind}/${width}`).toBe(
            width < 538 ? "100%" : "50%",
          );
        const button =
          kind === "native"
            ? columns[1].querySelector(".pm-button")!
            : columns[1].querySelector('td[role="presentation"]')!.closest("table")!;
        expect(window.getComputedStyle(button).width, `${kind}/${width}`).toBe("220px");
        // Happy DOM does not evaluate the native renderer's media-query range
        // syntax. Playwright below measures native pairs at the real boundary.
        if (kind === "compiled") {
          const pair = window.document.querySelector(".nike-recommendation-pair")!;
          expect(window.getComputedStyle(pair).width, `${kind}/${width}`).toBe(
            width < 480 ? "100%" : "50%",
          );
        }
        await window.happyDOM.close();
      }
    }
  });
  it("keeps every image/text editable and compiler/native padding and image sizing equal", async () => {
    const imported = fromMjml(source);
    expect(imported.warnings).toEqual([]);
    const input = roundTrip ? toMjml(imported.document) : source;
    const reimported = fromMjml(input);
    expect(reimported.warnings).toEqual([]);
    expect(
      blocks(reimported.document).every(
        (block) => block.type !== "Raw" && block.props.htmlContent === undefined,
      ),
    ).toBe(true);
    const { default: mjml } = await import("mjml-browser");
    const compiled = await mjml(input, { validationLevel: "strict" });
    expect(compiled.errors).toEqual([]);
    const $ = load(compiled.html);
    const native = load(
      renderToStaticMarkup(
        <Render config={createEmailConfig()} data={reimported.document as Data} />,
      ),
    );
    const images = $(".nike-recommendation-card img");
    const nativeImages = native(".nike-recommendation-card img");
    expect(images).toHaveLength(4);
    expect(nativeImages).toHaveLength(4);
    expect($(".nike-recommendation-text")).toHaveLength(8);
    expect(native(".nike-recommendation-text")).toHaveLength(8);
    expect(native(".nike-recommendation-pair")).toHaveLength(2);
    expect(style($(".nike-recommendations > table > tbody > tr > td").attr("style")).padding).toBe(
      "20px 0px 0px",
    );
    expect(native(".nike-recommendations").attr("data-pm-mjml-padding")).toBe("self");
    expect(style(native(".nike-recommendations").attr("style")).padding).toBe("20px 0px 0px");
    images.each((index, image) => {
      const padding = paddings[index];
      const column = native(".nike-recommendation-card").eq(index);
      expect(column.attr("data-pm-mjml-padding")).toBe("self");
      expect(style(column.attr("style")).padding).toBe(padding);
      expect(
        style($(".nike-recommendation-card > table > tbody > tr > td").eq(index).attr("style"))
          .padding,
      ).toBe(padding);
      const [left, right] = [index === 0 ? 4 : 2, index === 3 ? 4 : 2];
      const expectedWidth = Math.floor(598 / 4 - left - right);
      expect($(image).attr("width")).toBe(String(expectedWidth));
      expect(style(column.find("[data-pm-mjml-image-width]").attr("style")).width).toBe(
        `${expectedWidth}px`,
      );
      expect($(image).attr("src")).toBe(sourceImages.eq(index).attr("src"));
      expect(nativeImages.eq(index).attr("src")).toBe($(image).attr("src"));
      expect(column.find(".pm-native-image-fluid")).toHaveLength(1);
      for (let label = 0; label < 2; label++) {
        const compiledText = $(".nike-recommendation-text").eq(index * 2 + label);
        const nativeText = column.find(".nike-recommendation-text").eq(label);
        const expectedPadding = label === 0 ? "12px 10px 0px" : "4px 10px 0px";
        expect(style(compiledText.attr("style")).padding).toBe(expectedPadding);
        expect(style(nativeText.attr("style")).padding).toBe(expectedPadding);
        const compiledType = style(compiledText.children("div").attr("style"));
        const nativeType = style(nativeText.attr("style"));
        for (const property of ["font-size", "font-weight", "line-height"])
          expect(nativeType[property]).toBe(compiledType[property]);
      }
    });
    const nativeCss = native("style[data-pm-canvas-css]").text();
    for (const name of ["nike-recommendations", "nike-recommendation-card"])
      expect(nativeCss).toContain(`.${name}[data-pm-mjml-padding="self"]`);
    expect(nativeCss).toContain("padding-left: 14px !important");
    expect(nativeCss).toContain("padding-left: 6px !important");
    expect(nativeCss).toContain("padding-left: 4px !important");
    expect(nativeCss).toContain("line-height: 1.4 !important");

    const recommendationCards = blocks(reimported.document).filter(
      (block) => block.type === "Column" && block.props.cssClass === "nike-recommendation-card",
    );
    expect(recommendationCards).toHaveLength(4);
    for (const [index, card] of recommendationCards.entries()) {
      const children = card.props.content as EmailBlock[];
      expect(children.map(({ type }) => type)).toEqual(["Image", "Text", "Text"]);
      children[0].props.src = `https://example.com/editable-${index}.png`;
      children[1].props.content = `Edited recommendation ${index}`;
    }
    const edited = toMjml(reimported.document);
    expect(edited).not.toContain("mj-raw");
    for (let index = 0; index < 4; index++) {
      expect(edited).toContain(`https://example.com/editable-${index}.png`);
      expect(edited).toContain(`Edited recommendation ${index}`);
    }
  });
});
