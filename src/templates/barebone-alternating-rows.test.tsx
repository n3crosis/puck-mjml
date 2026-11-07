import { readFileSync } from "node:fs";
import { Render, type Data } from "@puckeditor/core";
import { load } from "cheerio";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createEmailConfig } from "../config";
import { toMjml } from "../export";
import { fromMjml } from "../import";
import { descendants } from "./test-support";

beforeAll(() => vi.stubGlobal("window", globalThis));
afterAll(() => vi.unstubAllGlobals());

const titles = ["Workflow improvements", "Reporting & visibility", "API & integrations"];
const source = readFileSync(
  new URL("../../templates/01-Barebone/product-update.mjml", import.meta.url),
  "utf8",
);
const reference = load(
  readFileSync(
    new URL(
      "../../tests/fixtures/react-email-reference/01-Barebone/product-update.html",
      import.meta.url,
    ),
    "utf8",
  ),
);

describe.each([false, true])("Barebone alternating rows, round trip: %s", (roundTrip) => {
  it("preserves the final 40px numbered gap and 26px decorative outer squares", async () => {
    const imported = fromMjml(source);
    expect(imported.warnings).toEqual([]);
    const input = roundTrip ? toMjml(imported.document) : source;
    const { default: mjml } = await import("mjml-browser");
    const result = await mjml(input, { validationLevel: "strict" });
    expect(result.errors).toEqual([]);
    const compiled = load(result.html);
    const stepTitles = [
      "Review the highlights",
      "Try it when you're ready",
      "Share with your team",
    ];
    for (const [index, title] of stepTitles.entries()) {
      const original = reference("p").filter((_i, node) => reference(node).text() === title);
      const originalRow = original.closest("table");
      expect(originalRow.css("margin-bottom")).toBe(index < 2 ? "2.25rem" : undefined);
      if (index === 2) expect(original.parents("table").eq(1).css("margin-bottom")).toBe("2.5rem");
      const cell = compiled(".bare-step-body").eq(index).find("td").last();
      expect(cell.css("padding")).toBe(index < 2 ? "0px 0px 36px" : "0px 0px 40px");
    }

    const originals = reference("span").filter(
      (_index, node) => reference(node).css("width") === "1.5rem",
    );
    expect(originals).toHaveLength(4);
    originals.each((_index, node) => {
      expect(reference(node).css("height")).toBe("1.5rem");
      expect(reference(node).css("border-width")).toBe("1px");
      expect(reference(node).css("box-sizing") ?? "content-box").toBe("content-box");
    });
    const squares = compiled(".bare-bullet-square p");
    expect(squares).toHaveLength(4);
    squares.each((_index, node) => {
      expect(compiled(node).css("width")).toBe("24px");
      expect(compiled(node).css("height")).toBe("24px");
      expect(compiled(node).css("border")).toBe("1px solid #e4e4e7");
      expect(compiled(node).css("box-sizing")).toBe("content-box");
    });
    // The distinct numbered badges intentionally stay 28px including borders.
    compiled(".bare-step-number p").each((_index, node) => {
      expect(compiled(node).css("width")).toBe("28px");
      expect(compiled(node).css("box-sizing")).toBe("border-box");
    });
  });

  it("centers both peers without fixed heights, offsets, or a raw fallback", async () => {
    const imported = fromMjml(source);
    expect(imported.warnings).toEqual([]);
    const input = roundTrip ? toMjml(imported.document) : source;
    const xml = load(input, { xml: true });
    const columns = xml("mj-column").filter((_index, column) =>
      (xml(column).attr("css-class") ?? "").split(" ").includes("bare-alternating-column"),
    );
    expect(columns).toHaveLength(6);
    expect(input).not.toMatch(/<mj-(?:raw|include)\b/);
    const blocks = descendants(imported.document.root.props!.sections!);
    expect(blocks.every((block) => block.type !== "Raw")).toBe(true);
    expect(blocks.filter((block) => block.type === "Text").length).toBeGreaterThan(9);

    const { default: mjml } = await import("mjml-browser");
    const result = await mjml(input, { validationLevel: "strict" });
    expect(result.errors).toEqual([]);
    const compiled = load(result.html);
    const canvas = load(
      renderToStaticMarkup(
        <Render config={createEmailConfig()} data={imported.document as Data} />,
      ),
    );

    for (const [index, title] of titles.entries()) {
      const originalTitle = reference("p").filter((_i, node) => reference(node).text() === title);
      const originalCells = originalTitle.closest("tr").children("td");
      expect(originalCells).toHaveLength(2);
      for (let peer = 0; peer < 2; peer++) {
        const original = originalCells.eq(peer);
        // Ordinary source table cells default to middle. All inline MJML
        // peers must explicitly use middle; mixing top/middle is not equivalent.
        expect(original.css("vertical-align") ?? "middle").toBe("middle");
        const column = columns.eq(index * 2 + peer);
        expect(column.attr("vertical-align")).toBe("middle");
        expect(column.attr("width")).toBe(original.css("width"));
        expect(column.attr("padding")).toBe(
          `0px ${peer === 0 ? "20px" : "0px"} ${index < 2 ? "36px" : "0px"} 0px`,
        );
        expect(column.attr("height")).toBeUndefined();
        for (const $ of [compiled, canvas]) {
          const actual = $(".bare-alternating-column").eq(index * 2 + peer);
          expect(actual.css("vertical-align")).toBe("middle");
          expect(actual.css("transform")).toBeUndefined();
          expect(actual.css("position")).toBeUndefined();
        }
      }
    }

    // The original 311px cap never binds in the desktop 48% cells; mobile
    // explicitly removes that cap. Preserve its fluid fractional width.
    expect(compiled(".bare-alternating-image")).toHaveLength(3);
    compiled(".bare-alternating-image table").each((_i, table) => {
      expect(compiled(table).css("width")).toBe("100%");
    });
    expect(canvas(".bare-alternating-image [data-pm-mjml-image-width]")).toHaveLength(3);
    expect(canvas("style").text()).toMatch(
      /bare-alternating-image[^{}]+data-pm-mjml-image-width[^{}]+\{\s*width:\s*100%\s*!important/,
    );
    expect(xml("mj-image[fluid-on-mobile='true']")).toHaveLength(5);
    expect(input).toMatch(/\.bare-alternating-first[^{}]*\{\s*padding-bottom:\s*32px\s*!important/);

    expect(canvas("style").text()).toMatch(
      /bare-alternating-column a\s*\{\s*text-decoration:\s*none/,
    );
    for (const $ of [compiled, canvas]) {
      const links = $(".bare-alternating-column a").filter(
        (_i, link) => $(link).text().trim() === "Learn about Pro",
      );
      expect(links).toHaveLength(3);
      links.each((index, link) => {
        const original = reference("a")
          .filter((_i, node) => reference(node).text() === "Learn about Pro")
          .eq(index);
        expect($(link).attr("href")).toBe(original.attr("href"));
        expect($(link).attr("target")).toBe(original.attr("target"));
        expect(original.css("text-decoration-line")).toBe("none");
        if ($ === compiled) expect($(link).css("text-decoration")).toBe("none");
      });
    }
  });
});
