import { readFileSync } from "node:fs";
import * as cheerio from "cheerio";
import postcss from "postcss";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { fromMjml } from "../import";
import { toMjml } from "../export";

beforeAll(() => vi.stubGlobal("window", globalThis));
afterAll(() => vi.unstubAllGlobals());

const files = {
  papermark: "Community/notifications/papermark-year-in-review",
  netlify: "Community/welcome/netlify-welcome",
} as const;

function original(name: keyof typeof files) {
  return cheerio.load(
    readFileSync(
      new URL(`../../.cache/react-email-reference/${files[name]}.html`, import.meta.url),
      "utf8",
    ),
  );
}

async function compiled(name: keyof typeof files, roundTrip: boolean) {
  const source = readFileSync(
    new URL(`../../templates/${files[name]}.mjml`, import.meta.url),
    "utf8",
  );
  const imported = fromMjml(source);
  expect(imported.warnings).toEqual([]);
  const input = roundTrip ? toMjml(imported.document) : source;
  expect(input).not.toMatch(/<mj-(?:raw|include)\b/);
  const { default: mjml2html } = await import("mjml-browser");
  const result = await mjml2html(input, { validationLevel: "strict" });
  expect(result.errors).toEqual([]);
  return cheerio.load(result.html);
}

function declaration(style: string | undefined, property: string) {
  let value: string | undefined;
  postcss.parse(`surface { ${style ?? ""} }`).walkDecls(property, (node) => {
    value = node.value.replace(/\s+/g, " ");
  });
  return value;
}

function normalizedGradient(value: string | undefined) {
  return value
    ?.replace(
      /#([a-f\d]{6})/gi,
      (_match, hex: string) =>
        `rgb(${[0, 2, 4].map((index) => Number.parseInt(hex.slice(index, index + 2), 16)).join(",")})`,
    )
    .replace(/\s+/g, "");
}

describe.each([false, true])(
  "Original-rendered Community design, editor round trip: %s",
  (roundTrip) => {
    it("renders all four Papermark gradients on both opaque surfaces while keeping solid fallbacks", async () => {
      const reference = original("papermark");
      const $ = await compiled("papermark", roundTrip);
      for (const [name, gradientColor, fallback] of [
        ["orange", "#fb7a00", "#fff2e6"],
        ["gray", "#4b5563", "#edeef0"],
        ["sand", "#e4c5a0", "#fcf9f6"],
        ["green", "#10b981", "#e7f8f2"],
      ] as const) {
        const gradient = `radial-gradient(circle at bottom right,${gradientColor} 0%,transparent 60%)`;
        expect(
          reference("[style]")
            .toArray()
            .some(
              (node) =>
                normalizedGradient(
                  declaration(reference(node).attr("style"), "background-image"),
                ) === normalizedGradient(gradient),
            ),
        ).toBe(true);
        const surfaces = $(`.paper-${name}, .paper-${name} > table`);
        expect(surfaces).toHaveLength(2);
        surfaces.each((_index, element) => {
          const style = $(element).attr("style");
          expect(declaration(style, "background-image")?.replace(/\s+/g, "")).toBe(
            gradient.replace(/\s+/g, ""),
          );
          expect(declaration(style, "background-color")).toBe(fallback);
        });
      }
    });

    it("preserves Netlify's four blue onboarding links without inventing destinations", async () => {
      const reference = original("netlify");
      const $ = await compiled("netlify", roundTrip);
      const originalLinks = reference("li a");
      const links = $(".community-rich-0 li a");
      expect(links).toHaveLength(4);
      links.each((index, element) => {
        const link = $(element);
        expect(link.text()).toBe(originalLinks.eq(index).text());
        expect(link.attr("href")).toBe(originalLinks.eq(index).attr("href"));
        expect(declaration(link.attr("style"), "color")).toBe(
          declaration(originalLinks.eq(index).attr("style"), "color"),
        );
        expect(declaration(link.attr("style"), "text-decoration")).toBe("none");
      });
    });

    it("keeps Netlify resource and preference links grouped and retains its original footer typography", async () => {
      const $ = await compiled("netlify", roundTrip);
      for (const [name, count] of [
        ["resource", 3],
        ["footer", 2],
      ] as const) {
        const table = $(`.netlify-${name}-links > table`);
        expect(table).toHaveLength(1);
        expect(declaration(table.attr("style"), "table-layout")).toBe("auto");
        const columns = table.find("tr > td");
        expect(columns).toHaveLength(count);
        columns.each((_index, element) => {
          expect(declaration($(element).attr("style"), "width")).toBeUndefined();
          expect($(element).attr("width")).toBeUndefined();
        });
      }
      expect(declaration($(".community-rich-0").attr("style"), "padding")).toBe("0px");
      expect(declaration($(".community-rich-0 ul").attr("style"), "margin")).toBe("16px 0");
      const resourceLinks = $(".netlify-resource-links a");
      expect(resourceLinks).toHaveLength(3);
      resourceLinks.each((_index, element) => {
        expect(declaration($(element).attr("style"), "font-weight")).toBe("700");
      });
      $(".netlify-resource-links em").each((_index, element) => {
        expect(declaration($(element).attr("style"), "font-weight")).toBeUndefined();
      });
      const footerLinks = $(".netlify-footer-links a");
      expect(footerLinks.map((_index, element) => $(element).text()).get()).toEqual([
        "Unsubscribe",
        "Manage Preferences",
      ]);
      footerLinks.each((_index, element) => {
        expect($(element).attr("href")).toBeUndefined();
        expect(declaration($(element).attr("style"), "color")).toBe("#067df7");
      });
      const footer = $("div")
        .filter(
          (_index, element) =>
            $(element).text().trim() ===
            "Netlify, 44 Montgomery Street, Suite 300 San Francisco, CA",
        )
        .last();
      expect(declaration(footer.attr("style"), "font-size")).toBe("14px");
      expect(declaration(footer.attr("style"), "line-height")).toBe("24px");
      expect(declaration(footer.attr("style"), "color")).toBe("#99a1af");
    });
  },
);
