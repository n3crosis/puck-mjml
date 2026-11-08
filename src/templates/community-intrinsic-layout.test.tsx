import { readFileSync } from "node:fs";
import { Render, type Data } from "@puckeditor/core";
import { load } from "cheerio";
import { parse } from "postcss";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createEmailConfig } from "../config";
import { fromMjml } from "../import";
import { toMjml } from "../export";
import type { EmailBlock } from "../types";

beforeAll(() => vi.stubGlobal("window", globalThis));
afterAll(() => vi.unstubAllGlobals());
const source = (name: string) =>
  readFileSync(new URL(`../../templates/Community/${name}.mjml`, import.meta.url), "utf8");
const reference = (name: string) =>
  load(
    readFileSync(
      new URL(`../../.cache/react-email-reference/Community/${name}.html`, import.meta.url),
      "utf8",
    ),
  );
const normalized = (text: string) => text.replace(/\s+/g, " ").trim();
function declarations(style: string | undefined) {
  const result: Record<string, string> = {};
  parse(`element { ${style ?? ""} }`).walkDecls((decl) => {
    result[decl.prop] = decl.value;
  });
  return result;
}
function namedRule(mjml: string, selector: string) {
  const $ = load(mjml, { xmlMode: true });
  const result: Record<string, string> = {};
  parse(
    $("mj-style")
      .map((_index, node) => $(node).text())
      .get()
      .join("\n"),
  ).walkRules((rule) => {
    if (rule.selectors.includes(selector))
      rule.walkDecls((decl) => {
        result[decl.prop] = decl.value;
      });
  });
  return result;
}
function blocks(value: unknown): EmailBlock[] {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap(blocks);
  const record = value as Record<string, unknown>;
  return [
    ...(typeof record.type === "string" && record.props ? [record as unknown as EmailBlock] : []),
    ...Object.values(record).flatMap(blocks),
  ];
}

// Structural and source-backed checks complement the 800/390px real-editor
// geometry assertions in community-intrinsic-layout.spec.ts.
describe.each([false, true])("Community intrinsic layouts, safe round trip: %s", (roundTrip) => {
  it("keeps both Papermark button surfaces and their labels equivalent to the original anchors", async () => {
    const name = "notifications/papermark-year-in-review";
    const input = source(name);
    const imported = fromMjml(input);
    expect(imported.warnings).toEqual([]);
    const mjml = roundTrip ? toMjml(imported.document) : input;
    const parsed = fromMjml(mjml);
    expect(parsed.warnings).toEqual([]);
    const original = reference(name);
    const anchors = original("a").filter(
      (_index, node) => normalized(original(node).text()) === "Share your stats",
    );
    expect(anchors).toHaveLength(2);
    anchors.each((_index, node) => {
      expect(original(node).attr("href")).toBe("https://www.papermark.com");
      expect(declarations(original(node).attr("style"))).toMatchObject({
        "padding-left": "3rem",
        "padding-right": "3rem",
        "padding-top": "1rem",
        "padding-bottom": "1rem",
        "font-size": "0.875rem",
        "font-weight": "700",
      });
    });
    const native = load(
      renderToStaticMarkup(<Render config={createEmailConfig()} data={parsed.document as Data} />),
    );
    const buttons = native(".pm-button").filter(
      (_index, node) => normalized(native(node).text()) === "Share your stats",
    );
    expect(buttons).toHaveLength(2);
    buttons.each((_index, node) => {
      expect(node.tagName).toBe("span");
      expect(declarations(native(node).attr("style"))).toMatchObject({
        padding: "16px 48px",
        "font-size": "14px",
        "font-weight": "700",
        "line-height": "20px",
      });
    });
    const { default: compile } = await import("mjml-browser");
    const result = await compile(mjml, { validationLevel: "strict" });
    expect(result.errors).toEqual([]);
    const compiled = load(result.html);
    const links = compiled("a").filter(
      (_index, node) => normalized(compiled(node).text()) === "Share your stats",
    );
    expect(links).toHaveLength(2);
    links.each((_index, node) => {
      expect(compiled(node).attr("href")).toBe("https://www.papermark.com");
      expect(declarations(compiled(node).attr("style"))).toMatchObject({
        padding: "16px 48px",
        "font-size": "14px",
        "font-weight": "700",
        "line-height": "20px",
      });
    });
  });

  it("keeps Papermark's source intrinsic table model fully editable", async () => {
    const name = "notifications/papermark-year-in-review";
    const input = source(name);
    const imported = fromMjml(input);
    expect(imported.warnings).toEqual([]);
    const mjml = roundTrip ? toMjml(imported.document) : input;
    const parsed = fromMjml(mjml);
    expect(parsed.warnings).toEqual([]);
    expect(namedRule(mjml, ".paper-activity-stats td p")).toEqual({
      "overflow-wrap": "normal",
      "word-break": "normal",
    });
    const table = blocks(parsed.document).find((block) => block.type === "Table")!;
    expect(table).toBeDefined();
    expect(table.props.htmlContent).toBeUndefined();
    const rows = table.props.bodyRows as { cells: { content: string; width: string }[] }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].cells).toHaveLength(3);
    expect(rows[0].cells.map((cell) => cell.width)).toEqual(Array(3).fill("33.33333333333333%"));
    const original = reference(name);
    const originalCells = original("p")
      .filter((_index, node) => original(node).text() === "documents")
      .closest("tr")
      .children("td");
    expect(
      originalCells.map((_index, node) => declarations(original(node).attr("style")).width).get(),
    ).toEqual(rows[0].cells.map((cell) => cell.width));
    const canvas = load(
      renderToStaticMarkup(<Render config={createEmailConfig()} data={parsed.document as Data} />),
    );
    const native = canvas(".paper-activity-stats > table.pm-native-table");
    expect(native).toHaveLength(1);
    expect(declarations(native.attr("style"))["table-layout"]).toBe("auto");
    expect(native.find("tr > td")).toHaveLength(3);
    expect(
      native
        .find("tr > td")
        .map((_index, node) => normalized(canvas(node).text()))
        .get(),
    ).toEqual(["You uploaded 25 documents", "You shared 50 links", "You received 500 views"]);
    for (const [index, fontSize, lineHeight, margin] of [
      [1, "14px", "20px", "16px 0px"],
      [2, "36px", "40px", "4px 0px"],
      [3, "24px", "32px", "16px 0px"],
    ] as const) {
      expect(namedRule(mjml, `.paper-activity-stats td p:nth-of-type(${index})`)).toMatchObject({
        "font-size": fontSize,
        "line-height": lineHeight,
        margin,
      });
      const originalParagraph = originalCells
        .first()
        .find("p")
        .eq(index - 1);
      const originalStyle = declarations(originalParagraph.attr("style"));
      expect(Number.parseFloat(originalStyle["font-size"]) * 16).toBe(Number.parseFloat(fontSize));
      expect(
        Number.parseFloat(originalStyle["line-height"]) * Number.parseFloat(fontSize),
      ).toBeCloseTo(Number.parseFloat(lineHeight));
    }
    rows[0].cells[0].content = rows[0].cells[0].content.replace(">25<", ">26<");
    const edited = toMjml(parsed.document);
    expect(edited).toContain(">26<");
    expect(edited).not.toMatch(/<mj-(?:raw|include)\b/);
    const { default: compile } = await import("mjml-browser");
    expect((await compile(edited, { validationLevel: "strict" })).errors).toEqual([]);
  });

  it("restores Papermark's source outer margin, collapsed divider rhythm and dashboard layout", async () => {
    const name = "notifications/papermark-year-in-review";
    const input = source(name);
    const imported = fromMjml(input);
    expect(imported.warnings).toEqual([]);
    const mjml = roundTrip ? toMjml(imported.document) : input;
    const original = reference(name);
    // The immutable body never resets the browser's default 8px margin.
    expect(declarations(original("body").attr("style")).margin).toBeUndefined();
    expect(original("style")).toHaveLength(0);
    expect(namedRule(mjml, "body").padding).toBe("8px");
    original("hr").each((_index, node) => {
      expect(declarations(original(node).attr("style"))["border-top"]).toBe("1px solid #eaeaea");
    });
    const $ = load(mjml, { xmlMode: true });
    const dividers = $("mj-divider");
    expect(dividers).toHaveLength(2);
    dividers.each((_index, node) => {
      expect($(node).attr("border-color")).toBe("#eaeaea");
      expect($(node).attr("padding")).toBe("8px 0px 8.04px");
    });
    // 16px preceding paragraph space + 8px native padding = source collapsed
    // 24px hr top margin. Source h1 default 0.67em at12px gives 8.04px below.
    const firstCard = $("mj-wrapper.paper-orange, mj-wrapper[css-class='paper-orange']");
    expect(firstCard.prev("mj-section").find("mj-spacer").attr("height")).toBe("24px");
    const dashboard = original("a").filter(
      (_index, node) => original(node).text() === "Go to your dashboard",
    );
    expect(declarations(dashboard.attr("style"))).toMatchObject({
      display: "block",
      "margin-top": "1rem",
      "font-weight": "700",
      "font-size": "0.875rem",
    });
    expect(namedRule(mjml, ".community-rich-4 a:nth-of-type(1)").display).toBe("block");
    const footer = $("mj-text[css-class='community-rich-4']");
    expect(footer.attr("padding")).toBe("0px");
    expect(footer.attr("font-weight")).toBe("700");
    expect(footer.closest("mj-section").attr("padding")).toBe("40px 0px 24px");
    const { default: compile } = await import("mjml-browser");
    expect((await compile(mjml, { validationLevel: "strict" })).errors).toEqual([]);
  });

  it("preserves Vercel's source black normal-weight facts for b and editor strong marks", () => {
    const name = "notifications/vercel-invite-user";
    const input = source(name);
    const imported = fromMjml(input);
    expect(imported.warnings).toEqual([]);
    const mjml = roundTrip ? toMjml(imported.document) : input;
    const original = reference(name);
    const facts = original("span").filter((_index, node) =>
      ["alanturing", "204.13.186.218", "São Paulo, Brazil"].includes(original(node).text()),
    );
    expect(facts).toHaveLength(3);
    facts.each((_index, node) =>
      expect(declarations(original(node).attr("style")).color).toBe("rgb(0,0,0)"),
    );
    expect(namedRule(mjml, ".vercel-invite-details b")).toEqual({
      color: "#000000",
      "font-weight": "400",
    });
    expect(namedRule(mjml, ".vercel-invite-details strong")).toEqual(
      namedRule(mjml, ".vercel-invite-details b"),
    );
  });
});
