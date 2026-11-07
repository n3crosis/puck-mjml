import { load } from "cheerio";
import type { AnyNode, Text } from "domhandler";
import { sanitizeEmailRichText } from "./richtext";

/** A CSS cascade cannot safely be inferred while importing an email. */
export function hasSourceWhitespaceStyles(source: string): boolean {
  return (
    /\b(?:white-space(?:-collapse|-trim)?|text-space-collapse|all)\s*[:=]/i.test(source) ||
    /@import\b|<link\b|\\(?:[\da-f]{1,6}|[-\w])/i.test(source) ||
    /\bwhitespace-(?:pre|break-spaces|\[)/i.test(source)
  );
}

const blockTags = new Set([
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "li",
  "blockquote",
  "pre",
  "hr",
  "br",
]);

/**
 * Import ordinary HTML text using its rendered whitespace, before Puck's
 * pre-wrap editor sees it. Never run this on edits or the retained export source.
 * Explicit whitespace CSS opts the entire document out, rather than guessing
 * which selectors, inherited rules, or external stylesheets apply.
 */
export function normalizeImportedWhitespace(html: string): string {
  // htmlparser2 keeps the first LF inside <pre>; parse5 consumes it while
  // parsing, which would make a second parse in the editor drop another LF.
  const $ = load(html, { xml: { xmlMode: false } }, false);
  let previous: Text | undefined;
  let atStart = true;
  let changed = false;
  const replace = (node: Text, value: string) => {
    if (node.data !== value) changed = true;
    node.data = value;
  };
  const boundary = () => {
    if (previous) replace(previous, previous.data.replace(/ $/, ""));
    previous = undefined;
    atStart = true;
  };
  const visit = (node: AnyNode) => {
    if (node.type === "text") {
      // HTML collapses ASCII whitespace only. NBSP and other Unicode spaces
      // have their own meaning and must not be folded into ordinary spaces.
      let value = node.data.replace(/[\t\n\f\r ]+/g, " ");
      if (atStart || previous?.data.endsWith(" ")) value = value.replace(/^ /, "");
      replace(node, value);
      if (value) {
        previous = node;
        atStart = false;
      }
      return;
    }
    if (node.type !== "tag") return;
    const block = blockTags.has(node.name);
    if (block) boundary();
    if (node.name === "pre" || node.name === "code") {
      // Code may deliberately contain newlines, tabs, and consecutive spaces.
      // Treat it as opaque, including inline code nested among ordinary text.
      previous = undefined;
      atStart = false;
    } else {
      node.children.forEach(visit);
    }
    if (block) boundary();
  };
  $.root().contents().toArray().forEach(visit);
  boundary();
  return changed ? sanitizeEmailRichText($.html()) : html;
}
