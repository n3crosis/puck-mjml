/* eslint-disable no-control-regex -- Imported source must fit a quoted XML attribute. */
import * as cheerio from "cheerio";
import { readNativeAttributes } from "./native-attributes";
import type { ExportOptions, MjmlAttribute } from "./types";

/** Decode exactly the HTML attribute layer that MJML leaves for its output DOM. */
export function decodeImportedAttribute(value: string): string {
  if (!value.includes("&")) return value;
  return (
    cheerio
      .load(
        `<span data-value="${value.replaceAll('"', "&quot;")}"></span>`,
        {},
        false,
      )("span")
      .attr("data-value") ?? ""
  );
}

/** Keep lexical source advisory: every candidate is revalidated at serialization. */
export function captureImportedAttributeSource(entry: MjmlAttribute, source?: string): void {
  if (
    entry.value === undefined ||
    !source?.includes("&") ||
    source.length > 16384 ||
    entry.name === "ico-open" ||
    entry.name === "ico-close"
  )
    return;
  entry.importSource = { name: entry.name, value: entry.value, source };
}

export type NativeAttributeSource = Readonly<{ value: string; source: string }>;
export type NativeAttributeSources = Readonly<Record<string, NativeAttributeSource>>;

/** Parallel source edits, including clears, with exactly the native entry precedence.
 * Call only after the ordinary reader has validated the corresponding entries.
 */
export function readImportedAttributeSources(
  tag: string,
  entries: MjmlAttribute[] | undefined,
  options: ExportOptions = {},
): Record<string, NativeAttributeSource | null> {
  const result: Record<string, NativeAttributeSource | null> = Object.create(null);
  for (const entry of entries ?? []) {
    const name = entry.name.trim();
    if (!name) continue;
    const value = Object.hasOwn(entry, "value") ? entry.value : undefined;
    const inherit = Object.hasOwn(entry, "inherit") ? entry.inherit : undefined;
    const template = Object.hasOwn(entry, "template") ? entry.template : undefined;
    if (inherit === true) {
      result[name] = null;
      continue;
    }
    if (value === undefined) continue;
    result[name] = null;
    // Navbar symbols become text and already have their own one-layer decoder.
    if (template === true || name === "ico-open" || name === "ico-close") continue;
    const provenance = Object.hasOwn(entry, "importSource") ? entry.importSource : undefined;
    if (
      !provenance ||
      typeof provenance !== "object" ||
      provenance.name !== name ||
      provenance.value !== value ||
      typeof provenance.source !== "string" ||
      !provenance.source.includes("&") ||
      provenance.source.length > 16384 ||
      /["<>\u0000-\u001f\u007f-\u009f]/.test(provenance.source)
    )
      continue;
    const decoded = decodeImportedAttribute(provenance.source);
    if (decoded !== value) continue;
    try {
      // Recheck both interpretations. Metadata never grants template trust or
      // relaxes existing URL, CSS, descriptor, or control-character validation.
      const normalized = readNativeAttributes(tag, [{ name, value: decoded }], options)[name];
      if (normalized !== decoded) continue;
      readNativeAttributes(tag, [{ name, value: provenance.source }], options);
      result[name] = { value: decoded, source: provenance.source };
    } catch {
      // Forged, stale, and otherwise unusable metadata uses normal XML escaping.
    }
  }
  return result;
}
