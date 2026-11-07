import { nativeCatalog } from "./native-attributes";
import type { ExportOptions } from "./types";

/** MJML trims ending-tag source before entity decoding. Preserve decoded edge spaces. */
export function encodeEndingWhitespace(value: string): string {
  return value.replace(/^\s+|\s+$/g, (space) =>
    Array.from(space, (character) => `&#${character.codePointAt(0)};`).join(""),
  );
}

// The native parser also implicitly closes an ending tag when it sees an
// ancestor's closing tag. Prevent content from changing the surrounding MJML tree.
const closingMjmlTag = new RegExp(
  `<\\s*\\/\\s*(?:${[...new Set(["mjml", "mj-head", "mj-body", ...Object.keys(nativeCatalog)])].join("|")})(?=[\\s/>])`,
  "i",
);

/** Pass trusted HTML through a native ending tag without applying rich-text rules. */
export function trustedEndingContent(tag: string, value: unknown, options: ExportOptions): string {
  if (options.allowRawHtml !== true) throw new Error("Trusted HTML requires allowRawHtml: true");
  if (!Object.hasOwn(nativeCatalog, tag) || !nativeCatalog[tag].endingTag) {
    throw new Error(`Trusted HTML requires a registered MJML ending tag: ${tag}`);
  }
  if (typeof value !== "string") throw new Error(`Trusted HTML for ${tag} must be text`);
  if (
    closingMjmlTag.test(value) ||
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
