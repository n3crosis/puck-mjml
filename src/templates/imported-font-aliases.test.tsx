import { readFileSync, readdirSync } from "node:fs";
import { Render, type Data } from "@puckeditor/core";
import { load } from "cheerio";
import postcss from "postcss";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { createFontAliases, familyKey } from "../canvas-css";
import { mjmlDefaultFonts } from "../canvas-font-resolver";
import { createEmailConfig } from "../config";
import { toMjml } from "../export";
import { fromMjml } from "../import";

const paths = readdirSync("templates", { recursive: true })
  .filter((path): path is string => typeof path === "string" && path.endsWith(".mjml"))
  .sort();
// The corpus uses literal family lists. Deliberately do not claim support for
// variables, shorthand, escaped strings, comments, or commas inside a name.
function literalStack(value: string): string[] | undefined {
  const parts = value.split(",").map((part) => part.trim());
  if (!parts.every((part) => /^(?:[A-Za-z_-][\w -]*|"[\w -]+"|'[\w -]+')$/.test(part)))
    return undefined;
  return parts.map((part) => familyKey(part.replace(/^['"]|['"]$/g, "")));
}
const fontValues = (css: string) => {
  const values: string[] = [];
  postcss.parse(css).walkDecls(/^font-family$/i, (declaration) => {
    values.push(declaration.value);
  });
  return values;
};

it("covers all 62 bundled source templates", () => expect(paths).toHaveLength(62));
it.each(paths)("references declared imported families through native aliases: %s", (path) => {
  const source = readFileSync(`templates/${path}`, "utf8");
  const { document, warnings } = fromMjml(source);
  expect(warnings).toEqual([]);
  const before = JSON.stringify(document);
  const exported = toMjml(document);
  const imports = document.root.props?.fontImports ?? [];
  const declared = new Set(imports.map(({ name }) => familyKey(name)));
  const $source = load(source, { xml: true });
  const sourceValues = [
    ...$source("[font-family]")
      .toArray()
      .map((element) => $source(element).attr("font-family")!),
    ...$source("mj-style")
      .toArray()
      .flatMap((element) => fontValues($source(element).text())),
  ];
  const sourceStacks = new Set(
    sourceValues
      .map(literalStack)
      .filter((stack) => stack !== undefined)
      .map((stack) => stack.join(",")),
  );
  const canvas = load(
    renderToStaticMarkup(<Render config={createEmailConfig()} data={document as Data} />),
  );
  const scope = canvas("style[data-pm-canvas-fonts]").attr("data-pm-canvas-fonts");
  const values = [
    ...canvas("[style]")
      .toArray()
      .flatMap((element) => fontValues(`a{${canvas(element).attr("style")}}`)),
    ...canvas("style[data-pm-canvas-css]")
      .toArray()
      .flatMap((element) => fontValues(canvas(element).text())),
  ];
  if (imports.length) {
    expect(scope).toMatch(/^pm-canvas-/);
    const aliases = createFontAliases(
      [...imports.map(({ name }) => name), ...mjmlDefaultFonts.map(({ name }) => name)],
      scope!,
    );
    const reverse = new Map(
      Object.entries(aliases).map(([name, alias]) => [familyKey(alias), name]),
    );
    let referenced = 0;
    for (const value of values) {
      const stack = literalStack(value);
      if (!stack) continue;
      const original = stack.map((name) => reverse.get(name) ?? name);
      if (!original.some((name) => declared.has(name))) continue;
      referenced += 1;
      expect(sourceStacks.has(original.join(",")), `font or fallback order changed: ${value}`).toBe(
        true,
      );
      stack.forEach((name, index) => {
        if (declared.has(original[index]))
          expect(name, `unregistered native reference in ${path}: ${value}`).toBe(
            familyKey(aliases[original[index]]),
          );
      });
    }
    expect(
      referenced,
      "declared source fonts must be exercised by native typography or CSS",
    ).toBeGreaterThan(0);
  }
  expect(JSON.stringify(document)).toBe(before);
  expect(toMjml(document)).toBe(exported);
  expect(exported).not.toContain("pm-canvas-");
});
