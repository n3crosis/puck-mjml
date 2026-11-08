import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { readFileSync, readdirSync } from "node:fs";
import type { TemplateManifest } from "../src/templates/manifest";

export interface ReferenceManifest {
  ref: string;
  templates: { file: string; html: string; sha256: string; bytes: number; sourceGitBlob: string }[];
}
export interface ContentManifest {
  ref: string;
  templates: {
    file: string;
    preview: string;
    content: string[];
    images: string[];
    links: string[];
  }[];
}

// Test commands run at the repository root; avoid browser-rewritten import.meta URLs.
const root = pathToFileURL(`${resolve(".")}/`);
export const referenceDirectory = new URL(".cache/react-email-reference/", root);
export const canonicalManifest: TemplateManifest = JSON.parse(
  readFileSync(new URL("templates/manifest.json", root), "utf8"),
);
export const referenceManifest: ReferenceManifest = JSON.parse(
  readFileSync(new URL("manifest.json", referenceDirectory), "utf8"),
);
export const contentManifest: ContentManifest = JSON.parse(
  readFileSync(new URL("src/templates/upstream-content.json", root), "utf8"),
);

/** No family allowlists: every canonical entry must have exactly one pinned oracle. */
export function inventoryProblems(
  canonical: TemplateManifest,
  references: ReferenceManifest,
  content: ContentManifest,
) {
  const problems: string[] = [];
  const files = canonical.templates.map(({ file }) => file);
  if (!files.length) problems.push("Empty canonical inventory");
  if (new Set(files).size !== files.length) problems.push("Duplicate canonical file");
  if (new Set(canonical.templates.map(({ id }) => id)).size !== files.length)
    problems.push("Duplicate canonical id");
  for (const [label, manifest] of [
    ["reference", references],
    ["content", content],
  ] as const) {
    if (manifest.ref !== canonical.ref) problems.push(`${label} revision differs`);
    const actual = manifest.templates.map(({ file }) => file);
    if (JSON.stringify([...actual].sort()) !== JSON.stringify([...files].sort()))
      problems.push(`${label} inventory differs`);
  }
  for (const entry of canonical.templates) {
    const reference = references.templates.find(({ file }) => file === entry.file);
    if (reference?.sourceGitBlob !== entry.upstreamBlob)
      problems.push(`${entry.file}: reference source blob differs`);
    if (reference?.html !== entry.file.replace(/\.mjml$/, ".html"))
      problems.push(`${entry.file}: reference HTML path differs`);
  }
  return problems;
}

const problems = inventoryProblems(canonicalManifest, referenceManifest, contentManifest);
if (problems.length) throw new Error(problems.join("\n"));

export const templateInventory = canonicalManifest.templates.map((entry) => ({
  ...entry,
  reference: referenceManifest.templates.find(({ file }) => file === entry.file)!,
  content: contentManifest.templates.find(({ file }) => file === entry.file)!,
}));
export type ReviewTemplate = (typeof templateInventory)[number];

export function templateSource(entry: Pick<ReviewTemplate, "file">) {
  return readFileSync(new URL(`templates/${entry.file}`, root), "utf8");
}

export function referenceHtml(entry: ReviewTemplate) {
  const bytes = readFileSync(new URL(entry.reference.html, referenceDirectory));
  if (
    bytes.byteLength !== entry.reference.bytes ||
    createHash("sha256").update(bytes).digest("hex") !== entry.reference.sha256
  )
    throw new Error(`${entry.file}: reference HTML does not match its pinned byte hash`);
  return bytes.toString("utf8");
}

export function inventoryFiles(directory: URL, extension: string) {
  return readdirSync(directory, { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith(extension))
    .map((file) => file.replaceAll("\\", "/"))
    .sort();
}
