import { nativeCatalog } from "./native-attributes";
import { mjmlClosingTag } from "./native-ending-tags";
import type { ExportOptions } from "./types";

/** MJML trims ending-tag source before entity decoding. Preserve decoded edge spaces. */
export function encodeEndingWhitespace(value: string): string {
  // Bound each edge directly. A trailing /\s+$/ search can revisit every
  // character in a long interior whitespace run before it reaches the edge.
  const start = value.length - value.trimStart().length;
  const end = Math.max(start, value.trimEnd().length);
  const encode = (space: string) =>
    Array.from(space, (character) => `&#${character.codePointAt(0)};`).join("");
  return encode(value.slice(0, start)) + value.slice(start, end) + encode(value.slice(end));
}

/** Pass trusted HTML through a native ending tag without applying rich-text rules. */
export function trustedEndingContent(tag: string, value: unknown, options: ExportOptions): string {
  if (options.allowRawHtml !== true) throw new Error("Trusted HTML requires allowRawHtml: true");
  if (!Object.hasOwn(nativeCatalog, tag) || !nativeCatalog[tag].endingTag) {
    throw new Error(`Trusted HTML requires a registered MJML ending tag: ${tag}`);
  }
  if (typeof value !== "string") throw new Error(`Trusted HTML for ${tag} must be text`);
  if (
    mjmlClosingTag.test(value) ||
    Array.from(value).some(
      (character) => character.charCodeAt(0) === 0 || character.charCodeAt(0) === 127,
    )
  ) {
    throw new Error(
      `Trusted HTML for ${tag} contains an invalid MJML closing tag or control character`,
    );
  }
  return value;
}
