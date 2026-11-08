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

beforeAll(() => vi.stubGlobal("window", globalThis));
afterAll(() => vi.unstubAllGlobals());

describe("native intrinsic layout", () => {
  it("keeps auto-width groups and columns on the compiler's automatic table layout", async () => {
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
      expect(canvas(`.${id}-label.pm-native-inline-column.intrinsic-auto`)).toHaveLength(1);
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
      expect(layout).toBe("auto");
    }
    expect(toMjml(document)).toBe(original);
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
