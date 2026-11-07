import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createUsePuck, type Overrides } from "@puckeditor/core";

const usePuck = createUsePuck();
const sides = ["top", "right", "bottom", "left"] as const;
type Sides = [number, number, number, number];
type Band = {
  kind: "padding" | "margin";
  side: (typeof sides)[number];
  left: number;
  top: number;
  width: number;
  height: number;
};
type Spacing = { padding: Sides; margin: Sides; bands: Band[]; legend: CSSProperties };
type SpacingTarget = { element: HTMLElement; label: string };
type ComponentSpacing = {
  boxes: (Spacing & { label: string })[];
  legend: CSSProperties;
};

const scale = (size: number, offset: number) => (offset > 0 && size > 0 ? size / offset : 1);
const px = (value: string) =>
  /^-?(?:\d+\.?\d*|\.\d+)(?:px)?$/.test(value.trim()) ? Number.parseFloat(value) : 0;
const nonzero = (values: Sides) => values.some((value) => Math.abs(value) > 0.01);

/** Computed padding/margin normally resolve to px. Resolve remaining percentages
 * against the containing block's content width, as required by CSS box spacing. */
function spacingPixels(value: string, target: HTMLElement): number {
  if (!value.trim().endsWith("%")) return px(value);
  const view = target.ownerDocument.defaultView;
  if (!view) return 0;
  const position = view.getComputedStyle(target).position;
  const positioned = position === "absolute" || position === "fixed";
  const parent = (positioned ? target.offsetParent : target.parentElement) as HTMLElement | null;
  if (!parent && position === "fixed") return (view.innerWidth * Number.parseFloat(value)) / 100;
  if (!parent) return 0;
  const css = view.getComputedStyle(parent);
  const width = parent.clientWidth - (positioned ? 0 : px(css.paddingLeft) + px(css.paddingRight));
  return (Math.max(0, width) * Number.parseFloat(value)) / 100;
}

/** Convert screen rectangles and used box values into the overlay's local coordinates. */
export function measureSpacing(target: HTMLElement, host: HTMLElement): Spacing | null {
  const view = target.ownerDocument.defaultView;
  if (!view) return null;
  const rect = target.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  const hostRect = host.getBoundingClientRect();
  const hostScaleX = scale(hostRect.width, host.offsetWidth);
  const hostScaleY = scale(hostRect.height, host.offsetHeight);
  const scaleX = scale(rect.width, target.offsetWidth) / hostScaleX;
  const scaleY = scale(rect.height, target.offsetHeight) / hostScaleY;
  const css = view.getComputedStyle(target);
  const padding = sides.map((side) =>
    spacingPixels(css.getPropertyValue(`padding-${side}`), target),
  ) as Sides;
  const margin = sides.map((side) =>
    spacingPixels(css.getPropertyValue(`margin-${side}`), target),
  ) as Sides;
  if (!nonzero(padding) && !nonzero(margin)) return null;
  const border = sides.map((side) => px(css.getPropertyValue(`border-${side}-width`))) as Sides;
  const left = (rect.left - hostRect.left) / hostScaleX;
  const top = (rect.top - hostRect.top) / hostScaleY;
  const width = rect.width / hostScaleX;
  const height = rect.height / hostScaleY;
  const innerLeft = left + border[3] * scaleX;
  const innerTop = top + border[0] * scaleY;
  const innerWidth = Math.max(0, width - (border[1] + border[3]) * scaleX);
  const innerHeight = Math.max(0, height - (border[0] + border[2]) * scaleY);
  const pt = Math.min(Math.max(0, padding[0] * scaleY), innerHeight);
  const pb = Math.min(Math.max(0, padding[2] * scaleY), innerHeight - pt);
  const pl = Math.min(Math.max(0, padding[3] * scaleX), innerWidth);
  const pr = Math.min(Math.max(0, padding[1] * scaleX), innerWidth - pl);
  const mt = Math.max(0, margin[0] * scaleY);
  const mr = Math.max(0, margin[1] * scaleX);
  const mb = Math.max(0, margin[2] * scaleY);
  const ml = Math.max(0, margin[3] * scaleX);
  const bands: Band[] = [
    { kind: "padding", side: "top", left: innerLeft, top: innerTop, width: innerWidth, height: pt },
    {
      kind: "padding",
      side: "bottom",
      left: innerLeft,
      top: innerTop + innerHeight - pb,
      width: innerWidth,
      height: pb,
    },
    {
      kind: "padding",
      side: "left",
      left: innerLeft,
      top: innerTop + pt,
      width: pl,
      height: Math.max(0, innerHeight - pt - pb),
    },
    {
      kind: "padding",
      side: "right",
      left: innerLeft + innerWidth - pr,
      top: innerTop + pt,
      width: pr,
      height: Math.max(0, innerHeight - pt - pb),
    },
    {
      kind: "margin",
      side: "top",
      left: left - ml,
      top: top - mt,
      width: width + ml + mr,
      height: mt,
    },
    {
      kind: "margin",
      side: "bottom",
      left: left - ml,
      top: top + height,
      width: width + ml + mr,
      height: mb,
    },
    { kind: "margin", side: "left", left: left - ml, top, width: ml, height },
    { kind: "margin", side: "right", left: left + width, top, width: mr, height },
  ].filter((band) => band.width > 0.01 && band.height > 0.01) as Band[];
  return { padding, margin, bands, legend: { left: left + 2, top: top + height + mb + 4 } };
}

/** Layout implementations split one MJML component across several boxes. Follow
 * only their direct structural children, never another component's slot content. */
export function componentSpacingTargets(root: HTMLElement, componentType: string): SpacingTarget[] {
  const targets: SpacingTarget[] = [];
  const child = (element: HTMLElement, selector: string) =>
    [...element.children].find(
      (candidate) => candidate.matches(selector) && !candidate.hasAttribute("data-puck-component"),
    ) as HTMLElement | undefined;
  const add = (element: HTMLElement | undefined, label = "") => {
    if (element) targets.push({ element, label });
  };
  const column = (element: HTMLElement, label = "") => {
    const content = element.classList.contains("pm-native-gutter")
      ? child(element, ".pm-native-column-content")
      : element;
    if (content !== element) add(element, label ? `${label} gutter` : "Gutter");
    add(content, label);
    // Native columns put inner-* styles on this direct div. A simple column's
    // direct child is its slot, which must not be counted as owned inner spacing.
    const inner = content && child(content, "div:not([data-puck-dropzone])");
    if (inner && !inner.className) add(inner, label ? `${label} inner` : "Inner");
  };
  if (componentType === "Column") {
    column(root);
    return targets;
  }
  let content = root;
  if (
    ["Wrapper", "Section", "Section1", "Section2", "Section3"].includes(componentType) &&
    root.classList.contains("pm-native-full-width")
  ) {
    add(root, "Outer");
    content = child(root, ".pm-native-layout-content") ?? root;
    if (content !== root) add(content);
  } else {
    add(root);
  }
  if (componentType === "Hero") add(child(root, ".pm-hero-content"), "Inner");
  if (componentType === "Button") add(child(root, ".pm-button"), "Inner");
  if (["Section1", "Section2", "Section3"].includes(componentType)) {
    const row = child(content, ".pm-native-columns");
    const columns = row
      ? [...row.children].filter(
          (element) =>
            element.matches(".pm-native-column") && !element.hasAttribute("data-puck-component"),
        )
      : [];
    const labels =
      componentType === "Section1"
        ? ["Column"]
        : componentType === "Section2"
          ? ["Left column", "Right column"]
          : ["Left column", "Middle column", "Right column"];
    columns.forEach((element, index) => column(element as HTMLElement, labels[index]));
  }
  return targets;
}

export function measureComponentSpacing(
  root: HTMLElement,
  host: HTMLElement,
  componentType: string,
  actionBar?: HTMLElement,
): ComponentSpacing | null {
  const boxes = componentSpacingTargets(root, componentType).flatMap(({ element, label }) => {
    const spacing = measureSpacing(element, host);
    return spacing ? [{ ...spacing, label }] : [];
  });
  if (!boxes.length) return null;
  const rect = root.getBoundingClientRect();
  const hostRect = host.getBoundingClientRect();
  const hostScaleY = scale(hostRect.height, host.offsetHeight);
  let top = Math.max(
    (rect.bottom - hostRect.top) / hostScaleY + 4,
    ...boxes.map((box) => Number(box.legend.top)),
  );
  if (actionBar?.dataset.placement === "below") {
    const barRect = actionBar.getBoundingClientRect();
    const style = actionBar.ownerDocument.defaultView?.getComputedStyle(actionBar);
    if (
      barRect.width > 0 &&
      barRect.height > 0 &&
      style?.visibility !== "hidden" &&
      style?.display !== "none"
    ) {
      top = Math.max(top, (barRect.bottom + 4 - hostRect.top) / hostScaleY);
    }
  }
  return {
    boxes,
    // One legend avoids labels obscuring each other on nested box boundaries.
    legend: {
      left: (rect.left - hostRect.left) / scale(hostRect.width, host.offsetWidth) + 2,
      top,
    },
  };
}

const sideValues = (values: Sides) =>
  values
    .map((value, index) => `${sides[index][0].toUpperCase()} ${Math.round(value * 10) / 10}`)
    .join("  ");

export function SpacingOverlay({
  children,
  hover,
  isSelected,
  componentId,
  componentType,
}: Parameters<Overrides["componentOverlay"]>[0]) {
  const inline = usePuck((state) => state.config.components[componentType]?.inline === true);
  const editing = usePuck((state) => state.appState.ui.previewMode === "edit");
  const active = editing && (hover || isSelected);
  const data = usePuck((state) => (active ? state.appState.data : null));
  const marker = useRef<HTMLSpanElement>(null);
  const [spacing, setSpacing] = useState<ComponentSpacing | null>(null);
  useLayoutEffect(() => {
    const element = marker.current;
    const host = element?.parentElement;
    const view = element?.ownerDocument.defaultView;
    if (!active || !element || !host || !view) {
      setSpacing(null);
      return;
    }
    const scope = element.closest("[data-puck-preview]") ?? element.ownerDocument;
    const wrapper = [...scope.querySelectorAll<HTMLElement>("[data-puck-component]")].find(
      (candidate) => candidate.getAttribute("data-puck-component") === componentId,
    );
    // Non-inline renderers sit inside Puck's unstyled drag wrapper. Inline
    // renderers attach that ref directly to their own styled component root.
    const target = (inline ? wrapper : wrapper?.firstElementChild) as HTMLElement | undefined;
    if (!target) {
      setSpacing(null);
      return;
    }
    const overlay = host.closest("[data-puck-overlay]");
    const actionBar = isSelected
      ? [...(overlay?.querySelectorAll<HTMLElement>(".pm-selection-actions") ?? [])].find(
          (bar) => bar.closest("[data-puck-overlay]") === overlay,
        )
      : undefined;
    let frame: number | undefined;
    const measure = () => {
      frame = undefined;
      const next = measureComponentSpacing(target, host, componentType, actionBar);
      setSpacing((previous) =>
        JSON.stringify(previous) === JSON.stringify(next) ? previous : next,
      );
    };
    const schedule = () => {
      if (frame === undefined) frame = view.requestAnimationFrame(measure);
    };
    measure();
    // Puck can position its native overlay in the next animation frame.
    schedule();
    const resize = new view.ResizeObserver(schedule);
    for (const { element } of componentSpacingTargets(target, componentType))
      resize.observe(element);
    resize.observe(host);
    if (actionBar) resize.observe(actionBar);
    const mutations = new view.MutationObserver(schedule);
    mutations.observe(target, {
      attributes: true,
      childList: true,
      characterData: true,
      subtree: true,
    });
    if (actionBar)
      mutations.observe(actionBar, {
        attributes: true,
        attributeFilter: ["style", "class", "data-placement"],
      });
    // Transform changes (zoom) do not trigger ResizeObserver. Observe both paths:
    // the rendered component and its separate native overlay portal.
    const ancestors = new Set<Element>();
    for (const node of [target, host, actionBar]) {
      if (!node) continue;
      for (let parent = node.parentElement; parent; parent = parent.parentElement)
        ancestors.add(parent);
    }
    for (const ancestor of ancestors)
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
  }, [active, isSelected, componentId, componentType, inline, data]);

  return (
    <>
      {children}
      <span ref={marker} className="pm-spacing-marker" hidden aria-hidden="true" />
      {active && spacing && (
        <div className="pm-spacing-overlay" aria-hidden="true">
          {spacing.boxes.flatMap((box, index) =>
            box.bands.map(({ kind, side, ...style }) => (
              <div
                key={`${index}-${kind}-${side}`}
                className={`pm-spacing-band pm-spacing-band--${kind}`}
                data-spacing-side={side}
                data-spacing-box={box.label || "Component"}
                style={style}
              />
            )),
          )}
          <div className="pm-spacing-legend" style={spacing.legend}>
            {spacing.boxes.map((box, index) => (
              <div key={index} className="pm-spacing-box-labels">
                {nonzero(box.padding) && (
                  <span className="pm-spacing-label pm-spacing-label--padding">
                    {box.label ? `${box.label} padding` : "Padding"}{" "}
                    <b>{sideValues(box.padding)} px</b>
                  </span>
                )}
                {nonzero(box.margin) && (
                  <span className="pm-spacing-label pm-spacing-label--margin">
                    {box.label ? `${box.label} margin` : "Margin"}{" "}
                    <b>{sideValues(box.margin)} px</b>
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
