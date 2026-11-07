import { describe, expect, it, vi } from "vitest";
import { load } from "cheerio";
import postcss, { type Rule } from "postcss";
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

describe("native MJML padding aliases", () => {
  const selector = ".inset > table > tbody > tr > td";
  const rulesFor = (css: string) => {
    const rules: Rule[] = [];
    postcss.parse(scopeCss([stylesheet(css)]).css).walkRules((rule) => {
      rules.push(rule);
    });
    return rules;
  };

  it("keeps the original rule and aliases only physical padding declarations", () => {
    const [original, alias] = rulesFor(
      `${selector} { color: red; padding: 10px; padding-left: 24px !important; padding-inline: 12px; --padding: 9px; }`,
    );
    expect(original.selector).toBe(`.pm-canvas-test ${selector}`);
    expect(original.toString()).toContain("color: red");
    expect(alias.nodes.map((node) => node.toString())).toEqual([
      "padding: 10px",
      "padding-left: 24px !important",
    ]);
    expect(alias.selector).toContain(`:is(.pm-canvas-test ${selector}, :where(`);
    expect(alias.selector).toContain('.pm-canvas-test .inset[data-pm-mjml-padding="self"]');
    expect(alias.selector).toContain(
      '.pm-canvas-test .inset[data-pm-mjml-padding="child"] > [data-pm-mjml-padding-target]',
    );
    expect(alias.selector).toMatch(/\)\):where\(/);
  });

  it("matches marked boxes only, not authored tables, other canvases, or the host", () => {
    const [, alias] = rulesFor(`${selector} { padding: 24px !important; }`);
    const $ = load(`<div class="pm-canvas-test">
      <div id="section" class="inset" data-pm-mjml-padding="self"></div>
      <div class="inset" data-pm-mjml-padding="child"><div id="gutter-content" data-pm-mjml-padding-target></div></div>
      <div class="inset"><table><tbody><tr><td id="authored">Keep original CSS</td></tr></tbody></table></div>
      <div id="unmarked" class="inset"></div>
      <div class="inset" data-pm-mjml-padding="child"><div><div id="nested" data-pm-mjml-padding-target></div></div></div>
    </div>
    <div class="pm-canvas-other"><div id="other" class="inset" data-pm-mjml-padding="self"></div></div>
    <div id="host" class="inset" data-pm-mjml-padding="self"></div>`);
    expect(
      $(alias.selector)
        .toArray()
        .map((element) => $(element).attr("id")),
    ).toEqual(["section", "gutter-content"]);
    expect($(`.pm-canvas-test ${selector}`).attr("id")).toBe("authored");
  });

  it("keeps each selector's specificity separate and preserves source order", () => {
    const rules = rulesFor(
      `${selector}, .other>TABLE>TBODY>TR>TD, #ordinary { padding-top: 4px; }
       .inset { padding-top: 1px !important; }
       ${selector} { padding-top: 8px; }`,
    );
    expect(rules).toHaveLength(5);
    expect(rules[1].selector.match(/:is\(/g)).toHaveLength(2);
    expect(rules[1].selector).not.toContain("#ordinary");
    expect(rules[2].selector).toBe(".pm-canvas-test .inset");
    expect(rules[4].nodes[0].toString()).toBe("padding-top: 8px");
  });

  it.each(["media (max-width: 600px)", "supports (display: flex)", "container (width < 600px)"])(
    "keeps aliases inside @%s",
    (group) => {
      const rules = rulesFor(`@${group} { ${selector} { padding-right: 12px !important; } }`);
      expect(rules).toHaveLength(2);
      expect(rules[0].parent).toBe(rules[1].parent);
      expect(rules[1].parent?.toString()).toContain(`@${group}`);
    },
  );

  it.each([
    "table > tbody > tr > td",
    ".inset table td",
    ".inset > div > table > tbody > tr > td",
    ".inset > table > tbody > tr > td:first-child",
    ".inset:hover > table > tbody > tr > td",
    ".inset.more > table > tbody > tr > td",
    ".inset[title] > table > tbody > tr > td",
    ".inset:is(.x, .y) > table > tbody > tr > td",
    "#inset > table > tbody > tr > td",
    "body .inset > table > tbody > tr > td",
    ".outer .inset > table > tbody > tr > td",
    ".inset + table > tbody > tr > td",
    ".inset > table > tbody > tr > td + .host",
  ])("does not reinterpret unsupported selector %s", (unsupported) => {
    const result = scopeCss([stylesheet(`${unsupported} { padding: 1px; }`)]);
    expect(result.css).not.toContain("data-pm-mjml-padding");
  });

  it("never aliases rejected root sibling selectors", () => {
    const result = scopeCss([
      stylesheet(`body + .inset > table > tbody > tr > td, body ~ .host { padding: 1px; }`),
    ]);
    expect(result.css).toBe("");
    expect(result.notes).toHaveLength(2);
  });

  it("does not clone nested rules, reset semantics, or rules without physical padding", () => {
    for (const declarations of [
      "color: red; width: 100%; padding-inline: 2px;",
      "padding: 2px; all: unset;",
      "padding: 2px; & { padding: 4px; }",
      "padding: 2px; @media (max-width: 600px) { padding: 4px; }",
    ]) {
      expect(scopeCss([stylesheet(`${selector} { ${declarations} }`)]).css).not.toContain(
        "data-pm-mjml-padding",
      );
    }
  });

  it("never mutates the source stylesheet", () => {
    const sheets = [stylesheet(`${selector} { padding-bottom: 16px !important; }`)];
    const before = JSON.stringify(sheets);
    scopeCss(sheets);
    expect(JSON.stringify(sheets)).toBe(before);
  });
});

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

  it("keeps colliding sanitized family names distinct across imported and head-only faces", () => {
    const aliases = createFontAliases(
      ["Open Sans", "OpenSans", "OpenSans-2", "constructor", "__proto__"],
      "pm-canvas-test",
    );
    expect(new Set(Object.values(aliases)).size).toBe(5);
    expect(aliases.constructor).toBe("constructor-pm-canvas-test");
    expect(aliases.__proto__).toBe("proto-pm-canvas-test");
    const result = scopeCss(
      [
        stylesheet(
          "@font-face {font-family: Open_Sans; src:url(head.woff);} .copy {font-family:Open_Sans, OpenSans, 'Open Sans';}",
        ),
      ],
      aliases,
    );
    expect(new Set(Object.values(result.fontAliases)).size).toBe(6);
    expect(result.fontAliases.open_sans).not.toBe(aliases["open sans"]);
    expect(result.fontAliases.open_sans).not.toBe(aliases.opensans);
    expect(result.css).toContain(result.fontAliases.open_sans);
    expect(aliasFontFamilyList("constructor, __proto__, unknown", aliases)).toBe(
      '"constructor-pm-canvas-test","proto-pm-canvas-test", unknown',
    );
    expect(aliasFontFamilyList("constructor, toString", {})).toBe("constructor, toString");
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

describe("native MJML image sizing aliases", () => {
  const rulesFor = (css: string) => {
    const rules: Rule[] = [];
    postcss.parse(scopeCss([stylesheet(css)]).css).walkRules((rule) => {
      rules.push(rule);
    });
    return rules;
  };
  it("preserves original rules and specificity while copying only literal full width", () => {
    const sheets = [
      stylesheet(".image table { width:100% !important; height:20px; max-width:none; padding:0; }"),
    ];
    const before = JSON.stringify(sheets);
    const rules: Rule[] = [];
    postcss.parse(scopeCss(sheets).css).walkRules((rule) => {
      rules.push(rule);
    });
    expect(JSON.stringify(sheets)).toBe(before);
    expect(rules).toHaveLength(2);
    expect(rules[0].selector).toBe(".pm-canvas-test .image table");
    expect(rules[0].nodes).toHaveLength(4);
    expect(rules[1].nodes.map((node) => node.toString())).toEqual(["width:100% !important"]);
    expect(rules[1].selector).toBe(
      ":is(.pm-canvas-test .image table, :where(.pm-canvas-test .image [data-pm-mjml-image-width])):where(.pm-canvas-test .image [data-pm-mjml-image-width])",
    );
  });
  it("matches only marked image anchors beneath the class, preserving authored table matches", () => {
    const [original, alias] = rulesFor(".image table { width:100% !important; }");
    const $ = load(
      `<div class="pm-canvas-test"><div class="image"><a id="direct" data-pm-mjml-image-width></a><div><a id="nested" data-pm-mjml-image-width></a></div><table id="authored"></table><a id="unmarked"></a></div><a id="other-class" data-pm-mjml-image-width></a></div><div class="pm-canvas-other image"><a id="other" data-pm-mjml-image-width></a></div><div class="image"><a id="host" data-pm-mjml-image-width></a></div>`,
    );
    expect(
      $(alias.selector)
        .toArray()
        .map((element) => $(element).attr("id")),
    ).toEqual(["direct", "nested"]);
    expect($(original.selector).attr("id")).toBe("authored");
  });
  it.each(["media (max-width:600px)", "supports (display:flex)", "container (width < 600px)"])(
    "preserves @%s and source ordering",
    (group) => {
      const rules = rulesFor(
        `@${group} { .image table, .other TABLE { width:100% !important; } .image a { width:50% !important; } }`,
      );
      expect(rules).toHaveLength(3);
      expect(rules[1].selector.match(/:is\(/g)).toHaveLength(2);
      expect(rules[0].parent).toBe(rules[1].parent);
      expect(rules[2].selector).toBe(".pm-canvas-test .image a");
      expect(rules[1].parent?.toString()).toContain(`@${group}`);
    },
  );
  it.each([
    "table",
    ".image > table",
    ".image + table",
    ".image ~ table",
    ".image table td",
    ".image table:first-child",
    ".image:hover table",
    ".image.more table",
    ".image[title] table",
    ".image:is(.x,.y) table",
    "#image table",
    "body .image table",
    ".outer .image table",
  ])("does not alias unsupported %s", (selector) => {
    expect(scopeCss([stylesheet(`${selector} { width:100% !important; }`)]).css).not.toContain(
      "data-pm-mjml-image-width",
    );
  });
  it.each([
    "width:90%;",
    "max-width:100%;",
    "width:calc(100%);",
    "width:100% !important; width:auto;",
    "width:100% !important; all:unset;",
    "width:100% !important; & { width:50%; }",
    "width:100% !important; @media (max-width:600px) { width:50%; }",
  ])("does not reinterpret %s", (declarations) => {
    expect(scopeCss([stylesheet(`.image table { ${declarations} }`)]).css).not.toContain(
      "data-pm-mjml-image-width",
    );
  });
  it("does not raise a non-important width above the native inline width", () => {
    const source = ".image table { width:100%; }";
    const result = scopeCss([stylesheet(source)]);
    expect(result.css).toBe(".pm-canvas-test " + source);
    expect(result.css).not.toContain("data-pm-mjml-image-width");
    expect(result.css).not.toContain("!important");
  });
  it("keeps root sibling filters and each adapter's declaration subset", () => {
    const result = scopeCss([
      stylesheet(
        "body + .image table, body ~ .host { width:100% !important; } .inset > table > tbody > tr > td, .image table { padding:24px; width:100% !important; }",
      ),
    ]);
    expect(result.notes).toHaveLength(2);
    expect(result.css).not.toContain(".host");
    const rules: Rule[] = [];
    postcss.parse(result.css).walkRules((rule) => {
      rules.push(rule);
    });
    expect(rules).toHaveLength(3);
    expect(
      rules
        .find((rule) => rule.selector.includes("data-pm-mjml-padding"))
        ?.nodes.map((node) => node.toString()),
    ).toEqual(["padding:24px"]);
    expect(
      rules
        .find((rule) => rule.selector.includes("data-pm-mjml-image-width"))
        ?.nodes.map((node) => node.toString()),
    ).toEqual(["width:100% !important"]);
  });
});
