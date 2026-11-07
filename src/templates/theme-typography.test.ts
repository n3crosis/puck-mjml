import { readFileSync } from "node:fs";
import { load, type CheerioAPI } from "cheerio";
import { parse } from "postcss";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { fromMjml } from "../import";
import { toMjml } from "../export";

beforeAll(() => vi.stubGlobal("window", globalThis));
afterAll(() => vi.unstubAllGlobals());

function declarations(style: string | undefined) {
  const result: Record<string, string> = {};
  parse(`text { ${style ?? ""} }`).walkDecls((declaration) => {
    result[declaration.prop] = declaration.value;
  });
  return result;
}

function reference(name: string) {
  // Actual React Email output at the pinned source commit, not MJML snapshots.
  return load(
    readFileSync(
      new URL(`../../tests/fixtures/react-email-reference/${name}.html`, import.meta.url),
      "utf8",
    ),
  );
}

async function compile(name: string, roundTrip: boolean) {
  const source = readFileSync(new URL(`../../templates/${name}.mjml`, import.meta.url), "utf8");
  const imported = fromMjml(source);
  expect(imported.warnings).toEqual([]);
  expect(source).not.toMatch(/<mj-(?:raw|include)\b/);
  const { default: mjml } = await import("mjml-browser");
  const result = await mjml(roundTrip ? toMjml(imported.document) : source, {
    validationLevel: "strict",
  });
  expect(result.errors).toEqual([]);
  return load(result.html);
}

function textAtSize($: CheerioAPI, tag: string, size: string) {
  return $(tag).filter((_index, node) => declarations($(node).attr("style"))["font-size"] === size);
}

describe.each([false, true])("theme typography, editor round trip: %s", (roundTrip) => {
  it.each([
    ["welcome", "#43454B", "rgb(67,69,75)"],
    ["product-update", "#43454B", "rgb(67,69,75)"],
    ["feature-announcement", "#14171E", "rgb(20,23,30)"],
  ])("Barebone %s preserves its app CTA heading typography", async (name, color, originalColor) => {
    const original = reference(`01-Barebone/${name}`);
    const rendered = await compile(`01-Barebone/${name}`, roundTrip);
    const originalHeading = textAtSize(original, "p", "28px");
    const renderedHeading = textAtSize(rendered, "div", "28px");
    expect(originalHeading).toHaveLength(1);
    expect(renderedHeading).toHaveLength(1);
    expect(renderedHeading.text()).toBe(originalHeading.text());
    const originalStyle = declarations(originalHeading.attr("style"));
    const renderedStyle = declarations(renderedHeading.attr("style"));
    expect(originalStyle).toMatchObject({ "font-weight": "600", color: originalColor });
    expect(renderedStyle.color).toBe(color);
    for (const property of ["font-weight", "font-size", "line-height", "letter-spacing"]) {
      expect(renderedStyle[property], property).toBe(originalStyle[property]);
    }
    // These headings use font-28; their buttons still correctly use font-16's 420 weight.
    const buttons = rendered("a").filter(
      (_index, node) => declarations(rendered(node).attr("style"))["font-size"] === "16px",
    );
    expect(buttons.length).toBeGreaterThan(0);
    buttons.each((_index, node) => {
      expect(declarations(rendered(node).attr("style"))["font-weight"]).toBe("420");
    });
  });

  it("Matte welcome preserves the original normal leading on all three tip titles", async () => {
    const original = reference("02-Matte/welcome");
    const rendered = await compile("02-Matte/welcome", roundTrip);
    const originalTitles = textAtSize(original, "p", "20px");
    const renderedTitles = textAtSize(rendered, "div", "20px");
    expect(originalTitles).toHaveLength(3);
    expect(renderedTitles).toHaveLength(3);
    renderedTitles.each((index, node) => {
      const originalTitle = originalTitles.eq(index);
      expect(rendered(node).text().trim()).toBe(originalTitle.text());
      const originalStyle = declarations(originalTitle.attr("style"));
      const renderedStyle = declarations(rendered(node).attr("style"));
      expect(originalStyle["line-height"]).toBe("1.5");
      for (const property of ["font-size", "line-height", "letter-spacing"]) {
        expect(renderedStyle[property], property).toBe(originalStyle[property]);
      }
    });
  });

  it("Barebone feature announcement preserves its centered 420px app CTA heading", async () => {
    const original = reference("01-Barebone/feature-announcement");
    const rendered = await compile("01-Barebone/feature-announcement", roundTrip);
    const originalHeading = textAtSize(original, "p", "28px");
    const renderedHeading = textAtSize(rendered, "div", "28px");
    expect(originalHeading).toHaveLength(1);
    expect(renderedHeading).toHaveLength(1);
    const originalStyle = declarations(originalHeading.attr("style"));
    const renderedStyle = declarations(renderedHeading.attr("style"));
    expect(originalStyle).toMatchObject({
      "max-width": "420px",
      "margin-left": "auto",
      "margin-right": "auto",
    });
    expect(renderedStyle["max-width"]).toBe(originalStyle["max-width"]);
    expect(renderedStyle.margin).toBe("0 auto");
  });

  it("Matte feature announcement preserves 24px CTA line boxes with 21px inline links", async () => {
    const original = reference("02-Matte/feature-announcement");
    const rendered = await compile("02-Matte/feature-announcement", roundTrip);
    const labels = ["See what's new →", "See how it works →", "View the details →"];
    for (const label of labels) {
      const originalLink = original("a").filter(
        (_index, node) => original(node).text().trim() === label,
      );
      const renderedLink = rendered("a").filter(
        (_index, node) => rendered(node).text().trim() === label,
      );
      expect(originalLink).toHaveLength(1);
      expect(renderedLink).toHaveLength(1);
      const originalParagraphStyle = declarations(originalLink.parent().attr("style"));
      const renderedParagraphStyle = declarations(renderedLink.parent().attr("style"));
      const originalLinkStyle = declarations(originalLink.attr("style"));
      const renderedLinkStyle = declarations(renderedLink.attr("style"));
      expect(originalParagraphStyle["line-height"]).toBe("24px");
      expect(renderedParagraphStyle["line-height"]).toBe(originalParagraphStyle["line-height"]);
      expect(renderedParagraphStyle["font-size"]).toBe(originalLinkStyle["font-size"]);
      expect(originalLinkStyle["line-height"]).toBe("1.5");
      expect(renderedLinkStyle["line-height"]).toBe(originalLinkStyle["line-height"]);
    }
  });

  it("Barebone text-only preserves the account link's distinct foreground color", async () => {
    const original = reference("01-Barebone/text-only");
    const rendered = await compile("01-Barebone/text-only", roundTrip);
    const originalLink = original("a").filter(
      (_index, node) => original(node).text() === "Open your account",
    );
    const renderedLink = rendered("a").filter(
      (_index, node) => rendered(node).text() === "Open your account",
    );
    expect(originalLink).toHaveLength(1);
    expect(renderedLink).toHaveLength(1);
    expect(declarations(originalLink.attr("style")).color).toBe("rgb(20,23,30)");
    expect(declarations(renderedLink.attr("style")).color.toLowerCase()).toBe("#14171e");
    expect(declarations(originalLink.parent().attr("style")).color).toBe("rgb(67,69,75)");
    expect(declarations(renderedLink.parent().attr("style")).color).toBe("#43454B");
  });

  it("Barebone product update preserves 20px leading on all three numbered steps", async () => {
    const original = reference("01-Barebone/product-update");
    const rendered = await compile("01-Barebone/product-update", roundTrip);
    for (const label of ["1", "2", "3"]) {
      const originalStep = original("p").filter((_index, node) => original(node).text() === label);
      const renderedStep = textAtSize(rendered, "div", "14px").filter(
        (_index, node) => rendered(node).text() === label,
      );
      expect(originalStep).toHaveLength(1);
      expect(renderedStep).toHaveLength(1);
      const originalStyle = declarations(originalStep.attr("style"));
      const renderedStyle = declarations(renderedStep.attr("style"));
      expect(originalStyle["line-height"]).toBe("1.25rem");
      expect(originalStyle["font-size"]).toBe("0.875rem");
      // The reference has no root font-size override: its rem is the browser's 16px default.
      expect(renderedStyle["line-height"]).toBe(
        `${parseFloat(originalStyle["line-height"]) * 16}px`,
      );
      expect(renderedStyle["font-size"]).toBe(`${parseFloat(originalStyle["font-size"]) * 16}px`);
      expect(renderedStyle["font-weight"]).toBe(originalStyle["font-weight"]);
    }
  });

  it.each([
    ["feature-announcement", 5],
    ["product-update", 4],
    ["subscription-confirmation", 2],
    ["welcome", 2],
  ] as const)("Protocol %s preserves inherited tracking on its 20px text", async (name, count) => {
    const original = reference(`03-Protocol/${name}`);
    const rendered = await compile(`03-Protocol/${name}`, roundTrip);
    const originalText = textAtSize(original, "p", "20px");
    const renderedText = textAtSize(rendered, "div", "20px");
    expect(originalText).toHaveLength(count);
    expect(renderedText).toHaveLength(count);
    renderedText.each((index, node) => {
      const originalNode = originalText.eq(index);
      expect(rendered(node).text().replace(/\s+/g, " ").trim()).toBe(originalNode.text());
      const originalStyle = declarations(originalNode.attr("style"));
      const renderedStyle = declarations(rendered(node).attr("style"));
      const originalTracking = [originalNode[0], ...originalNode.parents().toArray()]
        .map((ancestor) => declarations(original(ancestor).attr("style"))["letter-spacing"])
        .find((value) => value && value !== "inherit");
      expect(originalTracking).toBe("0.3px");
      expect(renderedStyle["letter-spacing"]).toBe(originalTracking);
      for (const property of ["font-size", "font-weight", "line-height"]) {
        expect(renderedStyle[property], property).toBe(originalStyle[property]);
      }
    });
  });
});
