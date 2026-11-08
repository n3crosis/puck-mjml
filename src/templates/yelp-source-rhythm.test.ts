import { readFileSync } from "node:fs";
import { load } from "cheerio";
import { parse } from "postcss";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { fromMjml } from "../import";
import { toMjml } from "../export";

beforeAll(() => vi.stubGlobal("window", globalThis));
afterAll(() => vi.unstubAllGlobals());
const input = readFileSync(
  new URL("../../templates/Community/notifications/yelp-recent-login.mjml", import.meta.url),
  "utf8",
);
const reference = load(
  readFileSync(
    new URL(
      "../../.cache/react-email-reference/Community/notifications/yelp-recent-login.html",
      import.meta.url,
    ),
    "utf8",
  ),
);

describe.each([false, true])("Yelp source rhythm, round trip: %s", (roundTrip) => {
  it("preserves normal headings and independent collapsed source margins", async () => {
    const imported = fromMjml(input);
    expect(imported.warnings).toEqual([]);
    const { default: compile } = await import("mjml-browser");
    const result = await compile(roundTrip ? toMjml(imported.document) : input, {
      validationLevel: "strict",
    });
    expect(result.errors).toEqual([]);
    const $ = load(result.html);
    // Browser default h1/h2 margins are .67em/.83em. Adjacent source
    // margins collapse to 21.58px; MJML table cells need explicit gaps.
    for (const [tag, size, padding] of [
      ["h1", "32px", "21.44px 0px 0px"],
      ["h2", "26px", "21.58px 0px"],
    ]) {
      expect(reference(tag).css("font-size")).toBe(size);
      expect(reference(tag).css("line-height")).toBeUndefined();
      expect(reference(tag).css("margin")).toBeUndefined();
      expect($(tag).css("margin")).toBe("0");
      expect($(tag).parent().css("font-size")).toBe(size);
      expect($(tag).closest("td").css("padding")).toBe(padding);
    }
    const normal: string[] = [];
    parse($("style").text()).walkRules(".reference-heading > div", (rule) => {
      rule.walkDecls("line-height", (decl) => {
        expect(decl.important).toBe(true);
        normal.push(decl.value);
      });
    });
    expect(normal).toEqual(["normal"]);
    const paragraphs = reference("p").slice(0, 6);
    expect(paragraphs.map((_index, node) => reference(node).css("margin-top")).get()).toEqual([
      "16px",
      "-5px",
      "-5px",
      "-5px",
      "16px",
      "-5px",
    ]);
    expect(paragraphs.map((_index, node) => reference(node).css("margin-bottom")).get()).toEqual(
      Array(6).fill("16px"),
    );
    const prefixes = [
      "Time:",
      "Device:",
      "Location:",
      "*Approximate",
      "If this was you,",
      "If this wasn't you",
    ];
    prefixes.forEach((prefix, index) => {
      const block = $("td > div")
        .filter((_index, node) => $(node).text().trim().startsWith(prefix))
        .last();
      expect(block).toHaveLength(1);
      expect(block.css("line-height")).toBe("24px");
      expect(block.parent().css("padding")).toBe(`0px 0px ${[11, 11, 11, 16, 11, 16][index]}px`);
    });
    const button = $("p").filter((_index, node) => $(node).text().trim() === "Learn More");
    expect(button).toHaveLength(1);
    expect(button.closest("table").parent().css("padding")).toBe("0px");
    expect(input).toContain('width="600px"');
    expect(input).toContain('<mj-section padding="20px">');
  });
});
