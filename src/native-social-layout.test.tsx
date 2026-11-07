import { Render, type Data } from "@puckeditor/core";
import { load } from "cheerio";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createEmailConfig } from "./config";
import { compileEmail, toMjml } from "./export";
import { fromMjml } from "./import";
import {
  socialCases,
  socialPreviewSource,
  socialSource,
} from "../tests/browser/fixtures/native-social-source";

beforeAll(() => vi.stubGlobal("window", globalThis));
afterAll(() => vi.unstubAllGlobals());

async function render(source: string, raw = false) {
  const { document, warnings } = fromMjml(source);
  if (!raw) expect(warnings).toEqual([]);
  const canvas = load(
    renderToStaticMarkup(
      <Render config={createEmailConfig(undefined, raw)} data={document as Data} />,
    ),
  );
  const result = await compileEmail(document, { allowRawHtml: raw });
  expect(result.errors).toEqual([]);
  return { canvas, compiled: load(result.html), document };
}

describe("native social row baseline", () => {
  it("matches the compiler's font-size reset without resetting label typography or spacing", async () => {
    const { canvas, compiled } = await render(socialSource);
    for (const { name } of socialCases) {
      const selector = `.social-${name}`;
      expect(canvas(selector).css("font-size"), name).toBe("0");
      expect(compiled(selector).css("font-size"), name).toBe("0px");
      expect(canvas(selector).css("padding"), name).toBe(compiled(selector).css("padding"));
      expect(canvas(selector).css("text-align"), name).toBe(compiled(selector).attr("align"));
      expect(canvas(selector).css("line-height"), name).toBeUndefined();
      const labels = canvas(`${selector} .pm-social-label a`);
      for (const label of labels.toArray()) {
        const link = canvas(label);
        const reference = compiled(`${selector} a`).filter(
          (_index, node) => compiled(node).text().trim() === link.text().trim(),
        );
        expect(reference).toHaveLength(1);
        for (const key of ["font-family", "font-size", "font-weight", "line-height", "color"]) {
          expect(link.css(key), `${name} ${key}`).toBe(reference.css(key));
        }
        expect(parseFloat(link.css("font-size")!)).toBeGreaterThan(0);
      }
      for (const image of canvas(`${selector} img`).toArray()) {
        const actual = canvas(image);
        const reference = compiled(`${selector} img[alt="${actual.attr("alt")}"]`);
        expect(reference).toHaveLength(1);
        for (const key of ["alt", "title", "src", "width"])
          expect(actual.attr(key)).toBe(reference.attr(key));
        for (const key of ["href", "target", "rel"])
          expect(actual.closest("a").attr(key)).toBe(reference.closest("a").attr(key));
      }
    }
  });

  it("keeps raw children and source-only labels readable and escaped", async () => {
    const { canvas, document } = await render(socialPreviewSource, true);
    for (const name of ["raw-child", "raw-label"]) {
      const wrapper = canvas(`.social-${name}`);
      expect(wrapper.css("font-size")).toBeUndefined();
      expect(wrapper.find(".pm-raw > strong")).toHaveLength(1);
      expect(wrapper.find(".pm-raw > code").text()).toContain("Stored");
      expect(wrapper.find(".pm-raw code em, .pm-raw code strong")).toHaveLength(0);
    }
    const exported = toMjml(document, { allowRawHtml: true });
    expect(exported).toContain("<em>Stored raw child</em>");
    expect(exported).toContain("<strong>Stored label</strong>");
  });
});
