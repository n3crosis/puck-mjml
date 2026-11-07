import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { compileEmail, toMjml } from "./export";
import type { EmailDocument, ExportOptions } from "./types";

beforeAll(() => vi.stubGlobal("window", globalThis));
afterAll(() => vi.unstubAllGlobals());

const documentWith = (rawFileStart: string): EmailDocument => ({
  root: { props: { rawFileStart, sections: [] } },
  content: [],
});

describe("raw content before the doctype", () => {
  it.each([
    '{% assign greeting = "Hello" %}\n{% if count < 5 %}{{ greeting }}{% endif %}',
    "<!--[if mso]><xml><x:setting>enabled</x:setting></xml><![endif]-->",
    '<?php $value = "Hello"; ?>',
  ])("preserves trusted template and conditional text: %s", async (rawFileStart) => {
    const result = await compileEmail(documentWith(rawFileStart), { allowRawHtml: true });
    expect(result.errors).toEqual([]);
    expect(result.mjml).toContain(
      `<mjml><mj-raw position="file-start">${rawFileStart}</mj-raw><mj-head>`,
    );
    expect(result.html.startsWith(`${rawFileStart}\n<!doctype html>`)).toBe(true);
  });

  it("keeps file-start, head, and body raw content in their separate positions", async () => {
    const document = documentWith("<!-- FILE START -->\n{% assign brand = 'Collage' %}");
    document.root.props!.rawHead = '<meta name="raw-head-test" content="HEAD" />';
    document.root.props!.sections = [
      { type: "Raw", props: { html: '<div data-raw-body="BODY">Body</div>' } },
    ];
    const result = await compileEmail(document, { allowRawHtml: true });
    expect(result.errors).toEqual([]);
    const doctype = result.html.indexOf("<!doctype html>");
    const head = result.html.indexOf("<head>");
    const headEnd = result.html.indexOf("</head>");
    const body = result.html.indexOf("<body");
    expect(result.html.indexOf("FILE START")).toBeLessThan(doctype);
    expect(result.html.indexOf("raw-head-test")).toBeGreaterThan(head);
    expect(result.html.indexOf("raw-head-test")).toBeLessThan(headEnd);
    expect(result.html.indexOf("data-raw-body")).toBeGreaterThan(body);
    expect(result.mjml.match(/position="file-start"/g)).toHaveLength(1);
  });

  it("requires strict opt-in and omits an empty setting", () => {
    for (const allowRawHtml of [undefined, false, "true", 1]) {
      expect(() =>
        toMjml(documentWith("<!-- trusted -->"), { allowRawHtml } as ExportOptions),
      ).toThrow(/allowRawHtml/);
    }
    expect(toMjml(documentWith(""))).not.toContain('position="file-start"');
  });

  it.each([
    "</mj-raw><mj-head><mj-title>Escape</mj-title></mj-head>",
    "</MJ-RAW><mj-body />",
    "< / mj-raw >",
    "<!-- text -->\u0000",
    "<!-- text -->\u007f",
  ])("rejects raw-container escapes and invalid controls", (rawFileStart) => {
    expect(() => toMjml(documentWith(rawFileStart), { allowRawHtml: true })).toThrow(
      /Raw HTML contains/,
    );
  });
});
