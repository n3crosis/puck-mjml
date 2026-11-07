import { createContext, useContext, useMemo, type CSSProperties, type ReactNode } from "react";
import { createUsePuck, renderContext, type Data } from "@puckeditor/core";
import type { EmailBlock } from "./types";
import type { NativeCanvasAttributes } from "./native-canvas-context";

const LayoutRootContext = createContext<Record<string, unknown> | undefined>(undefined);
const LayoutDataContext = createContext(new Map<string, EmailBlock>());
const usePuckData = createUsePuck();

function LayoutData({ data, children }: { data: Data; children: ReactNode }) {
  const blocks = useMemo(() => {
    const result = new Map<string, EmailBlock>();
    function visit(value: unknown) {
      if (!value || typeof value !== "object") return;
      if (Array.isArray(value)) {
        value.forEach(visit);
      } else {
        const block = value as EmailBlock;
        if (typeof block.type === "string" && typeof block.props?.id === "string") {
          result.set(block.props.id, block);
        }
        Object.values(value).forEach(visit);
      }
    }
    visit(data);
    return result;
  }, [data]);
  return (
    <LayoutRootContext.Provider value={data.root.props}>
      <LayoutDataContext.Provider value={blocks}>{children}</LayoutDataContext.Provider>
    </LayoutRootContext.Provider>
  );
}

function EditingLayoutData({ children }: { children: ReactNode }) {
  const data = usePuckData((state) => state.appState.data);
  return <LayoutData data={data}>{children}</LayoutData>;
}

/** Public Puck data APIs keep sibling order current during editing and undo/redo. */
export function NativeLayoutData({ editing, children }: { editing: boolean; children: ReactNode }) {
  const { data } = useContext(renderContext);
  return editing ? (
    <EditingLayoutData>{children}</EditingLayoutData>
  ) : (
    <LayoutData data={data}>{children}</LayoutData>
  );
}

export function useLayoutRootProps() {
  return useContext(LayoutRootContext);
}
export function useLayoutBlockProps(id: unknown) {
  const blocks = useContext(LayoutDataContext);
  return typeof id === "string" ? blocks.get(id)?.props : undefined;
}

export function useLayoutChildren(id: unknown, key: string): EmailBlock[] {
  const blocks = useContext(LayoutDataContext);
  const value = typeof id === "string" ? blocks.get(id)?.props[key] : undefined;
  return Array.isArray(value) ? (value as EmailBlock[]) : [];
}

export type NativeLayoutScope = {
  width: number;
  gutter?: string;
  direction?: string;
  grouped?: boolean;
  siblings?: { id: string; raw?: boolean }[];
};
export const NativeLayoutContext = createContext<NativeLayoutScope>({ width: 600 });

function horizontalPadding(a: NativeCanvasAttributes, side: "left" | "right") {
  const parts = (a.padding ?? "0").trim().split(/\s+/);
  const fallback = parts[side === "left" && parts.length === 4 ? 3 : 1] ?? parts[0];
  // MJML's layout arithmetic parses padding values as integers, including %.
  return Number.parseInt(a[`padding-${side}`] ?? fallback, 10) || 0;
}

function horizontalBorder(a: NativeCanvasAttributes, prefix = "border") {
  const side = (edge: string) =>
    Number.parseInt(a[`${prefix}-${edge}`] ?? a[prefix] ?? "0", 10) || 0;
  return side("left") + side("right");
}

export function layoutPaddingWidth(a: NativeCanvasAttributes, width: number): number {
  return Math.max(0, width - horizontalPadding(a, "left") - horizontalPadding(a, "right"));
}

export function layoutContentWidth(a: NativeCanvasAttributes, width: number): number {
  return Math.max(0, layoutPaddingWidth(a, Math.trunc(width)) - horizontalBorder(a));
}

export function layoutWidth(width: string | undefined, parent: number, fallback: number): number {
  if (!width) return fallback;
  return width.endsWith("%") ? (Number.parseFloat(width) * parent) / 100 : Number.parseFloat(width);
}

export function defaultLayoutWidth(scope: NativeLayoutScope): string {
  return `${100 / (scope.siblings?.filter((entry) => !entry.raw).length || 1)}%`;
}

export function columnContentWidth(a: NativeCanvasAttributes, scope: NativeLayoutScope): number {
  // The compiler sizes child components from the requested width, before gutters.
  const width = layoutWidth(a.width || defaultLayoutWidth(scope), scope.width, scope.width);
  return Math.max(
    0,
    layoutPaddingWidth(a, width) - horizontalBorder(a) - horizontalBorder(a, "inner-border"),
  );
}

/** Implicit columns in the simple renderer have no local attributes of their own. */
export function ImplicitColumnWidth({ count, children }: { count: number; children: ReactNode }) {
  const scope = useContext(NativeLayoutContext);
  return (
    <NativeLayoutContext.Provider value={{ width: scope.width / count }}>
      {children}
    </NativeLayoutContext.Provider>
  );
}

/** MJML 5 column gutters live outside the column's own box, in the width's unit. */
export function columnGutter(
  a: NativeCanvasAttributes,
  scope: NativeLayoutScope,
  id: string,
): { style: CSSProperties; grouped: boolean } | undefined {
  const siblings = scope.siblings ?? [];
  const index = siblings.findIndex((entry) => entry.id === id);
  if (scope.gutter === undefined || index < 0 || !scope.width) return undefined;
  const count = siblings.length;
  const nonRawCount = siblings.filter((entry) => !entry.raw).length || 1;
  const width = a.width || `${100 / nonRawCount}%`;
  const unit = width.endsWith("%") ? "%" : "px";
  const sourceGutter = Number.parseFloat(scope.gutter) || 0;
  const gutterPx = scope.gutter.endsWith("%") ? (sourceGutter * scope.width) / 100 : sourceGutter;
  const gutter = unit === "%" ? (gutterPx / scope.width) * 100 : gutterPx;
  const normalize = (value: number) => Number(value.toFixed(6));
  const reduced = Math.max(0, normalize(Number.parseFloat(width) - (gutter * (count - 1)) / count));
  const contentWidth =
    unit === "px"
      ? Math.floor(reduced) + (index < Math.round(count * (reduced - Math.floor(reduced))) ? 1 : 0)
      : reduced;
  const leading = unit === "px" ? Math.floor(Math.round(gutter) / 2) : gutter / 2;
  const trailing = unit === "px" ? Math.ceil(Math.round(gutter) / 2) : gutter / 2;
  const first = index === 0;
  const last = index === count - 1;
  const left = scope.direction === "rtl" ? (last ? 0 : trailing) : first ? 0 : leading;
  const right = scope.direction === "rtl" ? (first ? 0 : leading) : last ? 0 : trailing;
  const mobileHalf = normalize((gutterPx / scope.width) * 50);
  return {
    style: {
      // flex-basis includes the outside gutter because canvas items use border-box.
      flexBasis: `${normalize(contentWidth + left + right)}${unit}`,
      padding: `0 ${normalize(right)}${unit} 0 ${normalize(left)}${unit}`,
      "--pm-gutter-mobile-padding": `${first ? 0 : mobileHalf}% 0 ${last ? 0 : mobileHalf}% 0`,
    } as CSSProperties,
    grouped: Boolean(scope.grouped),
  };
}
