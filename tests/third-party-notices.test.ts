import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectPackageNotices, sha256 } from "../scripts/third-party-notices";

const roots: string[] = [];
function fixture(overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), "puck-license-test-"));
  roots.push(root);
  mkdirSync(join(root, "docs/third-party"), { recursive: true });
  writeFileSync(join(root, "docs/third-party/license-overrides.json"), JSON.stringify(overrides));
  return root;
}
function dependency(
  root: string,
  path: string,
  name: string,
  version = "1.0.0",
  license: string | null = "MIT example license\n",
) {
  const directory = join(root, "node_modules", path);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, "package.json"), JSON.stringify({ name, version, license: "MIT" }));
  writeFileSync(
    join(directory, "index.js"),
    "/*! Copyright Example. MIT license. */\nexport const x = 1;",
  );
  if (license !== null) writeFileSync(join(directory, "LICENSE"), license);
  return join(directory, "index.js");
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("distribution license collection", () => {
  it("uses actual modules, deduplicates wrappers, preserves exact text and inline notices", () => {
    const root = fixture();
    const file = dependency(root, "example", "example");
    dependency(root, "unused", "unused");
    const { packages } = collectPackageNotices([file, `\0${file}?commonjs-proxy`, file], root);
    expect(packages).toHaveLength(1);
    expect(packages[0].modules).toEqual(["index.js"]);
    expect(packages[0].licenseFiles[0].text).toBe("MIT example license\n");
    expect(packages[0].licenseFiles[0].sha256).toBe(sha256("MIT example license\n"));
    expect(packages[0].inlineNotices).toHaveLength(1);
  });
  it("keeps nested versions separately and sorts independent of input order", () => {
    const root = fixture();
    const a = dependency(root, "example", "example");
    const b = dependency(root, "parent/node_modules/example", "example", "2.0.0");
    expect(collectPackageNotices([a, b], root).packages).toEqual(
      collectPackageNotices([b, a], root).packages,
    );
    expect(collectPackageNotices([a, b], root).packages.map((entry) => entry.version)).toEqual([
      "1.0.0",
      "2.0.0",
    ]);
  });
  it("includes CSS-only packages and package metadata", () => {
    const root = fixture();
    const file = dependency(root, "example", "example");
    const css = file.replace("index.js", "style.css");
    writeFileSync(css, "/* copyright CSS author */\na { color: red; }");
    const entry = collectPackageNotices([css, file.replace("index.js", "package.json")], root)
      .packages[0];
    expect(entry.modules).toEqual(["package.json", "style.css"]);
    expect(entry.inlineNotices[0].text).toContain("CSS author");
  });
  it("fails closed when a bundled dependency lacks verified license text", () => {
    const root = fixture();
    const file = dependency(root, "example", "example", "1.0.0", null);
    expect(() => collectPackageNotices([file], root)).toThrow("Missing license text");
  });
  it("accepts only a version-specific source-verified fallback with a valid hash", () => {
    const text = "Verified upstream license\n";
    const root = fixture({
      "example@1.0.0": {
        source: "https://example.org/license",
        reason: "Archive omitted text",
        files: [{ path: "LICENSE", text, sha256: sha256(text) }],
      },
    });
    const file = dependency(root, "example", "example", "1.0.0", null);
    expect(collectPackageNotices([file], root).packages[0].licenseSource).toBe(
      "https://example.org/license",
    );
    const newer = dependency(root, "newer/node_modules/example", "example", "2.0.0", null);
    expect(() => collectPackageNotices([newer], root)).toThrow("Missing license text");
  });
  it("rejects modified fallback text rather than silently replacing its attribution", () => {
    const root = fixture({
      "example@1.0.0": {
        source: "https://example.org/license",
        reason: "Archive omitted text",
        files: [{ path: "LICENSE", text: "changed", sha256: sha256("original") }],
      },
    });
    const file = dependency(root, "example", "example", "1.0.0", null);
    expect(() => collectPackageNotices([file], root)).toThrow("Invalid license text/hash");
  });
});
