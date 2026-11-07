import { fromMjml, toMjml } from "../src/core";
import { createEmailConfig } from "../src/config";
import { sanitizeDocumentRichText } from "../src/normalize";
import type { EmailDocument } from "../src/types";

const rootDefaults = createEmailConfig().root!.defaultProps;

/** Never commit an import that the untrusted demo cannot export. */
export function reviewImport(source: string) {
  const result = fromMjml(source, { allowLocalImages: true });
  toMjml(result.document, { allowLocalImages: true });
  return result;
}

/** Compare the same defaults and rich-text shape that Puck stores in history. */
export function documentSnapshot(value: EmailDocument): string {
  const normalized = sanitizeDocumentRichText(value);
  return JSON.stringify(
    {
      ...normalized,
      root: {
        ...normalized.root,
        props: { ...rootDefaults, ...normalized.root.props },
      },
      zones: "zones" in normalized ? normalized.zones : {},
    },
    (_key, entry: unknown) =>
      entry && typeof entry === "object" && !Array.isArray(entry)
        ? Object.fromEntries(Object.entries(entry).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
        : entry,
  );
}

export function hasUnsavedChanges(value: EmailDocument, initial: string): boolean {
  return documentSnapshot(value) !== initial;
}
