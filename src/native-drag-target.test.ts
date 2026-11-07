import { describe, expect, it } from "vitest";
import { columnEdgePoints, emptyRowPoint } from "../tests/browser/native-column-drag-points";

describe("native column pointer targets", () => {
  const bounds = { x: 490, y: 161, width: 360, height: 124 };
  it.each([
    ["ltr", false, 492, -0.25],
    ["ltr", true, 848, 0.25],
    ["rtl", false, 848, 0.25],
    ["rtl", true, 492, -0.25],
  ] as const)("finishes %s after=%s toward the horizontal gap", (direction, after, x, delta) => {
    const { edge, finish } = columnEdgePoints(bounds, "x", direction, after);
    expect(edge).toEqual({ x, y: 223 });
    expect(finish).toEqual({ x: x + delta, y: 223 });
    // Both events remain outside a nested target's 6px contracted hit area.
    expect(Math.min(finish.x - bounds.x, bounds.x + bounds.width - finish.x)).toBeLessThan(6);
  });
  it.each(["ltr", "rtl"])("uses only vertical direction for stacked %s rows", (direction) => {
    expect(columnEdgePoints(bounds, "y", direction, false)).toEqual({
      edge: { x: 670, y: 163 },
      finish: { x: 670, y: 162.75 },
    });
    expect(columnEdgePoints(bounds, "y", direction, true)).toEqual({
      edge: { x: 670, y: 283 },
      finish: { x: 670, y: 283.25 },
    });
  });
  it("places the empty mobile target beyond the preceding row's overlapping hit area", () => {
    // Exact d805bbc trace geometry: 8px expansion, 100px empty content height,
    // preceding authored row ends at567.5; its contracted hit area ends569.5.
    const empty = { x: 587, y: 559.5, width: 406, height: 116 };
    const point = emptyRowPoint(empty);
    expect(point).toEqual({ x: 790, y: 617.5 });
    expect(point.y).toBeGreaterThan(569.5);
    expect(point.y).toBeGreaterThan(empty.y + 6);
    expect(point.y).toBeLessThan(empty.y + empty.height - 6);
  });
});
