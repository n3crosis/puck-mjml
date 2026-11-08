import { load } from "cheerio";
import type { AnyNode, Text } from "domhandler";
import postcss from "postcss";
import { sanitizeEmailRichText } from "./richtext";

const unresolvedStyles =
  /@import\b|<(?:link|mj-include)\b|\\(?:[\da-f]{1,6}|[-\w])|\bwhitespace-(?:pre|break-spaces|\[)/i;
const whitespaceSyntax = /\b(?:white-space-|(?:white-space|text-space-collapse|all)\s*[:=])/i;

function withoutCssComments(value: string): string {
  // Do not repeatedly scan unclosed comment suffixes with a global lazy regex.
  const pieces: string[] = [];
  let cursor = 0;
  let start = value.indexOf("/*");
  if (start < 0) return value;
  while (start >= 0) {
    const end = value.indexOf("*/", start + 2);
    if (end < 0) break;
    pieces.push(value.slice(cursor, start), " ");
    cursor = end + 2;
    start = value.indexOf("/*", cursor);
  }
  pieces.push(value.slice(cursor));
  return pieces.join("");
}

function mentionsWhitespace(value: string): boolean {
  return whitespaceSyntax.test(value) || whitespaceSyntax.test(withoutCssComments(value));
}

function hasUnresolvedWhitespaceCss(css: string): boolean {
  if (unresolvedStyles.test(css) || css.includes("\\")) return true;
  try {
    let unresolved = false;
    postcss.parse(css).walk((node) => {
      if (node.type === "decl") {
        if (node.prop.toLowerCase() === "white-space") {
          // Both values collapse source indentation. Inspect lexical values as
          // well: PostCSS accepts malformed importance such as !important important.
          const value = node.raws.value?.raw ?? node.value;
          const important = node.important ? (node.raws.important ?? " !important") : "";
          if (
            !/^[\t\n\f\r ]*(?:normal|nowrap)[\t\n\f\r ]*(?:![\t\n\f\r ]*important[\t\n\f\r ]*)?$/i.test(
              withoutCssComments(value + important),
            )
          )
            unresolved = true;
        } else if (mentionsWhitespace(`${node.prop}:`)) {
          unresolved = true;
        }
        if (mentionsWhitespace(node.value)) unresolved = true;
      } else if (
        (node.type === "atrule" && mentionsWhitespace(node.params)) ||
        (node.type === "rule" && mentionsWhitespace(node.selector))
      ) {
        unresolved = true;
      }
    });
    return unresolved;
  } catch {
    // Malformed CSS cannot establish that a whitespace declaration is safe.
    return mentionsWhitespace(css);
  }
}

/**
 * A CSS cascade cannot safely be inferred while importing an email. Only known
 * collapsing declarations are safe; any other relevant rule opts everything
 * out, even when a later, more specific, or !important rule might override it.
 */
export function hasSourceWhitespaceStyles(source: string): boolean {
  if (unresolvedStyles.test(source)) return true;
  // Inspect CSS in its own grammar, including decoded HTML style attributes.
  // This throwaway tree never replaces the retained MJML/HTML export source.
  const $ = load(source, { xml: { xmlMode: false } }, false);
  const pending = $.root().contents().toArray();
  while (pending.length) {
    const node = pending.pop()!;
    if (node.type === "text" || node.type === "comment") {
      if (mentionsWhitespace(node.data) || unresolvedStyles.test(node.data)) return true;
    } else if (node.type === "tag" || node.type === "style" || node.type === "script") {
      for (const [name, value] of Object.entries(node.attribs)) {
        if (name === "style") {
          if (hasUnresolvedWhitespaceCss(value)) return true;
        } else if (mentionsWhitespace(`${name}=${value}`) || unresolvedStyles.test(value)) {
          return true;
        }
      }
      if (node.name === "style" || node.name === "mj-style") {
        if (hasUnresolvedWhitespaceCss($(node).html() ?? "")) return true;
      } else {
        for (const child of node.children) pending.push(child);
      }
    }
  }
  return false;
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
 * The caller opts the document out for unresolved whitespace CSS, rather than
 * guessing which selectors, inherited rules, or external stylesheets apply.
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
