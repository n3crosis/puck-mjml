import { readFileSync, readdirSync } from "node:fs";
import { load } from "cheerio";
import { parse } from "postcss";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { fromMjml } from "../import";
import { toMjml } from "../export";

const names = [
  "activation",
  "feature-announcement",
  "password-reset",
  "product-update",
  "subscription-confirmation",
  "subscription-update",
  "text-only",
  "welcome",
] as const;
const folder = new URL("../../templates/01-Barebone/", import.meta.url);
const text = (html: string) =>
  load(html)("body")
    .text()
    .replace(/[\s\u200b-\u200d\ufeff]+/g, " ")
    .trim();
beforeAll(() => vi.stubGlobal("window", globalThis));
afterAll(() => vi.unstubAllGlobals());

describe("canonical Barebone MJML ports", () => {
  it("contains all eight actual upstream emails and no font-only entry", () => {
    expect(
      readdirSync(folder)
        .filter((file) => file.endsWith(".mjml"))
        .sort(),
    ).toEqual(names.map((name) => `${name}.mjml`).sort());
  });
  it.each(["welcome", "product-update", "feature-announcement"])(
    "%s keeps its 56px app tile compact below the mobile breakpoint",
    async (name) => {
      const source = readFileSync(new URL(`${name}.mjml`, folder), "utf8");
      const imported = fromMjml(source);
      expect(imported.warnings).toEqual([]);
      const { default: mjml } = await import("mjml-browser");
      for (const input of [source, toMjml(imported.document)]) {
        const result = await mjml(input, { validationLevel: "strict" });
        expect(result.errors).toEqual([]);
        const $ = load(result.html);
        const tile = $(".bare-app-icon");
        expect(tile).toHaveLength(1);
        const declarations = parse(`tile { ${tile.attr("style")} }`);
        for (const property of ["width", "max-width"]) {
          const found: string[] = [];
          declarations.walkDecls(property, (declaration) => {
            found.push(declaration.value);
          });
          // MJML inlines the winning declaration and removes its redundant !important.
          expect(found.at(-1)).toBe("56px");
        }
        expect(tile.find("img").attr("width")).toBe("32");
      }
    },
  );
  it.each(names)("%s preserves safe editable content, images, and links", async (name) => {
    const source = readFileSync(new URL(`${name}.mjml`, folder), "utf8");
    expect(source).toContain("674d8ec2804b86be5d99156383fb1810179847bf");
    expect(source).not.toMatch(/<mj-(?:raw|include)\b/);
    const { default: mjml } = await import("mjml-browser");
    const direct = await mjml(source, { validationLevel: "strict" });
    expect(direct.errors).toEqual([]);
    const imported = fromMjml(source);
    expect(imported.warnings).toEqual([]);
    const edited = await mjml(toMjml(imported.document), { validationLevel: "strict" });
    expect(edited.errors).toEqual([]);
    expect(text(edited.html)).toBe(text(direct.html));
    const before = load(direct.html);
    const after = load(edited.html);
    for (const [tag, attr] of [
      ["img", "src"],
      ["a", "href"],
    ]) {
      expect(
        after(tag)
          .map((_index, node) => after(node).attr(attr))
          .get(),
      ).toEqual(
        before(tag)
          .map((_index, node) => before(node).attr(attr))
          .get(),
      );
    }
    expect(text(edited.html)).toContain("Barebones");
    expect(text(edited.html)).toContain("Unsubscribe");
  });
});
