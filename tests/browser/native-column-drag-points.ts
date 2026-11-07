type Bounds = { x: number; y: number; width: number; height: number };

export function emptyRowPoint(bounds: Bounds) {
  // Adjacent Section hit areas overlap at their edges. The center belongs to
  // this empty row, unlike top + 10px (only 2px into its padded content box).
  return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
}

export function columnEdgePoints(
  bounds: Bounds,
  axis: string | null,
  direction: string,
  after: boolean,
) {
  const forward = axis === "y" || direction !== "rtl" ? 1 : -1;
  const sign = after ? forward : -forward;
  const edge =
    axis === "y"
      ? { x: bounds.x + bounds.width / 2, y: bounds.y + (after ? bounds.height - 2 : 2) }
      : { x: bounds.x + (sign > 0 ? bounds.width - 2 : 2), y: bounds.y + bounds.height / 2 };
  // Puck uses the last pointer direction for midpoint collision. Finish toward
  // the requested gap, never with a fixed positive x/y nudge that reverses RTL.
  const finish = {
    x: edge.x + (axis === "y" ? 0 : sign * 0.25),
    y: edge.y + (axis === "y" ? sign * 0.25 : 0),
  };
  return { edge, finish };
}
