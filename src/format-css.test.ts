import postcss, { type ChildNode } from "postcss";
import { describe, expect, it } from "vitest";
import { formatCss } from "./format-css";

function semantics(nodes: ChildNode[]): unknown[] {
  return nodes.map((node) => {
    switch (node.type) {
      case "decl":
        return {
          type: node.type,
          prop: node.prop,
          value: /^(?:box-shadow|text-shadow)$/i.test(node.prop)
            ? postcss.list.comma(node.value)
            : node.value,
          important: node.important,
        };
      case "comment":
        return { type: node.type, text: node.text };
      case "rule":
        return { type: node.type, selector: node.selector, nodes: semantics(node.nodes) };
      case "atrule":
        return {
          type: node.type,
          name: node.name,
          params: node.params,
          nodes: node.nodes && semantics(node.nodes),
        };
    }
  });
}

describe("CSS source formatting", () => {
  it("indents declarations and nested rules and is idempotent", () => {
    const source =
      ".card{color:red;padding:10px}@media(max-width:600px){.card{padding:0}.wide{display:none}}";
    const formatted = formatCss(source);
    expect(formatted).toBe(
      ".card {\n  color: red;\n  padding: 10px;\n}\n\n@media(max-width:600px) {\n  .card {\n    padding: 0;\n  }\n  .wide {\n    display: none;\n  }\n}\n",
    );
    expect(formatCss(formatted)).toBe(formatted);
  });

  it("preserves selectors, source order, comments, data URLs, custom properties, and declaration values", () => {
    const source =
      '/* keep */@import url("a,b.css");.a[data-x="a,b"]:is(.b,.c){--tokens:  {color:red;gap:2px}  ;color:red;color:blue!important;content:"a;{b}, c";background:url("data:image/svg+xml,%3Csvg%3E,a;b%3C/svg%3E");*width:99px;}@supports(display:grid){.x{display:grid}}/*# sourceMappingURL=style.css.map */';
    const formatted = formatCss(source);
    expect(semantics(postcss.parse(formatted).nodes)).toEqual(
      semantics(postcss.parse(source).nodes),
    );
    const before = postcss.parse(source);
    const after = postcss.parse(formatted);
    let beforeCustom = "";
    let afterCustom = "";
    before.walkDecls("--tokens", (decl) => {
      beforeCustom = decl.toString();
    });
    after.walkDecls("--tokens", (decl) => {
      afterCustom = decl.toString();
    });
    expect(afterCustom).toBe(beforeCustom);
    expect(formatted).toContain("*width: 99px;");
    expect(formatCss(formatted)).toBe(formatted);
  });

  it("puts shadow layers on separate lines without splitting functions, quotes, or comments", () => {
    const source =
      '.card{box-shadow:0 2px 4px rgba(0,0,0,.2),inset 0 0 2px var(--accent,rgb(1,2,3)) /* a,b */;text-shadow:0 0 1px var(--label,"a,b"),1px 1px red}';
    const formatted = formatCss(source);
    expect(formatted).toContain(
      "box-shadow:\n    0 2px 4px rgba(0,0,0,.2),\n    inset 0 0 2px var(--accent,rgb(1,2,3)) /* a,b */;",
    );
    expect(formatted).toContain('text-shadow:\n    0 0 1px var(--label,"a,b"),\n    1px 1px red;');
    expect(semantics(postcss.parse(formatted).nodes)).toEqual(
      semantics(postcss.parse(source).nodes),
    );
    expect(formatCss(formatted)).toBe(formatted);
  });

  it.each([
    ".card{color:",
    ".card{color:red",
    '.card{content:"unfinished}',
    "/* unfinished",
    "  \n",
  ])("keeps unfinished CSS exactly: %s", (source) => {
    expect(formatCss(source)).toBe(source);
  });
});
