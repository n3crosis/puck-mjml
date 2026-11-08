import { describe, expect, it } from "vitest";
import {
  canonicalManifest,
  contentManifest,
  referenceManifest,
  referenceDirectory,
  templateInventory,
  inventoryProblems,
  inventoryFiles,
  referenceHtml,
} from "./template-inventory";

describe("manifest-driven review inventory", () => {
  it("covers every canonical source and pinned HTML file, without hand-maintained cases", () => {
    expect(inventoryFiles(new URL("../templates/", import.meta.url), ".mjml")).toEqual(
      templateInventory.map(({ file }) => file).sort(),
    );
    expect(inventoryFiles(referenceDirectory, ".html")).toEqual(
      templateInventory.map(({ reference }) => reference.html).sort(),
    );
    for (const entry of templateInventory) expect(referenceHtml(entry)).toContain("<body");
  });
  it("rejects missing, extra and duplicate references instead of filtering the inventory", () => {
    for (const templates of [
      referenceManifest.templates.slice(1),
      [...referenceManifest.templates, referenceManifest.templates[0]],
    ]) {
      expect(
        inventoryProblems(canonicalManifest, { ...referenceManifest, templates }, contentManifest),
      ).toContain("reference inventory differs");
    }
  });
  it("rejects stale revisions and source blobs", () => {
    expect(
      inventoryProblems(canonicalManifest, { ...referenceManifest, ref: "other" }, contentManifest),
    ).toContain("reference revision differs");
    const changed = structuredClone(referenceManifest);
    changed.templates[0].sourceGitBlob = "other";
    expect(inventoryProblems(canonicalManifest, changed, contentManifest)).toContain(
      `${changed.templates[0].file}: reference source blob differs`,
    );
  });
  it("rejects original HTML byte/hash tampering", () => {
    const entry = structuredClone(templateInventory[0]);
    entry.reference.sha256 = "other";
    expect(() => referenceHtml(entry)).toThrow(/pinned byte hash/);
    entry.reference = { ...templateInventory[0].reference, bytes: 0 };
    expect(() => referenceHtml(entry)).toThrow(/pinned byte hash/);
  });
});
