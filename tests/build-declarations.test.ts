import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "vitest";

test("packed declarations rewrite module references without changing literal types", () => {
  const temporary = mkdtempSync(join(tmpdir(), "puck-declarations-"));
  try {
    const dist = join(temporary, "dist");
    mkdirSync(dist);
    writeFileSync(join(dist, "model.d.ts"), "export interface Model { value: string }\n");
    writeFileSync(
      join(dist, "index.d.ts"),
      `/** Unicode offsets: ✉️ 😀 */
import "./style.css";
import type { Model } from "./model";
export type { Model } from "./model";
export * from "./model";
export type Lazy = import("./model").Model;
import ModelModule = require("./model");
export type Literal = "./model";
export type External = import("react").ReactNode;
`,
    );
    execFileSync(process.execPath, [resolve("scripts/build-declarations.mjs")], { cwd: temporary });
    for (const [declaration, moduleExtension] of [
      ["ts", "js"],
      ["cts", "cjs"],
    ]) {
      const source = readFileSync(join(dist, `index.d.${declaration}`), "utf8");
      expect(source.match(new RegExp(`"\\./model\\.${moduleExtension}"`, "g"))).toHaveLength(5);
      expect(source).toContain('type Literal = "./model"');
      expect(source).toContain('import("react").ReactNode');
      expect(source).toContain("✉️ 😀");
      expect(source).not.toContain('import "./style.css"');
    }
    expect(readFileSync(join(dist, "style.d.cts"), "utf8")).toBe("export {};\n");
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
