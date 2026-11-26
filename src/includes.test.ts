import { expect, it } from "vitest";
import { resolveMjmlIncludes } from "./includes";
import { fromMjml } from "./import";
import { compileEmail } from "./export";

it("expands nested virtual files and hoists included document heads and CSS", async () => {
  const source = '<mjml><mj-body><mj-include path="parts/page.mjml"/></mj-body></mjml>';
  const expanded = resolveMjmlIncludes(source, {
    "parts/page.mjml":
      '<mjml><mj-head><mj-title>Included title</mj-title></mj-head><mj-body><mj-section><mj-column><mj-include path="../text.mjml"/><mj-include path="../style.css" type="css" css-inline="inline"/><mj-include path="../footer.html" type="html"/></mj-column></mj-section></mj-body></mjml>',
    "text.mjml": "<mj-text>Hello <br>world</mj-text>",
    "style.css": ".test { color: red; }",
    "footer.html": "<strong>Footer</strong>",
  });
  expect(expanded).toContain('<mj-style inline="inline">.test { color: red; }</mj-style>');
  expect(expanded).toContain("<mj-title>Included title</mj-title>");
  expect(expanded).toContain("<mj-raw><strong>Footer</strong></mj-raw>");
  expect(expanded).not.toContain("mj-include");
  const imported = fromMjml(expanded);
  const result = await compileEmail(imported.document, { allowRawHtml: true });
  expect(result.errors).toEqual([]);
  expect(result.html).toContain("Footer");
});

it("leaves ending-tag content and comments opaque and permits repeated includes", () => {
  const source =
    '<mjml><mj-body><mj-text><mj-include path="missing"/></mj-text><!-- <mj-include path="missing"/> --><mj-include path="a"/><mj-include path="a"/></mj-body></mjml>';
  expect(resolveMjmlIncludes(source, { a: "<mj-spacer/>" })).toBe(
    source.replaceAll('<mj-include path="a"/>', "<mj-spacer/>"),
  );
});

it("treats every compiler ending tag as opaque", () => {
  const source =
    '<mjml><mj-body><mj-hero><mj-carousel><mj-carousel-image src="https://example.com/a.png"><mj-include path="missing"/></mj-carousel-image></mj-carousel></mj-hero></mj-body></mjml>';
  expect(resolveMjmlIncludes(source, {})).toBe(source);
});

it("rejects missing files, cycles, escapes, unsupported types and oversized expansion", () => {
  const include = (path: string, type = "") =>
    `<mjml><mj-body><mj-include path="${path}" ${type}/></mj-body></mjml>`;
  expect(() => resolveMjmlIncludes(include("missing"), {})).toThrow("Missing");
  expect(() => resolveMjmlIncludes(include("a"), { a: '<mj-include path="a"/>' })).toThrow(
    "Circular",
  );
  for (const path of ["../secret", "/etc/passwd", "https://host/a", "a\\b", "%2e%2e/a"])
    expect(() => resolveMjmlIncludes(include(path), {})).toThrow();
  expect(() => resolveMjmlIncludes(include("a", 'type="other"'), { a: "" })).toThrow("Unsupported");
  expect(() =>
    resolveMjmlIncludes(include("a", 'type="html"'), { a: "</mj-raw><mj-text>escape" }),
  ).toThrow("boundary");
  for (const [type, value] of [
    ["html", "<p>x</p></mj-column></mj-section><mj-section><mj-column><mj-button>escape"],
    ["html", "</MJ-BODY ><mj-body>escape"],
    ["css", ".a{}</mj-head><mj-body><mj-section><mj-column><mj-text>escape"],
    ["css", ".a{}</mj-style >"],
  ])
    expect(() => resolveMjmlIncludes(include("a", `type="${type}"`), { a: value })).toThrow(
      "boundary",
    );
  expect(
    resolveMjmlIncludes(include("a", 'type="html"'), {
      a: "<p>a</p><mj-text-like></mj-text-like>",
    }),
  ).toContain("<mj-raw><p>a</p><mj-text-like></mj-text-like></mj-raw>");
  expect(() => resolveMjmlIncludes(include("a"), { a: "x".repeat(10 * 1024 * 1024) })).toThrow(
    "limit",
  );
});

it("decodes include paths and appends CSS to empty or existing heads", () => {
  for (const head of ["<mj-head/>", "<mj-head><mj-title>Existing</mj-title></mj-head>"]) {
    const source = `<mjml>${head}<mj-body><mj-include path="a&amp;b.css" type="css"/></mj-body></mjml>`;
    const result = resolveMjmlIncludes(source, { "a&b.css": "a { color: red; }" });
    expect(result).toContain("<mj-style>a { color: red; }</mj-style></mj-head>");
    expect(result).not.toContain("mj-include");
  }
});

it("preserves nested head precedence and defers CSS includes within their own document", () => {
  const result = resolveMjmlIncludes(
    '<mjml><mj-body><mj-include path="parent"/></mj-body></mjml>',
    {
      parent:
        '<mjml><mj-head><mj-style>.x { color: red; }</mj-style><mj-include path="last.css" type="css"/></mj-head><mj-body><mj-include path="child"/></mj-body></mjml>',
      child:
        "<mjml><mj-head><mj-style>.x { color: blue; }</mj-style></mj-head><mj-body><mj-section/></mj-body></mjml>",
      "last.css": ".x { color: green; }",
    },
  );
  expect(result.indexOf("red")).toBeLessThan(result.indexOf("blue"));
  expect(result.indexOf("blue")).toBeLessThan(result.indexOf("green"));
});

it("inserts an included head before subsequent head nodes", () => {
  const result = resolveMjmlIncludes(
    '<mjml><mj-head><mj-include path="header"/><mj-title>After</mj-title></mj-head><mj-body/></mjml>',
    {
      header: "<mjml><mj-head><mj-title>Before</mj-title></mj-head><mj-body/></mjml>",
    },
  );
  expect(result).toBe(
    "<mjml><mj-head><mj-title>Before</mj-title><mj-title>After</mj-title></mj-head><mj-body/></mjml>",
  );
});

it("bounds element nesting in source and included files", () => {
  const nested = "<mj-wrapper>".repeat(130) + "</mj-wrapper>".repeat(130);
  const wrap = (content: string) => `<mjml><mj-body>${content}</mj-body></mjml>`;
  expect(() => resolveMjmlIncludes(wrap(nested), {})).toThrow(
    "MJML include nesting limit exceeded",
  );
  expect(() => resolveMjmlIncludes(wrap('<mj-include path="nested"/>'), { nested })).toThrow(
    "MJML include nesting limit exceeded",
  );
  const opaque = wrap(`<mj-raw>${nested}</mj-raw>`);
  expect(resolveMjmlIncludes(opaque, {})).toBe(opaque);
});
