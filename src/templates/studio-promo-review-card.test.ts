import { readFileSync } from "node:fs";
import { load } from "cheerio";
import { parse } from "postcss";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { fromMjml } from "../import";
import { toMjml } from "../export";
import { scopeDocumentCss } from "../canvas-css";

beforeAll(() => vi.stubGlobal("window", globalThis));
afterAll(() => vi.unstubAllGlobals());

describe.each([false, true])("Studio promo painted review card, round trip: %s", (roundTrip) => {
  it("keeps source32px outer and16px inner mobile insets without changing the quote width", async () => {
    const reference = load(
      readFileSync(
        new URL("../../tests/fixtures/react-email-reference/05-Studio/promo.html", import.meta.url),
        "utf8",
      ),
    );
    const quote = reference("p").filter((_index, node) =>
      reference(node).text().includes("It's wild how fast Halo"),
    );
    expect(quote).toHaveLength(1);
    const cardCell = quote.closest("td");
    expect(cardCell.hasClass("mobile_px-4")).toBe(true);
    expect(cardCell.css("padding-left")).toBe("3rem");
    expect(cardCell.parents("td").first().css("padding-left")).toBe("2rem");
    const sourceMobile: string[] = [];
    parse(reference("style").text()).walkRules(".mobile_px-4", (rule) => {
      rule.walkDecls("padding-left", (declaration) => {
        sourceMobile.push(declaration.value);
      });
    });
    expect(sourceMobile).toEqual(["1rem"]);

    const source = readFileSync(
      new URL("../../templates/05-Studio/promo.mjml", import.meta.url),
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
    expect(rendered(".studio-review-section").hasClass("studio-mobile-inset")).toBe(false);
    expect(rendered(".studio-review-section > table > tbody > tr > td").css("padding")).toBe(
      "72px 32px 0px",
    );
    expect(rendered(".studio-mobile-card > table > tbody > tr > td").css("padding")).toBe(
      "80px 48px",
    );
    const mobile: Record<string, string> = {};
    parse(rendered("style").text()).walkRules(
      ".studio-mobile-card > table > tbody > tr > td",
      (rule) => {
        rule.walkDecls((declaration) => {
          mobile[declaration.prop] = declaration.value;
        });
      },
    );
    expect(mobile).toMatchObject({ "padding-left": "16px", "padding-right": "16px" });
    const scoped = scopeDocumentCss([{ css: rendered("style").text(), inline: "head" }], {
      scope: "studio-promo-card",
    });
    const bridged: string[] = [];
    parse(scoped.css).walkRules((rule) => {
      if (rule.selector.includes('.studio-mobile-card[data-pm-mjml-padding="self"]'))
        rule.walkDecls("padding-left", (declaration) => {
          bridged.push(declaration.value);
        });
    });
    expect(bridged).toEqual(["16px"]);
  });
});
