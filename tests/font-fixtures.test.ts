import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const directory = new URL("./browser/fixtures/fonts/", import.meta.url);
const manifest: {
  generator: string;
  variableAdvanceUnits: Record<string, number>;
  files: Record<string, string>;
} = JSON.parse(readFileSync(new URL("manifest.json", directory), "utf8"));

describe("original typography probe assets", () => {
  it("records reproducible generated WOFF binaries and a source generator", () => {
    expect(readFileSync(manifest.generator, "utf8")).toContain("pen.lineTo((advance - 50, 700))");
    expect(Object.keys(manifest.files)).toEqual([
      "other-400.woff",
      "static-400.woff",
      "static-600.woff",
      "variable.woff",
    ]);
    for (const [name, hash] of Object.entries(manifest.files)) {
      const bytes = readFileSync(new URL(name, directory));
      expect(bytes.subarray(0, 4).toString()).toBe("wOFF");
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(hash);
    }
  });

  it("keeps intermediate-weight advances on integer pixels at the browser fixture size", () => {
    expect(manifest.variableAdvanceUnits).toEqual({ "420": 2100, "450": 2250 });
    for (const advance of Object.values(manifest.variableAdvanceUnits)) {
      expect(((advance * 20) / 1000) % 1).toBe(0);
    }
  });

  it("uses real variable-font axis and advance variation tables for intermediate weights", () => {
    const bytes = readFileSync(new URL("variable.woff", directory));
    const tags = Array.from({ length: bytes.readUInt16BE(12) }, (_, index) =>
      bytes.subarray(44 + index * 20, 48 + index * 20).toString(),
    );
    expect(tags).toContain("fvar");
    expect(tags).toContain("gvar");
    expect(tags).toContain("HVAR");
  });
});
