import { readFileSync } from "node:fs";
import { load } from "cheerio";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { fromMjml } from "../import";
import { toMjml } from "../export";

beforeAll(() => vi.stubGlobal("window", globalThis));
afterAll(() => vi.unstubAllGlobals());

const names = [
  "activation",
  "feature-announcement",
  "password-reset",
  "product-update",
  "subscription-confirmation",
  "subscription-update",
  "text-only",
  "welcome",
];

describe.each(names)("Barebone %s link decorations", (name) => {
  it.each([false, true])("retains original link decorations, round trip: %s", async (roundTrip) => {
    const reference = load(
      readFileSync(
        new URL(`../../.cache/react-email-reference/01-Barebone/${name}.html`, import.meta.url),
        "utf8",
      ),
    );
    const source = readFileSync(
      new URL(`../../templates/01-Barebone/${name}.mjml`, import.meta.url),
      "utf8",
    );
    const imported = fromMjml(source);
    expect(imported.warnings).toEqual([]);
    const input = roundTrip ? toMjml(imported.document) : source;
    const labels = ["Unsubscribe"];
    if (name === "feature-announcement") labels.push("Read more");
    if (name === "text-only") labels.push("Open your account");
    const canonical = load(input, { xml: true });
    expect(canonical("mj-style").text()).toMatch(
      /\.bare-plain-link a\s*\{\s*text-decoration: none;/,
    );
    const { default: mjml } = await import("mjml-browser");
    const result = await mjml(input, { validationLevel: "strict" });
    expect(result.errors).toEqual([]);
    const compiled = load(result.html);
    for (const label of labels) {
      const original = reference("a").filter((_, node) => reference(node).text().trim() === label);
      expect(original).toHaveLength(label === "Read more" ? 2 : 1);
      original.each((_, node) => {
        expect(reference(node).css("text-decoration-line")).toBe("none");
        expect(reference(node).attr("href")).toBe("https://example.com/");
      });
      for (const $ of [canonical, compiled]) {
        const links = $("a").filter((_, node) => $(node).text().trim() === label);
        expect(links).toHaveLength(original.length);
        links.each((_, node) => {
          if ($ === compiled) expect($(node).css("text-decoration")).toBe("none");
          else expect($(node).parent().attr("css-class")).toContain("bare-plain-link");
          expect($(node).attr("href")).toBe("https://example.com/");
        });
      }
    }
    // Audit every source anchor: no intentionally underlined source link is
    // hidden by this correction to the eleven previously unstyled text links.
    reference("a").each((_, node) => {
      const link = reference(node);
      expect(link.css("text-decoration-line") ?? link.css("text-decoration")).toBe("none");
    });
  });
});
