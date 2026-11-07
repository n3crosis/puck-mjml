import { describe, expect, it, vi } from "vitest";
import {
  aliasFontFamilyList,
  createFontAliases,
  reportCanvasNotes,
  resetReportedCanvasNotes,
  scopeDocumentCss,
  type CanvasStyleSheet,
} from "./canvas-css";

const stylesheet = (css: string): CanvasStyleSheet => ({ css, inline: "head" });
const scopeCss = (sheets: CanvasStyleSheet[], fontAliases?: Record<string, string>) =>
  scopeDocumentCss(sheets, { scope: "pm-canvas-test", fontAliases });

describe("scoped canvas CSS selectors", () => {
  it("prefixes plain selectors with the canvas scope", () => {
    const result = scopeCss([stylesheet(".card { color: red; } a:hover { color: blue; }")]);
    expect(result.css).toContain(".pm-canvas-test .card { color: red; }");
    expect(result.css).toContain(".pm-canvas-test a:hover { color: blue; }");
    expect(result.notes).toEqual([]);
  });

  it("maps html, body, and :root to the canvas root", () => {
    const result = scopeCss([
      stylesheet(
        "body { padding: 0 16px !important; } html body .x { color: red; } :root { --brand: navy; } body > .card { margin: 0; }",
      ),
    ]);
    expect(result.css).toContain(".pm-canvas-test { padding: 0 16px !important; }");
    expect(result.css).toContain(".pm-canvas-test .x { color: red; }");
    expect(result.css).toContain(".pm-canvas-test { --brand: navy; }");
    expect(result.css).toContain(".pm-canvas-test > .card { margin: 0; }");
    expect(result.notes).toEqual([]);
  });

  it("keeps suffixes when mapping root compounds", () => {
    const result = scopeCss([
      stylesheet(":root::before { content: ''; } body[dir=rtl] .x { float: right; }"),
    ]);
    expect(result.css).toContain(".pm-canvas-test::before { content: ''; }");
    expect(result.css).toContain(".pm-canvas-test[dir=rtl] .x { float: right; }");
  });

  it("drops selectors that escape the canvas through sibling combinators", () => {
    const result = scopeCss([
      stylesheet(
        "body + .host-page { color: red; } body ~ * { margin: 0; } .card { color: blue; }",
      ),
    ]);
    expect(result.css).not.toContain("host-page");
    expect(result.css).toContain(".pm-canvas-test .card { color: blue; }");
    expect(result.notes).toHaveLength(2);
    expect(result.notes[0]).toContain('selector "body + .host-page" can match elements outside');
  });

  it("keeps the unescaped selectors of a selector list", () => {
    const result = scopeCss([stylesheet("body + .leak, .card, body ~ .leak2 { color: red; }")]);
    expect(result.css).toContain(".pm-canvas-test .card { color: red; }");
    expect(result.css).not.toContain(".leak");
    expect(result.notes).toHaveLength(2);
  });

  it("preserves pseudo classes, functions with commas, and quoted attribute values", () => {
    const result = scopeCss([
      stylesheet('.promo:is(.a, .b) input[title="a, b"] { border: 0; } .x:not(.y) { color: red; }'),
    ]);
    expect(result.css).toContain(
      '.pm-canvas-test .promo:is(.a, .b) input[title="a, b"] { border: 0; }',
    );
    expect(result.css).toContain(".pm-canvas-test .x:not(.y) { color: red; }");
  });

  it("scopes rules inside media, supports, and container queries", () => {
    const result = scopeCss([
      stylesheet(
        "@media only screen and (max-width: 600px) { .intro { padding: 24px !important; } } @supports (display: grid) { .grid { display: grid; } } @container (width < 400px) { .card { color: red; } }",
      ),
    ]);
    expect(result.css).toContain("@media only screen and (max-width: 600px)");
    expect(result.css).toContain(".pm-canvas-test .intro { padding: 24px !important; }");
    expect(result.css).toContain("@supports (display: grid)");
    expect(result.css).toContain(".pm-canvas-test .grid { display: grid; }");
    expect(result.css).toContain("@container (width < 400px)");
    expect(result.css).toContain(".pm-canvas-test .card { color: red; }");
  });

  it("keeps nested rules nested under their scoped parent", () => {
    const result = scopeCss([
      stylesheet(".card { color: red; .title { color: blue; } & > .body { color: green; } }"),
    ]);
    expect(result.css).toContain(".pm-canvas-test .card {");
    expect(result.css).toContain(".title { color: blue; }");
    expect(result.css).toContain("& > .body { color: green; }");
  });

  it("drops unsupported at-rules and imports with a note", () => {
    const result = scopeCss([
      stylesheet(
        "@import url(theme.css); @charset 'utf-8'; @namespace svg url(x); .card { color: red; }",
      ),
    ]);
    expect(result.css).not.toContain("@import");
    expect(result.css).not.toContain("@charset");
    expect(result.css).not.toContain("@namespace");
    expect(result.css).toContain(".pm-canvas-test .card { color: red; }");
    expect(result.notes).toHaveLength(3);
  });

  it("unwraps layer rules while reporting lost layer semantics", () => {
    const result = scopeCss([
      stylesheet("@layer base { .card { color: red; } .title { color: blue; } }"),
    ]);
    expect(result.css).toContain(".pm-canvas-test .card { color: red; }");
    expect(result.css).toContain(".pm-canvas-test .title { color: blue; }");
    expect(result.css).not.toContain("@layer");
    expect(result.notes[0]).toContain("@layer");
  });

  it("reports stylesheets that cannot be parsed", () => {
    const result = scopeCss([
      stylesheet(".card { color: red;"),
      stylesheet(".ok { color: blue; }"),
    ]);
    expect(result.css).toContain(".pm-canvas-test .ok");
    expect(result.css).not.toContain("card");
    expect(result.notes).toHaveLength(1);
    expect(result.notes[0]).toContain("Custom CSS 1 could not be parsed");
  });

  it("ignores empty and non-string entries without notes", () => {
    const result = scopeCss([{ css: "" }, { css: undefined }, stylesheet(".card { color: red; }")]);
    expect(result.css).toContain(".pm-canvas-test .card");
    expect(result.notes).toEqual([]);
  });
});

describe("namespaced canvas CSS globals", () => {
  it("namespaces keyframes and rewrites animation references", () => {
    const result = scopeCss([
      stylesheet(
        "@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } } .loader { animation: spin 2s linear infinite; } .alt { animation-name: spin; }",
      ),
    ]);
    expect(result.css).toContain("@keyframes pm-canvas-test-spin");
    expect(result.css).toContain("animation: pm-canvas-test-spin 2s linear infinite");
    expect(result.css).toContain("animation-name: pm-canvas-test-spin");
    expect(result.notes).toEqual([]);
  });

  it("rewrites keyframes referenced from an earlier stylesheet", () => {
    const result = scopeCss([
      stylesheet(".loader { animation: pulse 1s ease; }"),
      stylesheet("@keyframes pulse { from { opacity: 0; } }"),
    ]);
    expect(result.css).toContain("animation: pm-canvas-test-pulse 1s ease");
    expect(result.css).toContain("@keyframes pm-canvas-test-pulse");
  });

  it("leaves animation keywords and unknown names untouched", () => {
    const result = scopeCss([
      stylesheet(
        ".x { animation: ease-in 2s linear infinite alternate forwards; } .y { animation: other 1s; }",
      ),
    ]);
    expect(result.css).toContain("animation: ease-in 2s linear infinite alternate forwards");
    expect(result.css).toContain("animation: other 1s");
  });

  it("aliases declared font families and rewrites font-family declarations", () => {
    const aliases = createFontAliases(["Inter"], "pm-canvas-test");
    expect(aliases).toEqual({ inter: "Inter-pm-canvas-test" });
    const result = scopeCss(
      [
        stylesheet(
          "@font-face { font-family: 'Local Font'; src: url(https://example.com/local.woff2); } .card { font-family: Inter, Arial, sans-serif; } .quoted { font-family: 'Inter', serif; }",
        ),
      ],
      aliases,
    );
    expect(result.css).toContain('font-family: "LocalFont-pm-canvas-test"');
    expect(result.css).toContain('font-family: "Inter-pm-canvas-test", Arial, sans-serif');
    expect(result.css).toContain('font-family: "Inter-pm-canvas-test", serif');
    expect(result.notes).toEqual([]);
  });

  it("matches font families case-insensitively and preserves unknown families", () => {
    const aliases = createFontAliases(["Inter"], "pm-canvas-test");
    const result = scopeCss(
      [stylesheet('.a { font-family: inter, "Helvetica Neue", serif; }')],
      aliases,
    );
    expect(result.css).toContain('font-family: "Inter-pm-canvas-test", "Helvetica Neue", serif');
  });

  it("does not rewrite the font shorthand", () => {
    const aliases = createFontAliases(["Inter"], "pm-canvas-test");
    const result = scopeCss([stylesheet(".a { font: 16px Inter, sans-serif; }")], aliases);
    expect(result.css).toContain("font: 16px Inter, sans-serif");
  });
});

describe("font alias helpers", () => {
  it("builds aliases from declared names only", () => {
    expect(
      createFontAliases(
        ["Inter", " inter ", "", 42, "Helvetica Neue"] as unknown as string[],
        "pm-canvas-test",
      ),
    ).toEqual({
      inter: "Inter-pm-canvas-test",
      "helvetica neue": "HelveticaNeue-pm-canvas-test",
    });
  });

  it("rejects invalid scopes", () => {
    expect(createFontAliases(["Inter"], "bad scope!")).toEqual({});
  });

  it("rewrites font stacks and keeps them without aliases", () => {
    const aliases = { inter: "Inter-x" };
    expect(aliasFontFamilyList("Inter, Arial", aliases)).toBe('"Inter-x", Arial');
    expect(aliasFontFamilyList("Georgia, serif", aliases)).toBe("Georgia, serif");
    expect(aliasFontFamilyList("", aliases)).toBe("");
  });
});

describe("canvas note reporting", () => {
  it("warns once per unique note", () => {
    resetReportedCanvasNotes();
    const warnings: string[] = [];
    const warn = vi.spyOn(console, "warn").mockImplementation((message) => warnings.push(message));
    try {
      reportCanvasNotes(["a note"]);
      reportCanvasNotes(["a note", "another note"]);
      reportCanvasNotes(["another note"]);
      expect(warnings).toEqual(["[puck-mjml] a note", "[puck-mjml] another note"]);
    } finally {
      warn.mockRestore();
      resetReportedCanvasNotes();
    }
  });
});
