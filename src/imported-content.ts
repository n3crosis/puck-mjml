import { sanitizeEmailRichText } from "./richtext";
import { encodeEndingWhitespace } from "./ending-content";

const hasBlock = /<(?:p|h[1-6]|ul|ol|li|blockquote|pre|hr)\b/i;
function syntheticParagraph(source: string, edited: string): RegExpExecArray | undefined {
  if (hasBlock.test(source)) return undefined;
  const paragraph = /^<p(?: style="([^"]*)")?>([\s\S]*)<\/p>$/.exec(edited);
  return paragraph && !/<\/?p\b/i.test(paragraph[2]) ? paragraph : undefined;
}

/** A synthetic wrapper is structural, not a difference in sanitizer formatting. */
export function hasImportedRichTextWrapper(props: Record<string, unknown>): boolean {
  const value = props.importedRichText;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const original = value as Record<string, unknown>;
  if (
    typeof original.source !== "string" ||
    typeof original.baseline !== "string" ||
    typeof props.content !== "string"
  )
    return false;
  return Boolean(
    syntheticParagraph(
      sanitizeEmailRichText(original.source),
      sanitizeEmailRichText(props.content),
    ),
  );
}

/** Keep native text styles through edits, without changing document history. */
export function importedRichText(props: Record<string, unknown>): string | undefined {
  const value = props.importedRichText;
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const original = value as Record<string, unknown>;
  if (
    typeof original.source !== "string" ||
    typeof original.baseline !== "string" ||
    typeof props.content !== "string"
  )
    return undefined;
  // Persisted provenance is untrusted data too. Always pass it through the same
  // rich-text sanitizer as edited content; this is never a trusted HTML route.
  const source = sanitizeEmailRichText(original.source);
  if (props.content === original.baseline) return encodeEndingWhitespace(source);
  let edited = sanitizeEmailRichText(props.content);
  // Puck needs a paragraph around loose source text. Keep that one synthetic
  // wrapper out of exported native markup; real new paragraphs stay intact.
  const paragraph = syntheticParagraph(source, edited);
  if (paragraph) {
    // Keep a toolbar-applied paragraph alignment without adding new margins.
    // The only incoming style here is the sanitizer's text-align allowlist.
    edited = paragraph[1]
      ? `<p style="${paragraph[1]};margin:0">${paragraph[2]}</p>`
      : paragraph[2];
  }
  return encodeEndingWhitespace(edited);
}
