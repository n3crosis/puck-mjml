import { Render, type Data } from "@puckeditor/core";
import { load } from "cheerio";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  alignmentCases,
  alignmentSource,
  applyImplicitColumns,
} from "../tests/browser/fixtures/native-column-alignment-source";
import { columnEditSource } from "../tests/browser/fixtures/native-column-edit-source";
import { createEmailConfig } from "./config";
import { compileEmail } from "./export";
import { fromMjml } from "./import";
import type { EmailBlock, EmailDocument, MjmlAttribute } from "./types";

beforeAll(() => vi.stubGlobal("window", globalThis));
afterAll(() => vi.unstubAllGlobals());
const attrs = (values: Record<string, string>): MjmlAttribute[] =>
  Object.entries(values).map(([name, value]) => ({ name, value }));
const render = (document: EmailDocument) =>
  load(
    renderToStaticMarkup(
      <Render config={createEmailConfig(undefined, true)} data={document as Data} />,
    ),
  );

// Browser tests are the geometry gate. These validate that its full source matrix
// compiles, retains each oracle probe, and uses the compiler's width/box contract.
describe("native inline column compiler contract", () => {
  it("compiles every alignment, baseline, gutter, direction and typography fixture", async () => {
    const cases = alignmentCases();
    const { document, warnings } = fromMjml(alignmentSource(cases));
    expect(warnings).toEqual([]);
    applyImplicitColumns(document, cases);
    const result = await compileEmail(document);
    expect(result.errors).toEqual([]);
    const canvas = render(document),
      compiled = load(result.html);
    expect(cases).toHaveLength(176);
    for (const entry of cases) {
      const row = canvas(`.${entry.id}`);
      expect(row.length, entry.id).toBe(1);
      expect(row.find(".pm-native-inline-column").length, entry.id).toBeGreaterThan(0);
      expect(row.find(".pm-native-column-table").length, entry.id).toBe(
        row.find(".pm-native-inline-column").length,
      );
      for (const column of row.find(".pm-native-inline-column").toArray()) {
        const name = canvas(column)
          .attr("class")!
          .split(" ")
          .find((name) => name.startsWith(entry.id + "-"))!;
        const native = compiled(`div.${name}`);
        expect(native.length, name).toBe(1);
        expect(canvas(column).css("vertical-align"), name).toBe(native.css("vertical-align"));
        const grouped = canvas(column).parents(".pm-native-inline-group").length > 0;
        if (grouped)
          expect(canvas(column).css("--pm-group-column-width"), name).toBe(native.css("width"));
        const width = canvas(column).css("width")!;
        const widthClass = native
          .attr("class")!
          .split(" ")
          .find((name) => /^mj-column-(px|per)-/.test(name))!;
        const compiledWidth = result.html.match(
          new RegExp(`\\.${widthClass} \\{ width:([^;]+) !important`),
        )?.[1];
        expect(width, name).toBe(compiledWidth);
        expect(canvas(column).css("--pm-native-desktop-width"), name).toBe(compiledWidth);
        expect(canvas(column).css("align-self"), name).toBeUndefined();
      }
    }
    for (const entry of cases.filter(
      (entry) => entry.id.startsWith("baseline-") && entry.id.includes("-default-"),
    )) {
      for (const $ of [canvas, compiled])
        expect($(`.${entry.id}-group`).css("vertical-align")).toBeUndefined();
    }
    expect(canvas("style[data-pm-css]").text() || canvas("style").text()).toContain(
      "vertical-align:baseline!important",
    );
  });

  it("keeps desktop width caps normal, scoped and before authored max-width overrides", async () => {
    const cases = alignmentCases().filter((entry) => entry.id.startsWith("desktop-cap-"));
    const { document } = fromMjml(alignmentSource(cases));
    const result = await compileEmail(document);
    expect(result.errors).toEqual([]);
    const canvas = render(document),
      compiled = load(result.html);
    const widthStyle = canvas("style[data-pm-native-widths]");
    const scope = widthStyle.attr("data-pm-native-widths");
    expect(widthStyle.text()).toBe(
      `@media (width >= 601px) {\n.${scope} .pm-native-inline-column,\n.${scope} .pm-native-inline-group { max-width: var(--pm-native-desktop-width); }\n}`,
    );
    const styles = canvas("style").toArray();
    expect(styles.indexOf(widthStyle[0])).toBeLessThan(
      styles.indexOf(canvas("style[data-pm-canvas-css]")[0]),
    );
    for (const kind of ["column", "group", "gutter"])
      for (const override of ["default", "override"]) {
        const name = `.desktop-cap-${kind}-${override}-a`;
        const width = kind === "gutter" ? "190px" : "200px";
        expect(canvas(name).css("--pm-native-desktop-width")).toBe(width);
        expect(canvas(name).css("max-width")).toBeUndefined();
        expect(compiled("head style").text()).toContain(
          `width:${width} !important; max-width: ${width};`,
        );
      }
    for (const $ of [canvas, compiled]) {
      expect($("style").text()).toMatch(/\.desktop-width-override\s*\{\s*max-width:260px;/);
      expect($("style").text()).toMatch(
        /\.desktop-width-flex\s*\{\s*width:calc\(100% - 178px\)!important; max-width:calc\(100% - 178px\);/,
      );
    }
  });

  it("keeps the editable geometry source valid and its placeholders inert", async () => {
    const { document } = fromMjml(columnEditSource());
    const compiled = await compileEmail(document, { allowRawHtml: true });
    expect(compiled.errors).toEqual([]);
    const canvas = render(document);
    expect(canvas(".editable-group").css("vertical-align")).toBe("top");
    expect(canvas(".pm-raw").length).toBe(2);
    expect(canvas(".pm-image-empty").length).toBe(1);
    expect(
      canvas(
        ".pm-native-content-table[data-pm-mjml-padding], .pm-native-content-cell[data-pm-mjml-padding-target]",
      ).length,
    ).toBe(0);
    expect(canvas(".pm-native-content-cell > .pm-text").length).toBeGreaterThan(0);
    expect(canvas(".pm-native-content-cell > .pm-raw").length).toBe(0);
    expect(
      canvas(".editor-affordances > .pm-native-inline-section .pm-native-inline-column").length,
    ).toBe(2);
    expect(canvas(".editor-affordances .pm-native-inline-column").first().css("width")).toBe(
      "47.777778%",
    );
  });

  it.each(["local", "root", "component", "class", "nested"] as const)(
    "routes %s native layout attributes with legacy siblings through one inline row",
    async (kind) => {
      const first: EmailBlock = {
        type: "Column",
        props: { id: "first", cssClass: "first", width: 50, content: [] },
      };
      const second: EmailBlock = {
        type: "Column",
        props: { id: "second", cssClass: "second", width: 50, content: [] },
      };
      const document: EmailDocument = {
        root: {
          props: {
            width: 600,
            sections: [{ type: "Section", props: { id: "section", columns: [first, second] } }],
          },
        },
        content: [],
      };
      if (kind === "local") first.props.mjmlAttributes = attrs({ "vertical-align": "middle" });
      if (["root", "component", "class"].includes(kind))
        first.props.mjmlAttributes = [{ name: "vertical-align", inherit: true }];
      if (kind === "root")
        document.root.props!.attributeDefaults = attrs({ "vertical-align": "middle" });
      if (kind === "component")
        document.root.props!.componentDefaults = [
          { tag: "mj-column", attributes: attrs({ "vertical-align": "middle" }) },
        ];
      if (kind === "class") {
        document.root.props!.mjmlClasses = [
          { name: "aligned", attributes: attrs({ "vertical-align": "middle" }) },
        ];
        first.props.mjClass = "aligned";
      }
      if (kind === "nested") {
        first.props.mjmlAttributes = attrs({ "vertical-align": "middle" });
        document.root.props!.sections![0].props.columns = [
          { type: "Group", props: { id: "group", width: 50, columns: [first] } },
          second,
        ];
      }
      const canvas = render(document);
      expect(canvas(".pm-native-inline-section").length).toBe(1);
      expect(canvas(".first.pm-native-inline-column").length).toBe(1);
      expect(canvas(".second.pm-native-inline-column").length).toBe(1);
      expect(canvas(".first").css("vertical-align")).toBe("middle");
      const result = await compileEmail(document);
      expect(result.errors).toEqual([]);
      expect(load(result.html)(".first").css("vertical-align")).toBe("middle");
    },
  );

  it("leaves attribute-free legacy layout rendering unchanged", () => {
    const document: EmailDocument = {
      root: {
        props: {
          sections: [
            {
              type: "Section",
              props: {
                id: "s",
                columns: [
                  {
                    type: "Column",
                    props: { id: "c", width: 50, verticalAlign: "middle", content: [] },
                  },
                ],
              },
            },
          ],
        },
      },
      content: [],
    };
    const canvas = render(document);
    expect(canvas(".pm-native-inline-section").length).toBe(0);
    expect(canvas(".pm-flex-column").css("flex-basis")).toBe("50%");
    expect(canvas(".pm-flex-column").css("align-self")).toBe("center");
  });
});
