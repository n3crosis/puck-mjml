import { templateInventory, templateSource, referenceHtml } from "../../tests/template-inventory";
import { Render, type Data } from "@puckeditor/core";
import { load, type CheerioAPI } from "cheerio";
import postcss from "postcss";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createFontAliases, familyKey } from "../canvas-css";
import { mjmlDefaultFonts } from "../canvas-font-resolver";
import { createEmailConfig } from "../config";
import { fromMjml } from "../import";
import { compileEmail, toMjml } from "../export";
import type { EmailDocument } from "../types";
import { emailTemplates } from "./registry";
import { descendants } from "./test-support";

beforeAll(() => vi.stubGlobal("window", globalThis));
afterAll(() => vi.unstubAllGlobals());

const normalized = (text: string) => text.replace(/\s+/g, " ").trim();
const normalizedUrl = (value: string) => new URL(value, "https://demo.react.email/").href;

function headings($: CheerioAPI) {
  return $("h1,h2,h3,h4,h5,h6")
    .toArray()
    .map((node) => ({ level: node.tagName, text: normalized($(node).text()) }));
}

function images($: CheerioAPI) {
  return $("img")
    .toArray()
    .map((node) => ({
      src: $(node).attr("src"),
      alt: $(node).attr("alt") ?? "",
      destination: $(node).closest("a[href]").attr("href")
        ? normalizedUrl($(node).closest("a[href]").attr("href")!)
        : undefined,
    }));
}

function links($: CheerioAPI) {
  return $("a")
    .toArray()
    .map((node) => ({
      href: $(node).attr("href") ? normalizedUrl($(node).attr("href")!) : undefined,
      text: normalized($(node).text()),
    }));
}

function visibleContent($: CheerioAPI) {
  const body = $("body").clone();
  body.find("br").replaceWith("\n");
  return {
    text: normalized(body.text()),
    images: $("img")
      .toArray()
      .map((element) =>
        ["src", "alt", "width", "height", "style"].map((name) => $(element).attr(name) ?? ""),
      ),
    links: $("a")
      .toArray()
      .map((element) => $(element).attr("href") ?? ""),
  };
}

function expectEditableDocument(document: EmailDocument) {
  expect(document.content).toEqual([]);
  const blocks = descendants(document.root.props!.sections!);
  expect(blocks.length).toBeGreaterThan(0);
  expect(new Set(blocks.map((block) => block.props.id)).size).toBe(blocks.length);
  expect(blocks.every((block) => block.type !== "Raw" && Boolean(block.props.id))).toBe(true);
}

// The corpus uses literal family lists. This does not claim support for CSS
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

function expectImportedFontAliases(source: string, document: EmailDocument, canvas: CheerioAPI) {
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
  const scope = canvas("style[data-pm-canvas-fonts]").attr("data-pm-canvas-fonts");
  const values = [
    ...canvas("[style]")
      .toArray()
      .flatMap((element) => fontValues(`a{${canvas(element).attr("style")}}`)),
    ...canvas("style[data-pm-canvas-css]")
      .toArray()
      .flatMap((element) => fontValues(canvas(element).text())),
  ];
  if (!imports.length) return;
  expect(scope).toMatch(/^pm-canvas-/);
  const aliases = createFontAliases(
    [...imports.map(({ name }) => name), ...mjmlDefaultFonts.map(({ name }) => name)],
    scope!,
  );
  const reverse = new Map(Object.entries(aliases).map(([name, alias]) => [familyKey(alias), name]));
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
        expect(name, `unregistered native reference: ${value}`).toBe(
          familyKey(aliases[original[index]]),
        );
    });
  }
  expect(
    referenced,
    "declared source fonts must be exercised by native typography or CSS",
  ).toBeGreaterThan(0);
}

describe("canonical template review", () => {
  it("compiles and reimports the blank registry document without warnings", async () => {
    const result = await compileEmail(emailTemplates[0].create());
    expect(result.errors).toEqual([]);
    expect(result.html).toContain("<body");
    const imported = fromMjml(result.mjml);
    expect(imported.warnings).toEqual([]);
    expect(imported.document.root.props!.sections).toEqual([]);
    const repeated = await compileEmail(imported.document);
    expect(repeated.errors).toEqual([]);
    expect(visibleContent(load(repeated.html))).toEqual(visibleContent(load(result.html)));
  });

  // One source compile, one exported compile, one reimported compile and one
  // real safe canvas render per entry. Reuse only this case's immutable outputs,
  // not mutable documents or cross-test caches.
  it.each(templateInventory)(
    "$file preserves editable content, hierarchy, artwork, links, styles and fonts",
    async (entry) => {
      const source = templateSource(entry);
      const template = emailTemplates.find(({ id }) => id === entry.id)!;
      expect(template, "registered template").toBeDefined();
      const document = template.create();
      const next = template.create();
      const imported = fromMjml(source);
      expect(imported.warnings, "canonical import").toEqual([]);
      expect(document, "registry factory imports the canonical source").toEqual(imported.document);
      expect(document).toEqual(next);
      expect(document).not.toBe(next);
      const blocks = descendants(document.root.props!.sections!);
      const nextBlocks = descendants(next.root.props!.sections!);
      for (const [index, block] of blocks.entries()) {
        expect(block, `independent block ${block.props.id}`).not.toBe(nextBlocks[index]);
        expect(block.props, `independent props ${block.props.id}`).not.toBe(
          nextBlocks[index].props,
        );
      }
      expectEditableDocument(document);
      next.root.props!.subject = "Independent edit";
      expect(document.root.props!.subject).not.toBe("Independent edit");
      const before = JSON.stringify(document);
      const compiled = await compileEmail(document);
      expect(compiled.errors, "editor export").toEqual([]);
      expect(compiled.html).toContain("<body");
      const roundTrip = compiled.mjml;
      const reimported = fromMjml(roundTrip);
      expect(reimported.warnings, "reimport").toEqual([]);
      expectEditableDocument(reimported.document);
      const authored = document.root.props?.headStyles ?? [];
      // Rich-text defaults precede authored sheets; preserve their bytes/order.
      if (authored.length)
        expect(reimported.document.root.props?.headStyles?.slice(-authored.length)).toEqual(
          authored,
        );
      expect(reimported.document.root.props?.fontImports).toEqual(document.root.props?.fontImports);
      expect(source).not.toMatch(/<mj-(?:raw|include)\b/);
      expect(roundTrip).not.toMatch(/<mj-(?:raw|include)\b/);
      const { default: mjml } = await import("mjml-browser");
      const direct = await mjml(source, { validationLevel: "strict" });
      expect(direct.errors, "canonical source").toEqual([]);
      const secondExport = await compileEmail(reimported.document);
      expect(secondExport.errors, "reimported export").toEqual([]);
      const original = load(referenceHtml(entry));
      const canonical = load(direct.html);
      const exported = load(compiled.html);
      const repeated = load(secondExport.html);
      const visible = visibleContent(exported);
      expect(visible, "source to first export").toEqual(visibleContent(canonical));
      expect(visibleContent(repeated), "first to second export").toEqual(visible);
      expect(links(exported)).toEqual(links(canonical));
      const expectedHeadings = headings(original);
      const expectedImages = images(original);
      const originalDestinations = new Set(
        links(original)
          .map(({ href }) => href)
          .filter(Boolean),
      );
      for (const [label, $] of [
        ["canonical", canonical],
        ["exported", exported],
        ["reimported", repeated],
      ] as const) {
        expect(headings($), `${label} headings`).toEqual(expectedHeadings);
        expect(images($), `${label} image semantics`).toEqual(expectedImages);
        const destinations = new Set(
          links($)
            .map(({ href }) => href)
            .filter(Boolean),
        );
        for (const href of originalDestinations)
          expect(destinations.has(href), `${label} upstream destination: ${href}`).toBe(true);
      }
      const fixture = entry.content;
      if (fixture.preview)
        expect(normalized(document.root.props!.previewText!)).toBe(normalized(fixture.preview));
      for (const content of fixture.content) {
        // Browser word evidence remains case-sensitive, including CSS text-transform.
        expect(visible.text.toLowerCase()).toContain(normalized(content).toLowerCase());
      }
      expect([...new Set(images(exported).map(({ src }) => src))].sort()).toEqual(
        [...fixture.images].sort(),
      );
      const destinations = new Set(links(exported).map(({ href }) => href));
      for (const href of fixture.links)
        expect(destinations, `Missing upstream link: ${href}`).toContain(normalizedUrl(href));
      const canvas = load(
        renderToStaticMarkup(<Render config={createEmailConfig()} data={document as Data} />),
      );
      expect(headings(canvas), "safe canvas headings").toEqual(expectedHeadings);
      expect(images(canvas), "safe canvas image semantics").toEqual(expectedImages);
      // Canvas buttons intentionally are not navigable anchors. Browser evidence
      // records that difference instead of asserting navigational equivalence.
      expect(normalized(canvas(".pm-email").text())).not.toBe("");
      expectImportedFontAliases(source, document, canvas);
      expect(JSON.stringify(document)).toBe(before);
      expect(toMjml(document)).toBe(roundTrip);
      expect(roundTrip).not.toContain("pm-canvas-");
    },
    30000,
  );
});
