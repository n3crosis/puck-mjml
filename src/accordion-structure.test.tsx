import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { compileEmail, toMjml } from "./export";
import { sanitizeDocumentRichText } from "./normalize";
import { nativeEntryTagFromPath } from "./NativeFields";
import { createEmailConfig } from "./config";
import type { ArrayField } from "@puckeditor/core";
import type { EmailDocument } from "./types";

beforeAll(() => vi.stubGlobal("window", globalThis));
afterAll(() => vi.unstubAllGlobals());
const doc = (items: unknown[]): EmailDocument => ({
  root: {
    props: {
      sections: [
        { type: "Section1", props: { column: [{ type: "Accordion", props: { items } }] } },
      ],
    },
  },
  content: [],
});
const raw = (html: string) => ({ kind: "raw", html });

describe("native accordion child structure", () => {
  it("preserves raw entries at both legal parent levels with strict host opt-in", async () => {
    const document = doc([
      raw("<!-- before elements -->"),
      {
        kind: "element",
        children: [
          raw("<!-- before title -->"),
          { kind: "title", content: "Question", mjmlAttributes: [{ name: "color", value: "red" }] },
          raw("<!-- between children -->"),
          { kind: "text", content: "<p>Answer</p>" },
          raw("<!-- after answer -->"),
        ],
      },
      raw("<!-- after elements -->"),
    ]);
    expect(() => toMjml(document)).toThrow(/allowRawHtml/);
    const result = await compileEmail(document, { allowRawHtml: true });
    expect(result.errors).toEqual([]);
    const parts = [
      "before elements",
      "before title",
      "Question",
      "between children",
      "Answer",
      "after answer",
      "after elements",
    ];
    for (let i = 1; i < parts.length; i++) {
      expect(result.mjml.indexOf(parts[i])).toBeGreaterThan(result.mjml.indexOf(parts[i - 1]));
      expect(result.html.indexOf(parts[i])).toBeGreaterThan(result.html.indexOf(parts[i - 1]));
    }
    expect(result.mjml).toContain('<mj-accordion-title color="red">Question</mj-accordion-title>');
  });

  it("supports empty, missing, repeated and reordered native ending children", async () => {
    const document = doc([
      { title: "Unused title", content: "Unused answer", children: [] },
      {
        children: [
          { kind: "text", content: "<p>Text first</p>" },
          { kind: "title", content: "Title last" },
          { kind: "title", content: "Repeated title" },
        ],
      },
    ]);
    const result = await compileEmail(document);
    expect(result.errors).toEqual([]);
    expect(result.mjml).toContain("<mj-accordion-element></mj-accordion-element>");
    expect(result.mjml).not.toContain("Unused");
    expect(result.mjml.indexOf("Text first")).toBeLessThan(result.mjml.indexOf("Title last"));
    expect(result.mjml.indexOf("Title last")).toBeLessThan(result.mjml.indexOf("Repeated title"));
  });

  it("keeps legacy named fields unchanged and sanitizes ordered text without touching trusted source", () => {
    const document = doc([
      { title: "A < B", content: "<p>Named</p>" },
      {
        children: [
          { kind: "text", content: "<p>Safe<script>bad()</script></p>" },
          { kind: "title", content: "Title", htmlContent: "<b>Trusted title</b>" },
          raw("<b>Trusted raw</b>"),
        ],
      },
    ]);
    const normalized = sanitizeDocumentRichText(document);
    const result = toMjml(normalized, { allowRawHtml: true });
    expect(result).toContain("A &lt; B");
    expect(result).toContain("<p>Named</p>");
    expect(result).not.toContain("bad()");
    expect(result).toContain("<b>Trusted title</b>");
    expect(result).toContain("<b>Trusted raw</b>");
    expect(JSON.stringify(document)).toContain("bad()");
  });

  it.each([
    { items: [{ kind: "unknown" }] },
    { items: [{ children: [{ kind: "unknown" }] }] },
    { items: [{ children: {} }] },
  ])("rejects malformed child kinds and containers", ({ items }) => {
    expect(() => toMjml(doc(items))).toThrow(/unsupported|must be an array/);
  });

  it("provides ordered-child controls and chooses the appropriate nested native attribute schema", () => {
    const config = createEmailConfig(undefined, true);
    const field = config.components.Accordion.fields!.items as ArrayField;
    expect(field.arrayFields.children.type).toBe("custom");
    expect(field.arrayFields.kind.visible).toBe(true);
    const props = {
      items: [
        { kind: "raw" },
        { children: [{ kind: "title" }, { kind: "text" }, { kind: "raw" }] },
      ],
    };
    expect(nativeEntryTagFromPath(props, "items[0].mjmlAttributes", "mj-accordion-element")).toBe(
      "mj-raw",
    );
    expect(
      nativeEntryTagFromPath(props, "items[1].children[0].mjmlAttributes", "mj-accordion-title"),
    ).toBe("mj-accordion-title");
    expect(
      nativeEntryTagFromPath(props, "items[1].children[1].mjmlAttributes", "mj-accordion-title"),
    ).toBe("mj-accordion-text");
    expect(
      nativeEntryTagFromPath(props, "items[1].children[2].mjmlAttributes", "mj-accordion-title"),
    ).toBe("mj-raw");
  });
});
