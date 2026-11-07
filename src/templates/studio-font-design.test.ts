import { readFileSync } from "node:fs";
import { load } from "cheerio";
import { parse } from "postcss";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { fromMjml } from "../import";
import { toMjml } from "../export";

beforeAll(() => vi.stubGlobal("window", globalThis));
afterAll(() => vi.unstubAllGlobals());

const names = [
  "abandoned-cart",
  "activation",
  "newsletter",
  "order-confirmation",
  "order-shipping",
  "password-reset",
  "promo",
  "welcome",
];

function staticFaces(html: string, selector = "style") {
  const $ = load(html, selector === "mj-style" ? { xml: true } : undefined);
  const faces: Record<string, string>[] = [];
  $(selector).each((_index, node) => {
    parse($(node).text()).walkAtRules("font-face", (rule) => {
      const face: Record<string, string> = {};
      rule.walkDecls((declaration) => {
        face[declaration.prop] = declaration.value.replace(/["']/g, "").replace(/\s+/g, " ").trim();
      });
      faces.push(face);
    });
  });
  return faces;
}

// Source 400 and 450 deliberately register the same Inter Light 300 binary. The
// source's Geist v4 binary is variable but has five individual declarations.
// Match these contracts, rather than substituting a heavier weight or newer URL.
describe.each([false, true])("Studio source font faces, round trip: %s", (roundTrip) => {
  it.each(names)("%s preserves all nine exact source registrations", async (name) => {
    const reference = readFileSync(
      new URL(`../../tests/fixtures/react-email-reference/05-Studio/${name}.html`, import.meta.url),
      "utf8",
    );
    const source = readFileSync(
      new URL(`../../templates/05-Studio/${name}.mjml`, import.meta.url),
      "utf8",
    );
    const expected = staticFaces(reference);
    expect(expected.map((face) => [face["font-family"], face["font-weight"]])).toEqual([
      ["Geist", "400"],
      ["Geist", "450"],
      ["Geist", "500"],
      ["Geist", "600"],
      ["Geist", "700"],
      ["Inter", "400"],
      ["Inter", "450"],
      ["Inter", "500"],
      ["Inter", "600"],
    ]);
    expect(
      expected.every((face) => face["font-style"] === "normal" && face["mso-font-alt"] === "Arial"),
    ).toBe(true);
    expect(expected[5].src).toBe(expected[6].src);
    expect(expected[0].src).toContain("/geist/v4/");
    expect(staticFaces(source, "mj-style")).toEqual(expected);
    const imported = fromMjml(source);
    expect(imported.warnings).toEqual([]);
    const input = roundTrip ? toMjml(imported.document) : source;
    expect(staticFaces(input, "mj-style")).toEqual(expected);
    expect(input).not.toMatch(/font-optical-sizing|font-variation-settings|<mj-(?:raw|include)\b/);
    const { default: mjml } = await import("mjml-browser");
    const compiled = await mjml(input, { validationLevel: "strict" });
    expect(compiled.errors).toEqual([]);
    expect(staticFaces(compiled.html)).toEqual(expected);
  });
});
