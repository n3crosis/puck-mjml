import { describe, expect, it } from "vitest";
import { compareGeometry, tolerance } from "../tests/browser/native-column-geometry";

const required = ["editable-solo", "editable-group", "editable-inner", "editable-copy"];
const valid = () => ({
  bounds: Object.fromEntries(
    ["row", ...required.slice(0, 3), "editable-copy:text"].map((name) => [
      name,
      [{ x: 0, y: 0, width: 600, height: 20 }],
    ]),
  ),
  probeCounts: Object.fromEntries(required.map((name) => [name, 1])),
});

describe("editable native column geometry oracle", () => {
  it("accepts complete valid snapshots", () => {
    expect(compareGeometry(valid(), valid(), required)).toEqual([]);
  });

  it("rejects required probes missing from both snapshots even when their bounds agree", () => {
    const missing = { bounds: { row: [{ x: 0, y: 0, width: 600, height: 0 }] }, probeCounts: {} };
    const failures = compareGeometry(missing, missing, required);
    for (const label of ["canvas", "compiled"])
      for (const name of required)
        expect(failures).toContain(`${label} ${name}: expected one probe, found 0`);
  });

  it.each(["canvas", "compiled"])("rejects a missing probe on the %s side", (label) => {
    const actual = valid(),
      expected = valid();
    delete (label === "canvas" ? actual : expected).probeCounts["editable-solo"];
    expect(compareGeometry(actual, expected, required)).toContain(
      `${label} editable-solo: expected one probe, found 0`,
    );
  });

  it.each(["canvas", "compiled"])(
    "rejects duplicate probes on the %s side even if bounds were overwritten",
    (label) => {
      const actual = valid(),
        expected = valid();
      (label === "canvas" ? actual : expected).probeCounts["editable-inner"] = 2;
      expect(compareGeometry(actual, expected, required)).toContain(
        `${label} editable-inner: expected one probe, found 2`,
      );
    },
  );

  it.each(["canvas", "compiled"])("rejects missing visible copy lines on the %s side", (label) => {
    const actual = valid(),
      expected = valid();
    (label === "canvas" ? actual : expected).bounds["editable-copy:text"] = [];
    expect(compareGeometry(actual, expected, required)).toContain(
      `${label} editable-copy: no visible text lines`,
    );
  });

  it("retains the exact 1/64px tolerance", () => {
    const actual = valid(),
      expected = valid();
    actual.bounds["editable-solo"][0].height += tolerance;
    expect(compareGeometry(actual, expected, required)).toEqual([]);
    actual.bounds["editable-solo"][0].height += tolerance;
    expect(compareGeometry(actual, expected, required)).toEqual([
      "editable-solo[0].height: canvas=20.03125, compiled=20, delta=0.03125",
    ]);
  });
});
