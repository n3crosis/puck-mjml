import { readFileSync } from "node:fs";
import { load, type CheerioAPI } from "cheerio";
import { parse } from "postcss";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { fromMjml } from "../import";
import { toMjml } from "../export";

beforeAll(() => vi.stubGlobal("window", globalThis));
afterAll(() => vi.unstubAllGlobals());
const normalize = (text: string) => text.replace(/\s+/g, " ").trim();
function declarations(style?: string) {
  const result: Record<string, string> = {};
  parse(`element { ${style ?? ""} }`).walkDecls((decl) => {
    result[decl.prop] = decl.value;
  });
  return result;
}
function text($: CheerioAPI, starts: string) {
  const matches = $("p,h1,h2,div").filter(
    (_i, node) =>
      normalize($(node).text()).startsWith(starts) && $(node).find("p,h1,h2,div").length === 0,
  );
  expect(matches, starts).toHaveLength(1);
  return matches;
}
function source(name: string) {
  return readFileSync(new URL(`../../templates/Community/${name}.mjml`, import.meta.url), "utf8");
}
function original(name: string) {
  return load(
    readFileSync(
      new URL(`../../.cache/react-email-reference/Community/${name}.html`, import.meta.url),
      "utf8",
    ),
  );
}
async function compiled(name: string, roundTrip: boolean) {
  const input = source(name);
  const parsed = fromMjml(input);
  expect(parsed.warnings).toEqual([]);
  const output = roundTrip ? toMjml(parsed.document) : input;
  expect(output).not.toMatch(/<mj-(?:raw|include)\b/);
  expect(fromMjml(output).warnings).toEqual([]);
  const { default: compile } = await import("mjml-browser");
  const result = await compile(output, { validationLevel: "strict" });
  expect(result.errors).toEqual([]);
  return load(result.html);
}
function namedRule($: CheerioAPI, selector: string) {
  const result: Record<string, string> = {};
  parse($("style").text()).walkRules((rule) => {
    if (rule.selectors.includes(selector))
      rule.walkDecls((decl) => {
        result[decl.prop] = decl.value;
      });
  });
  return result;
}

// Every value below is read from the immutable produced HTML. Browser tests
// additionally compare each neighboring gap/card edge, avoiding cancellation.
describe.each([false, true])("Community source rhythm, safe round trip: %s", (roundTrip) => {
  it("preserves Google Play's separate left-only section and uncollapsed paragraph margins", async () => {
    const name = "newsletters/google-play-policy-update";
    const ref = original(name);
    const $ = await compiled(name, roundTrip);
    const exceptions = text(ref, "We're noting exceptions");
    const refSection = declarations(exceptions.closest("td").attr("style"));
    expect(refSection["padding-left"]).toBe("40px");
    expect(refSection["padding-right"]).toBeUndefined();
    expect(declarations(exceptions.attr("style"))).toMatchObject({
      "margin-top": "16px",
      "margin-bottom": "16px",
    });
    expect(
      declarations($(".google-play-exceptions > table > tbody > tr > td").attr("style")).padding,
    ).toBe("16px 0px 0px 40px");
    expect(
      declarations($(".google-play-deadline > table > tbody > tr > td").attr("style")).padding,
    ).toBe("16px 40px 0px");
    const deadline = text($, "We're also extending");
    expect(declarations(deadline.closest("td").attr("style")).padding).toBe("0px 0px 16px");
    const rule = $(".google-play-deadline p[style*='border-top']");
    expect(declarations(rule.closest("td").attr("style")).padding).toBe("4px 0px 20px");
    expect(declarations(text($, "Thank you,").closest("td").attr("style")).padding).toBe(
      "16px 0px 16px",
    );
  });

  it("preserves Airbnb's paragraph margins, quote radius and separately collapsed divider gaps", async () => {
    const name = "reviews/airbnb-review";
    const ref = original(name);
    const $ = await compiled(name, roundTrip);
    for (const start of ["Here's what Alex wrote", "Now that the review period"]) {
      expect(declarations(text(ref, start).attr("style"))).toMatchObject({
        "margin-top": "16px",
        "margin-bottom": "16px",
      });
      expect(declarations(text($, start).closest("td").attr("style")).padding).toBe("16px 0px");
    }
    expect(declarations(text(ref, "“Alan was a great guest!").attr("style"))["border-radius"]).toBe(
      "0.25rem",
    );
    expect(namedRule($, ".airbnb-review-quote")["border-radius"]).toBe("4px");
    expect(declarations(text($, "Common questions").closest("td").attr("style")).padding).toBe(
      "16px 0px 16px",
    );
    expect(
      $("p[style*='border-top']")
        .map((_i, node) => declarations($(node).closest("td").attr("style")).padding)
        .get(),
    ).toEqual(["20px 0px", "4px 0px 20px"]);
    const report = text($, "Report unsafe behavior");
    expect(namedRule($, ".community-rich-3 > div")["line-height"]).toBe("normal");
    expect(declarations(report.closest("td").attr("style")).padding).toBe("0px");
    expect(declarations($(".airbnb-content > table > tbody > tr > td").attr("style")).padding).toBe(
      "20px 24px 48px",
    );
  });

  it("keeps CodePen's grey participation gaps and paragraph bottom margin inside every rounded card", async () => {
    const name = "newsletters/codepen-challengers";
    const ref = original(name);
    const $ = await compiled(name, roundTrip);
    expect(declarations(text(ref, "To participate:").attr("style"))).toMatchObject({
      "margin-top": "16px",
      "margin-bottom": "16px",
      padding: "30px",
    });
    expect(
      declarations($(".codepen-participation-margins > table > tbody > tr > td").attr("style"))
        .padding,
    ).toBe("16px 0px");
    const originals = ref('table[style*="border-radius:10px"]');
    const cards = $(".codepen-card-idea, .codepen-card-resource");
    expect(originals).toHaveLength(6);
    expect(cards).toHaveLength(6);
    cards.each((index, node) => {
      const outer = declarations(originals.eq(index).attr("style"));
      const paragraph = declarations(originals.eq(index).find("p").attr("style"));
      expect(outer["margin-bottom"]).toBe("20px");
      expect(
        declarations(
          originals.eq(index).children("tbody").children("tr").children("td").attr("style"),
        ).padding,
      ).toBe("20px");
      expect(paragraph).toMatchObject({
        "margin-bottom": "16px",
        "line-height": "24px",
        "font-size": "13px",
      });
      expect(declarations($(node).attr("style")).padding).toBe("20px 20px 36px");
      expect(declarations($(node).children("div").attr("style"))).toMatchObject({
        "line-height": paragraph["line-height"],
        "font-size": paragraph["font-size"],
      });
    });
  });

  it("keeps GitHub's 24px paragraph leading and 12px anchors inside its 14px audit line", async () => {
    const name = "notifications/github-access-token";
    const ref = original(name);
    const $ = await compiled(name, roundTrip);
    expect(declarations(text(ref, "@alanturing,").attr("style"))).toMatchObject({
      "margin-top": "16px",
      "margin-bottom": "16px",
    });
    expect(declarations(text($, "@alanturing,").closest("td").attr("style")).padding).toBe(
      "16px 0px",
    );
    for (const start of [
      "Hey alanturing!",
      "A fine-grained personal access token (resend)",
      "Your security audit log",
    ]) {
      const expected = declarations(text(ref, start).attr("style"));
      expect(expected["line-height"]).toBe("24px");
      expect(declarations(text($, start).attr("style"))).toMatchObject({
        "line-height": expected["line-height"],
        "font-size": expected["font-size"],
      });
    }
    $(".github-security-links a").each((_i, node) => {
      expect(declarations($(node).attr("style"))["font-size"]).toBe("12px");
      expect($(node).attr("href")).toBeUndefined();
    });
  });

  it("preserves Vercel's collapsed 26px divider margins and both 1px horizontal source edges", async () => {
    const name = "notifications/vercel-invite-user";
    const ref = original(name);
    const $ = await compiled(name, roundTrip);
    const hr = declarations(ref("hr").attr("style"));
    expect(hr).toMatchObject({
      "margin-top": "26px",
      "margin-bottom": "26px",
      "border-width": "1px",
      "border-style": "solid",
    });
    expect(declarations(text(ref, "or copy and paste").attr("style"))["margin-bottom"]).toBe(
      "16px",
    );
    const line = $(".vercel-source-divider p");
    expect(declarations(line.attr("style"))["border-top"]).toBe("solid 2px #eaeaea");
    expect(declarations(line.closest("td").attr("style")).padding).toBe("10px 0px 26px");
  });
});
