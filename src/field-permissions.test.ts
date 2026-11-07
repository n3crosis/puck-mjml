import { describe, expect, it } from "vitest";
import { isReadOnlyPath } from "./field-permissions";

describe("nested field permissions", () => {
  it.each(["bodyRows[0].cells[1].padding", "bodyRows.0.cells.1.padding"])(
    "matches mixed exact and wildcard notation for %s",
    (path) => {
      expect(isReadOnlyPath(path, { "bodyRows[*].cells.1.padding": true })).toBe(true);
      expect(isReadOnlyPath(path, { "bodyRows.*.cells[1].padding": true })).toBe(true);
      expect(isReadOnlyPath(path, { "bodyRows[0].cells[2].padding": true })).toBe(false);
      expect(isReadOnlyPath(path, { "bodyRows[*].cells[*].color": true })).toBe(false);
    },
  );
  it("keeps parent locks while allowing specific same-depth exceptions in either order", () => {
    const rules = { "bodyRows[*].cells[*].padding": true, "bodyRows[0].cells[1].padding": false };
    expect(isReadOnlyPath("bodyRows[0].cells[1].padding", rules)).toBe(false);
    expect(
      isReadOnlyPath(
        "bodyRows[0].cells[1].padding",
        Object.fromEntries(Object.entries(rules).reverse()),
      ),
    ).toBe(false);
    expect(isReadOnlyPath("bodyRows[0].cells[0].padding", rules)).toBe(true);
    expect(isReadOnlyPath("bodyRows[0].cells[1].padding", { ...rules, bodyRows: true })).toBe(true);
  });
  it("never treats a wildcard as a property-name match or a prefix as a field match", () => {
    expect(isReadOnlyPath("bodyRows.text.padding", { "bodyRows.*.padding": true })).toBe(false);
    expect(isReadOnlyPath("bodyRowsOther[0].padding", { bodyRows: true })).toBe(false);
  });
  it("keeps a lock for conflicting equivalent rules and ignores undefined values", () => {
    expect(
      isReadOnlyPath("bodyRows[0].cells[1].padding", {
        "bodyRows[0].cells[1].padding": true,
        "bodyRows.0.cells.1.padding": false,
      }),
    ).toBe(true);
    expect(
      isReadOnlyPath("bodyRows[0].cells[1].padding", {
        "bodyRows[*].cells[*].padding": true,
        "bodyRows[0].cells[1].padding": undefined,
      }),
    ).toBe(true);
  });
});
