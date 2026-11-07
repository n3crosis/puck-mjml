import { useLayoutEffect, useRef, useState, type PointerEvent } from "react";
import { createUsePuck, type Overrides } from "@puckeditor/core";
import { DotsSixVerticalIcon } from "@phosphor-icons/react/dist/csr/DotsSixVertical";
import { normalizeTableRows, type TableProps, type TableRow } from "./table";

const usePuck = createUsePuck();
const groups = ["headerRows", "bodyRows", "footerRows"] as const;
type Rows = Record<(typeof groups)[number], TableRow[]>;
type Geometry = {
  top: number;
  height: number;
  boundaries: number[];
  widths: number[];
  pixels: number;
  scale: number;
  direction: 1 | -1;
};
type Drag = {
  pointer: number;
  index: number;
  startX: number;
  widths: number[];
  pixels: number;
  direction: 1 | -1;
  next: number[];
};

/** Modern rows retain all original cell content and style values. */
export function rectangularTableRows(props: TableProps): Rows | null {
  try {
    const normalized = normalizeTableRows(props);
    const rows: Rows = normalized.legacy
      ? normalized
      : {
          headerRows: props.headerRows ?? [],
          bodyRows: props.bodyRows ?? [],
          footerRows: props.footerRows ?? [],
        };
    const all = groups.flatMap((group) => rows[group]);
    const count = all[0]?.cells.length ?? 0;
    if (
      count < 2 ||
      all.some(
        (row) =>
          row.cells.length !== count ||
          row.cells.some(
            (cell) => Number(cell.colSpan ?? 1) !== 1 || Number(cell.rowSpan ?? 1) !== 1,
          ),
      )
    )
      return null;
    return rows;
  } catch {
    return null;
  }
}
const minimum = (total: number) => Math.min(5, total / 3);
const percentage = (value: number) => `${Math.round(value * 100) / 100}%`;
function pairBounds(widths: number[], index: number) {
  const total = widths[index] + widths[index + 1];
  const min = minimum(total);
  // Imported columns may already be narrower than the editing minimum. Keep
  // their current size as the bound instead of jumping on click or moving a
  // separator against the requested direction when it reaches that bound.
  return {
    min: Math.min(min, widths[index]),
    max: total - Math.min(min, widths[index + 1]),
    total,
  };
}
export function resizeColumnPair(widths: number[], index: number, delta: number): number[] {
  if (index < 0 || index >= widths.length - 1 || !Number.isFinite(delta) || delta === 0)
    return widths;
  const { min, max, total } = pairBounds(widths, index);
  const requested = Math.max(min, Math.min(max, widths[index] + delta));
  if (requested === widths[index]) return widths;
  const left = Math.round(requested * 100) / 100;
  if (left === widths[index]) return widths;
  const next = [...widths];
  next[index] = left;
  next[index + 1] = Math.round((total - left) * 100) / 100;
  return next;
}
export function measureTableColumns(
  table: HTMLTableElement,
  host: HTMLElement,
  count: number,
): Geometry | null {
  const cells = [...(table.rows[0]?.cells ?? [])];
  if (cells.length !== count || cells.length < 2) return null;
  const boxes = cells.map((cell) => cell.getBoundingClientRect());
  const pixels = boxes.reduce((sum, box) => sum + box.width, 0);
  if (!pixels || boxes.some((box) => !box.width)) return null;
  const rect = table.getBoundingClientRect();
  const base = host.getBoundingClientRect();
  const scale = host.offsetWidth > 0 && base.width > 0 ? base.width / host.offsetWidth : 1;
  // Use rendered cell order: direction can come from the document or custom
  // CSS, and RTL places the first logical cell to the right of the next cell.
  const direction = boxes[0].left > boxes[1].left ? -1 : 1;
  return {
    top: (boxes[0].top - base.top) / scale,
    height: (rect.bottom - boxes[0].top) / scale,
    boundaries: boxes.slice(0, -1).map((box, index) => {
      const next = boxes[index + 1];
      const edge = direction === 1 ? (box.right + next.left) / 2 : (box.left + next.right) / 2;
      return (edge - base.left) / scale;
    }),
    widths: boxes.map((box) => (box.width / pixels) * 100),
    pixels,
    scale,
    direction,
  };
}
function locked(pattern: string, path: string) {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "\\d+");
  return new RegExp(`^${escaped}(?:$|[.\\[])`).test(path);
}

export function TableColumnResize({
  componentId,
  componentType,
  isSelected,
}: Pick<
  Parameters<Overrides["componentOverlay"]>[0],
  "componentId" | "componentType" | "isSelected"
>) {
  const api = usePuck((state) => state);
  const item = api.getItemById(componentId);
  const active = componentType === "Table" && isSelected && api.appState.ui.previewMode === "edit";
  const rows = active && item ? rectangularTableRows(item.props) : null;
  const count = rows ? groups.flatMap((group) => rows[group])[0].cells.length : 0;
  const marker = useRef<HTMLSpanElement>(null);
  const drag = useRef<Drag | null>(null);
  const [geometry, setGeometry] = useState<Geometry | null>(null);
  const [preview, setPreview] = useState<{ index: number; widths: number[] } | null>(null);
  const allowed = (
    index: number,
    current = item,
    currentRows = rows,
    widths = geometry?.widths,
  ) => {
    if (!current || !currentRows || !widths || !api.getPermissions({ item: current }).edit)
      return false;
    const locks = Object.entries(current.readOnly ?? {})
      .filter(([, value]) => value)
      .map(([path]) => path);
    return groups.every((group) =>
      currentRows[group].every((entry, row) =>
        entry.cells.every(
          (cell, column) =>
            !locks.some((pattern) => locked(pattern, `${group}[${row}].cells[${column}].width`)) ||
            (column !== index && column !== index + 1 && cell.width === percentage(widths[column])),
        ),
      ),
    );
  };
  useLayoutEffect(() => {
    const element = marker.current;
    const host = element?.parentElement;
    const view = element?.ownerDocument.defaultView;
    if (!active || !count || !element || !host || !view) {
      setGeometry(null);
      return;
    }
    const scope = element.closest("[data-puck-preview]") ?? element.ownerDocument;
    const wrapper = [...scope.querySelectorAll<HTMLElement>("[data-puck-component]")].find(
      (candidate) => candidate.getAttribute("data-puck-component") === componentId,
    );
    const table = wrapper?.querySelector<HTMLTableElement>(".pm-table");
    if (!table) {
      setGeometry(null);
      return;
    }
    let frame: number | undefined;
    const measure = () => {
      frame = undefined;
      const next = measureTableColumns(table, host, count);
      setGeometry((previous) =>
        JSON.stringify(previous) === JSON.stringify(next) ? previous : next,
      );
    };
    const schedule = () => {
      if (frame === undefined) frame = view.requestAnimationFrame(measure);
    };
    measure();
    schedule();
    const resize = new view.ResizeObserver(schedule);
    resize.observe(table);
    resize.observe(host);
    const mutations = new view.MutationObserver(schedule);
    mutations.observe(table, { attributes: true, childList: true, subtree: true });
    for (let ancestor: HTMLElement | null = host; ancestor; ancestor = ancestor.parentElement)
      mutations.observe(ancestor, { attributes: true, attributeFilter: ["style", "class"] });
    view.addEventListener("resize", schedule);
    view.addEventListener("scroll", schedule, true);
    return () => {
      if (frame !== undefined) view.cancelAnimationFrame(frame);
      resize.disconnect();
      mutations.disconnect();
      view.removeEventListener("resize", schedule);
      view.removeEventListener("scroll", schedule, true);
    };
  }, [active, componentId, count, item?.props]);
  const commit = (index: number, widths: number[]) => {
    const current = api.getItemById(componentId);
    const selector = api.getSelectorForId(componentId);
    const currentRows = current ? rectangularTableRows(current.props) : null;
    if (
      !current ||
      !selector ||
      !currentRows ||
      !allowed(index, current, currentRows, widths) ||
      groups.flatMap((group) => currentRows[group])[0].cells.length !== widths.length
    )
      return;
    const patch = Object.fromEntries(
      groups.map((group) => [
        group,
        currentRows[group].map((row) => ({
          ...row,
          // Freeze the measured widths of the untouched columns too; leaving
          // them implicit lets the browser redistribute them after the edit.
          cells: row.cells.map((cell, column) =>
            cell.width === percentage(widths[column])
              ? cell
              : { ...cell, width: percentage(widths[column]) },
          ),
        })),
      ]),
    );
    api.dispatch({
      type: "replace",
      destinationIndex: selector.index,
      destinationZone: selector.zone,
      data: { ...current, props: { ...current.props, ...patch } },
      recordHistory: true,
    });
  };
  const nextDrag = (event: PointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (!state || state.pointer !== event.pointerId) return null;
    event.preventDefault();
    event.stopPropagation();
    state.next = resizeColumnPair(
      state.widths,
      state.index,
      ((event.clientX - state.startX) / state.pixels) * 100 * state.direction,
    );
    return state;
  };
  const cancel = () => {
    drag.current = null;
    setPreview(null);
  };
  return (
    <>
      <span ref={marker} hidden aria-hidden="true" />
      {active && rows && geometry && (
        <div className="pm-table-resize" style={{ top: geometry.top, height: geometry.height }}>
          {geometry.boundaries.map((left, index) => {
            if (!allowed(index)) return null;
            const widths = preview?.index === index ? preview.widths : geometry.widths;
            const bounds = pairBounds(widths, index);
            const shift =
              (((widths[index] - geometry.widths[index]) / 100) *
                geometry.pixels *
                geometry.direction) /
              geometry.scale;
            return (
              <div
                key={index}
                className="pm-table-resize-handle"
                role="separator"
                aria-orientation="vertical"
                aria-label={`Resize columns ${index + 1} and ${index + 2}`}
                aria-valuemin={bounds.min}
                aria-valuemax={bounds.max}
                aria-valuenow={Math.round(widths[index] * 100) / 100}
                aria-valuetext={`Column ${index + 1}: ${widths[index].toFixed(1)}%; column ${index + 2}: ${widths[index + 1].toFixed(1)}%`}
                tabIndex={0}
                draggable={false}
                style={{ left: left + shift }}
                data-resizing={preview?.index === index || undefined}
                title="Drag to resize columns. Arrow keys adjust by 1%."
                onClick={(event) => event.stopPropagation()}
                onDragStart={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onPointerDown={(event) => {
                  if (event.button !== 0) return;
                  event.preventDefault();
                  event.stopPropagation();
                  event.currentTarget.focus({ preventScroll: true });
                  event.currentTarget.setPointerCapture?.(event.pointerId);
                  drag.current = {
                    pointer: event.pointerId,
                    index,
                    startX: event.clientX,
                    widths: geometry.widths,
                    pixels: geometry.pixels,
                    direction: geometry.direction,
                    next: geometry.widths,
                  };
                  setPreview({ index, widths: geometry.widths });
                }}
                onPointerMove={(event) => {
                  const state = nextDrag(event);
                  if (state) setPreview({ index: state.index, widths: state.next });
                }}
                onPointerUp={(event) => {
                  const state = nextDrag(event);
                  if (!state) return;
                  cancel();
                  event.currentTarget.releasePointerCapture?.(event.pointerId);
                  if (
                    state.next.some(
                      (width, column) => Math.abs(width - state.widths[column]) > 0.01,
                    )
                  )
                    commit(state.index, state.next);
                }}
                onPointerCancel={cancel}
                onLostPointerCapture={cancel}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    event.stopPropagation();
                    cancel();
                    return;
                  }
                  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                  event.preventDefault();
                  event.stopPropagation();
                  const next = resizeColumnPair(
                    geometry.widths,
                    index,
                    (event.key === "ArrowRight" ? 1 : -1) * geometry.direction,
                  );
                  if (next !== geometry.widths) commit(index, next);
                }}
              >
                <span className="pm-table-resize-grip" aria-hidden="true">
                  <DotsSixVerticalIcon size={14} />
                </span>
                {preview?.index === index && (
                  <span className="pm-table-resize-value" aria-hidden="true">
                    {widths[index].toFixed(0)}% / {widths[index + 1].toFixed(0)}%
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
