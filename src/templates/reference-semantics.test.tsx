import { readFileSync } from "node:fs";
import { Render, type Data } from "@puckeditor/core";
import { load, type CheerioAPI } from "cheerio";
import { parse } from "postcss";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createEmailConfig } from "../config";
import { fromMjml } from "../import";
import { toMjml } from "../export";

beforeAll(() => vi.stubGlobal("window", globalThis));
afterAll(() => vi.unstubAllGlobals());

const fixtureRoot = new URL("../../.cache/react-email-reference/", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("manifest.json", fixtureRoot), "utf8")) as {
  templates: { file: string; html: string }[];
};
const inheritedTypography = [
  "font-family",
  "font-size",
  "font-weight",
  "line-height",
  "letter-spacing",
  "color",
  "text-transform",
];
const normalized = (text: string) => text.replace(/\s+/g, " ").trim();

function headings($: CheerioAPI) {
  return $("h1,h2,h3,h4,h5,h6")
    .toArray()
    .map((node) => ({ level: node.tagName, text: normalized($(node).text()) }));
}

function declarations(style: string | undefined) {
  const result: Record<string, string> = {};
  parse(`element { ${style ?? ""} }`).walkDecls((declaration) => {
    result[declaration.prop] = declaration.value;
  });
  return result;
}

function images($: CheerioAPI) {
  return $("img")
    .toArray()
    .map((node) => $(node).attr("src"));
}

function links($: CheerioAPI) {
  return $("a")
    .toArray()
    .map((node) => ({
      href: $(node).attr("href")
        ? new URL($(node).attr("href")!, "https://demo.react.email/").href
        : undefined,
      text: normalized($(node).text()),
    }));
}

function expectHeadingStyles($: CheerioAPI, count: number) {
  const wrappers = $(".reference-heading");
  expect(wrappers).toHaveLength(count);
  wrappers.each((_index, node) => {
    // The dedicated class may accompany other styles, but is never duplicated
    // or used on a broader container that would accidentally restyle body copy.
    expect(
      $(node)
        .attr("class")
        ?.split(/\s+/)
        .filter((name) => name === "reference-heading"),
    ).toHaveLength(1);
    expect($(node).find("h1,h2")).toHaveLength(1);
  });
  $("h1,h2").each((_index, node) => {
    const style = declarations($(node).attr("style"));
    expect(style.margin).toBe("0");
    for (const property of inheritedTypography) expect(style[property], property).toBe("inherit");
  });
}

describe("authentic React Email content hierarchy", () => {
  it("covers the complete 62-template inventory and all 36 original headings", () => {
    expect(manifest.templates).toHaveLength(62);
    const counts = manifest.templates.map(
      (entry) => headings(load(readFileSync(new URL(entry.html, fixtureRoot), "utf8"))).length,
    );
    expect(counts.filter(Boolean)).toHaveLength(21);
    expect(counts.reduce((total, count) => total + count, 0)).toBe(36);
  });

  it.each(manifest.templates)(
    "$file preserves original headings through safe editing",
    async (entry) => {
      const source = readFileSync(
        new URL(`../../templates/${entry.file}`, import.meta.url),
        "utf8",
      );
      const original = load(readFileSync(new URL(entry.html, fixtureRoot), "utf8"));
      const expected = headings(original);
      const imported = fromMjml(source);
      expect(imported.warnings).toEqual([]);
      const roundTrip = toMjml(imported.document);
      expect(source).not.toMatch(/<mj-(?:raw|include)\b/);
      expect(roundTrip).not.toMatch(/<mj-(?:raw|include)\b/);
      const { default: mjml } = await import("mjml-browser");
      const outputs: CheerioAPI[] = [];
      for (const input of [source, roundTrip]) {
        const result = await mjml(input, { validationLevel: "strict" });
        expect(result.errors).toEqual([]);
        const $ = load(result.html);
        outputs.push($);
        expect(headings($)).toEqual(expected);
        expectHeadingStyles($, expected.length);
        expect(images($)).toEqual(images(original));
        const originalDestinations = new Set(
          links(original)
            .map((link) => link.href)
            .filter(Boolean),
        );
        const destinations = new Set(
          links($)
            .map((link) => link.href)
            .filter(Boolean),
        );
        for (const href of originalDestinations) expect(destinations.has(href), href).toBe(true);
      }
      expect(links(outputs[1])).toEqual(links(outputs[0]));

      if (expected.length) {
        // Exercise the real safe Puck renderer, not reconstructed MJML HTML.
        // This is DOM/CSS coverage; browser screenshots remain the visual gate.
        const canvas = load(
          renderToStaticMarkup(
            <Render config={createEmailConfig()} data={imported.document as Data} />,
          ),
        );
        expect(headings(canvas)).toEqual(expected);
        expect(canvas(".reference-heading")).toHaveLength(expected.length);
        const css = parse(
          canvas("style")
            .toArray()
            .map((node) => canvas(node).text())
            .join("\n"),
        );
        const rules: string[] = [];
        css.walkRules((rule) => {
          if (rule.selector.includes(".reference-heading h1")) {
            rules.push(rule.selector);
            const style = declarations(rule.nodes.map((node) => node.toString()).join(";"));
            expect(style.margin).toBe("0");
            for (const property of inheritedTypography) expect(style[property]).toBe("inherit");
          }
        });
        expect(rules).toHaveLength(1);
        expect(rules[0]).toMatch(/\.pm-canvas-[^ ]+ \.reference-heading h1/);
      }
    },
  );
});

describe.each([false, true])(
  "scoped inline reference formatting, editor round trip: %s",
  (roundTrip) => {
    async function compile(name: string) {
      const source = readFileSync(new URL(`../../templates/${name}.mjml`, import.meta.url), "utf8");
      const imported = fromMjml(source);
      expect(imported.warnings).toEqual([]);
      const { default: mjml } = await import("mjml-browser");
      const result = await mjml(roundTrip ? toMjml(imported.document) : source, {
        validationLevel: "strict",
      });
      expect(result.errors).toEqual([]);
      return load(result.html);
    }

    it("retains CodePen's one combined heading and the existing separate Cubes typography", async () => {
      const $ = await compile("Community/newsletters/codepen-challengers");
      expect(headings($)).toEqual([{ level: "h1", text: "This week: #CodePenChallenge: Cubes" }]);
      const label = $(".codepen-challenge-heading h1 > em");
      expect(label).toHaveLength(1);
      expect(label.text()).toBe("Cubes");
      expect(declarations(label.attr("style"))).toMatchObject({
        display: "block",
        "padding-top": "4px",
        "font-size": "32px",
        "line-height": "24px",
        "font-style": "normal",
        "font-weight": "400",
      });
      expect(declarations($(".codepen-challenge-heading > div").attr("style"))).toMatchObject({
        "font-size": "32px",
        "line-height": "normal",
        "font-weight": "400",
      });
    });

    it("does not promote Barebone's first ordinary Some new things paragraph to a heading", async () => {
      const $ = await compile("01-Barebone/product-update");
      const labels = $("div").filter(
        (_index, node) =>
          normalized($(node).text()) === "Some new things" && $(node).find("div").length === 0,
      );
      expect(labels).toHaveLength(3);
      expect(labels.eq(0).find("h1,h2")).toHaveLength(0);
      expect(labels.eq(1).children("h2")).toHaveLength(1);
      expect(labels.eq(2).children("h2")).toHaveLength(1);
    });

    it("restores GitHub's original blue anchor labels without inventing destinations", async () => {
      const $ = await compile("Community/notifications/github-access-token");
      const original = load(
        readFileSync(
          new URL("Community/notifications/github-access-token.html", fixtureRoot),
          "utf8",
        ),
      );
      for (const [text, color] of [
        ["resend", "#067df7"],
        ["Your security audit log", "#0366d6"],
        ["Contact support", "#0366d6"],
      ]) {
        const link = $("a").filter((_index, node) => $(node).text() === text);
        const reference = original("a").filter((_index, node) => original(node).text() === text);
        expect(link).toHaveLength(1);
        expect(reference).toHaveLength(1);
        expect(reference.attr("href")).toBeUndefined();
        expect(link.attr("href")).toBeUndefined();
        expect(declarations(link.attr("style"))).toMatchObject({
          color,
          "text-decoration": "none",
        });
      }
    });
  },
);
