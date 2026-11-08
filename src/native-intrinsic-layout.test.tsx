import { Render, type Data } from "@puckeditor/core";
import { load } from "cheerio";
import { readFileSync } from "node:fs";
import postcss from "postcss";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  intrinsicCases,
  intrinsicLayoutSource,
} from "../tests/browser/fixtures/native-intrinsic-layout-source";
import { createEmailConfig } from "./config";
import { compileEmail, toMjml } from "./export";
import { fromMjml } from "./import";
import { TableBlock } from "./TableBlock";
import type { TableProps } from "./table";
import { scopeDocumentCss } from "./canvas-css";

beforeAll(() => vi.stubGlobal("window", globalThis));
afterAll(() => vi.unstubAllGlobals());

describe("native intrinsic layout", () => {
  it("uses column-local intrinsic tables only for authored auto widths", async () => {
    const { document, warnings } = fromMjml(intrinsicLayoutSource());
    expect(warnings).toEqual([]);
    const original = toMjml(document);
    const canvas = load(
      renderToStaticMarkup(<Render config={createEmailConfig()} data={document as Data} />),
    );
    const result = await compileEmail(document);
    expect(result.errors).toEqual([]);
    const compiled = load(result.html);
    for (const id of intrinsicCases) {
      expect(canvas(`.${id}-group.pm-native-inline-group`)).toHaveLength(1);
      expect(canvas(`.${id}-label.pm-native-inline-column`)).toHaveLength(1);
      expect(canvas(`.${id}-label`).css("--pm-native-table-layout")).toBe("fixed");
      expect(canvas(`.${id}-symbol`).css("--pm-native-table-layout")).toBe("fixed");
      expect(compiled(`.${id}-label > table`).css("table-layout")).toBeUndefined();
      expect(canvas(`.${id}-label .pm-native-column-table`)).toHaveLength(1);
      expect(canvas(`.${id}-label .pm-native-content-table`)).toHaveLength(1);
    }
    const css = postcss.parse(readFileSync(new URL("./style.css", import.meta.url), "utf8"));
    for (const selector of [".pm-native-column-table", ".pm-native-content-table"]) {
      let layout: string | undefined;
      css.walkRules((rule) => {
        if (rule.selectors.includes(selector))
          rule.walkDecls("table-layout", (decl) => {
            layout = decl.value;
          });
      });
      expect(layout).toBe("var(--pm-native-table-layout, fixed)");
    }
    expect(canvas("style[data-pm-canvas-css]").text()).toContain(
      "--pm-native-table-layout:auto!important",
    );
    expect(result.html).not.toContain("--pm-native-table-layout");
    expect(toMjml(document)).toBe(original);
  });

  it("mirrors auto and definite width cascade without expanding unrelated columns", () => {
    const source = `.intrinsic { width:auto!important; }
      .intrinsic { width:120px!important; width:auto; }
      @media (max-width:400px) { .intrinsic { width:75%!important; } }
      body + .outside { width:auto!important; }`;
    const result = scopeDocumentCss([{ css: source }], { scope: "pm-test" });
    const root = postcss.parse(result.css);
    const mirrors: {
      selector: string;
      value: string;
      important: boolean;
      media?: string;
    }[] = [];
    root.walkDecls("--pm-native-table-layout", (decl) => {
      const rule = decl.parent as postcss.Rule;
      mirrors.push({
        selector: rule.selector,
        value: decl.value,
        important: Boolean(decl.important),
        media: rule.parent?.type === "atrule" ? rule.parent.params : undefined,
      });
    });
    expect(mirrors.map(({ value, important }) => [value, important])).toEqual([
      ["auto", true],
      ["fixed", true],
      ["auto", false],
      ["fixed", true],
    ]);
    expect(mirrors[3].media).toBe("(max-width:400px)");
    const dom = load(
      '<div class="pm-test"><div id="column" class="intrinsic pm-native-inline-column"></div><div id="group" class="intrinsic pm-native-inline-group"></div><div id="ordinary" class="intrinsic"></div></div><div id="host" class="intrinsic pm-native-inline-column"></div>',
    );
    expect(
      dom(mirrors[0].selector)
        .toArray()
        .map((node) => dom(node).attr("id")),
    ).toEqual(["column"]);
    expect(result.css).not.toContain(".outside");
    expect(
      scopeDocumentCss([{ css: ".ordinary {width:100%!important;}" }], { scope: "pm-test" }).css,
    ).not.toContain("--pm-native-table-layout");
  });

  it.each([
    ".intrinsic { width:var(--width)!important; }",
    ":root { --width:auto; } .intrinsic { width:var(--width, 120px)!important; }",
    ".intrinsic { width:calc(100% - 10px)!important; }",
    ".intrinsic { width:inherit!important; }",
    ".intrinsic { width:initial!important; }",
    ".intrinsic { width:unset!important; }",
    ".intrinsic { width:revert!important; }",
    ".intrinsic { width:revert-layer!important; }",
    ".intrinsic { width:-1px!important; }",
    ".intrinsic { width:12unknown!important; }",
    ".intrinsic { width:not-a-width!important; }",
    String.raw`.intrinsic { w\69 dth:120px!important; }`,
    String.raw`.intrinsic { width:\61uto!important; }`,
    ".intrinsic, :unknown-pseudo { width:120px!important; }",
    ".intrinsic, .other::before { width:120px!important; }",
    ".intrinsic[data-size] { width:120px!important; }",
    ".intrinsic > { width:120px!important; }",
    ".intrinsic + { width:120px!important; }",
    ".intrinsic ~ { width:120px!important; }",
    ".unrelated { all:unset!important; }",
    ".parent { & .intrinsic { width:120px!important; } }",
    "@keyframes resize { to { width:120px; } }",
  ])("keeps fixed containment when sizing cannot be mirrored safely: %s", (css) => {
    const result = scopeDocumentCss([{ css: ".intrinsic { width:auto!important; }" }, { css }], {
      scope: "pm-test",
    });
    expect(result.css).not.toContain("--pm-native-table-layout");
    expect(result.css).toContain("width:auto!important");
    expect(result.notes).toContain(
      "Custom CSS uses unsupported width selectors/values, nesting, animations, or all resets; intrinsic native-column sizing stays constrained on the canvas.",
    );
  });

  it("recognizes case-insensitive width keywords without strengthening selectors", () => {
    const result = scopeDocumentCss(
      [{ css: ".parent > DIV.intrinsic, #specific { WIDTH: AUTO !important; }" }],
      { scope: "pm-test" },
    );
    expect(result.css).toContain("--pm-native-table-layout: auto !important");
    expect(result.css).toContain(
      ".pm-test .parent > DIV.intrinsic:where(.pm-native-inline-column)",
    );
    expect(result.css).toContain(".pm-test #specific:where(.pm-native-inline-column)");
    expect(result.notes).toEqual([]);
  });

  it.each([false, true])("marks only markup-free native cells while editing=%s", (isEditing) => {
    const { document } = fromMjml(intrinsicLayoutSource());
    const source = document.root.props!.sections![0].props.columns as {
      props: { content: { props: TableProps }[] };
    }[];
    const table = source[0].props.content[0].props;
    const original = toMjml(document);
    const canvas = load(
      renderToStaticMarkup(<TableBlock {...table} source={table} puck={{ isEditing }} />),
    );
    expect(canvas(".pm-imported-empty-cell")).toHaveLength(1);
    expect(canvas("tr").eq(0).find("td").eq(1).find(".pm-imported-empty-cell")).toHaveLength(1);
    expect(canvas("tr").eq(1).find("td").eq(1).find("p > br")).toHaveLength(1);
    expect(canvas("tr").eq(2).find("td").eq(1).find("br")).toHaveLength(1);
    expect(toMjml(document)).toBe(original);

    table.bodyRows![0].cells[1].content = "<p>Typed</p>";
    const changed = load(
      renderToStaticMarkup(<TableBlock {...table} source={table} puck={{ isEditing }} />),
    );
    expect(changed(".pm-imported-empty-cell")).toHaveLength(0);
    expect(changed("tr").eq(0).find("td").eq(1).text()).toBe("Typed");
    expect(toMjml(document)).toContain(">Typed</td>");
  });

  it("uses raw source to classify an empty mapped rich-text editor and retains explicit empty markup", () => {
    const source: TableProps = {
      bodyRows: [
        {
          cells: [
            { native: true, content: "", importedRichText: { source: "", baseline: "" } },
            {
              native: true,
              content: "<p></p>",
              importedRichText: { source: "<p></p>", baseline: "<p></p>" },
            },
            {
              native: true,
              content: '<p style="text-align:center"></p>',
              importedRichText: {
                source: '<p style="text-align:center"></p>',
                baseline: '<p style="text-align:center"></p>',
              },
            },
            ...["\u00a0", "&nbsp;", "\u2003", "&emsp;"].map((source) => ({
              native: true as const,
              content: source,
              importedRichText: { source, baseline: source },
            })),
          ],
        },
      ],
    };
    const mapped: TableProps = {
      ...source,
      bodyRows: [
        {
          cells: source.bodyRows![0].cells.map((cell) => ({
            ...cell,
            content: (
              <div contentEditable>
                <p>
                  <br />
                </p>
              </div>
            ),
          })),
        },
      ],
    };
    const canvas = load(
      renderToStaticMarkup(<TableBlock {...mapped} source={source} puck={{ isEditing: true }} />),
    );
    expect(canvas(".pm-imported-empty-cell")).toHaveLength(1);
    expect(canvas("[contenteditable]")).toHaveLength(7);
    for (let index = 1; index < 7; index++)
      expect(canvas("td").eq(index).find(".pm-imported-empty-cell")).toHaveLength(0);
    const readOnly = load(renderToStaticMarkup(<TableBlock {...source} source={source} />));
    expect(readOnly("td").eq(3).text()).toBe("\u00a0");
    expect(readOnly("td").eq(4).text()).toBe("\u00a0");
    expect(readOnly("td").eq(5).text()).toBe("\u2003");
    expect(readOnly("td").eq(6).text()).toBe("\u2003");
  });
});
