import { readFileSync } from "node:fs";
import { load } from "cheerio";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { fromMjml } from "../import";
import { toMjml } from "../export";

beforeAll(() => vi.stubGlobal("window", globalThis));
afterAll(() => vi.unstubAllGlobals());

describe.each([false, true])("Plaid source typography, round trip: %s", (roundTrip) => {
  it("keeps the source's narrow fallback stacks, line heights and centered code width", async () => {
    const name = "Community/magic-links/plaid-verify-identity";
    const source = readFileSync(new URL(`../../templates/${name}.mjml`, import.meta.url), "utf8");
    const reference = load(
      readFileSync(
        new URL(`../../.cache/react-email-reference/${name}.html`, import.meta.url),
        "utf8",
      ),
    );
    const imported = fromMjml(source);
    expect(imported.warnings).toEqual([]);
    const { default: compile } = await import("mjml-browser");
    const result = await compile(roundTrip ? toMjml(imported.document) : source, {
      validationLevel: "strict",
    });
    expect(result.errors).toEqual([]);
    const $ = load(result.html);
    expect(reference('table[style*="HelveticaNeue-Bold"]').attr("style")).toContain("width:280px");
    expect($(".community-rich-0 > div").attr("style")).toContain("font-family:HelveticaNeue-Bold;");
    expect(reference("h1").attr("style")).toContain(
      "font-family:HelveticaNeue-Medium,Helvetica,Arial,sans-serif",
    );
    expect($(".reference-heading > div").attr("style")).toContain(
      "font-family:HelveticaNeue-Medium,Helvetica,Arial,sans-serif;",
    );
    for (const [text, lineHeight] of [
      ["Verify Your Identity", "16px"],
      ["Securely powered by Plaid.", "23px"],
    ]) {
      const original = reference("p").filter((_i, node) => reference(node).text() === text);
      expect(original.attr("style")).toContain(`line-height:${lineHeight}`);
      const block = $("div").filter(
        (_i, node) => $(node).text() === text && $(node).find("div").length === 0,
      );
      expect(block.last().attr("style")).toContain(`line-height:${lineHeight}`);
    }
    expect($("style").text()).toMatch(/width:\s*280px/);
    expect($("style").text()).toMatch(/max-width:\s*100%/);
    expect($("style").text()).toMatch(/box-shadow:\s*none/);
  });
});
