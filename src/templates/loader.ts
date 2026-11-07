import { fromMjml } from "../import";
import type { EmailDocument } from "../types";

/** Import a fresh editable tree from a checked-in, standalone MJML template. */
export function loadMjmlTemplate(source: string, file: string): EmailDocument {
  const { document, warnings } = fromMjml(source);
  if (warnings.length) {
    throw new Error(
      `Template ${file} could not be imported without changes: ${warnings.join(" ")}`,
    );
  }
  return document;
}
