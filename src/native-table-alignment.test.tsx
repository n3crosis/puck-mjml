import { Render, type Data } from "@puckeditor/core";
import { load } from "cheerio";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createEmailConfig } from "./config";
import { compileEmail, toMjml } from "./export";
import { fromMjml } from "./import";
import { TableBlock } from "./TableBlock";
import { renderTableContent, type TableRow } from "./table";

beforeAll(() => vi.stubGlobal("window", globalThis));
afterAll(() => vi.unstubAllGlobals());

describe("native table wrapper alignment", () => {
  it.each(["left", "center", "right"])(
    "mirrors compiled outer-cell %s without overriding authored cells",
    async (align) => {
      const { document, warnings } = fromMjml(
        `<mjml><mj-body><mj-section text-align="center"><mj-column padding="0px"><mj-table css-class="summary" align="${align}"><tr><th>Heading</th><td>Inherited</td><td style="text-align:right">Right</td><td style="text-align:center"><strong>Centered cell</strong></td></tr></mj-table></mj-column></mj-section></mj-body></mjml>`,
      );
      expect(warnings).toEqual([]);
      const original = toMjml(document);
      const canvas = load(
        renderToStaticMarkup(<Render config={createEmailConfig()} data={document as Data} />),
      );
      const result = await compileEmail(document);
      expect(result.errors).toEqual([]);
      const compiled = load(result.html);
      expect(compiled("td.summary").attr("align")).toBe(align);
      // A CSS text-align value does not have the same TH inheritance semantics
      // as the compiler's HTML align presentation hint.
      expect(canvas("div.summary").attr("align")).toBe(compiled("td.summary").attr("align"));
      expect(canvas("div.summary").attr("style") ?? "").not.toContain("text-align");
      expect(canvas(".summary td").eq(0).attr("style") ?? "").not.toContain("text-align");
      expect(canvas(".summary th").attr("style") ?? "").not.toContain("text-align");
      expect(canvas(".summary td").eq(1).attr("style")).toContain("text-align:right");
      expect(canvas(".summary td").eq(2).attr("style")).toContain("text-align:center");
      expect(canvas(".summary strong").text()).toBe("Centered cell");
      expect(toMjml(document)).toBe(original);
    },
  );
  it("uses MJML's default or class-inherited table alignment instead of section center", async () => {
    const { document } = fromMjml(
      `<mjml><mj-head><mj-attributes><mj-class name="right" align="right" /></mj-attributes></mj-head><mj-body><mj-section text-align="center"><mj-column><mj-table css-class="default"><tr><td>Default</td></tr></mj-table><mj-table css-class="inherited" mj-class="right"><tr><td>Inherited</td></tr></mj-table></mj-column></mj-section></mj-body></mjml>`,
    );
    const canvas = load(
      renderToStaticMarkup(<Render config={createEmailConfig()} data={document as Data} />),
    );
    const compiled = load((await compileEmail(document)).html);
    for (const [name, align] of [
      ["default", "left"],
      ["inherited", "right"],
    ]) {
      expect(compiled(`td.${name}`).attr("align")).toBe(align);
      expect(canvas(`div.${name}`).attr("align")).toBe(align);
      expect(canvas(`div.${name}`).attr("style") ?? "").not.toContain("text-align");
    }
  });
  it("leaves the visual-only wrapper and explicit cell styles unchanged", () => {
    const canvas = load(
      renderToStaticMarkup(
        <TableBlock
          align="right"
          bodyRows={[
            {
              cells: [
                { content: "<p>Left cell</p>", align: "left" },
                { content: "<p>Right cell</p>", align: "right" },
              ],
            },
          ]}
        />,
      ),
    );
    expect(canvas("body > div").attr("style") ?? "").not.toContain("text-align");
    expect(canvas("body > div").attr("align")).toBeUndefined();
    expect(canvas("td").eq(0).attr("style")).toContain("text-align:left");
    expect(canvas("td").eq(1).attr("style")).toContain("text-align:right");
  });

  it.each([false, true])(
    "keeps header defaults and explicit cell alignment separate while editing=%s",
    (isEditing) => {
      const bodyRows: TableRow[] = [
        {
          cells: [
            { content: "<strong>Heading</strong>", header: true, native: true },
            { content: "Left heading", header: true, native: true, align: "left" },
            { content: "Right data", native: true, align: "right" },
            { content: "Inherited data", native: true },
          ],
        },
      ];
      const source = renderTableContent({ bodyRows });
      const canvas = load(
        renderToStaticMarkup(
          <TableBlock
            nativeAttributes={{ align: "right", padding: "0px" }}
            puck={{ isEditing }}
            bodyRows={bodyRows}
            importedTableContent={{ source, baseline: source }}
          />,
        ),
      );
      expect(canvas("body > div").attr("align")).toBe("right");
      expect(canvas("table").hasClass("pm-native-table")).toBe(true);
      expect(canvas("body > div").attr("style") ?? "").not.toContain("text-align");
      expect(canvas("th").eq(0).attr("style") ?? "").not.toContain("text-align");
      expect(canvas("th").eq(1).attr("style")).toContain("text-align:left");
      expect(canvas("td").eq(0).attr("style")).toContain("text-align:right");
      expect(canvas("td").eq(1).attr("style") ?? "").not.toContain("text-align");
      expect(canvas("th strong").text()).toBe("Heading");
    },
  );

  it("does not inline over authored wrapper/header CSS or direction", async () => {
    const { document, warnings } = fromMjml(
      `<mjml><mj-head><mj-style>.summary { text-align:right; direction:rtl; } .summary th { text-align:left; }</mj-style></mj-head><mj-body><mj-section><mj-column><mj-table css-class="summary" align="center"><tr><th>Heading</th><td>Data</td></tr></mj-table></mj-column></mj-section></mj-body></mjml>`,
    );
    expect(warnings).toEqual([]);
    const original = toMjml(document);
    const canvas = load(
      renderToStaticMarkup(<Render config={createEmailConfig()} data={document as Data} />),
    );
    const result = await compileEmail(document);
    expect(result.errors).toEqual([]);
    const compiled = load(result.html);
    expect(canvas("div.summary").attr("align")).toBe(compiled("td.summary").attr("align"));
    for (const tree of [canvas, compiled]) {
      expect(tree(".summary").attr("style") ?? "").not.toMatch(/text-align|direction/);
      expect(tree(".summary th").attr("style") ?? "").not.toContain("text-align");
      expect(tree("style").text()).toContain("text-align:right");
      expect(tree("style").text()).toContain("direction:rtl");
      expect(tree("style").text()).toContain("text-align:left");
    }
    expect(toMjml(document)).toBe(original);
  });
});
