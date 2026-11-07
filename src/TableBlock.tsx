import type { ArrayField, ComponentConfig } from "@puckeditor/core";
import type { CSSProperties } from "react";
import { renderEmailInlineMenu, renderEmailRichTextMenu } from "./RichTextToolbar";
import { emailRichTextConfig } from "./EmailRichText";
import { sanitizeEmailRichText } from "./richtext";
import { hasImportedRichTextWrapper, importedRichText } from "./imported-content";
import { colorField } from "./ColorField";
import { nativeStyle, typographyKeys, type NativeCanvasAttributes } from "./native-canvas-context";
import {
  getTableAttributes,
  getTableCellStyle,
  getTableStyle,
  normalizeTableRows,
  type TableCell,
  type TableProps,
  type TableRow,
} from "./table";

const options = (values: string[]) =>
  values.map((value) => ({ label: value || "Automatic", value }));
const cellFields: ArrayField<TableCell[]>["arrayFields"] = {
  content: {
    type: "richtext",
    ...emailRichTextConfig,
    label: "Cell text",
    contentEditable: true,
    visible: false,
    renderMenu: renderEmailRichTextMenu,
    renderInlineMenu: renderEmailInlineMenu,
  },
  header: {
    type: "radio",
    label: "Cell type",
    options: [
      { label: "Data", value: false },
      { label: "Header", value: true },
    ],
  },
  scope: {
    type: "select",
    label: "Header scope",
    options: options(["", "row", "col", "rowgroup", "colgroup"]),
  },
  colSpan: { type: "number", label: "Columns spanned", min: 1, max: 1000 },
  rowSpan: { type: "number", label: "Rows spanned (0 spans the group)", min: 0, max: 65534 },
  align: {
    type: "select",
    label: "Text alignment",
    options: options(["left", "center", "right", "justify"]),
  },
  verticalAlign: {
    type: "select",
    label: "Vertical alignment",
    options: options(["top", "middle", "bottom"]),
  },
  width: { type: "text", label: "Width (px or %)" },
  padding: { type: "text", label: "Cell padding (px or %)" },
  color: colorField("Text color (hex)"),
  backgroundColor: colorField("Background color (hex)"),
  border: { type: "text", label: "Border" },
};

export function newTableCell(header: boolean): TableCell {
  return {
    content: header ? "<p>Heading</p>" : "<p>Cell</p>",
    header,
    scope: header ? "col" : "",
    colSpan: 1,
    rowSpan: 1,
    align: "left",
    verticalAlign: "top",
    width: "",
    padding: "8px",
    backgroundColor: "",
    color: "",
    border: "1px solid #e5e7eb",
  };
}

const rowsField = (label: string, header = false): ArrayField<TableRow[]> => ({
  type: "array",
  label,
  arrayFields: {
    cells: {
      type: "array",
      label: "Cells",
      arrayFields: cellFields,
      defaultItemProps: () => newTableCell(header),
      getItemSummary: (cell, index) => `${cell.header ? "Header" : "Cell"} ${(index ?? 0) + 1}`,
    },
  },
  defaultItemProps: () => ({ cells: [newTableCell(header), newTableCell(header)] }),
  getItemSummary: (row, index) => `Row ${(index ?? 0) + 1} · ${row.cells.length} cells`,
});

export function TableBlock(
  input: TableProps & {
    nativeAttributes?: NativeCanvasAttributes;
    source?: TableProps;
    puck?: { isEditing?: boolean };
  },
) {
  // Puck's read-only rich-text mapper represents missing nested array paths as null.
  // Keep that renderer detail separate from the serialized-data validator.
  const props: TableProps = {
    ...input,
    headerRows: input.headerRows ?? undefined,
    bodyRows: input.bodyRows ?? undefined,
    footerRows: input.footerRows ?? undefined,
  };
  const rows = normalizeTableRows(props);
  const sourceRows = input.source ? normalizeTableRows(input.source) : rows;
  const native = Boolean(props.importedTableContent);
  const attrs = input.nativeAttributes ?? getTableAttributes(props);
  const renderRows = (items: TableRow[], originals: TableRow[]) =>
    items.map((row, rowIndex) => (
      <tr key={rowIndex}>
        {row.cells.map((cell, cellIndex) => {
          const Cell = cell.header ? "th" : "td";
          const sourceCell = originals[rowIndex]?.cells[cellIndex] ?? cell;
          const original = importedRichText(sourceCell);
          const wrapped = original !== undefined && hasImportedRichTextWrapper(sourceCell);
          return (
            <Cell
              key={cellIndex}
              scope={cell.header && cell.scope ? cell.scope : undefined}
              colSpan={cell.colSpan! > 1 ? cell.colSpan : undefined}
              rowSpan={cell.rowSpan !== 1 ? cell.rowSpan : undefined}
              style={{
                ...getTableCellStyle(cell),
                padding: cell.padding || (cell.native ? undefined : `${attrs.cellpadding}px`),
              }}
            >
              <div
                className={`pm-text${cell.native ? " pm-imported-text" : ""}${wrapped ? " pm-imported-inline-text" : ""}`}
                style={{ lineHeight: "inherit" }}
              >
                {original !== undefined && !input.puck?.isEditing ? (
                  <div dangerouslySetInnerHTML={{ __html: original }} />
                ) : typeof cell.content === "string" ? (
                  <div dangerouslySetInnerHTML={{ __html: sanitizeEmailRichText(cell.content) }} />
                ) : (
                  cell.content
                )}
              </div>
            </Cell>
          );
        })}
      </tr>
    ));
  return (
    <div
      className={input.nativeAttributes?.["css-class"] ?? props.cssClass ?? undefined}
      style={{
        padding: String(attrs.padding),
        ...(input.nativeAttributes
          ? nativeStyle(input.nativeAttributes, [
              "padding-top",
              "padding-right",
              "padding-bottom",
              "padding-left",
            ])
          : {}),
        backgroundColor: attrs["container-background-color"] as string | undefined,
        // MJML places align on the containing td. Preserve that inheritance
        // without overriding explicit authored cell alignment or th defaults.
        textAlign: input.nativeAttributes ? (attrs.align as CSSProperties["textAlign"]) : undefined,
      }}
    >
      <table
        className={`pm-table${native ? " pm-native-table" : ""}`}
        style={
          input.nativeAttributes
            ? {
                ...nativeStyle(input.nativeAttributes, [
                  ...typographyKeys,
                  "table-layout",
                  "width",
                  "border",
                ]),
                backgroundColor: "transparent",
                borderCollapse: native || Number(attrs.cellspacing) > 0 ? "separate" : "collapse",
                borderSpacing: `${attrs.cellspacing}px`,
                marginLeft: attrs.align === "center" || attrs.align === "right" ? "auto" : 0,
                marginRight: attrs.align === "center" || attrs.align === "left" ? "auto" : 0,
              }
            : getTableStyle(props)
        }
        cellPadding={attrs.cellpadding}
        cellSpacing={attrs.cellspacing}
      >
        {props.caption && <caption>{props.caption}</caption>}
        {rows.headerRows.length > 0 && (
          <thead>{renderRows(rows.headerRows, sourceRows.headerRows)}</thead>
        )}
        {rows.bodyRows.length > 0 && (
          <tbody>{renderRows(rows.bodyRows, sourceRows.bodyRows)}</tbody>
        )}
        {rows.footerRows.length > 0 && (
          <tfoot>{renderRows(rows.footerRows, sourceRows.footerRows)}</tfoot>
        )}
      </table>
    </div>
  );
}

export const tableConfig: ComponentConfig<TableProps> = {
  label: "Table",
  fields: {
    caption: { type: "text", label: "Table caption" },
    headerRows: { ...rowsField("Header rows", true), metadata: { tableEditor: true } },
    bodyRows: { ...rowsField("Body rows"), metadata: { tableEditorPart: true } },
    footerRows: { ...rowsField("Footer rows"), metadata: { tableEditorPart: true } },
    width: { type: "text", label: "Table width (px, %, or auto)" },
    align: {
      type: "select",
      label: "Table alignment",
      options: options(["left", "center", "right"]),
    },
    tableLayout: {
      type: "select",
      label: "Table layout",
      options: options(["auto", "fixed", "initial", "inherit"]),
    },
    padding: { type: "text", label: "Outer padding (px or %)" },
    cellpadding: { type: "number", label: "Default cell padding (px)", min: 0, max: 1000 },
    cellspacing: { type: "number", label: "Cell spacing (px)", min: 0, max: 1000 },
    fontFamily: { type: "text", label: "Font family (blank inherits)" },
    fontSize: { type: "number", label: "Font size (px)", min: 1, max: 200 },
    lineHeight: { type: "text", label: "Line height (px, %, or multiplier)" },
    color: colorField("Text color (hex)"),
    containerBackgroundColor: colorField("Container background (hex)"),
    border: { type: "text", label: "Table border" },
    cssClass: { type: "text", label: "CSS class" },
  },
  defaultProps: {
    caption: "",
    headerRows: [
      {
        cells: [
          { ...newTableCell(true), content: "<p>Item</p>" },
          { ...newTableCell(true), content: "<p>Details</p>" },
        ],
      },
    ],
    bodyRows: [
      {
        cells: [
          { ...newTableCell(false), content: "<p>Example</p>" },
          { ...newTableCell(false), content: "<p>Description</p>" },
        ],
      },
    ],
    footerRows: [],
    color: "#222222",
    fontFamily: "",
    fontSize: 13,
    lineHeight: "22px",
    align: "left",
    width: "100%",
    cellpadding: 0,
    cellspacing: 0,
    tableLayout: "auto",
    border: "none",
    padding: "10px",
    containerBackgroundColor: "",
    cssClass: "",
  },
  resolveData: ({ props }) => {
    const rows = normalizeTableRows(props);
    return rows.legacy
      ? {
          props: {
            ...props,
            headerRows: rows.headerRows,
            bodyRows: rows.bodyRows,
            footerRows: rows.footerRows,
          },
        }
      : { props };
  },
  render: (props) => <TableBlock {...props} />,
};
