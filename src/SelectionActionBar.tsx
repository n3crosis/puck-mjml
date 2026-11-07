import { useLayoutEffect, useRef } from "react";
import { ActionBar, type Overrides } from "@puckeditor/core";

type Bounds = Pick<DOMRect, "left" | "right" | "top" | "bottom" | "width" | "height">;

/** Prefer space outside the selection; pin controls when neither side is visible. */
export function selectionActionPlacement(
  target: Bounds,
  tools: Pick<Bounds, "width" | "height">,
  viewportWidth: number,
  viewportHeight: number,
) {
  const gap = 8;
  const maxTop = Math.max(gap, viewportHeight - tools.height - gap);
  const aboveTop = target.top - tools.height - gap;
  const belowTop = target.bottom + gap;
  const above = aboveTop >= gap && aboveTop <= maxTop;
  const below = belowTop >= gap && belowTop <= maxTop;
  return {
    left: Math.max(gap, Math.min(target.right - tools.width, viewportWidth - tools.width - gap)),
    top: above ? aboveTop : below ? belowTop : Math.max(gap, Math.min(aboveTop, maxTop)),
    side: above ? "above" : below ? "below" : "pinned",
  } as const;
}

/** Retain Puck's actions and zoom handling while keeping controls visible. */
export function SelectionActionBar({
  label,
  parentAction,
  children,
}: Parameters<Overrides["actionBar"]>[0]) {
  const barRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const bar = barRef.current;
    const target = bar?.closest<HTMLElement>("[data-puck-overlay]");
    const view = bar?.ownerDocument.defaultView;
    if (!bar || !target || !view) return;
    const previousOffset = bar.style.translate.split(" ").map(parseFloat);
    let offset = { x: previousOffset[0] || 0, y: previousOffset[1] || 0 };
    let frame = 0;
    const position = () => {
      frame = 0;
      const targetBounds = target.getBoundingClientRect();
      if (!targetBounds.width) return;
      let bounds = bar.getBoundingClientRect();
      const scale = bar.offsetWidth > 0 ? bounds.width / bar.offsetWidth : 1;
      if (!scale) return;
      const width = Math.max(24, Math.min(targetBounds.width, view.innerWidth - 16)) / scale;
      const maxWidth = `${width}px`;
      if (bar.style.maxWidth !== maxWidth) bar.style.maxWidth = maxWidth;
      // A wrapped link form can be taller than a small preview. Keep every
      // control reachable without clipping ordinary tooltips on shorter bars.
      const height = Math.max(24, view.innerHeight - 16) / scale;
      bar.style.maxHeight = `${height}px`;
      bar.style.overflowY = bar.scrollHeight > height ? "auto" : "";
      bounds = bar.getBoundingClientRect();
      if (!bounds.height) return;
      const next = selectionActionPlacement(
        targetBounds,
        bounds,
        view.innerWidth,
        view.innerHeight,
      );
      // Puck already scales its action container to counter canvas zoom. Measure
      // in viewport pixels, then convert the displacement back to that space.
      offset = {
        x: offset.x + (next.left - bounds.left) / scale,
        y: offset.y + (next.top - bounds.top) / scale,
      };
      bar.style.translate = `${offset.x}px ${offset.y}px`;
      bar.dataset.placement = next.side;
    };
    const schedule = () => {
      if (!frame) frame = view.requestAnimationFrame(position);
    };
    position();
    const observer = new view.ResizeObserver(schedule);
    observer.observe(bar);
    observer.observe(target);
    const movements = new view.MutationObserver(schedule);
    movements.observe(target, { attributes: true, attributeFilter: ["style"] });
    if (bar.parentElement)
      movements.observe(bar.parentElement, { attributes: true, attributeFilter: ["style"] });
    bar.ownerDocument.addEventListener("scroll", schedule, true);
    view.addEventListener("resize", schedule);
    return () => {
      observer.disconnect();
      movements.disconnect();
      bar.ownerDocument.removeEventListener("scroll", schedule, true);
      view.removeEventListener("resize", schedule);
      if (frame) view.cancelAnimationFrame(frame);
    };
  }, []);
  return (
    <div ref={barRef} className="pm-selection-actions">
      <ActionBar>
        <ActionBar.Group>
          {parentAction}
          {label && <ActionBar.Label label={label} />}
        </ActionBar.Group>
        <ActionBar.Group>{children}</ActionBar.Group>
      </ActionBar>
    </div>
  );
}
