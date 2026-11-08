import { readFileSync } from "node:fs";
import { load } from "cheerio";
import { parse } from "postcss";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
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

function staticFaces(styles: string[]) {
  const faces: Record<string, string>[] = [];
  for (const css of styles) {
    parse(css).walkAtRules("font-face", (rule) => {
      const face: Record<string, string> = {};
      rule.walkDecls((declaration) => {
        face[declaration.prop] = declaration.value.replace(/["']/g, "").replace(/\s+/g, " ").trim();
      });
      faces.push(face);
    });
  }
  return faces;
}

function styles(html: string, selector = "style") {
  const $ = load(html, selector === "mj-style" ? { xml: true } : undefined);
  return $(selector)
    .map((_index, node) => $(node).text())
    .get();
}

// The source combines a variable stylesheet with three static registrations.
// Its 400 registration points to a font internally named Inter Light. Preserve
// that source contract rather than correcting the URL or narrowing headings.
describe.each([false, true])("Barebone source font faces, round trip: %s", (roundTrip) => {
  it.each(names)(
    "%s preserves the exact valid static faces and variable fallback",
    async (name) => {
      const reference = readFileSync(
        new URL(`../../.cache/react-email-reference/01-Barebone/${name}.html`, import.meta.url),
        "utf8",
      );
      const source = readFileSync(
        new URL(`../../templates/01-Barebone/${name}.mjml`, import.meta.url),
        "utf8",
      );
      const expected = staticFaces(styles(reference));
      expect(expected.map((face) => face["font-weight"])).toEqual(["400", "500", "600"]);
      expect(
        expected.every(
          (face) => face["font-family"] === "Inter" && face["font-style"] === "normal",
        ),
      ).toBe(true);
      expect(expected.every((face) => face["mso-font-alt"] === "Arial")).toBe(true);
      expect(staticFaces(styles(source, "mj-style"))).toEqual(expected);

      const imported = fromMjml(source);
      expect(imported.warnings).toEqual([]);
      const input = roundTrip ? toMjml(imported.document) : source;
      expect(staticFaces(styles(input, "mj-style"))).toEqual(expected);
      const { default: mjml } = await import("mjml-browser");
      const compiled = await mjml(input, { validationLevel: "strict" });
      expect(compiled.errors).toEqual([]);
      expect(staticFaces(styles(compiled.html))).toEqual(expected);
      const $ = load(compiled.html);
      // Source weights such as 420 and 450 and italic text still need the variable
      // import. A successful static registration is not imported-CSS readiness.
      expect(
        $("link[rel=stylesheet]")
          .map((_index, node) => $(node).attr("href"))
          .get(),
      ).toContain(
        "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap",
      );
      expect(input).not.toMatch(
        /font-optical-sizing|font-variation-settings|<mj-(?:raw|include)\b/,
      );
    },
  );
});
