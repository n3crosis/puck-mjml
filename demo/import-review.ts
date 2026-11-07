import { fromMjml, toMjml } from "../src/core";

/** Never commit an import that the untrusted demo cannot export. */
export function reviewImport(source: string) {
  const result = fromMjml(source);
  toMjml(result.document);
  return result;
}

export function hasUnsavedChanges(value: unknown, initial: string): boolean {
  return JSON.stringify(value) !== initial;
}
