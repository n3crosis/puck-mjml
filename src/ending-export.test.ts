import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { compileEmail, toMjml } from "./export";
import { sanitizeDocumentRichText } from "./normalize";
import type { EmailBlock, EmailDocument, ExportOptions } from "./types";

beforeAll(() => vi.stubGlobal("window", globalThis));
afterAll(() => vi.unstubAllGlobals());

const doc = (column: EmailBlock[]): EmailDocument => ({
  root: { props: { sections: [{ type: "Section1", props: { column } }] } },
  content: [],
});

describe("trusted native ending-tag content", () => {
  const html = '<font face="Georgia"><sup>Native HTML</sup>&nbsp;{{ customer.name }}</font>';
  const column: EmailBlock[] = [
    { type: "Text", props: { content: "Fallback text", htmlContent: html } },
    {
      type: "Button",
      props: { href: "https://example.com", label: "Fallback button", htmlContent: html },
    },
    {
      type: "Social",
      props: {
        links: [
          { name: "web", href: "https://example.com", label: "Fallback social", htmlContent: html },
        ],
      },
    },
    {
      type: "Navbar",
      props: {
        links: [{ href: "https://example.com", label: "Fallback navigation", htmlContent: html }],
      },
    },
    {
      type: "Accordion",
      props: {
        items: [
          {
            title: "Fallback title",
            content: "Fallback answer",
            titleHtmlContent: html,
            htmlContent: html,
          },
        ],
      },
    },
    {
      type: "Table",
      props: {
        htmlContent:
          '<caption>Arbitrary native table</caption><colgroup><col width="120" /></colgroup><tr><td><img src="https://example.com/picture.png" width="20" /></td></tr>',
      },
    },
  ];

  it("compiles native HTML in every supported content-bearing body ending tag", async () => {
    const result = await compileEmail(doc(column), { allowRawHtml: true });
    expect(result.errors).toEqual([]);
    expect(result.mjml.match(/<font face="Georgia">/g)).toHaveLength(6);
    expect(result.html).toContain("<sup>Native HTML</sup>");
    expect(result.html).toContain("{{ customer.name }}");
    expect(result.html).toContain('<colgroup><col width="120"></colgroup>');
    expect(result.html).toContain('src="https://example.com/picture.png"');
    expect(result.html).not.toContain("Fallback");
  });

  it("preserves title and preview ending content with an explicit host opt-in", async () => {
    const document = doc([]);
    Object.assign(document.root.props!, {
      subject: "Fallback subject",
      previewText: "Fallback preview",
      subjectHtmlContent: "News &copy; {{ brand }}",
      previewHtmlContent: '<span data-preview="native">Highlights &bull; this week</span>',
    });
    expect(() => toMjml(document)).toThrow(/allowRawHtml/);
    const result = await compileEmail(document, { allowRawHtml: true });
    expect(result.errors).toEqual([]);
    expect(result.mjml).toContain("<mj-title>News &copy; {{ brand }}</mj-title>");
    expect(result.html).toContain("<title>News &copy; {{ brand }}</title>");
    expect(result.html).toContain('data-preview="native"');
    expect(result.html).not.toContain("Fallback");
  });

  it("treats an empty HTML override as intentional and restores visual content when absent", () => {
    const document = doc([{ type: "Text", props: { content: "Visual content", htmlContent: "" } }]);
    expect(toMjml(document, { allowRawHtml: true })).not.toContain("Visual content");
    delete (document.root.props!.sections![0].props.column as EmailBlock[])[0].props.htmlContent;
    expect(toMjml(document)).toContain("Visual content");
  });

  it.each([undefined, false, "true", 1])(
    "requires strict host opt-in for every override (%s)",
    (allowRawHtml) => {
      for (const block of column) {
        expect(() => toMjml(doc([block]), { allowRawHtml } as ExportOptions)).toThrow(
          /allowRawHtml/,
        );
      }
    },
  );

  it("keeps trusted source unchanged when normalizing the document for Puck", () => {
    const document = doc(column);
    const normalized = sanitizeDocumentRichText(document);
    expect(toMjml(normalized, { allowRawHtml: true })).toContain(html);
    const normalizedColumn = normalized.root.props!.sections![0].props.column as EmailBlock[];
    expect(normalizedColumn[0].props.htmlContent).toBe(html);
    expect(column[0].props.content).toBe("Fallback text");
  });
});

describe("ordered raw items inside native link lists", () => {
  it.each(["Social", "Navbar"])("keeps raw entries between %s links", async (type) => {
    const document = doc([
      {
        type,
        props: {
          links: [
            { name: "web", label: "First link", href: "https://example.com/first" },
            { kind: "raw", html: "<!-- RAW BETWEEN LINKS -->", mjmlAttributes: [] },
            { kind: "link", name: "web", label: "Last link", href: "https://example.com/last" },
          ],
        },
      },
    ]);
    expect(() => toMjml(document)).toThrow(/allowRawHtml/);
    const result = await compileEmail(document, { allowRawHtml: true });
    expect(result.errors).toEqual([]);
    expect(result.mjml).toContain("<mj-raw><!-- RAW BETWEEN LINKS --></mj-raw>");
    expect(result.html.indexOf("First link")).toBeLessThan(
      result.html.indexOf("RAW BETWEEN LINKS"),
    );
    expect(result.html.indexOf("RAW BETWEEN LINKS")).toBeLessThan(result.html.indexOf("Last link"));
  });

  it.each(["Social", "Navbar"])("rejects unknown %s item kinds", (type) => {
    expect(() =>
      toMjml(
        doc([
          {
            type,
            props: { links: [{ kind: "unknown", name: "web", href: "https://example.com" }] },
          },
        ]),
      ),
    ).toThrow(/unsupported item kind/);
  });
});
