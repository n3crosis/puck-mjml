import { describe, expect, it } from "vitest";
import { sanitizeDocumentRichText } from "./normalize";
import type { EmailBlock, EmailDocument } from "./types";

describe("editor document ingress", () => {
  it("migrates legacy table text literally and keeps modern cells safe and stable", () => {
    const legacy = {
      type: "Table",
      props: {
        id: "legacy",
        firstHeading: "A < B",
        secondHeading: "Price",
        rows: [{ first: "<strong>Literal</strong>", second: "A & B" }],
      },
    };
    const modern = {
      type: "Table",
      props: {
        id: "modern",
        headerRows: [],
        bodyRows: [
          {
            cells: [
              {
                content: '<p onclick="bad()">Safe <strong>bold</strong><script>bad()</script></p>',
                colSpan: 3,
              },
              { content: "A & B" },
            ],
          },
        ],
        footerRows: [{ cells: [{ content: '<a href="javascript:bad()">Total</a>' }] }],
      },
    };
    const document: EmailDocument = {
      root: {
        props: { sections: [{ type: "Section1", props: { id: "s", column: [legacy, modern] } }] },
      },
      content: [],
    };
    const normalized = sanitizeDocumentRichText(document);
    const tables = normalized.root.props!.sections![0].props.column as EmailBlock[];
    expect(tables[0].props.headerRows).toMatchObject([
      { cells: [{ content: "<p>A &lt; B</p>" }, { content: "<p>Price</p>" }] },
    ]);
    expect(tables[0].props.bodyRows).toMatchObject([
      {
        cells: [
          { content: "<p>&lt;strong&gt;Literal&lt;/strong&gt;</p>" },
          { content: "<p>A &amp; B</p>" },
        ],
      },
    ]);
    expect(tables[1].props.bodyRows).toEqual([
      {
        cells: [
          { content: "<p>Safe <strong>bold</strong></p>", colSpan: 3 },
          { content: "<p>A &amp; B</p>" },
        ],
      },
    ]);
    expect(tables[1].props.footerRows).toEqual([{ cells: [{ content: "<a>Total</a>" }] }]);
    expect(tables[1].props.headerRows).toBe(modern.props.headerRows);
    expect(sanitizeDocumentRichText(normalized)).toBe(normalized);
    expect(legacy.props.rows[0].first).toBe("<strong>Literal</strong>");
    expect(modern.props.bodyRows[0].cells[0].content).toContain("onclick");
  });
  it("sanitizes nested rich text without changing trusted raw source or mutating host data", () => {
    const text: EmailBlock = {
      type: "Text",
      props: { id: "text", content: '<p onclick="bad()">Hello<script>bad()</script></p>' },
    };
    const accordion: EmailBlock = {
      type: "Accordion",
      props: {
        id: "accordion",
        items: [{ title: "Q", content: "<p>Answer<img src=x onerror=bad()></p>" }],
      },
    };
    const raw: EmailBlock = {
      type: "Raw",
      props: { id: "raw", html: '<p onclick="custom()">{{ name }}</p>' },
    };
    const column: EmailBlock = {
      type: "Column",
      props: { id: "column", content: [text, accordion, raw] },
    };
    const group: EmailBlock = { type: "Group", props: { id: "group", columns: [column] } };
    const section: EmailBlock = { type: "Section", props: { id: "section", columns: [group] } };
    const wrapper: EmailBlock = { type: "Wrapper", props: { id: "wrapper", sections: [section] } };
    const original: EmailDocument = { root: { props: { sections: [wrapper] } }, content: [] };
    const sanitized = sanitizeDocumentRichText(original);
    const visit = (block: EmailBlock, slot: string) => (block.props[slot] as EmailBlock[])[0];
    const nextColumn = visit(
      visit(visit(sanitized.root.props!.sections![0], "sections"), "columns"),
      "columns",
    );
    const content = nextColumn.props.content as EmailBlock[];
    expect(content[0].props.content).toBe("<p>Hello</p>");
    expect(content[1].props.items).toEqual([{ title: "Q", content: "<p>Answer</p>" }]);
    expect(content[2]).toBe(raw);
    expect(text.props.content).toContain('onclick="bad()"');
    expect(sanitizeDocumentRichText(sanitized)).toBe(sanitized);
  });

  it("retains references when the incoming document is already safe", () => {
    const document: EmailDocument = {
      root: {
        props: {
          sections: [
            {
              type: "Hero",
              props: {
                id: "hero",
                content: [
                  {
                    type: "Text",
                    props: { id: "text", content: "<p>Hello <strong>world</strong></p>" },
                  },
                ],
              },
            },
          ],
        },
      },
      content: [],
    };
    expect(sanitizeDocumentRichText(document)).toBe(document);
  });
});
