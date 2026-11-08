import { readFileSync } from "node:fs";
import { load } from "cheerio";
import postcss from "postcss";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { fromMjml } from "../import";
import { toMjml } from "../export";

beforeAll(() => vi.stubGlobal("window", globalThis));
afterAll(() => vi.unstubAllGlobals());

// Measured from the authentic React Email output at the pinned upstream commit
// 674d8ec2804b86be5d99156383fb1810179847bf, not from our own MJML compiler.
describe.each([false, true])("Dropbox design, editor round trip: %s", (roundTrip) => {
  it("preserves original text weight, color, leading, link color, and button geometry", async () => {
    const source = readFileSync(
      new URL(
        "../../templates/Community/reset-password/dropbox-reset-password.mjml",
        import.meta.url,
      ),
      "utf8",
    );
    const { document, warnings } = fromMjml(source);
    expect(warnings).toEqual([]);
    const { default: mjml2html } = await import("mjml-browser");
    const result = await mjml2html(roundTrip ? toMjml(document) : source, {
      validationLevel: "strict",
    });
    expect(result.errors).toEqual([]);
    const $ = load(result.html);
    const paragraphs = $("div").filter(
      (_index, node) => $(node).attr("style")?.includes("font-size:16px") ?? false,
    );
    expect(paragraphs).toHaveLength(5);
    paragraphs.each((_index, paragraph) => {
      const style = $(paragraph).attr("style");
      expect(style).toContain("font-weight:300");
      expect(style).toContain("line-height:26px");
      expect(style).toContain("color:#404040");
    });
    const button = $("a").filter((_index, node) => $(node).text().trim() === "Reset password");
    expect(button.attr("style")).toContain("line-height:100%");
    expect(button.css("font-family")).toBe("inherit");
    expect(document.root.props!.fontImports).toEqual([]);
    expect(result.html).not.toMatch(/fonts\.googleapis\.com|@font-face/);
    expect(button.closest(".dropbox-reset-button")).toHaveLength(1);
    expect(button.attr("style")).toContain("padding:14px 7px");
    expect(button.closest("table").attr("style")).toContain("width:224px");
    const styles = postcss.parse(
      $("style")
        .map((_index, style) => $(style).text())
        .get()
        .join("\n"),
    );
    const families: Record<string, string[]> = {};
    styles.walkRules((rule) => {
      rule.walkDecls("font-family", (declaration) => {
        families[rule.selector] = postcss.list
          .comma(declaration.value)
          .map((family) => family.replace(/^(['"])(.*)\1$/, "$2"));
        expect(declaration.important).toBe(true);
      });
    });
    expect(families.body).toEqual([
      "Open Sans",
      "HelveticaNeue-Light",
      "Helvetica Neue Light",
      "Helvetica Neue",
      "Helvetica",
      "Arial",
      "Lucida Grande",
      "sans-serif",
    ]);
    expect(families[".dropbox-reset-button a"]).toEqual(["Open Sans", "Helvetica Neue", "Arial"]);
    paragraphs.each((_index, paragraph) => {
      expect($(paragraph).css("font-family")).toBe("inherit");
    });
    let linkColor = "";
    styles.walkRules(".community-rich-0 a:nth-of-type(1)", (rule) => {
      rule.walkDecls("color", (declaration) => {
        linkColor = declaration.value;
      });
    });
    expect(linkColor).toBe("#067df7");
  });
});
