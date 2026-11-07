import { sanitizeEmailTableContent } from "./richtext";
import { renderTableContent } from "./table";

/** Preserve native cell omissions and markup until a table-content edit. */
export function importedTableContent(props: Record<string, unknown>): string | undefined {
  const value = props.importedTableContent;
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const original = value as Record<string, unknown>;
  if (typeof original.source !== "string" || typeof original.baseline !== "string")
    return undefined;
  const current = renderTableContent(props);
  if (current !== original.baseline) return current;
  // Provenance can be supplied by any host or persisted document. Revalidate
  // safe table structure and rich text instead of granting it trusted HTML.
  return sanitizeEmailTableContent(original.source);
}
