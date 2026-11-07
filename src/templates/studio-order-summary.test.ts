import { readFileSync } from "node:fs";
import { load } from "cheerio";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { fromMjml } from "../import";
import { toMjml } from "../export";

beforeAll(() => vi.stubGlobal("window", globalThis));
afterAll(() => vi.unstubAllGlobals());

const amounts = ["$198.00", "$16.00", "$0.00", "$214.00"];
const source = readFileSync(
  new URL("../../templates/05-Studio/order-confirmation.mjml", import.meta.url),
  "utf8",
);
const original = load(
  readFileSync(
    new URL(
      "../../tests/fixtures/react-email-reference/05-Studio/order-confirmation.html",
      import.meta.url,
    ),
    "utf8",
  ),
);

describe.each([false, true])("Studio order amount typography, round trip: %s", (roundTrip) => {
  it("preserves the pinned source's 15px/500 amount cells and 24px leading", async () => {
    const imported = fromMjml(source);
    expect(imported.warnings).toEqual([]);
    const input = roundTrip ? toMjml(imported.document) : source;
    expect(input).not.toMatch(/<mj-(?:raw|include)\b/);
    const { default: mjml } = await import("mjml-browser");
    const compiled = await mjml(input, { validationLevel: "strict" });
    expect(compiled.errors).toEqual([]);
    const rendered = load(compiled.html);
    const table = rendered(".studio-summary > table");
    expect(table).toHaveLength(1);
    expect(
      table
        .find("tr")
        .toArray()
        .map((row) =>
          rendered(row)
            .find("td")
            .toArray()
            .map((cell) => rendered(cell).text().trim()),
        ),
    ).toEqual([
      ["Subtotal", "$198.00"],
      ["Tax", "$16.00"],
      ["Shipping", "$0.00"],
      ["Total", "$214.00"],
    ]);
    for (const [index, amount] of amounts.entries()) {
      const expected = original("p").filter(
        (_index, node) => original(node).text().trim() === amount,
      );
      const actual = table
        .find("td")
        .filter((_index, node) => rendered(node).text().trim() === amount);
      expect(expected).toHaveLength(1);
      expect(actual).toHaveLength(1);
      for (const property of ["font-size", "font-weight", "letter-spacing"]) {
        expect(actual.css(property)).toBe(expected.css(property));
      }
      expect(actual.css("font-size")).toBe("15px");
      expect(actual.css("font-weight")).toBe("500");
      expect(actual.css("line-height")).toBe(
        `${parseFloat(expected.css("font-size")!) * parseFloat(expected.css("line-height")!)}px`,
      );
      expect(actual.css("text-align")).toBe("right");
      expect(actual.css("padding")).toBe(index === 3 ? "12px 0px" : "6px 0px");
    }
  });
});
