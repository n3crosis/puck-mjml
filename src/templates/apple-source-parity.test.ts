import { readFileSync } from "node:fs";
import { load } from "cheerio";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { fromMjml } from "../import";
import { toMjml } from "../export";

beforeAll(() => vi.stubGlobal("window", globalThis));
afterAll(() => vi.unstubAllGlobals());

it("preserves Apple's invoice paragraphs and visible link typography through editing export", async () => {
  const source = readFileSync(
    new URL("../../templates/Community/receipts/apple-receipt.mjml", import.meta.url),
    "utf8",
  );
  const reference = load(
    readFileSync(
      new URL(
        "../../.cache/react-email-reference/Community/receipts/apple-receipt.html",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const wallet = reference('img[alt="Apple Wallet"]').parent();
  // The anchor inherits 16px, but the visible text span is 14px.
  expect(wallet.find("span").css("font-size")).toBe("14px");
  const imported = fromMjml(source);
  expect(imported.warnings).toEqual([]);
  const { default: render } = await import("mjml-browser");
  for (const mjml of [source, toMjml(imported.document)]) {
    const result = await render(mjml, { validationLevel: "strict" });
    expect(result.errors).toEqual([]);
    const html = load(result.html);
    const invoice = html(".apple-invoice > table");
    expect(invoice.find("td")).toHaveLength(5);
    expect(invoice.find("p")).toHaveLength(14);
    expect(invoice.find("td").first().css("padding")).toBe("0px 0px 0px 20px");
    expect(html(".community-rich-5 > div").css("font-size")).toBe("14px");
    const styles = html("style").text();
    expect(styles).toMatch(/\.apple-invoice p\s*\{[^}]*line-height:\s*1\.4/);
    expect(styles).toMatch(
      /\.apple-invoice p:first-child\s*\{[^}]*font-size:\s*10px;[^}]*line-height:\s*1\.4/,
    );
    expect(styles).toMatch(/a\s*\{\s*color:\s*#067df7;\s*text-decoration:\s*none/);
    expect(styles).toMatch(/\.apple-invoice a\s*\{[^}]*text-decoration:\s*underline/);
  }
});
