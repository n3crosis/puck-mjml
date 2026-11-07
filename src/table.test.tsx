import { isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Render, setDeep, type Config } from "@puckeditor/core";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { TableBlock, tableConfig } from "./TableBlock";
import {
  getTableAttributes,
  getTableCellAttributes,
  getTableCellStyle,
  getTableStyle,
  normalizeTableRows,
  renderTableContent,
  type TableProps,
} from "./table";

const example: TableProps = {
  caption: "Quarterly sales & totals",
  headerRows: [
    {
      cells: [
        { content: "<p>Team</p>", rowSpan: 2 },
        { content: "<p>Revenue</p>", colSpan: 2, scope: "colgroup" },
      ],
    },
    { cells: [{ content: "<p>Q1</p>" }, { content: "<p>Q2</p>" }] },
  ],
  bodyRows: [
    {
      cells: [
        { content: "<p>North</p>", header: true, scope: "row" },
        { content: "<p><strong>$12</strong></p>" },
        { content: "<p>$18</p>", align: "right", backgroundColor: "#eef5ee" },
      ],
    },
  ],
  footerRows: [
    {
      cells: [
        { content: "<p>Total</p>", header: true, scope: "row", colSpan: 2 },
        { content: '<p><a href="https://example.com/report">$30</a></p>' },
      ],
    },
  ],
  fontFamily: "Arial, sans-serif",
  fontSize: 14,
  lineHeight: "1.5",
  align: "center",
  width: "90%",
  cellpadding: "4",
  cellspacing: 2,
  tableLayout: "fixed",
  border: "1px solid #dddddd",
  padding: "10px 20px",
  containerBackgroundColor: "#f5f5f5",
  cssClass: "sales-table",
};

describe("table rows and cells", () => {
  it("migrates legacy text literally, without mutating or double-escaping it", () => {
    const original = {
      firstHeading: "A & B",
      secondHeading: "Value",
      rows: [{ first: "<b>literal</b>", second: "<img src=x onerror=bad()>" }],
    };
    const rows = normalizeTableRows(original);
    expect(rows.legacy).toBe(true);
    expect(rows.headerRows[0].cells[0].content).toBe("<p>A &amp; B</p>");
    expect(rows.bodyRows[0].cells[0].content).toBe("<p>&lt;b&gt;literal&lt;/b&gt;</p>");
    expect(original.rows[0].first).toBe("<b>literal</b>");
    const normalizedAgain = normalizeTableRows(rows);
    expect(normalizedAgain.legacy).toBe(false);
    expect(normalizedAgain.bodyRows).toBe(rows.bodyRows);
    const html = renderTableContent(rows);
    expect(html).toContain("&lt;b&gt;literal&lt;/b&gt;");
    expect(html).not.toContain("&amp;lt;");
    expect(html).not.toContain("<img");
  });

  it("honors explicitly empty modern groups instead of resurrecting legacy rows", () => {
    const rows = normalizeTableRows({
      bodyRows: [],
      firstHeading: "Old",
      rows: [{ first: "Old", second: "Row" }],
    });
    expect(rows).toEqual({ legacy: false, headerRows: [], bodyRows: [], footerRows: [] });
    expect(renderTableContent({ headerRows: [], rows: [{ first: "Old", second: "Row" }] })).toBe(
      "",
    );
  });

  it("supports multiple row groups, arbitrary cell counts, spans, and accessible headers", () => {
    const html = renderTableContent(example);
    expect(html).toContain("<caption>Quarterly sales &amp; totals</caption><thead>");
    expect(html).toContain('scope="col" rowspan="2"');
    expect(html).toContain('scope="colgroup" colspan="2"');
    expect(html).toContain('scope="row"');
    expect(html).toContain("<tbody>");
    expect(html).toContain("<tfoot>");
    expect(html).toContain("<strong>$12</strong>");
    expect(html).toContain('href="https://example.com/report"');
    expect(normalizeTableRows(example).bodyRows[0].cells).toHaveLength(3);
    expect(
      getTableCellAttributes({ content: "All remaining rows", header: true, rowSpan: 0 }).rowspan,
    ).toBe(0);
    expect(
      renderTableContent({ bodyRows: [{ cells: [{ content: "Span", rowSpan: 0 }] }] }),
    ).toContain('rowspan="0"');
  });

  it("rejects malformed collections instead of silently dropping table data", () => {
    expect(() => normalizeTableRows({ rows: "bad" })).toThrow(/Table rows/);
    expect(() => normalizeTableRows({ bodyRows: null })).toThrow(/Table bodyRows/);
    expect(() => normalizeTableRows({ bodyRows: [{ cells: "bad" }] })).toThrow(/cells/);
    expect(() => normalizeTableRows({ bodyRows: [{ cells: [null] }] })).toThrow(/cells item/);
  });

  it("validates style values and sanitizes rich cell content independently", () => {
    const html = renderTableContent({
      caption: '<img src=x onerror="bad()">',
      bodyRows: [
        {
          cells: [
            {
              content:
                '<p onclick="bad()">Safe<strong>bold</strong><script>bad()</script><a href="javascript:bad()">link</a></p>',
              scope: 'col" onclick=bad()',
              header: false,
              colSpan: -3,
              rowSpan: Infinity,
              padding: "1px;background:url(x)",
              color: "red;position:fixed",
              border: "1px solid #fff;position:fixed",
            },
          ],
        },
      ],
    });
    expect(html).toContain("&lt;img src=x onerror=&quot;bad()&quot;&gt;");
    expect(html).toContain("<p>Safe<strong>bold</strong><a>link</a></p>");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<p onclick");
    expect(html).not.toContain("position:fixed");
    expect(html).not.toContain("colspan");
    expect(html).not.toContain("rowspan");
    expect(html).not.toContain(" scope=");
  });
});

describe("table canvas", () => {
  it("renders legacy data and partially supplied modern groups through Puck", () => {
    const config: Config<{ Table: TableProps }> = { components: { Table: tableConfig } };
    const legacy = renderToStaticMarkup(
      <Render
        config={config}
        data={{
          root: {},
          content: [
            {
              type: "Table",
              props: {
                id: "legacy",
                firstHeading: "Item",
                secondHeading: "Value",
                rows: [{ first: "<b>Literal</b>", second: "A & B" }],
              },
            },
          ],
        }}
      />,
    );
    expect(legacy).toContain("&lt;b&gt;Literal&lt;/b&gt;");
    expect(legacy).toContain("A &amp; B");
    const modern = renderToStaticMarkup(
      <Render
        config={config}
        data={{
          root: {},
          content: [
            {
              type: "Table",
              props: { id: "modern", bodyRows: [{ cells: [{ content: "<p>Only body</p>" }] }] },
            },
          ],
        }}
      />,
    );
    expect(modern).toContain("<p>Only body</p>");
    expect(modern).not.toContain("<thead>");
  });

  it("uses the same validated presentation as the MJML serializer", () => {
    expect(getTableAttributes(example)).toMatchObject({
      "font-size": "14px",
      "line-height": "1.5",
      cellpadding: 4,
      cellspacing: 2,
      width: "90%",
      "table-layout": "fixed",
    });
    expect(getTableStyle(example)).toMatchObject({
      fontSize: "14px",
      lineHeight: "1.5",
      width: "90%",
      tableLayout: "fixed",
      borderCollapse: "separate",
      borderSpacing: "2px",
    });
    expect(
      getTableCellStyle({
        content: "Cell",
        align: "justify",
        verticalAlign: "bottom",
        padding: "4px 8px",
        border: "1px solid #ddd",
      }),
    ).toMatchObject({
      textAlign: "justify",
      verticalAlign: "bottom",
      padding: "4px 8px",
      border: "1px solid #ddd",
    });
    const html = renderToStaticMarkup(<TableBlock {...example} />);
    expect(html).toContain("<caption>Quarterly sales &amp; totals</caption>");
    expect(html).toContain('scope="colgroup" colSpan="2"');
    expect(html).toContain("<tfoot>");
    expect(html).toContain('cellPadding="4"');
  });

  it("keeps Puck's transformed rich-text nodes inside nested cells and exposes inline field metadata", () => {
    let transformedCell: unknown;
    const config: Config<{ Table: TableProps }> = {
      components: {
        Table: {
          ...tableConfig,
          render: (props) => {
            transformedCell = props.bodyRows?.[0].cells[0].content;
            return <TableBlock {...props} />;
          },
        },
      },
    };
    const html = renderToStaticMarkup(
      <Render
        config={config}
        data={{
          root: {},
          content: [
            {
              type: "Table",
              props: {
                id: "table",
                headerRows: [],
                bodyRows: [{ cells: [{ content: "<p><strong>Inline cell</strong></p>" }] }],
                footerRows: [],
              },
            },
          ],
        }}
      />,
    );
    expect(isValidElement(transformedCell)).toBe(true);
    expect(html).toContain("<strong>Inline cell</strong>");
    const bodyField = tableConfig.fields?.bodyRows;
    expect(bodyField?.type).toBe("array");
    if (bodyField?.type !== "array") throw new Error("Expected body rows array field");
    const cellsField = bodyField.arrayFields.cells;
    expect(cellsField.type).toBe("array");
    if (cellsField.type !== "array") throw new Error("Expected cells array field");
    expect(cellsField.arrayFields.content).toMatchObject({
      type: "richtext",
      contentEditable: true,
      visible: false,
    });
    const changed = setDeep(
      { bodyRows: [{ cells: [{ content: "Before" }] }] },
      "bodyRows[0].cells[0].content",
      "After",
    );
    expect(changed.bodyRows[0].cells[0].content).toBe("After");
  });
});

describe("native MJML table compilation", () => {
  beforeAll(() => vi.stubGlobal("window", globalThis));
  afterAll(() => vi.unstubAllGlobals());

  it("preserves structured rich table HTML and accepts every generated table attribute", async () => {
    const { default: mjml } = await import("mjml-browser");
    const attrs = Object.entries(getTableAttributes(example))
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => ` ${key}="${value}"`)
      .join("");
    const result = await mjml(
      `<mjml><mj-body><mj-section><mj-column><mj-table${attrs}>${renderTableContent(example)}</mj-table></mj-column></mj-section></mj-body></mjml>`,
      { validationLevel: "strict" },
    );
    expect(result.errors).toEqual([]);
    expect(result.html).toContain("<caption>Quarterly sales &amp; totals</caption>");
    expect(result.html).toContain('scope="colgroup" colspan="2"');
    expect(result.html).toContain("<strong>$12</strong>");
    expect(result.html).toContain("<tfoot>");
    expect(result.html).toContain("table-layout:fixed");
    expect(result.html).toContain('cellpadding="4"');
    expect(result.html).toContain('cellspacing="2"');
  });
});
