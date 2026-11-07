import { readFileSync } from "node:fs";
import { Render, type Data } from "@puckeditor/core";
import { load, type Cheerio, type CheerioAPI } from "cheerio";
import type { AnyNode } from "domhandler";
import { parse } from "postcss";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createEmailConfig } from "../config";
import { fromMjml } from "../import";
import { toMjml } from "../export";

beforeAll(() => vi.stubGlobal("window", globalThis));
afterAll(() => vi.unstubAllGlobals());

const names = [
  "activation",
  "password-reset",
  "subscription-confirmation",
  "subscription-update",
  "text-only",
  "welcome",
  "product-update",
  "feature-announcement",
];
const cell = "> table > tbody > tr > td";
const normalized = (text: string) => text.replace(/\s+/g, " ").trim();
const pixels = (value: string) =>
  value.replace(/([\d.]+)rem\b/g, (_match, size: string) => `${Number(size) * 16}px`);

function declarations(style: string | undefined) {
  const result: Record<string, string> = {};
  parse(`element { ${style ?? ""} }`).walkDecls((node) => {
    result[node.prop] = pixels(node.value);
    if (node.prop === "padding") {
      const [top, right = top, bottom = top, left = right] = pixels(node.value).split(/\s+/);
      Object.assign(result, {
        "padding-top": top,
        "padding-right": right,
        "padding-bottom": bottom,
        "padding-left": left,
      });
    }
  });
  return result;
}

/** Resolve the inline and important responsive declarations used by these
 * fixtures. This checks authored CSS contracts, not browser layout or pixels. */
function stylesAt($: CheerioAPI, node: Cheerio<AnyNode>, width: number) {
  const result = declarations(node.attr("style"));
  $("style").each((_index, element) => {
    parse($(element).text()).walkRules((rule) => {
      let parent = rule.parent;
      while (parent && parent.type !== "root") {
        if (parent.type === "atrule" && parent.name === "media") {
          const max = /max-width:\s*([\d.]+)px/.exec(parent.params);
          const min = /min-width:\s*([\d.]+)px/.exec(parent.params);
          if ((max && width > Number(max[1])) || (min && width < Number(min[1]))) return;
        }
        parent = parent.parent;
      }
      let matches = false;
      try {
        matches = node.is(rule.selector);
      } catch {
        return;
      }
      if (!matches) return;
      rule.walkDecls((declaration) => {
        if (declaration.important) Object.assign(result, declarations(declaration.toString()));
      });
    });
  });
  return result;
}

function original(name: string) {
  return load(
    readFileSync(
      new URL(
        `../../tests/fixtures/react-email-reference/01-Barebone/${name}.html`,
        import.meta.url,
      ),
      "utf8",
    ),
  );
}

function textNode($: CheerioAPI, selector: string, text: string) {
  return $(selector)
    .filter((_index, node) => normalized($(node).text()) === text)
    .first();
}

async function compile(name: string, roundTrip: boolean) {
  const source = readFileSync(
    new URL(`../../templates/01-Barebone/${name}.mjml`, import.meta.url),
    "utf8",
  );
  const imported = fromMjml(source);
  expect(imported.warnings).toEqual([]);
  const input = roundTrip ? toMjml(imported.document) : source;
  expect(input).not.toMatch(/<mj-(?:raw|include)\b/);
  const { default: mjml } = await import("mjml-browser");
  const result = await mjml(input, { validationLevel: "strict" });
  expect(result.errors).toEqual([]);
  return { $: load(result.html), document: imported.document };
}

describe.each([false, true])(
  "Barebone source-backed responsive design, round trip: %s",
  (roundTrip) => {
    it.each(names.slice(0, 5))(
      "%s preserves its original transactional mobile card padding",
      async (name) => {
        const reference = original(name);
        const { $ } = await compile(name, roundTrip);
        const nativeCard = reference("td.mobile_px-6.mobile_py-12");
        expect(nativeCard).toHaveLength(1);
        const expected = stylesAt(reference, nativeCard, 390);
        expect(expected).toMatchObject({
          "padding-left": "24px",
          "padding-right": "24px",
          "padding-top": "48px",
          "padding-bottom": "48px",
        });
        const actual = stylesAt($, $(`.bare-card-section ${cell}`), 390);
        for (const property of ["padding-left", "padding-right", "padding-top", "padding-bottom"])
          expect(actual[property]).toBe(expected[property]);
        expect(stylesAt($, $(`.bare-card-section ${cell}`), 800)["padding-top"]).toBe(
          name === "text-only" ? "80px" : "64px",
        );
      },
    );

    it.each(["welcome", "product-update", "feature-announcement"])(
      "%s keeps its422px hero cap and mobile card spacing",
      async (name) => {
        const reference = original(name);
        const { $ } = await compile(name, roundTrip);
        const heading = reference("h1").first();
        expect(declarations(heading.closest("table").attr("style"))["max-width"]).toBe("422px");
        expect(declarations($("h1").parent().attr("style"))["max-width"]).toBe("422px");
        const gaps = $(".bare-card-gap > div");
        expect(gaps.length).toBeGreaterThan(0);
        gaps.each((_index, node) => expect(stylesAt($, $(node), 390).height).toBe("8px"));
        expect(reference("table.mobile_mb-2").length).toBeGreaterThan(0);
        $(`.bare-card-start ${cell}`).each((_index, node) =>
          expect(stylesAt($, $(node), 390)["padding-top"]).toBe("40px"),
        );
        $(`.bare-card-end ${cell}`).each((_index, node) =>
          expect(stylesAt($, $(node), 390)["padding-bottom"]).toBe("40px"),
        );
        $(`.bare-card-inset ${cell}`).each((_index, node) => {
          expect(stylesAt($, $(node), 390)).toMatchObject({
            "padding-left": "40px",
            "padding-right": "40px",
          });
        });
      },
    );

    it("retains text-only's420px left-aligned body cap", async () => {
      const reference = original("text-only");
      const { $ } = await compile("text-only", roundTrip);
      const copies = $(".bare-letter-copy > div");
      expect(copies).toHaveLength(4);
      copies.each((_index, node) => {
        const source = textNode(reference, "p", normalized($(node).text()));
        expect(source).toHaveLength(1);
        expect(declarations(source.attr("style"))["max-width"]).toBe("420px");
        expect(declarations($(node).attr("style"))).toMatchObject({
          "max-width": "420px",
          "text-align": "left",
        });
      });
    });

    it.each([
      ["welcome", 2],
      ["product-update", 5],
    ] as const)(
      "%s expands only the original responsive stacked images (%s)",
      async (name, count) => {
        const reference = original(name);
        const { $ } = await compile(name, roundTrip);
        const originals = reference("img.mobile_imprtntmax-w-full");
        expect(originals).toHaveLength(count);
        const images = $("table.mj-full-width-mobile img");
        expect(images).toHaveLength(count);
        expect(images.map((_index, node) => $(node).attr("src")).get()).toEqual(
          originals.map((_index, node) => reference(node).attr("src")).get(),
        );
        expect(
          $("img[src$='logo-black.png'], img[src$='logo-white.png']").closest(
            "table.mj-full-width-mobile",
          ),
        ).toHaveLength(0);
        $(`.bare-tile-column ${cell}`).each((_index, node) =>
          expect(stylesAt($, $(node), 390)).toMatchObject({
            "padding-left": "0px",
            "padding-right": "0px",
          }),
        );
      },
    );

    it.each(names.filter((name) => name !== "text-only"))(
      "%s keeps original CTA label leading and padding",
      async (name) => {
        const reference = original(name);
        const { $ } = await compile(name, roundTrip);
        const buttons = $("a").filter(
          (_index, node) => declarations($(node).attr("style"))["mso-padding-alt"] === "0px",
        );
        expect(buttons.length).toBeGreaterThan(0);
        buttons.each((_index, node) => {
          const source = textNode(reference, "a", normalized($(node).text()));
          expect(source).toHaveLength(1);
          const label = source
            .children("span")
            .filter(
              (_i, span) => normalized(reference(span).text()) === normalized($(node).text()),
            );
          expect(declarations(label.attr("style"))["line-height"]).toBe("120%");
          expect(declarations($(node).attr("style"))).toMatchObject({
            "font-size": "16px",
            "line-height": "1.2",
            "padding-top": "16px",
            "padding-bottom": "16px",
          });
        });
      },
    );

    it("keeps both feature icons48px with original32/20px desktop/mobile gaps", async () => {
      const reference = original("feature-announcement");
      const { $ } = await compile("feature-announcement", roundTrip);
      const originals = reference("img[src$='barebones-image-3.png']");
      const icons = $(".bare-feature-icon-slot img");
      expect(icons).toHaveLength(2);
      icons.each((index, node) => {
        expect($(node).attr("width")).toBe(originals.eq(index).attr("width"));
        expect($(node).attr("width")).toBe("48");
      });
      const originalSlot = originals.first().closest("td");
      const slot = $(".bare-feature-icon-slot").first();
      expect(stylesAt(reference, originalSlot, 800)["padding-right"]).toBe("32px");
      expect(stylesAt(reference, originalSlot, 390)["padding-right"]).toBe("20px");
      expect(stylesAt($, slot, 390).width).toBe("68px");
      expect(stylesAt($, slot.find(cell).first(), 390)["padding-right"]).toBe("20px");
      expect(declarations($(".bare-feature-icon-copy").first().attr("style")).width).toBe(
        "calc(100% - 80px)",
      );
    });

    it.each([
      ["welcome", "circle"],
      ["product-update", "square"],
    ])("%s retains 24px decorative content size without spoken glyphs", async (name, shape) => {
      const reference = original(name);
      const { $, document } = await compile(name, roundTrip);
      const originals = reference("span").filter((_index, node) => {
        const style = declarations(reference(node).attr("style"));
        return style.width === "24px" && style.height === "24px";
      });
      expect(originals).toHaveLength(4);
      const shapes = $(`.bare-bullet-${shape} p`);
      expect(shapes).toHaveLength(4);
      shapes.each((_index, node) => {
        expect(normalized($(node).text())).toBe("");
        expect(declarations($(node).attr("style"))).toMatchObject({
          width: "24px",
          height: "24px",
          "box-sizing": "content-box",
          border: "1px solid #e4e4e7",
          "border-radius": shape === "circle" ? "50%" : "8px",
        });
      });
      expect($("body").text()).not.toMatch(/[○□]/);
      const canvas = load(
        renderToStaticMarkup(<Render config={createEmailConfig()} data={document as Data} />),
      );
      expect(canvas(`.bare-bullet-${shape} p`)).toHaveLength(4);
      expect(canvas("style").text()).toContain(`.bare-bullet-${shape} p`);
    });

    it("keeps all three original numbered badge labels and bordered geometry", async () => {
      const reference = original("product-update");
      const { $ } = await compile("product-update", roundTrip);
      const labels = $(".bare-step-number p");
      expect(labels.map((_index, node) => $(node).text()).get()).toEqual(["1", "2", "3"]);
      labels.each((_index, node) => {
        const source = textNode(reference, "p", $(node).text()).closest("table");
        expect(declarations(source.attr("style"))).toMatchObject({
          width: "28px",
          "border-radius": "10px",
        });
        expect(declarations(source.find("td").first().attr("style"))).toMatchObject({
          "padding-top": "4px",
          "padding-bottom": "4px",
        });
        expect(declarations($(node).attr("style"))).toMatchObject({
          width: "28px",
          "border-radius": "10px",
          border: "1px solid #e4e4e7",
          "padding-top": "4px",
          "padding-bottom": "4px",
          "line-height": "20px",
        });
      });
    });
  },
);
