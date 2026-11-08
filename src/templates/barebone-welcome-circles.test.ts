import { readFileSync } from "node:fs";
import { load } from "cheerio";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { fromMjml } from "../import";
import { toMjml } from "../export";

beforeAll(() => vi.stubGlobal("window", globalThis));
afterAll(() => vi.unstubAllGlobals());

describe.each([false, true])("Barebone welcome source circle size, round trip: %s", (roundTrip) => {
  it("keeps 24px of content plus both 1px borders instead of shrinking the four circles", async () => {
    const reference = load(
      readFileSync(
        new URL("../../.cache/react-email-reference/01-Barebone/welcome.html", import.meta.url),
        "utf8",
      ),
    );
    const original = reference('span[style*="border-radius:9999px"][style*="width:1.5rem"]');
    expect(original).toHaveLength(4);
    original.each((_index, node) => {
      expect(reference(node).css("width")).toBe("1.5rem");
      expect(reference(node).css("height")).toBe("1.5rem");
      expect(reference(node).css("border-width")).toBe("1px");
      expect(reference(node).css("box-sizing")).toBeUndefined();
    });
    expect(reference("style").text()).not.toContain("box-sizing");
    const source = readFileSync(
      new URL("../../templates/01-Barebone/welcome.mjml", import.meta.url),
      "utf8",
    );
    const imported = fromMjml(source);
    expect(imported.warnings).toEqual([]);
    const input = roundTrip ? toMjml(imported.document) : source;
    expect(input).not.toMatch(/<mj-(?:raw|include)\b/);
    const { default: mjml } = await import("mjml-browser");
    const result = await mjml(input, { validationLevel: "strict" });
    expect(result.errors).toEqual([]);
    const compiled = load(result.html);
    const circles = compiled(".bare-bullet-circle p");
    expect(circles).toHaveLength(4);
    circles.each((_index, node) => {
      const circle = compiled(node);
      expect(circle.css("width")).toBe("24px");
      expect(circle.css("height")).toBe("24px");
      expect(circle.css("box-sizing")).toBe("content-box");
      expect(circle.css("border")).toBe("1px solid #e4e4e7");
      expect(circle.text().trim()).toBe("");
    });
    // Changing the decoration must not replace its existing editable row slots.
    expect(compiled(".bare-bullet-column")).toHaveLength(4);
    expect(compiled(".bare-bullet-column").first().attr("style")).toContain("width:100%");
  });
});
