import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as cheerio from "cheerio";
import type { Element } from "domhandler";
import postcss from "postcss";
import { compileEmail } from "../export";
import { fromMjml } from "../import";
import productUpdateSource from "../../templates/03-Protocol/product-update.mjml?raw";
import welcomeSource from "../../templates/03-Protocol/welcome.mjml?raw";

beforeAll(() => vi.stubGlobal("window", globalThis));
afterAll(() => vi.unstubAllGlobals());

function property($: cheerio.CheerioAPI, element: Element, name: "color" | "background-color") {
  for (const node of [element, ...$(element).parents().toArray()]) {
    const styles = new Map(
      ($(node).attr("style") ?? "").split(";").map((declaration) => {
        const separator = declaration.indexOf(":");
        return [
          declaration.slice(0, separator).trim(),
          declaration
            .slice(separator + 1)
            .trim()
            .toLowerCase(),
        ];
      }),
    );
    const value =
      styles.get(name) ?? (name === "background-color" ? $(node).attr("bgcolor") : undefined);
    if (value && value !== "inherit" && value !== "transparent") return value;
  }
  throw new Error(`No explicit ${name} found for ${$(element).text().trim()}`);
}

function luminance(color: string) {
  expect(color).toMatch(/^#[\da-f]{6}$/i);
  const channels = [1, 3, 5]
    .map((offset) => Number.parseInt(color.slice(offset, offset + 2), 16) / 255)
    .map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function expectNoResponsivePaintOverrides($: cheerio.CheerioAPI, element: Element) {
  const ancestry = [element, ...$(element).parents().toArray()];
  for (const style of $("style").toArray()) {
    postcss.parse($(style).text()).walkAtRules("media", (media) => {
      media.walkRules((rule) => {
        if (!ancestry.some((node) => $(node).is(rule.selector))) return;
        rule.walkDecls((declaration) => {
          expect(declaration.prop, `Responsive paint override for ${rule.selector}`).not.toMatch(
            /^(?:color|background(?:-color|-image)?|opacity|filter|visibility)$/i,
          );
        });
      });
    });
  }
}

function expectReadable($: cheerio.CheerioAPI, element: Element, expectedBackground = "#131313") {
  expectNoResponsivePaintOverrides($, element);
  const foreground = property($, element, "color");
  const background = property($, element, "background-color");
  expect(background).toBe(expectedBackground);
  const bright = Math.max(luminance(foreground), luminance(background));
  const dark = Math.min(luminance(foreground), luminance(background));
  expect(
    (bright + 0.05) / (dark + 0.05),
    `${foreground} on ${background}: ${$(element).text().trim()}`,
  ).toBeGreaterThanOrEqual(4.5);
}

async function renderBoth(source: string) {
  const { default: mjml2html } = await import("mjml-browser");
  const direct = await mjml2html(source, { validationLevel: "strict" });
  expect(direct.errors).toEqual([]);
  const imported = fromMjml(source);
  expect(imported.warnings).toEqual([]);
  const edited = await compileEmail(imported.document);
  expect(edited.errors).toEqual([]);
  return [direct.html, edited.html].map((html) => cheerio.load(html));
}

describe("Protocol visual contrast regressions", () => {
  it("keeps both blog cards on the upstream dark panel with readable titles, copy, and links", async () => {
    for (const $ of await renderBoth(productUpdateSource)) {
      const row = $(".dither-update-blog-row");
      expect(row).toHaveLength(1);
      expect(row.find(".dither-blog-first, .dither-blog-last")).toHaveLength(2);
      const text = row.find(".pm-email-text > div");
      expect(text).toHaveLength(6);
      expect(
        text.filter((_index, element) => $(element).text().trim() === "Less manual work"),
      ).toHaveLength(2);
      for (const element of text.toArray()) expectReadable($, element);
      const links = row.find("a");
      expect(links).toHaveLength(2);
      for (const element of links.toArray()) expectReadable($, element);
    }
  });

  it("uses the existing readable fg-3 tone for the small welcome help copy and inherited link", async () => {
    for (const $ of await renderBoth(welcomeSource)) {
      const copy = $(".dither-welcome-assist-copy > div");
      expect(copy).toHaveLength(1);
      expect(copy.attr("style")).toMatch(/font-size:\s*11px/);
      expect(copy.attr("style")).toMatch(/font-weight:\s*300/);
      expect(property($, copy[0], "color")).toBe("#818181");
      expectReadable($, copy[0]);
      const link = copy.find("a");
      expect(link).toHaveLength(1);
      expect(link.text()).toBe("Help Center");
      expect(property($, link[0], "color")).toBe("#818181");
      expectReadable($, link[0]);
    }
  });
});

const matteSources = import.meta.glob<string>("../../templates/02-Matte/*.mjml", {
  query: "?raw",
  import: "default",
  eager: true,
});

describe("Matte footer contrast regressions", () => {
  it.each(Object.entries(matteSources))(
    "%s keeps footer descriptions readable without changing their typography",
    async (_file, source) => {
      for (const $ of await renderBoth(source)) {
        const copy = $(".collage-footer-copy > div");
        expect(copy).toHaveLength(1);
        expect(copy.attr("style")).toMatch(/font-size:\s*13px/);
        expect(copy.attr("style")).toMatch(/font-weight:\s*300/);
        expect(property($, copy[0], "color")).toBe("#5f7458");
        expectReadable($, copy[0], "#ffffff");
      }
    },
  );
});
