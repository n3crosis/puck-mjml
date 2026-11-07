import { readFileSync } from "node:fs";
import { load, type CheerioAPI } from "cheerio";
import { parse } from "postcss";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { fromMjml } from "../import";
import { toMjml } from "../export";

beforeAll(() => vi.stubGlobal("window", globalThis));
afterAll(() => vi.unstubAllGlobals());
const input = readFileSync(
  new URL("../../templates/Community/magic-links/raycast-magic-link.mjml", import.meta.url),
  "utf8",
);
const reference = load(
  readFileSync(
    new URL(
      "../../tests/fixtures/react-email-reference/Community/magic-links/raycast-magic-link.html",
      import.meta.url,
    ),
    "utf8",
  ),
);
function text($: CheerioAPI, prefix: string) {
  const match = $("p,h1,div").filter(
    (_i, node) =>
      $(node).text().replace(/\s+/g, " ").trim().startsWith(prefix) &&
      $(node).find("p,h1,div").length === 0,
  );
  expect(match, prefix).toHaveLength(1);
  return match;
}
function rule($: CheerioAPI, selector: string) {
  const declarations: Record<string, { value: string; important: boolean }> = {};
  parse($("style").text()).walkRules((rule) => {
    if (rule.selectors.includes(selector))
      rule.walkDecls((declaration) => {
        declarations[declaration.prop] = {
          value: declaration.value,
          important: Boolean(declaration.important),
        };
      });
  });
  return declarations;
}

describe.each([false, true])("Raycast source rhythm, safe round trip: %s", (roundTrip) => {
  it("retains independent source heading, section, paragraph and container spacing", async () => {
    const imported = fromMjml(input);
    expect(imported.warnings).toEqual([]);
    const source = roundTrip ? toMjml(imported.document) : input;
    expect(source).not.toMatch(/<mj-(?:raw|include)\b/);
    expect(fromMjml(source).warnings).toEqual([]);
    const { default: compile } = await import("mjml-browser");
    const result = await compile(source, { validationLevel: "strict" });
    expect(result.errors).toEqual([]);
    const $ = load(result.html);

    const heading = reference("h1");
    const section = heading.next("table");
    expect(heading.css("font-size")).toBe("28px");
    expect(heading.css("line-height")).toBeUndefined();
    expect(heading.css("margin-top")).toBe("48px");
    expect(section.css("margin-top")).toBe("24px");
    expect(section.css("margin-bottom")).toBe("24px");
    expect(section.find("p").first().css("margin-top")).toBe("16px");
    expect(section.find("p").last().css("margin-bottom")).toBe("16px");
    // The table's 24px outer margin and its cell's 16px paragraph margin
    // cannot collapse together. Keep both 40px boundaries, not one net offset.
    expect($(".reference-heading").css("padding")).toBe("48px 0px 40px");
    expect($(".reference-heading > div").css("font-size")).toBe("28px");
    expect($(".reference-heading > div").css("font-weight")).toBe("700");
    expect(rule($, ".reference-heading > div")["line-height"]).toEqual({
      value: "normal",
      important: true,
    });
    expect($("h1").css("line-height")).toBe("inherit");
    for (const [prefix, padding] of [
      ["👉 Click here to sign in", "0px 0px 16px"],
      ["If you didn't request this", "0px 0px 40px"],
      ["Best,", "0px"],
      ["Raycast Technologies Inc.", "20px 0px 16px 4px"],
      ["2093 Philadelphia Pike", "0px 0px 16px 4px"],
    ]) {
      const original = text(reference, prefix);
      const actual = text($, prefix);
      expect(original.css("margin-top")).toBe("16px");
      expect(original.css("margin-bottom")).toBe("16px");
      expect(actual.closest("td").css("padding")).toBe(padding);
      expect(actual.css("font-size")).toBe(original.css("font-size"));
      expect(actual.css("line-height")).toBe(
        prefix.startsWith("Raycast") || prefix.startsWith("2093") ? "24px" : "26px",
      );
    }
    const container = reference('table[style*="raycast-bg.png"]');
    expect(container.children("tbody").children("tr").children("td").css("padding-bottom")).toBe(
      "48px",
    );
    expect($('table[style*="raycast-bg.png"] > tbody > tr > td').first().css("padding")).toBe(
      "20px 25px 48px",
    );

    expect(reference("a").css("text-decoration-line")).toBe("none");
    expect(rule($, ".community-rich-0 a:nth-of-type(1)")["text-decoration"].value).toBe("none");
    expect(rule($, ".community-rich-0 a:nth-of-type(1)").color.value).toBe("#ff6363");
    expect(reference("hr").css("border-top")).toBe("1px solid #eaeaea");
    const divider = $('p[style*="border-top"]');
    expect(divider.css("border-top")).toBe("solid 1px #eaeaea");
    expect(divider.closest("td").css("padding")).toBe("48px 0px 20px");
    expect(rule($, "body").padding).toEqual({ value: "8px", important: true });

    // Leave source assets, font intent, responsive width and licensing intact.
    expect(input).toContain("MIT-licensed demo; copyright React Email contributors.");
    expect(input).toContain("674d8ec2804b86be5d99156383fb1810179847bf");
    expect(
      $("img")
        .map((_i, node) => $(node).attr("src"))
        .get(),
    ).toEqual(
      reference("img")
        .map((_i, node) => reference(node).attr("src"))
        .get(),
    );
    expect($(".reference-heading > div").css("font-family")).toBe(
      reference("body > table > tbody > tr > td").css("font-family")?.replace(/"/g, "'"),
    );
    expect(source).toContain('width="600px"');
    expect(source).toContain('background-size="auto"');
    expect(source).toContain('background-position="center bottom"');
    expect(source).toContain('background-repeat="no-repeat"');
  });
});
