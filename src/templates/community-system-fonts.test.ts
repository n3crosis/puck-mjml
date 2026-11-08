import { readFileSync } from "node:fs";
import { load } from "cheerio";
import { list, parse } from "postcss";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { scopeDocumentCss } from "../canvas-css";
import { inlineStyleFontFamilies, resolveImplicitFontImports } from "../canvas-font-resolver";
import { fromMjml } from "../import";
import { toMjml } from "../export";

beforeAll(() => vi.stubGlobal("window", globalThis));
afterAll(() => vi.unstubAllGlobals());

const names = [
  "magic-links/aws-verify-email",
  "magic-links/linear-login-code",
  "magic-links/notion-magic-link",
  "magic-links/slack-confirm",
  "newsletters/codepen-challengers",
  "newsletters/google-play-policy-update",
  "notifications/yelp-recent-login",
  "receipts/nike-receipt",
  "reset-password/dropbox-reset-password",
  "reviews/airbnb-review",
  "welcome/koala-welcome",
  "welcome/stripe-welcome",
];
const stack = (value: string) =>
  list.comma(value).map((family) => family.replace(/^(['"])(.*)\1$/, "$2"));
const families = (css: string) => {
  const result: string[][] = [];
  parse(css).walkDecls("font-family", (declaration) => {
    result.push(stack(declaration.value));
  });
  return result;
};

describe.each(names)("%s installed-font intent", (name) => {
  it.each([false, true])(
    "preserves original stacks without downloads, round trip: %s",
    async (roundTrip) => {
      const input = readFileSync(
        new URL(`../../templates/Community/${name}.mjml`, import.meta.url),
        "utf8",
      );
      const reference = load(
        readFileSync(
          new URL(`../../.cache/react-email-reference/Community/${name}.html`, import.meta.url),
          "utf8",
        ),
      );
      const imported = fromMjml(input);
      expect(imported.warnings).toEqual([]);
      const source = roundTrip ? toMjml(imported.document) : input;
      const document = fromMjml(source).document;
      const settings = document.root.props!;
      expect(settings.fontImports).toEqual([]);
      const { default: compile } = await import("mjml-browser");
      const result = await compile(source, { validationLevel: "strict" });
      expect(result.errors).toEqual([]);
      expect(result.html).not.toMatch(/fonts\.googleapis\.com|@font-face/);
      const output = load(result.html);
      const inlineFamilies: string[] = [];
      output("[style]").each((_index, node) => {
        const family = output(node).css("font-family");
        if (family) inlineFamilies.push(family);
      });
      expect(resolveImplicitFontImports(inlineFamilies, [])).toEqual([]);
      const styles = settings.headStyles ?? [];
      expect(resolveImplicitFontImports(inlineStyleFontFamilies(styles), [])).toEqual([]);
      const scoped = scopeDocumentCss(styles, { scope: "pm-canvas-installed-fonts" });
      expect(scoped.notes).toEqual([]);
      expect(scoped.fontAliases).toEqual({});
      const outputStacks = families(output("style").text());
      const scopedStacks = families(scoped.css);
      reference("[style]").each((_index, node) => {
        const family = reference(node).css("font-family");
        if (!family) return;
        expect(outputStacks).toContainEqual(stack(family));
        expect(scopedStacks).toContainEqual(stack(family));
      });
      expect(
        output("[style]").filter((_index, node) => output(node).css("font-family") === "inherit")
          .length,
      ).toBeGreaterThan(0);
      if (name.includes("dropbox")) {
        const button = output(".dropbox-reset-button a");
        expect(button).toHaveLength(1);
        expect(button.text().trim()).toBe("Reset password");
        const rules: string[] = [];
        parse(output("style").text()).walkRules(".dropbox-reset-button a", (rule) => {
          rule.walkDecls("font-family", (decl) => {
            rules.push(decl.value);
          });
        });
        expect(rules.map(stack)).toEqual([
          stack(
            reference("a")
              .filter((_index, node) => reference(node).text().trim() === "Reset password")
              .css("font-family")!,
          ),
        ]);
      }
    },
  );
});
