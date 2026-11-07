import type { CSSProperties } from "react";
import type { RichText } from "@puckeditor/core";
import { sanitizeEmailRichText } from "./richtext";
import { normalizeColor as color } from "./native-attributes";

export type TableCellScope = "" | "row" | "col" | "rowgroup" | "colgroup";
export type TableCell = {
  content: RichText;
  header?: boolean;
  scope?: TableCellScope;
  colSpan?: number;
  rowSpan?: number;
  align?: "left" | "center" | "right" | "justify";
  verticalAlign?: "top" | "middle" | "bottom";
  width?: string;
  padding?: string;
  backgroundColor?: string;
  color?: string;
  border?: string;
};
export type TableRow = { cells: TableCell[] };
export type TableProps = {
  caption?: string;
  headerRows?: TableRow[];
  bodyRows?: TableRow[];
  footerRows?: TableRow[];
  firstHeading?: string;
  secondHeading?: string;
  rows?: { first: string; second: string }[];
  color?: string;
  fontFamily?: string;
  fontSize?: number | string;
  lineHeight?: number | string;
  align?: "left" | "center" | "right";
  width?: string;
  cellpadding?: number | string;
  cellspacing?: number | string;
  tableLayout?: "auto" | "fixed" | "initial" | "inherit";
  border?: string;
  padding?: string;
  containerBackgroundColor?: string;
  cssClass?: string;
};

export type NormalizedTableRows = {
  headerRows: TableRow[];
  bodyRows: TableRow[];
  footerRows: TableRow[];
  legacy: boolean;
};

type Attributes = Record<string, string | number | undefined>;
const rowGroups = ["headerRows", "bodyRows", "footerRows"] as const;
const text = (value: unknown) => (typeof value === "string" ? value : "");
const escapeHtml = (value: unknown) =>
  text(value).replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character]!,
  );

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function records(value: unknown, label: string): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value.map((item) => record(item, `${label} item`));
}

function integer(value: unknown, fallback: number, min: number, max: number): number {
  const number = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  return typeof number === "number" &&
    Number.isSafeInteger(number) &&
    number >= min &&
    number <= max
    ? number
    : fallback;
}

function choice<T extends string>(value: unknown, values: readonly T[], fallback: T): T {
  return values.includes(value as T) ? (value as T) : fallback;
}

function spacing(value: unknown, fallback = ""): string {
  const input = text(value).trim();
  if (input === "0") return "0px";
  return /^\d+(?:\.\d+)?(?:px|%)(?:\s+\d+(?:\.\d+)?(?:px|%)){0,3}$/.test(input) ? input : fallback;
}

function width(value: unknown, fallback = ""): string {
  const input = text(value).trim();
  return /^(?:auto|\d+(?:\.\d+)?(?:px|%))$/.test(input) ? input : fallback;
}

function border(value: unknown, fallback = ""): string {
  const input = text(value).trim();
  return /^(?:none|0|0px|\d+(?:\.\d+)?px\s+(?:solid|dashed|dotted|double|groove|ridge|inset|outset)\s+(?:#[\da-fA-F]{3}(?:[\da-fA-F]{3})?|transparent))$/.test(
    input,
  )
    ? input
    : fallback;
}

function normalizeCell(value: Record<string, unknown>, headerRow: boolean): TableCell {
  const header = typeof value.header === "boolean" ? value.header : headerRow;
  const cell: TableCell = {
    content: (value.content as RichText) ?? "",
    header,
    scope: header
      ? choice(
          value.scope,
          ["", "row", "col", "rowgroup", "colgroup"] as const,
          headerRow ? "col" : "row",
        )
      : "",
    colSpan: integer(value.colSpan, 1, 1, 1000),
    rowSpan: integer(value.rowSpan, 1, 0, 65534),
    align: choice(value.align, ["left", "center", "right", "justify"] as const, "left"),
    verticalAlign: choice(value.verticalAlign, ["top", "middle", "bottom"] as const, "top"),
    width: width(value.width),
    padding: spacing(value.padding),
    backgroundColor: color(value.backgroundColor),
    color: color(value.color),
    border: border(value.border),
  };
  return Object.entries(cell).every(([key, entry]) => value[key] === entry)
    ? (value as TableCell)
    : cell;
}

function mapShared<T>(items: T[], map: (item: T) => T): T[] {
  const next = items.map(map);
  return next.every((item, index) => item === items[index]) ? items : next;
}

/** Any supplied modern row group opts out of the legacy two-column shape, including []. */
export function normalizeTableRows(value: unknown): NormalizedTableRows {
  const props = record(value, "Table props");
  const modern = rowGroups.some((key) => props[key] !== undefined);
  if (!modern) {
    const literal = (value: unknown) => `<p>${escapeHtml(value)}</p>`;
    return {
      legacy: true,
      headerRows: [
        {
          cells: [
            normalizeCell({ content: literal(props.firstHeading), header: true }, true),
            normalizeCell({ content: literal(props.secondHeading), header: true }, true),
          ],
        },
      ],
      bodyRows: records(props.rows === undefined ? [] : props.rows, "Table rows").map((row) => ({
        cells: [
          normalizeCell({ content: literal(row.first) }, false),
          normalizeCell({ content: literal(row.second) }, false),
        ],
      })),
      footerRows: [],
    };
  }
  const read = (key: (typeof rowGroups)[number]): TableRow[] => {
    const items = props[key] === undefined ? [] : props[key];
    records(items, `Table ${key}`);
    return mapShared(items as TableRow[], (row) => {
      records(row.cells, `Table ${key} cells`);
      const cells = mapShared(row.cells, (cell) =>
        normalizeCell(record(cell, "Table cell"), key === "headerRows"),
      );
      return cells === row.cells ? row : { ...row, cells };
    });
  };
  return {
    headerRows: read("headerRows"),
    bodyRows: read("bodyRows"),
    footerRows: read("footerRows"),
    legacy: false,
  };
}

/** MJML attributes and canvas styling share the same validated values. */
export function getTableAttributes(value: unknown): Attributes {
  const props = record(value, "Table props");
  const font = text(props.fontFamily).trim();
  const size =
    typeof props.fontSize === "string" ? Number(props.fontSize.replace(/px$/, "")) : props.fontSize;
  const height =
    typeof props.lineHeight === "number" ? String(props.lineHeight) : text(props.lineHeight).trim();
  const cssClass = text(props.cssClass);
  if (cssClass && !/^[A-Za-z_][\w-]*(?: [A-Za-z_][\w-]*)*$/.test(cssClass))
    throw new Error("Table CSS class must contain class names separated by single spaces");
  return {
    color: color(props.color, "#222222"),
    "font-family": font && /^[\p{L}\p{N} ,'"_-]{1,160}$/u.test(font) ? font : undefined,
    "font-size": `${typeof size === "number" && Number.isFinite(size) ? Math.max(1, Math.min(200, size)) : 13}px`,
    "line-height": /^\d+(?:\.\d+)?(?:px|%)?$/.test(height) ? height : "22px",
    align: choice(props.align, ["left", "center", "right"], "left"),
    width: width(props.width, "100%"),
    cellpadding: integer(props.cellpadding, 0, 0, 1000),
    cellspacing: integer(props.cellspacing, 0, 0, 1000),
    "table-layout": choice(props.tableLayout, ["auto", "fixed", "initial", "inherit"], "auto"),
    border: border(props.border, "none"),
    padding: spacing(props.padding, "10px"),
    "container-background-color": color(props.containerBackgroundColor) || undefined,
    "css-class": ["pm-email-text", cssClass].filter(Boolean).join(" "),
  };
}

export function getTableStyle(value: unknown): CSSProperties {
  const attrs = getTableAttributes(value);
  const align = attrs.align;
  return {
    color: String(attrs.color),
    fontFamily: attrs["font-family"] as string | undefined,
    fontSize: String(attrs["font-size"]),
    lineHeight: String(attrs["line-height"]),
    tableLayout: attrs["table-layout"] as CSSProperties["tableLayout"],
    width: String(attrs.width),
    border: String(attrs.border),
    backgroundColor: "transparent",
    borderCollapse: Number(attrs.cellspacing) > 0 ? "separate" : "collapse",
    borderSpacing: `${attrs.cellspacing}px`,
    marginLeft: align === "center" || align === "right" ? "auto" : 0,
    marginRight: align === "center" || align === "left" ? "auto" : 0,
  };
}

export function getTableCellStyle(value: TableCell): CSSProperties {
  const cell = normalizeCell(record(value, "Table cell"), false);
  return {
    textAlign: cell.align,
    verticalAlign: cell.verticalAlign,
    width: cell.width || undefined,
    padding: cell.padding || undefined,
    backgroundColor: cell.backgroundColor || undefined,
    color: cell.color || undefined,
    border: cell.border || "none",
  };
}

const serializeStyle = (style: CSSProperties) =>
  Object.entries(style)
    .filter(([, value]) => value !== undefined)
    .map(
      ([key, value]) => `${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}:${value}`,
    )
    .join(";");

export function getTableCellAttributes(cell: TableCell): Attributes {
  const normalized = normalizeCell(record(cell, "Table cell"), false);
  return {
    scope: normalized.header && normalized.scope ? normalized.scope : undefined,
    colspan: normalized.colSpan! > 1 ? normalized.colSpan : undefined,
    rowspan: normalized.rowSpan !== 1 ? normalized.rowSpan : undefined,
    style: serializeStyle(getTableCellStyle(normalized)),
  };
}

const serializeAttributes = (attributes: Attributes) =>
  Object.entries(attributes)
    .filter(([, value]) => value !== undefined && value !== "")
    .map(([name, value]) => ` ${name}="${escapeHtml(String(value))}"`)
    .join("");

/** The content of mj-table is HTML, so it needs its own strict cell/style serialization. */
export function renderTableContent(value: unknown): string {
  const props = record(value, "Table props");
  const rows = normalizeTableRows(props);
  const renderRows = (tag: string, items: TableRow[]) =>
    items.length
      ? `<${tag}>${items
          .map(
            (row) =>
              `<tr>${row.cells
                .map((cell) => {
                  const tag = cell.header ? "th" : "td";
                  return `<${tag}${serializeAttributes(getTableCellAttributes(cell))}>${sanitizeEmailRichText(cell.content)}</${tag}>`;
                })
                .join("")}</tr>`,
          )
          .join("")}</${tag}>`
      : "";
  const caption = text(props.caption) ? `<caption>${escapeHtml(props.caption)}</caption>` : "";
  return (
    caption +
    renderRows("thead", rows.headerRows) +
    renderRows("tbody", rows.bodyRows) +
    renderRows("tfoot", rows.footerRows)
  );
}
