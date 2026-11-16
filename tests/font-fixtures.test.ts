import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const directory = new URL("./browser/fixtures/fonts/", import.meta.url);
const manifest: {
  files: Record<string, string>;
} = JSON.parse(readFileSync(new URL("manifest.json", directory), "utf8"));

describe("original typography probe assets", () => {
  it("pins the generated WOFF fixtures", () => {
    expect(Object.keys(manifest.files)).toEqual([
      "ligature.woff",
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
});
