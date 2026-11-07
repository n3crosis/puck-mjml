import { readFileSync, readdirSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as cheerio from "cheerio";
import { compileEmail } from "../export";
import { fromMjml } from "../import";
import { emailTemplates } from "./registry";
import { templateManifest } from "./manifest";
import { descendants } from "./test-support";
import upstreamFixtures from "./upstream-content.json";

beforeAll(() => vi.stubGlobal("window", globalThis));
afterAll(() => vi.unstubAllGlobals());

const normalizeText = (value: string) => value.replace(/\s+/g, " ").trim();
const visibleContent = (html: string) => {
  const $ = cheerio.load(html);
  $("br").replaceWith("\n");
  return {
    text: normalizeText($("body").text()),
    images: $("img")
      .map((_index, element) => {
        const image = $(element);
        return JSON.stringify(
          ["src", "alt", "width", "height", "style"].map((name) => image.attr(name) ?? ""),
        );
      })
      .get(),
    links: $("a")
      .map((_index, element) => $(element).attr("href") ?? "")
      .get(),
  };
};

const canonicalFiles = readdirSync(new URL("../../templates/", import.meta.url), {
  recursive: true,
  encoding: "utf8",
})
  .filter((file) => file.endsWith(".mjml"))
  .map((file) => file.replaceAll("\\", "/"))
  .sort();

describe("template provenance", () => {
  it("pins the exact 62-email upstream inventory, excluding theme and font helpers", () => {
    expect(templateManifest.repository).toBe("https://github.com/resend/react-email");
    expect(templateManifest.ref).toBe("674d8ec2804b86be5d99156383fb1810179847bf");
    expect(templateManifest.license).toBe("MIT");
    expect(templateManifest.templates).toHaveLength(62);
    expect(new Set(templateManifest.templates.map(({ file }) => file)).size).toBe(62);
    expect(new Set(templateManifest.templates.map(({ id }) => id)).size).toBe(62);
    const expectedFamilies = {
      "01-Barebone": 8,
      "02-Matte": 8,
      "03-Protocol": 8,
      "04-Arcane": 8,
      "05-Studio": 8,
      Community: 22,
    };
    for (const [family, count] of Object.entries(expectedFamilies)) {
      expect(
        templateManifest.templates.filter(({ file }) => file.startsWith(`${family}/`)),
      ).toHaveLength(count);
    }
    for (const entry of templateManifest.templates) {
      expect(entry.file).not.toMatch(/(?:fonts|theme)\.mjml$/);
      expect(entry.upstreamBlob).toMatch(/^[\da-f]{40}$/);
      expect(entry.upstreamPath).toBe(`apps/demo/emails/${entry.file.replace(/\.mjml$/, ".tsx")}`);
      expect(entry.id).toBe(entry.file.replace(/\.mjml$/, "").toLowerCase());
    }
  });

  it("registers exactly the canonical files present, without placeholder emails", () => {
    const available = emailTemplates.filter(({ id }) => id !== "blank");
    expect(
      available.map(({ sourcePath }) => sourcePath!.replace(/^templates\//, "")).sort(),
    ).toEqual(canonicalFiles);
    expect(canonicalFiles).toHaveLength(62);
    expect(emailTemplates).toHaveLength(63);
    expect(canonicalFiles).toEqual(templateManifest.templates.map(({ file }) => file).sort());
    for (const template of available) {
      expect(template.source).toBe(
        readFileSync(new URL(`../../${template.sourcePath}`, import.meta.url), "utf8"),
      );
      expect(template.upstreamUrl).toContain(`/blob/${templateManifest.ref}/apps/demo/emails/`);
      expect(template.source).toContain(template.upstreamUrl);
      for (const [tag] of template.source!.matchAll(
        /<mj(?:ml|-[\w-]+)\b(?:[^"'>]|"[^"]*"|'[^']*')*>/g,
      )) {
        const attributes = [...tag.matchAll(/\b([\w:-]+)\s*=\s*(?:"[^"]*"|'[^']*')/g)].map(
          (match) => match[1],
        );
        expect(
          new Set(attributes).size,
          `${template.sourcePath}: duplicate XML attributes in ${tag}`,
        ).toBe(attributes.length);
      }
    }
  });
});

describe("template registry", () => {
  it("lists only real emails and the blank document, with unique ids and labels", () => {
    expect(emailTemplates).toHaveLength(canonicalFiles.length + 1);
    expect(emailTemplates[0].id).toBe("blank");
    expect(new Set(emailTemplates.map(({ id }) => id)).size).toBe(emailTemplates.length);
    for (const template of emailTemplates) {
      expect(template.id).toMatch(/^[a-z0-9/-]+$/);
      expect(template.label.length).toBeGreaterThan(0);
      expect(template.id).not.toMatch(/-fonts$/);
    }
  });

  it.each(emailTemplates.map((template) => [template.id, template] as const))(
    "%s creates independent editable documents and compiles cleanly",
    async (_id, template) => {
      const document = template.create();
      const next = template.create();
      expect(document).toEqual(next);
      expect(document).not.toBe(next);
      expect(document.content).toEqual([]);
      const blocks = descendants(document.root.props!.sections!);
      expect(new Set(blocks.map((block) => block.props.id)).size).toBe(blocks.length);
      expect(blocks.every((block) => block.type !== "Raw" && Boolean(block.props.id))).toBe(true);
      if (template.source) {
        expect(blocks.length).toBeGreaterThan(0);
        expect(template.source).not.toMatch(/<mj-(?:raw|include)\b/);
        expect(fromMjml(template.source).warnings).toEqual([]);
        document.root.props!.subject = "Independent edit";
        expect(next.root.props!.subject).not.toBe("Independent edit");
      }
      const result = await compileEmail(next);
      expect(result.errors, JSON.stringify(result.errors, null, 2)).toEqual([]);
      expect(result.html).toContain("<body");
    },
    30000,
  );

  it.each(
    emailTemplates
      .filter((template) => template.source)
      .map((template) => [template.id, template] as const),
  )(
    "%s preserves canonical source content through the editor import/export path",
    async (_id, template) => {
      const { default: mjml2html } = await import("mjml-browser");
      const direct = await mjml2html(template.source!, { validationLevel: "strict" });
      expect(direct.errors, JSON.stringify(direct.errors, null, 2)).toEqual([]);
      const roundTrip = await compileEmail(template.create());
      expect(visibleContent(roundTrip.html)).toEqual(visibleContent(direct.html));
    },
    30000,
  );
});

describe("Pinned upstream content review", () => {
  it("uses fixtures from the pinned upstream source", () => {
    expect(upstreamFixtures.ref).toBe(templateManifest.ref);
    expect(upstreamFixtures.templates).toHaveLength(62);
    expect(upstreamFixtures.templates.map(({ file }) => file).sort()).toEqual(
      templateManifest.templates.map(({ file }) => file).sort(),
    );
  });
  it.each(upstreamFixtures.templates.filter(({ file }) => canonicalFiles.includes(file)))(
    "$file retains upstream preview, content, artwork, and links",
    async (fixture) => {
      const template = emailTemplates.find(
        ({ sourcePath }) => sourcePath === `templates/${fixture.file}`,
      )!;
      expect(template).toBeDefined();
      const document = template.create();
      if (fixture.preview)
        expect(normalizeText(document.root.props!.previewText!)).toBe(
          normalizeText(fixture.preview),
        );
      const result = await compileEmail(document);
      const visible = visibleContent(result.html);
      for (const content of fixture.content) {
        // Protocol presents display headings in uppercase, matching upstream CSS.
        expect(visible.text.toLowerCase()).toContain(normalizeText(content).toLowerCase());
      }
      const $ = cheerio.load(result.html);
      const images = new Set(
        $("img")
          .map((_index, element) => $(element).attr("src"))
          .get(),
      );
      expect([...images].sort()).toEqual([...fixture.images].sort());
      const normalizeUrl = (value: string) => {
        try {
          return new URL(value, "https://demo.react.email/").href;
        } catch {
          return value;
        }
      };
      const links = new Set(
        $("a[href]")
          .map((_index, element) => normalizeUrl($(element).attr("href")!))
          .get(),
      );
      for (const href of fixture.links)
        expect(links, `Missing upstream link: ${href}`).toContain(normalizeUrl(href));
    },
  );
});
