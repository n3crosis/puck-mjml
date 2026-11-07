import { readFileSync } from "node:fs";
import { load } from "cheerio";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { fromMjml } from "../import";
import { toMjml } from "../export";

beforeAll(() => vi.stubGlobal("window", globalThis));
afterAll(() => vi.unstubAllGlobals());

describe.each([false, true])("Studio shipping source rule rhythm, round trip: %s", (roundTrip) => {
  it("models the collapsed card/rule margin and original blank line separately", async () => {
    const reference = load(
      readFileSync(
        new URL(
          "../../tests/fixtures/react-email-reference/05-Studio/order-shipping.html",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const note = reference("p").filter((_index, node) =>
      reference(node).text().startsWith("After dispatch"),
    );
    const noteTable = note.closest("table");
    const rule = noteTable.prev("table");
    const card = rule.prev("table");
    expect(card.css("margin-bottom")).toBe("1.5rem");
    expect(rule.css("margin-top")).toBe("3rem");
    expect(rule.css("border-top-width")).toBe("1px");
    expect(rule.find("td").text()).toBe("\u00a0");
    expect(noteTable.css("margin-top")).toBe("1.5rem");

    const source = readFileSync(
      new URL("../../templates/05-Studio/order-shipping.mjml", import.meta.url),
      "utf8",
    );
    const imported = fromMjml(source);
    expect(imported.warnings).toEqual([]);
    const input = roundTrip ? toMjml(imported.document) : source;
    expect(input).not.toMatch(/<mj-(?:raw|include)\b/);
    const { default: mjml } = await import("mjml-browser");
    const result = await mjml(input, { validationLevel: "strict" });
    expect(result.errors).toEqual([]);
    const rendered = load(result.html);
    expect(rendered(".studio-product-wrap > table > tbody > tr > td").css("padding")).toBe(
      "0px 24px",
    );
    expect(rendered(".studio-dispatch-divider").css("padding")).toBe("48px 0px 0px");
    expect(rendered(".studio-dispatch-divider p").css("border-top")).toBe("solid 1px #F0F0F0");
    expect(rendered(".studio-dispatch-line > div").css("height")).toBe("20px");
    expect(rendered(".studio-dispatch-note").css("padding")).toBe("24px 0px 0px");
    expect(rendered(".studio-faq-divider p").parent().css("padding")).toBe("48px 0px");
    expect(rendered(".studio-faq-section > table > tbody > tr > td").css("padding")).toBe(
      "0px 48px 56px",
    );
  });
});
