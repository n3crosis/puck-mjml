import {
  createContext,
  useCallback,
  useContext,
  useRef,
  type ReactNode,
  type RefCallback,
} from "react";

export type NativeDragPreview = ReturnType<typeof createNativeDragPreview>;
type RowKind = "section" | "group" | "intrinsic";
type RowLayout = { axis: "x" | "y"; columns?: string; heights?: string };

// Puck's static gap detector recognizes flex/grid, not table flow. Snapshot the
// rendered tracks before switching intrinsic tables to grid for a drag only.
function intrinsicTracks(row: HTMLElement): RowLayout {
  const bounds = row.getBoundingClientRect();
  const style = row.ownerDocument.defaultView?.getComputedStyle(row);
  const px = (value: string | undefined) => Number.parseFloat(value || "") || 0;
  const width =
    px(style?.width) +
    (style?.boxSizing === "border-box"
      ? 0
      : px(style?.paddingLeft) +
        px(style?.paddingRight) +
        px(style?.borderLeftWidth) +
        px(style?.borderRightWidth));
  const scale = width > 0 && bounds.width > 0 ? bounds.width / width : 1;
  const boxes = [...row.children]
    .filter((child) => child.matches(".pm-intrinsic-cell:not([data-dnd-placeholder])"))
    .map((child) => child.getBoundingClientRect());
  // Inline-block cells can have different tops with middle/bottom alignment.
  // A repeated horizontal interval, not their top edge, marks a wrapped row.
  const rows: DOMRect[][] = [];
  for (const box of boxes) {
    const last = rows.at(-1);
    if (
      !last ||
      last.some((cell) => Math.min(cell.right, box.right) - Math.max(cell.left, box.left) > 1 / 64)
    ) {
      rows.push([box]);
    } else last.push(box);
  }
  const columns = rows[0] || [];
  const heights = rows.map((cells) => Math.max(...cells.map((box) => box.height)));
  return {
    axis: columns.length > 1 ? "x" : "y",
    columns: columns.map((box) => `${box.width / scale}px`).join(" ") || "1fr",
    heights: heights.map((height) => `${height / scale}px`).join(" ") || "auto",
  };
}

/** Puck's public onAction runs synchronously before its drag-start callback
 * returns. Keep supported drag-preview geometry local to the owning editor. */
export function createNativeDragPreview() {
  const rows = new Map<HTMLElement, RowKind>();
  let dragging = false;
  function classifyRow(row: HTMLElement, kind: RowKind): "x" | "y" {
    if (kind === "group") return "x";
    const style = row.ownerDocument.defaultView?.getComputedStyle(row);
    const px = (value: string | undefined) => Number.parseFloat(value || "") || 0;
    // Rows registered during a drag can already carry the Section hit-area
    // padding. Classify against the content box that sizes their children.
    const width =
      row.getBoundingClientRect().width -
      px(style?.paddingLeft) -
      px(style?.paddingRight) -
      px(style?.borderLeftWidth) -
      px(style?.borderRightWidth);
    const items = [...row.children].filter((child) =>
      child.matches(".pm-native-inline-column, .pm-native-inline-group"),
    );
    // An empty section has no widths to classify. Its own responsive rule supplies
    // only the empty-row hint; authored nonempty mobile rows still use real widths.
    if (!items.length)
      return row.ownerDocument.defaultView
        ?.getComputedStyle(row)
        .getPropertyValue("--pm-native-empty-drag-axis")
        .trim() === "y"
        ? "y"
        : "x";
    // Inspect the actual widths, not the media breakpoint: authored mobile
    // columns may deliberately remain 80px/calc(...) or percentage siblings.
    return width > 0 &&
      items.every((item) => Math.abs(item.getBoundingClientRect().width - width) <= 1 / 64)
      ? "y"
      : "x";
  }
  function updateRow(row: HTMLElement, layout?: RowLayout) {
    if (!layout) {
      row.removeAttribute("data-pm-native-dragging");
      row.removeAttribute("data-pm-native-drag-axis");
      row.style.removeProperty("--pm-intrinsic-drag-columns");
      row.style.removeProperty("--pm-intrinsic-drag-rows");
      return;
    }
    if (layout.columns) row.style.setProperty("--pm-intrinsic-drag-columns", layout.columns);
    if (layout.heights) row.style.setProperty("--pm-intrinsic-drag-rows", layout.heights);
    row.setAttribute("data-pm-native-drag-axis", layout.axis);
    row.setAttribute("data-pm-native-dragging", "true");
  }
  const measure = (row: HTMLElement, kind: RowKind): RowLayout =>
    kind === "intrinsic" ? intrinsicTracks(row) : { axis: classifyRow(row, kind) };
  function setDragging(value: boolean) {
    if (dragging === value) return;
    dragging = value;
    // Snapshot all row geometry before any row changes its layout.
    const axes = [...rows].map(
      ([row, kind]) => [row, dragging ? measure(row, kind) : undefined] as const,
    );
    for (const [row, axis] of axes) updateRow(row, axis);
  }
  return {
    onAction(_action: unknown, state: { ui: { isDragging: boolean } }) {
      setDragging(state.ui.isDragging);
    },
    register(row: HTMLElement, kind: RowKind) {
      rows.set(row, kind);
      updateRow(row, dragging ? measure(row, kind) : undefined);
      return () => {
        rows.delete(row);
        updateRow(row);
      };
    },
    reset() {
      setDragging(false);
    },
  };
}

const NativeDragPreviewContext = createContext<NativeDragPreview | undefined>(undefined);
export function NativeDragPreviewProvider({
  bridge,
  children,
}: {
  bridge: NativeDragPreview;
  children: ReactNode;
}) {
  return (
    <NativeDragPreviewContext.Provider value={bridge}>{children}</NativeDragPreviewContext.Provider>
  );
}
export function useNativeDragPreviewBridge() {
  return useContext(NativeDragPreviewContext);
}
export function useNativeDragRowRef(kind: RowKind, editing: boolean): RefCallback<HTMLDivElement> {
  const bridge = useNativeDragPreviewBridge();
  const cleanup = useRef<(() => void) | undefined>(undefined);
  return useCallback(
    (row) => {
      cleanup.current?.();
      cleanup.current = row && bridge && editing ? bridge.register(row, kind) : undefined;
    },
    [bridge, kind, editing],
  );
}
