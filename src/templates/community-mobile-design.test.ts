import { readFileSync } from "node:fs";
import * as cheerio from "cheerio";
import postcss from "postcss";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { fromMjml } from "../import";
import { toMjml } from "../export";

beforeAll(() => vi.stubGlobal("window", globalThis));
afterAll(() => vi.unstubAllGlobals());

const sources = {
  apple: "Community/receipts/apple-receipt.mjml",
  nike: "Community/receipts/nike-receipt.mjml",
  airbnb: "Community/reviews/airbnb-review.mjml",
  google: "Community/newsletters/google-play-policy-update.mjml",
} as const;

type Template = keyof typeof sources;
const sourceFor = (name: Template) =>
  readFileSync(new URL(`../../templates/${sources[name]}`, import.meta.url), "utf8");

async function compiled(name: Template, roundTrip = false) {
  const source = sourceFor(name);
  const { document, warnings } = fromMjml(source);
  expect(warnings).toEqual([]);
  const output = roundTrip ? toMjml(document) : source;
  const { default: mjml2html } = await import("mjml-browser");
  const result = await mjml2html(output, { validationLevel: "strict" });
  expect(result.errors).toEqual([]);
  expect(output).not.toMatch(/<mj-(?:raw|include)\b/);
  return cheerio.load(result.html);
}

function hasCssRule(
  $: cheerio.CheerioAPI,
  selector: string,
  property: string,
  value: string,
  media?: string,
) {
  const css = postcss.parse(
    $("style")
      .map((_index, element) => $(element).text())
      .get()
      .join("\n"),
  );
  let found = false;
  css.walkRules(selector, (rule) => {
    if (
      media &&
      !(
        rule.parent?.type === "atrule" &&
        rule.parent.name === "media" &&
        rule.parent.params === media
      )
    )
      return;
    rule.walkDecls(property, (declaration) => {
      if (declaration.value === value && declaration.important) found = true;
    });
  });
  return found;
}

// These are source/compiler regression checks for the native responsive layout.
// Actual 390px pixel geometry is verified by the browser suite in CI.
describe.each([false, true])("Community mobile design, editor round trip: %s", (roundTrip) => {
  it("keeps Apple's header, purchased item, and total in non-stacking native rows", async () => {
    const $ = await compiled("apple", roundTrip);
    for (const [name, widths] of [
      ["apple-header-row", [50, 50]],
      ["apple-item-row", [14, 72, 14]],
      ["apple-total-row", [80, 20]],
    ] as const) {
      const columns = $(`.${name} > div`);
      expect(columns).toHaveLength(widths.length);
      columns.each((index, element) => {
        expect($(element).attr("style")).toContain("display:inline-block;");
        expect($(element).attr("style")).toContain(`width:${widths[index]}%;`);
      });
    }
    for (const [name, width] of [
      ["apple-item-icon", "20%"],
      ["apple-item-description", "64%"],
      ["apple-item-price", "16%"],
    ]) {
      expect(hasCssRule($, `.${name}`, "width", width!, "only screen and (max-width: 479px)")).toBe(
        true,
      );
    }
    expect($(".apple-item-row img").attr("src")).toContain("apple-hbo-max-icon.jpeg");
    expect($(".apple-item-description").text()).toContain("HBO Max: Stream TV & Movies");
    expect($(".apple-item-price").text().trim()).toBe("$14.99");
  });

  it("keeps Apple's wallet icon adjacent to its link inside a compact centered group", async () => {
    const $ = await compiled("apple", roundTrip);
    const group = $(".apple-wallet-cta");
    expect(group.children("div")).toHaveLength(2);
    expect(group.find("img").attr("src")).toContain("apple-wallet.png");
    expect(group.find("a").last().text().trim()).toBe("Apply and use in minutes");
    expect(group.closest("td").attr("style")).toContain("text-align:center;");
    expect(hasCssRule($, ".apple-wallet-cta", "width", "220px")).toBe(true);
    expect(group.find("img").attr("width")).toBe("28");
  });

  it("keeps Nike recommendations in two mobile pairs with fluid images and breathing room", async () => {
    const source = cheerio.load(sourceFor("nike"), { xml: true });
    const pairs = source('mj-group[css-class="nike-recommendation-pair"]');
    expect(pairs).toHaveLength(2);
    pairs.each((_index, element) => {
      const pair = source(element);
      expect(pair.attr("width")).toBe("50%");
      expect(pair.children("mj-column")).toHaveLength(2);
      pair.children("mj-column").each((_index, column) => {
        expect(source(column).attr("width")).toBe("50%");
        expect(source(column).attr("padding")).toBe("0px 6px 24px");
        expect(source(column).find("mj-image").attr("fluid-on-mobile")).toBe("true");
        source(column)
          .find("mj-text")
          .each((_index, text) => {
            expect(source(text).attr("line-height")).toBe("1.4");
          });
      });
    });
    const $ = await compiled("nike", roundTrip);
    expect($(".nike-recommendation-pair")).toHaveLength(2);
    expect($(".nike-recommendation-pair > .nike-recommendation-card")).toHaveLength(4);
    expect($(".nike-recommendation-card table.mj-full-width-mobile")).toHaveLength(4);
    expect($(".nike-recommendation-card img")).toHaveLength(4);
  });

  it("keeps Google Play's three social icons in one left-aligned compact row", async () => {
    const $ = await compiled("google", roundTrip);
    const group = $(".google-play-social-icons");
    expect(group.children("div")).toHaveLength(3);
    expect(group.find("img")).toHaveLength(3);
    expect(group.closest("td").attr("style")).toContain("text-align:left;");
    expect(hasCssRule($, ".google-play-social-icons", "width", "96px")).toBe(true);
    group.children("div").each((_index, element) => {
      expect($(element).attr("style")).toContain("display:inline-block;");
      expect($(element).find("img").attr("width")).toBe("28");
      expect($(element).find("img").attr("height")).toBe("28");
      expect($(element).find("a").attr("href")).toBe("https://notifications.google.com");
    });
  });

  it("gives Airbnb's body, review, and button consistent horizontal gutters", async () => {
    const $ = await compiled("airbnb", roundTrip);
    const contentCell = $(".airbnb-content > table > tbody > tr > td");
    expect(contentCell).toHaveLength(1);
    expect(contentCell.attr("style")).toContain("padding:20px 24px 48px;");
    expect(contentCell.text()).toContain("Here's what Alex wrote");
    expect(contentCell.find('a[href="https://www.airbnb.com"]').text().trim()).toBe(
      "Send My Feedback",
    );
    expect(sourceFor("airbnb")).toContain("Intentional readability improvement over upstream");
  });
});
