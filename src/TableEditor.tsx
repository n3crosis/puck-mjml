import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AutoField, createUsePuck, type ArrayField, type Field } from "@puckeditor/core";
import { ColumnsPlusRightIcon } from "@phosphor-icons/react/dist/csr/ColumnsPlusRight";
import { ArrowUpIcon } from "@phosphor-icons/react/dist/csr/ArrowUp";
import { ArrowDownIcon } from "@phosphor-icons/react/dist/csr/ArrowDown";
import { ArrowLeftIcon } from "@phosphor-icons/react/dist/csr/ArrowLeft";
import { ArrowRightIcon } from "@phosphor-icons/react/dist/csr/ArrowRight";
import { MinusIcon } from "@phosphor-icons/react/dist/csr/Minus";
import { PlusIcon } from "@phosphor-icons/react/dist/csr/Plus";
import { TrashIcon } from "@phosphor-icons/react/dist/csr/Trash";
import { newTableCell } from "./TableBlock";
import { PropertyFieldLabel } from "./PropertyInspector";
import { sanitizeEmailRichText } from "./richtext";
import { normalizeTableRows, type TableCell, type TableProps, type TableRow } from "./table";

const usePuck = createUsePuck();
const rowGroups = [
  { name: "headerRows", label: "Header" },
  { name: "bodyRows", label: "Body" },
  { name: "footerRows", label: "Footer" },
] as const;
type RowGroup = (typeof rowGroups)[number]["name"];
type CellSelection = { group: RowGroup; row: number; cell: number };
type RowData = Record<RowGroup, TableRow[]>;

function moveItem<T>(items: T[], from: number, to: number) {
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function percentWidths(rows: TableRow[], count: number): number[] | undefined {
  if (!count || !rows.length) return;
  const widths = rows.map((row) =>
    row.cells.map((cell) => {
      const value = cell.width?.trim();
      return value && /^\d+(?:\.\d+)?%$/.test(value) ? Number(value.slice(0, -1)) : NaN;
    }),
  );
  const first = widths[0];
  return widths.every(
    (row) =>
      row.length === count &&
      row.every(
        (value, index) =>
          Number.isFinite(value) && value > 0 && value <= 100 && value === first[index],
      ),
  )
    ? first
    : undefined;
}

/** Allocate hundredths of a percent, retaining ratios and an exact 100% total. */
function balancedWidths(weights: number[]): string[] {
  const total = weights.reduce((sum, value) => sum + value, 0);
  const scaled = weights.map((value) => (value / total) * 10000);
  const units = scaled.map(Math.floor);
  const remainder = 10000 - units.reduce((sum, value) => sum + value, 0);
  const fractions = scaled
    .map((value, index) => ({ index, fraction: value - units[index] }))
    .sort((a, b) => b.fraction - a.fraction);
  for (let index = 0; index < remainder; index++) units[fractions[index].index]++;
  return units.map((value) => `${value / 100}%`);
}

function CellField({
  definition,
  onChange,
  ...props
}: {
  definition: Field;
  id: string;
  value: unknown;
  readOnly: boolean;
  onChange: (value: unknown) => void;
}) {
  const latestOnChange = useRef(onChange);
  useEffect(() => {
    latestOnChange.current = onChange;
  }, [onChange]);
  // A stable callback prevents Puck's rich-text synchronization effect from
  // replaying the last edit when selection, undo or another field changes.
  const change = useCallback((value: unknown) => latestOnChange.current(value), []);
  const field = useMemo(() => ({ ...definition, visible: true }), [definition]);
  return <AutoField {...props} field={field} onChange={change} />;
}

function cellSummary(content: TableCell["content"]) {
  const html = sanitizeEmailRichText(content);
  const text =
    typeof DOMParser === "undefined"
      ? html.replace(/<[^>]*>/g, " ")
      : (new DOMParser().parseFromString(html, "text/html").body.textContent ?? "");
  return text.replace(/\s+/g, " ").trim() || "Empty cell";
}

function hasRowSpans(rows: TableRow[]) {
  return rows.some((row) => row.cells.some((cell) => (cell.rowSpan ?? 1) !== 1));
}

// Wildcards follow Puck's nested field paths, e.g. bodyRows[*].cells[*].content.
function pathMatches(pattern: string, path: string) {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "\\d+");
  return new RegExp(`^${escaped}(?:$|[.\\[])`).test(path);
}

function TableEditor({ field }: { field: ArrayField<TableRow[]> }) {
  const api = usePuck((state) => state);
  const item = api.selectedItem;
  const [selection, setSelection] = useState<CellSelection>({ group: "bodyRows", row: 0, cell: 0 });
  if (!item) return null;
  // Use normalized rows only to migrate legacy documents. Modern rows stay
  // untouched so editing one cell never rewrites a sibling's styles or spans.
  const normalized = normalizeTableRows(item.props);
  const rows: RowData = normalized.legacy
    ? normalized
    : {
        headerRows: (item.props.headerRows as TableRow[] | undefined) ?? [],
        bodyRows: (item.props.bodyRows as TableRow[] | undefined) ?? [],
        footerRows: (item.props.footerRows as TableRow[] | undefined) ?? [],
      };
  const allRows = rowGroups.flatMap(({ name }) => rows[name]);
  const width = Math.max(
    0,
    ...allRows.map((row) => row.cells.reduce((sum, cell) => sum + (cell.colSpan ?? 1), 0)),
  );
  const hasSpans = allRows.some((row) =>
    row.cells.some((cell) => (cell.colSpan ?? 1) !== 1 || (cell.rowSpan ?? 1) !== 1),
  );
  const rectangular = allRows.every((row) => row.cells.length === width);
  const percentages = !hasSpans && rectangular ? percentWidths(allRows, width) : undefined;
  const firstWidths = allRows[0]?.cells.map((cell) => cell.width);
  const inheritedWidths =
    !hasSpans &&
    rectangular &&
    firstWidths &&
    (percentages ||
      allRows.every((row) => row.cells.every((cell, index) => cell.width === firstWidths[index])))
      ? firstWidths
      : undefined;
  const canEdit = Boolean(api.getPermissions({ item }).edit);
  const locks = Object.entries(item.readOnly ?? {}).filter(([, locked]) => locked);
  const isLocked = (path: string) =>
    !canEdit || locks.some(([pattern]) => pathMatches(pattern, path));
  const structureLocked = (group: RowGroup) =>
    isLocked(group) ||
    locks.some(([path]) => path.startsWith(`${group}[`) || path.startsWith(`${group}.`));
  const columnsLocked = rowGroups.some(({ name }) => rows[name].length && structureLocked(name));
  const columnReason =
    !canEdit || columnsLocked
      ? "These cells are read only."
      : hasSpans
        ? "Column changes are unavailable while cells span rows or columns."
        : !rectangular
          ? "Column changes require the same number of cells in every row."
          : !allRows.length
            ? "Add a row first."
            : "";
  const first = rowGroups.flatMap(({ name }) =>
    rows[name].map((_, row) => ({ group: name, row, cell: 0 })),
  )[0];
  const selectedRow = rows[selection.group][selection.row];
  const active = selectedRow
    ? { ...selection, cell: Math.min(selection.cell, Math.max(0, selectedRow.cells.length - 1)) }
    : first;
  const cell = active ? rows[active.group][active.row].cells[active.cell] : undefined;
  const cellsField = field.arrayFields.cells;
  const fields =
    cellsField.type === "array" ? (cellsField.arrayFields as Record<string, Field>) : {};

  const commit = (patch: Partial<TableProps>) => {
    const current = api.getItemById(item.props.id);
    const selector = api.getSelectorForId(item.props.id);
    if (!current || !selector || !api.getPermissions({ item: current }).edit) return;
    api.dispatch({
      type: "replace",
      destinationIndex: selector.index,
      destinationZone: selector.zone,
      data: {
        ...current,
        props: { ...current.props, ...(normalized.legacy ? rows : {}), ...patch },
      },
      recordHistory: true,
    });
  };

  const addColumn = () => {
    if (columnReason) return;
    const nextWidths = percentages
      ? balancedWidths([...percentages, percentages.reduce((sum, value) => sum + value, 0) / width])
      : undefined;
    commit(
      Object.fromEntries(
        rowGroups.map(({ name }) => [
          name,
          rows[name].map((row) => ({
            ...row,
            cells: [...row.cells, newTableCell(name === "headerRows")].map((cell, index) =>
              nextWidths ? { ...cell, width: nextWidths[index] } : cell,
            ),
          })),
        ]),
      ),
    );
  };
  const removeColumn = () => {
    if (columnReason || width <= 1 || !active) return;
    const index = active.cell;
    const nextWidths = percentages
      ? balancedWidths(percentages.filter((_, column) => column !== index))
      : undefined;
    commit(
      Object.fromEntries(
        rowGroups.map(({ name }) => [
          name,
          rows[name].map((row) => ({
            ...row,
            cells: row.cells
              .filter((_, cellIndex) => cellIndex !== index)
              .map((cell, column) => (nextWidths ? { ...cell, width: nextWidths[column] } : cell)),
          })),
        ]),
      ),
    );
    setSelection({ ...active, cell: Math.min(index, width - 2) });
  };
  const moveColumn = (direction: -1 | 1) => {
    if (columnReason || !active) return;
    const target = active.cell + direction;
    if (target < 0 || target >= width) return;
    commit(
      Object.fromEntries(
        rowGroups.map(({ name }) => [
          name,
          rows[name].map((row) => ({ ...row, cells: moveItem(row.cells, active.cell, target) })),
        ]),
      ),
    );
    setSelection({ ...active, cell: target });
  };

  return (
    <div className="pm-table-editor">
      <div className="pm-table-structure" role="group" aria-label="Table columns">
        <span>
          {width} {width === 1 ? "column" : "columns"}
        </span>
        {([-1, 1] as const).map((direction) => {
          const label = `Move selected column ${direction === -1 ? "left" : "right"}`;
          const Icon = direction === -1 ? ArrowLeftIcon : ArrowRightIcon;
          return (
            <button
              key={direction}
              type="button"
              aria-label={label}
              title={columnReason || label}
              disabled={
                Boolean(columnReason) ||
                !active ||
                active.cell + direction < 0 ||
                active.cell + direction >= width
              }
              onClick={() => moveColumn(direction)}
            >
              <Icon size={14} aria-hidden="true" />
            </button>
          );
        })}
        <div className="pm-table-column-actions">
          <button
            type="button"
            disabled={Boolean(columnReason)}
            title={columnReason || "Add a column to every row"}
            onClick={addColumn}
          >
            <ColumnsPlusRightIcon size={14} aria-hidden="true" /> Add column
          </button>
          <button
            type="button"
            disabled={Boolean(columnReason) || width <= 1 || !active}
            title={
              columnReason ||
              (width <= 1
                ? "Keep at least one column."
                : "Remove the selected column from every row")
            }
            onClick={removeColumn}
          >
            <MinusIcon size={14} aria-hidden="true" /> Remove column
          </button>
        </div>
      </div>
      {columnReason && (hasSpans || !rectangular) ? (
        <p className="pm-table-hint">{columnReason} Cell properties remain editable.</p>
      ) : null}
      {!columnReason && width > 1 ? (
        <p className="pm-table-hint">Drag a column edge on the canvas to resize.</p>
      ) : null}
      {rowGroups.map(({ name, label }) => {
        const items = rows[name];
        const rowReason = structureLocked(name)
          ? "These rows are read only."
          : hasRowSpans(items)
            ? "Row changes are unavailable while cells span multiple rows."
            : "";
        return (
          <section className="pm-table-row-group" key={name} aria-label={`${label} rows`}>
            <div className="pm-table-group-heading">
              <span>
                {label} <small>{items.length}</small>
              </span>
              <button
                type="button"
                aria-label={`Add ${label.toLowerCase()} row`}
                title={rowReason || `Add ${label.toLowerCase()} row`}
                disabled={Boolean(rowReason)}
                onClick={() => {
                  if (rowReason) return;
                  const next = [
                    ...items,
                    {
                      cells: Array.from({ length: width || 2 }, (_, index) => ({
                        ...newTableCell(name === "headerRows"),
                        ...(inheritedWidths?.[index] !== undefined
                          ? { width: inheritedWidths[index] }
                          : {}),
                      })),
                    },
                  ];
                  commit({ [name]: next });
                  setSelection({ group: name, row: next.length - 1, cell: 0 });
                }}
              >
                <PlusIcon size={14} aria-hidden="true" /> Row
              </button>
              {([-1, 1] as const).map((direction) => {
                const actionLabel = `Move selected ${label.toLowerCase()} row ${direction === -1 ? "up" : "down"}`;
                const Icon = direction === -1 ? ArrowUpIcon : ArrowDownIcon;
                return (
                  <button
                    key={direction}
                    type="button"
                    aria-label={actionLabel}
                    title={rowReason || actionLabel}
                    disabled={
                      Boolean(rowReason) ||
                      active?.group !== name ||
                      active.row + direction < 0 ||
                      active.row + direction >= items.length
                    }
                    onClick={() => {
                      if (rowReason || active?.group !== name) return;
                      const target = active.row + direction;
                      if (target < 0 || target >= items.length) return;
                      commit({ [name]: moveItem(items, active.row, target) });
                      setSelection({ ...active, row: target });
                    }}
                  >
                    <Icon size={14} aria-hidden="true" />
                  </button>
                );
              })}
              <button
                type="button"
                aria-label={`Remove selected ${label.toLowerCase()} row`}
                title={rowReason || `Remove selected ${label.toLowerCase()} row`}
                disabled={Boolean(rowReason) || active?.group !== name}
                onClick={() => {
                  if (rowReason || active?.group !== name) return;
                  commit({ [name]: items.filter((_, index) => index !== active.row) });
                  setSelection({ ...active, row: Math.max(0, active.row - 1), cell: 0 });
                }}
              >
                <TrashIcon size={14} aria-hidden="true" />
              </button>
            </div>
            {items.length ? (
              <div className="pm-table-grid-scroll">
                <table
                  className="pm-table-cell-grid"
                  style={{ minWidth: width * 62 }}
                  aria-label={`${label} cells`}
                >
                  <tbody>
                    {items.map((row, rowIndex) => (
                      <tr key={rowIndex}>
                        {!row.cells.length && !hasRowSpans(items) ? (
                          <td colSpan={Math.max(1, width)}>
                            <button
                              type="button"
                              aria-label={`Select empty ${label.toLowerCase()} row ${rowIndex + 1}`}
                              aria-pressed={active?.group === name && active.row === rowIndex}
                              onClick={() => setSelection({ group: name, row: rowIndex, cell: 0 })}
                            >
                              <small>Row {rowIndex + 1}</small>
                              <span>Empty row</span>
                            </button>
                          </td>
                        ) : null}
                        {row.cells.map((entry, cellIndex) => {
                          const selected =
                            active?.group === name &&
                            active.row === rowIndex &&
                            active.cell === cellIndex;
                          const text = cellSummary(entry.content);
                          return (
                            <td
                              key={cellIndex}
                              colSpan={entry.colSpan ?? 1}
                              rowSpan={entry.rowSpan ?? 1}
                            >
                              <button
                                type="button"
                                aria-pressed={selected}
                                aria-label={`${label} row ${rowIndex + 1} cell ${cellIndex + 1}: ${text}`}
                                title={text}
                                onClick={() =>
                                  setSelection({ group: name, row: rowIndex, cell: cellIndex })
                                }
                              >
                                <small>
                                  {rowIndex + 1}.{cellIndex + 1}
                                  {entry.header ? " · H" : ""}
                                </small>
                                <span>{text}</span>
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="pm-table-empty">No {label.toLowerCase()} rows</p>
            )}
          </section>
        );
      })}
      {cell && active ? (
        <section className="pm-table-selected-cell" aria-label="Selected cell properties">
          <div className="pm-table-cell-heading">
            {rowGroups.find(({ name }) => name === active.group)!.label} · Row {active.row + 1},
            cell {active.cell + 1}
          </div>
          <p className="pm-table-hint">Select a cell above or edit its text on the canvas.</p>
          {Object.entries(fields).map(([name, definition]) => {
            const path = `${active.group}[${active.row}].cells[${active.cell}].${name}`;
            const readOnly = isLocked(path);
            const input = (
              <CellField
                key={path}
                id={`${item.props.id}_${path.replace(/[^\w-]/g, "_")}`}
                definition={definition}
                value={cell[name as keyof TableCell]}
                readOnly={readOnly}
                onChange={(value) => {
                  if (readOnly) return;
                  const currentRows =
                    (api.getItemById(item.props.id)?.props[active.group] as
                      | TableRow[]
                      | undefined) ?? rows[active.group];
                  const currentCell = currentRows[active.row]?.cells[active.cell];
                  // Puck's rich-text editor may replay its latest value when its
                  // callback updates. Do not create duplicate history/state work.
                  if (!currentCell || Object.is(currentCell[name as keyof TableCell], value))
                    return;
                  commit({
                    [active.group]: currentRows.map((row, index) =>
                      index !== active.row
                        ? row
                        : {
                            ...row,
                            cells: row.cells.map((current, index) =>
                              index !== active.cell ? current : { ...current, [name]: value },
                            ),
                          },
                    ),
                  });
                }}
              />
            );
            return (
              <div
                key={name}
                className={`pm-table-cell-property${definition.type === "richtext" ? " pm-table-cell-property--content" : ""}`}
                data-table-cell-property={name}
              >
                {definition.type === "custom" ? (
                  input
                ) : (
                  <PropertyFieldLabel
                    label={definition.label ?? name}
                    readOnly={readOnly}
                    el={
                      definition.type === "richtext" || definition.type === "radio"
                        ? "div"
                        : "label"
                    }
                  >
                    {input}
                  </PropertyFieldLabel>
                )}
              </div>
            );
          })}
        </section>
      ) : null}
    </div>
  );
}

/** Keep Puck's array schema/inline transforms, replacing only the table UI. */
export function TableArrayField({
  field,
  children,
}: {
  field: { type: string } & Pick<Field, "metadata">;
  children: ReactNode;
}) {
  const id = usePuck((state) => state.selectedItem?.props.id);
  if (field.type === "array" && field.metadata?.tableEditorPart)
    return <span hidden data-pm-table-field-hidden />;
  return field.type === "array" && field.metadata?.tableEditor ? (
    <TableEditor key={id} field={field as ArrayField<TableRow[]>} />
  ) : (
    <>{children}</>
  );
}
