import {
  createContext,
  useCallback,
  useContext,
  useRef,
  type ReactNode,
  type RefCallback,
} from "react";

export type NativeDragPreview = ReturnType<typeof createNativeDragPreview>;
type RowKind = "section" | "group";

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
  function updateRow(row: HTMLElement, axis?: "x" | "y") {
    if (!axis) {
      row.removeAttribute("data-pm-native-dragging");
      row.removeAttribute("data-pm-native-drag-axis");
      return;
    }
    row.setAttribute("data-pm-native-drag-axis", axis);
    row.setAttribute("data-pm-native-dragging", "true");
  }
  function setDragging(value: boolean) {
    if (dragging === value) return;
    dragging = value;
    // Snapshot all native inline geometry before any row switches to flex.
    const axes = [...rows].map(
      ([row, kind]) => [row, dragging ? classifyRow(row, kind) : undefined] as const,
    );
    for (const [row, axis] of axes) updateRow(row, axis);
  }
  return {
    onAction(_action: unknown, state: { ui: { isDragging: boolean } }) {
      setDragging(state.ui.isDragging);
    },
    register(row: HTMLElement, kind: RowKind) {
      rows.set(row, kind);
      updateRow(row, dragging ? classifyRow(row, kind) : undefined);
      return () => {
        rows.delete(row);
        row.removeAttribute("data-pm-native-dragging");
        row.removeAttribute("data-pm-native-drag-axis");
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
