import { readFileSync } from "node:fs";
import { load } from "cheerio";
import { parse } from "postcss";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { communityBodyInsetNames, dropboxName } from "../../tests/browser/community-body-insets";
import { fromMjml } from "../import";
import { toMjml } from "../export";

beforeAll(() => vi.stubGlobal("window", globalThis));
afterAll(() => vi.unstubAllGlobals());

const source = (name: string) =>
  readFileSync(new URL(`../../templates/Community/${name}.mjml`, import.meta.url), "utf8");
const reference = (name: string) =>
  load(
    readFileSync(
      new URL(`../../tests/fixtures/react-email-reference/Community/${name}.html`, import.meta.url),
      "utf8",
    ),
  );
const declarations = (value?: string) => {
  const result: Record<string, string> = {};
  parse(`element { ${value ?? ""} }`).walkDecls((decl) => {
    result[decl.prop] = decl.value;
  });
  return result;
};
function bodyRules(html: string, selector: string) {
  const $ = load(html, { xmlMode: selector === "mj-style" });
  const result: { value: string; important: boolean }[] = [];
  parse(
    $(selector)
      .map((_i, node) => $(node).text())
      .get()
      .join("\n"),
  ).walkRules((rule) => {
    if (rule.selectors.includes("body"))
      rule.walkDecls("padding", (decl) => {
        result.push({ value: decl.value, important: Boolean(decl.important) });
      });
  });
  return result;
}
function inventory(html: string) {
  const $ = load(html);
  return {
    images: $("img")
      .map((_i, node) => $(node).attr("src"))
      .get(),
    destinations: $("a[href]")
      .map((_i, node) => $(node).attr("href"))
      .get(),
    text: $("body").text().replace(/\s+/g, " ").trim(),
  };
}

describe.each([false, true])("Community source body insets, safe round trip: %s", (roundTrip) => {
  it.each(communityBodyInsetNames)(
    "preserves %s source boundaries without changing its contents",
    async (name) => {
      const original = reference(name);
      const originalBody = declarations(original("body").attr("style"));
      // Table/table-cell formatting prevents descendants' vertical margins from
      // collapsing through the body. Padding is equivalent only with this guard.
      expect(
        original("body")
          .children()
          .map((_i, node) => node.name)
          .get(),
      ).toEqual(["table"]);
      expect(original("body > table").attr("style")).toBeUndefined();
      const outerCell = declarations(
        original("body > table > tbody > tr > td").first().attr("style"),
      );
      expect(outerCell["background-color"]).toBe(originalBody["background-color"]);
      expect(originalBody["background-image"]).toBeUndefined();
      expect(outerCell["background-image"]).toBeUndefined();
      expect(Object.keys(originalBody).filter((key) => key.startsWith("margin"))).toEqual([]);
      // No source stylesheet resets the browser margin; do not infer 8px from the port.
      for (const sheet of original("style").toArray()) {
        parse(original(sheet).text()).walkDecls(/^margin/, (decl) => {
          expect(decl.parent?.toString()).not.toMatch(/(?:^|[,\s])body(?:\s|[,{}])/);
        });
      }
      const input = source(name);
      const imported = fromMjml(input);
      expect(imported.warnings).toEqual([]);
      const mjml = roundTrip ? toMjml(imported.document) : input;
      const padding = name === dropboxName ? "18px 8px" : "8px";
      expect(bodyRules(mjml, "mj-style")).toEqual([{ value: padding, important: true }]);
      if (name === dropboxName) {
        expect(originalBody).toMatchObject({ "padding-top": "0", "padding-bottom": "0" });
        expect(
          declarations(original("body > table > tbody > tr > td").first().attr("style")),
        ).toMatchObject({ "padding-top": "10px", "padding-bottom": "10px" });
      }
      const { default: compile } = await import("mjml-browser");
      const direct = await compile(input, { validationLevel: "strict" });
      const result = await compile(mjml, { validationLevel: "strict" });
      expect(direct.errors).toEqual([]);
      expect(result.errors).toEqual([]);
      expect(bodyRules(result.html, "style").at(-1)).toEqual({ value: padding, important: true });
      expect(inventory(result.html)).toEqual(inventory(direct.html));
      expect(mjml).not.toMatch(/<mj-(?:raw|include)\b/);
    },
  );
});

it("does not add default margins to the three explicit source resets", () => {
  for (const name of [
    "magic-links/slack-confirm",
    "newsletters/codepen-challengers",
    "notifications/vercel-invite-user",
  ]) {
    const original = reference(name);
    const style = declarations(original("body").attr("style"));
    if (name === "newsletters/codepen-challengers") expect(style.margin).toBe("0");
    else
      for (const edge of ["top", "right", "bottom", "left"])
        expect(style[`margin-${edge}`]).toBe("0");
    expect(communityBodyInsetNames as readonly string[]).not.toContain(name);
    expect(bodyRules(source(name), "mj-style").some(({ value }) => value === "8px")).toBe(false);
  }
  expect(communityBodyInsetNames).toHaveLength(18);
  expect(communityBodyInsetNames as readonly string[]).not.toContain(
    "notifications/papermark-year-in-review",
  );
});
