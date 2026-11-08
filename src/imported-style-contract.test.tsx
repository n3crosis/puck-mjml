import { Render, type Data } from "@puckeditor/core";
import { load } from "cheerio";
import { Window } from "happy-dom";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { importedRichContentSource } from "../tests/browser/fixtures/imported-rich-content-source";
import { createEmailConfig } from "./config";
import { compileEmail, toMjml } from "./export";
import { fromMjml } from "./import";
import { descendants } from "./templates/test-support";
import type { TableRow } from "./table";

beforeAll(() => vi.stubGlobal("window", globalThis));
afterAll(() => vi.unstubAllGlobals());

describe.each([false, true])("imported content style contract, roundtrip: %s", (roundTrip) => {
  it("preserves scoped label/value CSS and normal word breaking in editable intrinsic tables", async () => {
    const input = roundTrip
      ? toMjml(fromMjml(importedRichContentSource).document)
      : importedRichContentSource;
    const imported = fromMjml(input);
    expect(imported.warnings).toEqual([]);
    const table = descendants(imported.document.root.props!.sections!).find(
      ({ type }) => type === "Table",
    )!;
    expect(table).toBeDefined();
    expect(table.props.htmlContent).toBeUndefined();
    const compiled = await compileEmail(imported.document);
    expect(compiled.errors).toEqual([]);
    const native = renderToStaticMarkup(
      <Render config={createEmailConfig()} data={imported.document as Data} />,
    );
    for (const html of [compiled.html, native]) {
      const window = new Window({
        settings: { disableCSSFileLoading: true, enableImageFileLoading: false },
      });
      window.document.write(html);
      const wrapper = window.document.querySelector(".details")!;
      const renderedTable = wrapper.querySelector("table")!;
      expect(window.getComputedStyle(renderedTable).tableLayout).toBe("auto");
      const cells = wrapper.querySelectorAll("td");
      expect(cells).toHaveLength(2);
      for (const cell of cells) {
        // MJML's surrounding text cell uses break-word; an authored normal
        // reset must survive, because it changes the table's min-content width.
        expect(window.getComputedStyle(cell).wordBreak).toBe("normal");
        const paragraphs = cell.querySelectorAll("p");
        expect(window.getComputedStyle(paragraphs[0]).fontSize).toBe("10px");
        for (const value of [...paragraphs].slice(1))
          expect(window.getComputedStyle(value).fontSize).toBe("12px");
      }
      await window.happyDOM.close();
    }
    const rows = table.props.bodyRows as TableRow[];
    rows[0].cells[0].content = String(rows[0].cells[0].content).replace(
      "First value",
      "Edited value",
    );
    const edited = await compileEmail(imported.document);
    expect(edited.errors).toEqual([]);
    expect(load(edited.html)(".details").text()).toContain("Edited value");
    expect(edited.mjml).not.toMatch(/<mj-(?:raw|include)\b/);
  });

  it("retains heading inheritance, inline emphasis and button gradients without leaking CSS", async () => {
    const source = `<mjml><mj-head><mj-style inline="inline">
      .heading h2 { margin:0; font-family:inherit; font-size:inherit; font-weight:inherit; line-height:inherit; color:inherit; }
      .heading em { display:block; font-size:19px; font-style:normal; }
      .gradient a, .gradient td { background-image:linear-gradient(#334455,#778899); }
    </mj-style></mj-head><mj-body><mj-section><mj-column>
      <mj-text css-class="heading" font-size="24px" color="#333333"><h2>A heading <em>With emphasis</em></h2></mj-text>
      <mj-button css-class="gradient" background-color="#334455" href="https://example.com/">Continue</mj-button>
    </mj-column></mj-section></mj-body></mjml>`;
    const document = fromMjml(roundTrip ? toMjml(fromMjml(source).document) : source).document;
    const compiled = await compileEmail(document);
    expect(compiled.errors).toEqual([]);
    const $ = load(compiled.html);
    expect($(".heading h2").css("margin")).toBe("0");
    for (const property of ["font-family", "font-size", "font-weight", "line-height", "color"])
      expect($(".heading h2").css(property)).toBe("inherit");
    expect($(".heading em").css("font-size")).toBe("19px");
    expect($(".gradient a").css("background-image")).toContain("linear-gradient");
    expect($(".gradient td").css("background-image")).toContain("linear-gradient");
    const canvas = load(
      renderToStaticMarkup(<Render config={createEmailConfig()} data={document as Data} />),
    );
    expect(canvas("h2").text()).toBe("A heading With emphasis");
    expect(canvas("style[data-pm-canvas-css]").text()).toMatch(/\.pm-canvas-[^ ]+ \.heading h2/);
    expect(toMjml(document)).not.toContain("pm-canvas-");
  });
});
