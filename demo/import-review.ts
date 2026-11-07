import { fromMjml, toMjml } from "../src/core";

/** Never commit an import that the untrusted demo cannot export. */
export function reviewImport(source: string) {
  const result = fromMjml(source, { allowLocalImages: true });
  toMjml(result.document, { allowLocalImages: true });
  return result;
}

export function hasUnsavedChanges(value: unknown, initial: string): boolean {
  return JSON.stringify(value) !== initial;
}
