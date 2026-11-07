import { readFileSync, readdirSync } from "node:fs";
import { load } from "cheerio";
import { parse } from "postcss";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { fromMjml } from "../import";
import { toMjml } from "../export";
import { descendants } from "./test-support";

const families = ["04-Arcane", "05-Studio"] as const;
const names = [
  "abandoned-cart",
  "activation",
  "newsletter",
  "order-confirmation",
  "order-shipping",
  "password-reset",
  "promo",
  "welcome",
] as const;
const sourceFor = (family: string, name: string) =>
  readFileSync(new URL(`../../templates/${family}/${name}.mjml`, import.meta.url), "utf8");

beforeAll(() => vi.stubGlobal("window", globalThis));
afterAll(() => vi.unstubAllGlobals());

describe("canonical Arcane and Studio MJML ports", () => {
  it.each(families)(
    "%s contains eight emails, with fonts only in native head metadata",
    (family) => {
      expect(
        readdirSync(new URL(`../../templates/${family}/`, import.meta.url))
          .filter((file) => file.endsWith(".mjml"))
          .sort(),
      ).toEqual(names.map((name) => `${name}.mjml`).sort());
      for (const name of names) {
        const source = sourceFor(family, name);
        const $ = load(source, { xml: true });
        expect(
          $("mj-head > mj-font")
            .map((_index, node) => $(node).attr("name"))
            .get(),
        ).toEqual(["Inter", family === "04-Arcane" ? "Instrument Serif" : "Geist"]);
        expect($("mj-head > mj-breakpoint").attr("width")).toBe("601px");
        expect(source).not.toMatch(/<mj-(?:raw|include)\b/);
        // Ending-tag CSS is raw text in MJML: XML-escaped selectors compile but do not apply.
        expect(source).not.toContain("&gt;");
        expect(source).not.toContain("${");
      }
    },
  );

  it.each(families)("%s order totals remain individually editable table cells", async (family) => {
    const imported = fromMjml(sourceFor(family, "order-confirmation"));
    expect(imported.warnings).toEqual([]);
    const table = descendants(imported.document.root.props!.sections!).find(
      (block) => block.type === "Table",
    )!;
    expect(table).toBeDefined();
    expect(table.props.htmlContent).toBeUndefined();
    const rows = table.props.bodyRows as { cells: { content: string }[] }[];
    expect(rows.map((row) => row.cells.map(({ content }) => load(content).text()))).toEqual([
      ["Subtotal", "$198.00"],
      ["Tax", "$16.00"],
      ["Shipping", "$0.00"],
      ["Total", "$214.00"],
    ]);
    rows[3].cells[1].content = "<p>$215.00</p>";
    const { default: mjml } = await import("mjml-browser");
    const compiled = await mjml(toMjml(imported.document), { validationLevel: "strict" });
    expect(compiled.errors).toEqual([]);
    const $ = load(compiled.html);
    const summary = $(family === "04-Arcane" ? ".arcane-summary" : ".studio-summary");
    expect(summary.text()).toContain("$215.00");
    expect(summary.text()).not.toContain("$214.00");
    if (family === "04-Arcane") {
      expect(summary.find("tr").last().find("td").last().attr("style")).toContain(
        "border-top: 1px solid #300610",
      );
    }
  });

  it("Arcane newsletter tips remain native table cells with scoped typography", async () => {
    const imported = fromMjml(sourceFor("04-Arcane", "newsletter"));
    expect(imported.warnings).toEqual([]);
    const tables = descendants(imported.document.root.props!.sections!).filter(
      (block) => block.type === "Table",
    );
    expect(tables).toHaveLength(3);
    for (const table of tables) expect(table.props.htmlContent).toBeUndefined();
    const { default: mjml } = await import("mjml-browser");
    const compiled = await mjml(toMjml(imported.document), { validationLevel: "strict" });
    const $ = load(compiled.html);
    expect($(".arcane-tip").length).toBe(3);
    expect($(".arcane-tip td").first().attr("style")).toContain("font-size: 20px");
    expect($(".arcane-tip td").first().attr("style")).toContain("Instrument Serif");
  });

  it.each(families)("%s preserves order thumbnails and mobile column rules", async (family) => {
    const source = sourceFor(family, "order-confirmation");
    const imported = fromMjml(source);
    const { default: mjml } = await import("mjml-browser");
    const direct = await mjml(source, { validationLevel: "strict" });
    const compiled = await mjml(toMjml(imported.document), { validationLevel: "strict" });
    expect(direct.errors).toEqual([]);
    expect(compiled.errors).toEqual([]);
    const $ = load(compiled.html);
    const prefix = family === "04-Arcane" ? "arcane-order" : "studio-product";
    const size = family === "04-Arcane" ? 68 : 80;
    expect($(`.${prefix}-image img`).first().attr("width")).toBe(String(size));
    const css = parse(
      $("head style")
        .map((_index, node) => $(node).text())
        .get()
        .join("\n"),
    );
    const mobileDeclarations = (selector: string, property: string) => {
      const declarations: { value: string; important: boolean }[] = [];
      css.walkRules(selector, (rule) => {
        const parent = rule.parent;
        if (
          parent?.type !== "atrule" ||
          parent.name !== "media" ||
          !/\(\s*max-width\s*:\s*600px\s*\)/.test(parent.params)
        )
          return;
        rule.walkDecls(property, (declaration) => {
          declarations.push({
            value: declaration.value.replace(/\s+/g, ""),
            important: declaration.important ?? false,
          });
        });
      });
      return declarations;
    };
    for (const property of ["width", "max-width"]) {
      expect(mobileDeclarations(`.${prefix}-image`, property)).toEqual([
        { value: `${size}px`, important: true },
      ]);
      expect(mobileDeclarations(`.${prefix}-copy`, property)).toEqual([
        { value: `calc(100%-${size}px)`, important: true },
      ]);
    }
  });
});
