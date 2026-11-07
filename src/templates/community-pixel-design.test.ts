import { readFileSync } from "node:fs";
import { load, type CheerioAPI } from "cheerio";
import { parse } from "postcss";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { fromMjml } from "../import";
import { toMjml } from "../export";

beforeAll(() => vi.stubGlobal("window", globalThis));
afterAll(() => vi.unstubAllGlobals());

const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
const source = (name: string) =>
  readFileSync(new URL(`../../templates/Community/${name}.mjml`, import.meta.url), "utf8");
const reference = (name: string) =>
  load(
    readFileSync(
      new URL(`../../tests/fixtures/react-email-reference/Community/${name}.html`, import.meta.url),
      "utf8",
    ),
  );

function declarations(value: string | undefined) {
  const result: Record<string, string> = {};
  parse(`element { ${value ?? ""} }`).walkDecls((declaration) => {
    result[declaration.prop] = declaration.value;
  });
  return result;
}

function textStyle($: CheerioAPI, text: string, original = false) {
  const elements = $(original ? "p,h1,h2" : "div,p")
    .filter((_index, node) => normalize($(node).text()) === text)
    .filter((_index, node) => original || $(node).find("div,p").length === 0);
  expect(elements, text).toHaveLength(1);
  return declarations(elements.attr("style"));
}

function pixels(value: string, fontSize = 16) {
  if (value.endsWith("rem")) return Number.parseFloat(value) * 16;
  if (value.endsWith("px")) return Number.parseFloat(value);
  return Number(value) * fontSize;
}

function family(value: string) {
  return value.replace(/["'\s]/g, "").toLowerCase();
}

function ruleStyle($: CheerioAPI, selector: string) {
  const result: Record<string, string> = {};
  parse(
    $("style")
      .map((_index, node) => $(node).text())
      .get()
      .join("\n"),
  ).walkRules((rule) => {
    if (rule.selectors.includes(selector)) {
      rule.walkDecls((declaration) => {
        result[declaration.prop] = declaration.value;
      });
    }
  });
  return result;
}

async function compiled(name: string, roundTrip: boolean) {
  const input = source(name);
  const imported = fromMjml(input);
  expect(imported.warnings).toEqual([]);
  const native = roundTrip ? toMjml(imported.document) : input;
  expect(native).not.toMatch(/<mj-(?:raw|include)\b/);
  const { default: mjml } = await import("mjml-browser");
  const result = await mjml(native, { validationLevel: "strict" });
  expect(result.errors).toEqual([]);
  return load(result.html);
}

// These fixes follow the immutable source and the 800/390px pixel audit.
// Compiler/DOM checks do not replace the subsequent browser screenshot gate.
describe.each([false, true])("Community pixel design, editor round trip: %s", (roundTrip) => {
  it("retains Linear's original heading-to-button gap and unadorned footer link", async () => {
    const name = "magic-links/linear-login-code";
    const original = reference(name);
    const $ = await compiled(name, roundTrip);
    const heading = textStyle(original, "Your login code for Linear", true);
    // The original h1 retains the browser's 0.67em vertical margins in addition
    // to its explicit 17px top padding. Native text blocks need explicit padding.
    expect(heading["font-size"]).toBe("24px");
    expect(heading["padding-top"]).toBe("17px");
    expect(heading["margin-bottom"]).toBeUndefined();
    expect(declarations($("h1").closest("td").attr("style")).padding).toBe("33.08px 0px 16.08px");
    const footer = original("a").filter((_index, node) => original(node).text() === "Linear");
    expect(declarations(footer.attr("style"))["text-decoration-line"]).toBe("none");
    expect(ruleStyle($, ".community-rich-1 a:nth-of-type(1)")["text-decoration"]).toBe("none");
  });

  it("keeps Notion's source paragraph leading and compact monospace code", async () => {
    const name = "magic-links/notion-magic-link";
    const original = reference(name);
    const $ = await compiled(name, roundTrip);
    for (const text of [
      "Or, copy and paste this temporary login code:",
      "If you didn't try to login, you can safely ignore this email.",
      "Hint: You can set a permanent password in Settings & members → My account.",
    ]) {
      expect(textStyle($, text)["line-height"]).toBe(
        textStyle(original, text, true)["line-height"],
      );
    }
    expect(declarations(original("code").attr("style"))["font-size"]).toBeUndefined();
    // Chromium's original unstyled code uses the default 13px fixed-width font.
    // Do not enlarge it to the 16px proportional body default during conversion.
    expect(declarations($(".community-rich-1 > div").attr("style"))["font-size"]).toBe("13px");
    expect(ruleStyle($, ".community-rich-1 > div")["line-height"]).toBe("normal");
    expect(ruleStyle($, ".notion-heading > div")["line-height"]).toBe("normal");
    const footer = original("a").filter((_index, node) => original(node).text() === "Notion.so");
    expect(ruleStyle($, ".community-rich-2 a:nth-of-type(1)")["font-size"]).toBe(
      declarations(footer.attr("style"))["font-size"],
    );
  });

  it("avoids doubling Stripe's source divider margins and link decoration", async () => {
    const name = "welcome/stripe-welcome";
    const original = reference(name);
    const $ = await compiled(name, roundTrip);
    const dividers = $("p[style*='border-top']");
    expect(dividers).toHaveLength(3);
    const originalDivider = declarations(original("hr").last().attr("style"));
    const signoff = textStyle(original, "— The Stripe team", true);
    expect(originalDivider["margin-top"]).toBe("20px");
    expect(signoff["margin-bottom"]).toBe("16px");
    // Native paragraph padding already provides 16px of the collapsed 20px gap.
    expect(declarations(dividers.last().closest("td").attr("style")).padding).toBe("4px 0px 20px");
    const button = $('a[href="https://dashboard.stripe.com/login"]');
    expect(declarations(button.closest("table").closest("td").attr("style")).padding).toBe("0px");
    for (const [index, selector] of [
      [0, ".community-rich-0 a:nth-of-type(1)"],
      [1, ".community-rich-1 a:nth-of-type(1)"],
      [2, ".community-rich-1 a:nth-of-type(2)"],
      [3, ".community-rich-3 a:nth-of-type(1)"],
      [4, ".community-rich-4 a:nth-of-type(1)"],
    ] as const) {
      expect(declarations(original("p a").eq(index).attr("style"))["text-decoration-line"]).toBe(
        "none",
      );
      expect(ruleStyle($, selector)["text-decoration"]).toBe("none");
    }
  });

  it("matches Koala's address leading without adding its divider margin twice", async () => {
    const name = "welcome/koala-welcome";
    const original = reference(name);
    const $ = await compiled(name, roundTrip);
    const address = "470 Noor Ave STE B #1148, South San Francisco, CA 94080";
    expect(textStyle($, address)["line-height"]).toBe(
      textStyle(original, address, true)["line-height"],
    );
    expect(declarations(original("hr").attr("style"))["margin-top"]).toBe("20px");
    const divider = $("p[style*='border-top']");
    expect(declarations(divider.closest("td").attr("style")).padding).toBe("4px 0px 20px");
  });

  it("respects Amazon's effective 600px source maximum rather than its larger width attribute", async () => {
    const name = "reviews/amazon-review";
    const original = reference(name);
    const $ = await compiled(name, roundTrip);
    const container = original('table[style*="width:640px"]').first();
    const originalStyle = declarations(container.attr("style"));
    expect(originalStyle["max-width"]).toBe("37.5em");
    expect(originalStyle.width).toBe("640px");
    expect(declarations(container.find("td").first().attr("style")).padding).toBe("20px");
    const native = $('div[style*="max-width:600px"]').first();
    expect(native).toHaveLength(1);
    expect(declarations(native.find("td").first().attr("style")).padding).toBe("20px 20px 0px");
    expect(600 - 20 * 2).toBe(560);
    expect($(".amazon-review-copy")).toHaveLength(1);
    expect(ruleStyle($, ".amazon-review-copy > table > tbody > tr > td")["padding-left"]).toBe(
      "0px",
    );
  });

  it("retains Nike's card border, source desktop leading, and non-underlined links", async () => {
    const name = "receipts/nike-receipt";
    const original = reference(name);
    const $ = await compiled(name, roundTrip);
    const card = original('table[style*="border-width:1px"][style*="width:600px"]');
    expect(card).toHaveLength(1);
    expect(declarations(card.attr("style"))["border-color"]).toBe("rgb(229,229,229)");
    expect(declarations(card.attr("style"))["margin-top"]).toBe("10px");
    expect(
      declarations($(".nike-receipt-card > table > tbody > tr > td").attr("style")).border,
    ).toBe("1px solid #e5e5e5");
    const labels = $(".nike-recommendation-text > div");
    expect(labels).toHaveLength(8);
    labels.each((_index, node) => {
      const text = normalize($(node).text());
      const matching = original("p")
        .filter((_i, item) => normalize(original(item).text()) === text)
        .first();
      expect(declarations($(node).attr("style"))["line-height"]).toBe(
        declarations(matching.attr("style"))["line-height"],
      );
    });
    for (const text of [
      "Get Help",
      "1-800-806-6453",
      "4 am - 11 pm PT",
      "© 2022 Nike, Inc. All Rights Reserved.",
    ]) {
      expect(textStyle($, text)["line-height"]).toBe(
        textStyle(original, text, true)["line-height"],
      );
    }
    for (let index = 0; index < 9; index += 1) {
      expect(ruleStyle($, `.community-rich-${index} a:nth-of-type(1)`)["text-decoration"]).toBe(
        "none",
      );
    }
    // Existing mobile tests separately require the two fluid pairs and 1.4 leading.
    expect($(".nike-recommendation-pair")).toHaveLength(2);
  });

  it("restores CodePen's full-width banner, title, and readable rounded cards", async () => {
    const name = "newsletters/codepen-challengers";
    const original = reference(name);
    const $ = await compiled(name, roundTrip);
    const sourceBanner = original('img[src$="/codepen-challengers.png"]').closest("table");
    expect(declarations(sourceBanner.attr("style")).width).toBe("100%");
    expect(declarations($("table.codepen-banner").attr("style")).width).toBe("100%");
    expect(declarations($(".codepen-challenge-heading > div").attr("style"))).toMatchObject({
      "font-size": "32px",
      "line-height": "normal",
    });
    const cubeLeading = textStyle(original, "Cubes", true)["line-height"];
    expect(declarations($(".codepen-challenge-heading h1 > em").attr("style"))["line-height"]).toBe(
      cubeLeading,
    );
    const cards = $(".codepen-card-idea, .codepen-card-resource");
    expect(cards).toHaveLength(6);
    const originalCards = original('table[style*="border-radius:10px"]');
    expect(originalCards).toHaveLength(6);
    cards.each((index, node) => {
      const expected = declarations(originalCards.eq(index).find("p").first().attr("style"));
      expect(declarations($(node).children("div").attr("style"))["line-height"]).toBe(
        expected["line-height"],
      );
      expect(declarations($(node).closest("table").attr("style"))["border-collapse"]).toBe(
        "separate",
      );
    });
    expect(ruleStyle($, ".codepen-card-idea")["border-radius"]).toBe("10px");
    expect(ruleStyle($, ".codepen-card-resource")["border-radius"]).toBe("10px");
    expect(ruleStyle($, ".community-rich-0 a:nth-of-type(1)")["text-decoration"]).toBe("none");
  });

  it("keeps Stack Overflow's hero centered and its heart chip content-sized", async () => {
    const name = "newsletters/stack-overflow-tips";
    const original = reference(name);
    const $ = await compiled(name, roundTrip);
    for (const selector of [".stack-hero-copy", ".stack-hero-art"]) {
      expect(declarations($(selector).attr("style"))["vertical-align"]).toBe("middle");
    }
    const heart = textStyle(original, "<3", true);
    expect(heart["max-width"]).toBe("min-content");
    expect(ruleStyle($, ".stack-heart > div")).toMatchObject({
      // Source min-content relied on its p sizing context. MJML's div wraps
      // between the two glyphs, so preserve the observed single-line chip.
      width: "max-content",
      display: "inline-block",
      padding: "4px 6px 3px",
      "border-radius": heart["border-radius"],
    });
    const firstTip = original("li p").first();
    expect(declarations(firstTip.attr("style"))["margin-bottom"]).toBe("16px");
    expect(ruleStyle($, ".stack-tips li").margin).toBe("0 0 16px");
    expect(ruleStyle($, ".stack-tips li p").margin).toBe("0");
    expect(ruleStyle($, ".stack-tips li:last-child")["margin-bottom"]).toBe("0");
  });

  it("retains Airbnb's original desktop content width with safe mobile gutters", async () => {
    const name = "reviews/airbnb-review";
    const original = reference(name);
    const $ = await compiled(name, roundTrip);
    const sourceContainer = original('table[style*="width:580px"]').first();
    expect(declarations(sourceContainer.attr("style")).width).toBe("580px");
    const section = $(".airbnb-content");
    expect(declarations(section.attr("style"))["max-width"]).toBe("628px");
    const padding = declarations(section.find("td").first().attr("style")).padding;
    expect(padding).toBe("20px 24px 48px");
    expect(628 - 24 * 2).toBe(pixels(declarations(sourceContainer.attr("style")).width));
    expect(ruleStyle($, ".community-rich-0 a:nth-of-type(1)")["text-decoration"]).toBe("none");
  });

  it("insets Google Play's social panel to its original 90 percent width", async () => {
    const name = "newsletters/google-play-policy-update";
    const original = reference(name);
    const $ = await compiled(name, roundTrip);
    const panel = original('table[style*="width:90%"]');
    expect(panel).toHaveLength(1);
    expect(declarations(panel.find("td").first().attr("style"))["padding-left"]).toBe("20px");
    const wrapper = $(".google-play-panel-container");
    expect(declarations(wrapper.find("td").first().attr("style")).padding).toBe("0px 5%");
    expect(wrapper.find(".google-play-social-icons img")).toHaveLength(3);
    const art = wrapper.find('img[src$="/google-play-footer.png"]');
    expect(art.attr("width")).toBe("520");
    expect(declarations(art.closest('td[style*="padding:"]').attr("style")).padding).toBe(
      "0px 0px 0px 20px",
    );
  });

  it("keeps AWS's grey outer inset, compact code rhythm, and footer typography", async () => {
    const name = "magic-links/aws-verify-email";
    const original = reference(name);
    const $ = await compiled(name, roundTrip);
    const originalContainer = original('table[style*="background-color:rgb(238,238,238)"]');
    expect(originalContainer).toHaveLength(1);
    expect(declarations(originalContainer.attr("style"))["max-width"]).toBe("37.5em");
    expect(declarations(originalContainer.find("td").first().attr("style")).padding).toBe("20px");
    expect(declarations($(".aws-container").attr("style"))).toMatchObject({
      "max-width": "600px",
      "background-color": "#eeeeee",
    });
    expect(declarations($(".aws-container > table > tbody > tr > td").attr("style")).padding).toBe(
      "20px",
    );
    expect(declarations($("body").attr("style"))["background-color"]).toBe("#ffffff");
    for (const text of ["Verification code", "596853", "(This code is valid for 10 minutes)"]) {
      const expected = textStyle(original, text, true);
      const actual = textStyle($, text);
      expect(actual["font-size"]).toBe(expected["font-size"]);
      expect(actual["line-height"]).toBe(expected["line-height"]);
      expect(actual.color).toBe("#333333");
    }
    const footer = $(".community-rich-0 > div");
    expect(declarations(footer.attr("style"))["line-height"]).toBe("24px");
    const css = parse(
      $("style")
        .map((_index, node) => $(node).text())
        .get()
        .join("\n"),
    );
    const linkSizes: string[] = [];
    css.walkRules((rule) => {
      if (rule.selector.startsWith(".community-rich-0 a:")) {
        rule.walkDecls("font-size", (declaration) => {
          linkSizes.push(declaration.value);
        });
      }
    });
    expect(linkSizes).toEqual(["14px", "14px"]);
  });

  it("matches Papermark's source system font, leading, and persistent activity columns", async () => {
    const name = "notifications/papermark-year-in-review";
    const original = reference(name);
    const $ = await compiled(name, roundTrip);
    const sourceFont = declarations(original('td[style*="ui-sans-serif"]').first().attr("style"))[
      "font-family"
    ];
    for (const text of [
      "Papermark",
      "2024 in review",
      "Your Year with Papermark",
      "Viewers spent",
      "minutes on your documents",
      "You uploaded",
      "25",
      "documents",
      "Your top document",
      "150 views",
      "with 200 views",
      "of sharers on Papermark",
    ]) {
      const expected = textStyle(original, text, true);
      const actual = textStyle($, text);
      const inheritedFont = declarations($(".paper-activity-stats > table").attr("style"))[
        "font-family"
      ];
      expect(family(actual["font-family"] ?? inheritedFont), text).toBe(family(sourceFont));
      const size = pixels(expected["font-size"]);
      expect(pixels(actual["font-size"]), text).toBe(size);
      expect(pixels(actual["line-height"], size), text).toBeCloseTo(
        pixels(expected["line-height"], size),
      );
    }
    const table = $(".paper-activity-stats > table");
    expect(declarations(table.attr("style"))["table-layout"]).toBe("auto");
    const columns = table.find("> tbody > tr > td");
    expect(columns).toHaveLength(3);
    columns.each((_index, node) => {
      expect(declarations($(node).attr("style"))).toMatchObject({
        width: "33.33333333333333%",
        "text-align": "center",
      });
    });
    expect(columns.map((_index, node) => normalize($(node).text())).get()).toEqual([
      "You uploaded 25 documents",
      "You shared 50 links",
      "You received 500 views",
    ]);
  });

  it("does not enlarge Yelp's original 80 by 40 logo", async () => {
    const name = "notifications/yelp-recent-login";
    const original = reference(name);
    const $ = await compiled(name, roundTrip);
    const selector = 'img[src$="/yelp-logo.png"]';
    // Upstream leaves this image unsized. Its observed intrinsic dimensions
    // in the complete artwork capture are 80×40, not the port's old 120×60.
    expect(original(selector).attr("width")).toBeUndefined();
    expect(original(selector).attr("height")).toBeUndefined();
    expect($(selector).attr("src")).toBe(original(selector).attr("src"));
    expect($(selector).attr("width")).toBe("80");
    expect($(selector).attr("height")).toBe("40");
  });

  it("uses Netlify's actual reference system font instead of substituting Arial", async () => {
    const name = "welcome/netlify-welcome";
    const original = reference(name);
    const $ = await compiled(name, roundTrip);
    const expected = declarations(original('td[style*="ui-sans-serif"]').first().attr("style"))[
      "font-family"
    ];
    expect(family(textStyle($, "Welcome to Netlify")["font-family"])).toBe(family(expected));
    expect(family(textStyle($, "Here's how to get started:")["font-family"])).toBe(
      family(expected),
    );
  });
});
