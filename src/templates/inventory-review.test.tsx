import { templateInventory, templateSource, referenceHtml } from "../../tests/template-inventory";
import { Render, type Data } from "@puckeditor/core";
import { load, type CheerioAPI } from "cheerio";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createEmailConfig } from "../config";
import { fromMjml } from "../import";
import { toMjml } from "../export";

beforeAll(() => vi.stubGlobal("window", globalThis));
afterAll(() => vi.unstubAllGlobals());

const normalized = (text: string) => text.replace(/\s+/g, " ").trim();

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
        ? new URL($(node).closest("a[href]").attr("href")!, "https://demo.react.email/").href
        : undefined,
    }));
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

describe("authentic React Email content hierarchy", () => {
  it.each(templateInventory)(
    "$file preserves source hierarchy, image semantics and authored styles through safe editing",
    async (entry) => {
      const source = templateSource(entry);
      const original = load(referenceHtml(entry));
      const expected = headings(original);
      const imported = fromMjml(source);
      expect(imported.warnings).toEqual([]);
      const roundTrip = toMjml(imported.document);
      const reimported = fromMjml(roundTrip);
      expect(reimported.warnings).toEqual([]);
      const authored = imported.document.root.props?.headStyles ?? [];
      // The exporter prepends its rich-text defaults. Authored sheets must stay
      // byte-for-byte intact and in their original order after those defaults.
      if (authored.length)
        expect(reimported.document.root.props?.headStyles?.slice(-authored.length)).toEqual(
          authored,
        );
      expect(reimported.document.root.props?.fontImports).toEqual(
        imported.document.root.props?.fontImports,
      );
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

      {
        // Exercise the real safe Puck renderer, not reconstructed MJML HTML.
        // This is DOM/CSS coverage; browser captures record layout evidence separately.
        const canvas = load(
          renderToStaticMarkup(
            <Render config={createEmailConfig()} data={imported.document as Data} />,
          ),
        );
        expect(headings(canvas)).toEqual(expected);
        expect(images(canvas)).toEqual(images(original));
        // Canvas button destinations deliberately are not navigable anchors.
        // Browser evidence records that renderer difference instead of hiding it.
        expect(normalized(canvas(".pm-email").text())).not.toBe("");
      }
    },
  );
});
