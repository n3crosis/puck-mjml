import { load } from "cheerio";
import postcss from "postcss";
import { describe, expect, it } from "vitest";
import { scopeDocumentCss } from "./canvas-css";

const scope = "pm-canvas-test";
const apply = (css: string) => scopeDocumentCss([{ css }], { scope });
const scopedSelector = (selector: string) =>
  (postcss.parse(apply(`${selector} { color:red; }`).css).first as postcss.Rule).selector;

// Each shim's universal arm matches every element. Its other, fixed arm
// contributes exactly the removed root token's CSS specificity.
const mappings = [
  [":root div", `.${scope}:is(:root, *) div`],
  ["html div", `.${scope}:is(html, *) div`],
  ["body .wide", `.${scope}:is(body, *) .wide`],
  ["html body .wide", `.${scope}:is(html, *):is(body, *) .wide`],
  ["html > body .wide", `.${scope}:is(html, *):is(body, *) .wide`],
  [":root body .wide", `.${scope}:is(:root, *):is(body, *) .wide`],
  [":root > body .wide", `.${scope}:is(:root, *):is(body, *) .wide`],
  ["body[dir=rtl] > .wide", `.${scope}:is(body, *)[dir=rtl] > .wide`],
  [":root:is(.x, .y) .wide", `.${scope}:is(:root, *):is(.x, .y) .wide`],
  [":root:not(.absent) div", `.${scope}:is(:root, *):not(.absent) div`],
  ['body[title="a, b"] .wide', `.${scope}:is(body, *)[title="a, b"] .wide`],
  [":root::before", `.${scope}:is(:root, *)::before`],
  ["body:before", `.${scope}:is(body, *):before`],
  ["html > body::after", `.${scope}:is(html, *):is(body, *)::after`],
  ["body .wide::first-line", `.${scope}:is(body, *) .wide::first-line`],
  [":root:unknown-pseudo div", `.${scope}:is(:root, *):unknown-pseudo div`],
];

describe("root selector specificity", () => {
  it.each(mappings)("preserves root tokens without wrapping the suffix: %s", (source, output) => {
    expect(scopedSelector(source)).toBe(output);
  });

  it("does not change ordinary selectors or combine selector-list specificity", () => {
    expect(scopedSelector(":root div, .wide, div, *")).toBe(
      `.${scope}:is(:root, *) div, .${scope} .wide, .${scope} div, .${scope} *`,
    );
    expect(apply(":root div { max-width:250px } .wide { max-width:150px }").css).toBe(
      `.${scope}:is(:root, *) div { max-width:250px } .${scope} .wide { max-width:150px }`,
    );
  });

  it.each([
    [":root div", `.${scope} div`],
    ["body .wide", `.${scope} .wide`],
    ["html body .wide", `.${scope} .wide`],
    ['body[dir="rtl"] > .wide', `.${scope}[dir="rtl"] > .wide`],
    [":root div:has(> span)", `.${scope} div:has(> span)`],
    [":root > .wide + div", `.${scope} > .wide + div`],
  ])("keeps the previous target set for %s", (source, previous) => {
    const $ = load(`<div id="host" class="wide"></div>
      <div class="${scope}" dir="rtl"><div id="direct" class="wide"><span></span></div>
        <div id="nested-root" class="pm-canvas pm-canvas-inner"><div id="nested" class="wide"></div></div>
      </div><div class="pm-canvas-other"><div id="other" class="wide"></div></div>`);
    const ids = (selector: string) =>
      $(selector)
        .toArray()
        .map((node) => $(node).attr("id"));
    expect(ids(scopedSelector(source))).toEqual(ids(previous));
    expect(ids(scopedSelector(source))).not.toContain("host");
    expect(ids(scopedSelector(source))).not.toContain("other");
  });

  it("documents the unchanged nested-editor boundary rather than promising containment", () => {
    const $ = load(
      `<div class="${scope}"><div class="pm-canvas-inner"><div id="inner" class="wide"></div></div></div>`,
    );
    expect($(scopedSelector(":root .wide")).attr("id")).toBe("inner");
  });

  it.each([
    "html.theme body .wide",
    "html[lang=en] body[dir=rtl] .wide",
    "body html .wide",
    "html + body .wide",
  ])("leaves unsupported root chains bounded and reports their limitation: %s", (selector) => {
    const result = apply(`${selector} { color:red; }`);
    expect(result.css).not.toContain(":is(");
    expect(result.notes).toHaveLength(1);
    expect(result.notes[0]).toContain("does not preserve specificity");
  });

  it.each([":where(:root) div", ":is(:root, body) div", "body#id .wide"])(
    "does not broaden existing root recognition for %s",
    (selector) => expect(scopedSelector(selector)).toBe(`.${scope} ${selector}`),
  );

  it.each(["body + .host", ":root[dir=rtl] ~ .host", "html > body + .host"])(
    "still drops a root sibling selector: %s",
    (selector) => {
      const result = apply(`${selector} { color:red; }`);
      expect(result.css).toBe("");
      expect(result.notes[0]).toContain("outside the canvas");
    },
  );

  it("keeps namespaces, conditional groups, bridges, and source data independent", () => {
    const sheets = [
      {
        css: "@font-face { font-family:Local; src:url(font.woff2) } @keyframes pulse { from { opacity:0 } } @media (min-width:601px) { :root div { animation:pulse 1s; font-family:Local; } .inset > table > tbody > tr > td { padding:2px } .image table { width:100%!important } }",
      },
    ];
    const before = JSON.stringify(sheets);
    const result = scopeDocumentCss(sheets, { scope });
    expect(result.css).toContain(`@keyframes ${scope}-pulse`);
    expect(result.css).toContain(`font-family:"Local-${scope}"`);
    expect(result.css).toContain(`.${scope}:is(:root, *) div`);
    expect(result.css).toContain("data-pm-mjml-padding");
    expect(result.css).toContain("data-pm-mjml-image-width");
    expect(JSON.stringify(sheets)).toBe(before);
  });
});

describe("bounded canvas nesting", () => {
  it.each([
    ".child",
    "> .child",
    ".first + .peer",
    "&",
    "&:hover",
    "&[dir=rtl]",
    "&:is(.a, .b) > .child",
    "& > .child",
    "& .first ~ .peer",
    "&::before",
    '&[title="a,b"] > .child',
    ":is(.child, .other)",
    ".child:not(.absent)",
  ])("retains contained nesting: %s", (selector) => {
    const result = apply(`:root { ${selector} { --retained:yes; } }`);
    expect(result.css).toContain(`${selector} { --retained:yes; }`);
    expect(result.notes).toEqual([]);
  });

  it.each([
    "& + .host",
    "& ~ .host",
    "+ .host",
    "~ .host",
    "&:hover + .host",
    '&[title="a,b"] ~ .host',
    "&:is(.a, .b) + .host",
    ":is(&, .host)",
    ":not(&)",
    ".ancestor &",
    "& &",
    "&:is(&, .host)",
    '[title="&"]',
    '&[title="&"]',
    String.raw`.escaped\&`,
    String.raw`&.escaped\+ + .host`,
    "|| .host",
    "& || .host",
    "&/**/+ .host",
    "&/* comment */ > .child",
    ".child/* comment */ .grandchild",
    '&[title="a/*b"]',
    "&:is([)] > .child",
    "& > + .host",
    ".safe, & + .host",
    ".safe,",
    ", .safe",
    ".safe,, .other",
  ])("rejects the whole unsupported nested selector list: %s", (selector) => {
    const result = apply(`:root { ${selector} { --rejected:yes; } .kept { color:blue; } }`);
    expect(result.css).not.toContain("--rejected");
    expect(result.css).toContain(".kept { color:blue; }");
    expect(result.notes.some((note) => note.includes("canvas-safe nesting subset"))).toBe(true);
  });

  it.each([
    "media (min-width:1px)",
    "supports (display:block)",
    "container (min-width:1px)",
    "layer nested",
  ])("checks nested rules recursively through @%s", (group) => {
    const result = apply(
      `:root { @${group} { & + .host { --rejected:yes; } & > .kept { color:blue; } } }`,
    );
    expect(result.css).not.toContain("--rejected");
    expect(result.css).toContain("& > .kept { color:blue; }");
    expect(result.notes.some((note) => note.includes("canvas-safe nesting subset"))).toBe(true);
  });

  it("checks nesting below safe parents and nested layers/conditionals", () => {
    const result = apply(
      ".card { .child { @layer x { @supports (display:block) { :is(&, .host) { --rejected:yes; } } } & > .kept { color:blue; } } }",
    );
    expect(result.css).not.toContain("--rejected");
    expect(result.css).toContain("& > .kept");
  });

  it.each(["starting-style", "scope (.host)"])("keeps unsupported @%s rules dropped", (group) => {
    const result = apply(`:root { @${group} { & + .host { --rejected:yes; } } }`);
    expect(result.css).not.toContain("--rejected");
    expect(result.notes[0]).toContain("unsupported @");
  });

  it("does not treat keyframe steps or font faces as nested selectors", () => {
    const result = apply(
      ":root { @keyframes fade { from { opacity:0; } 50%, to { opacity:1; } } @font-face { font-family:Local; src:url(font.woff2); } & > .child { animation:fade 1s; font-family:Local; } }",
    );
    expect(result.css).toContain(`@keyframes ${scope}-fade`);
    expect(result.css).toContain("50%, to { opacity:1; }");
    expect(result.css).toContain(`font-family:"Local-${scope}"`);
    expect(result.notes).toEqual([]);
  });

  it("retains parse-failure behavior and independent valid stylesheets", () => {
    const result = scopeDocumentCss(
      [{ css: ":root { .bad[ { color:red; } }" }, { css: ".good { color:blue; }" }],
      { scope },
    );
    expect(result.css).not.toContain("color:red");
    expect(result.css).toContain(`.${scope} .good`);
    expect(result.notes[0]).toContain("could not be parsed");
  });
});
