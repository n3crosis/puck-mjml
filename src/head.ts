/* eslint-disable no-control-regex -- These validators explicitly reject unsafe control characters. */
import { normalizeEmailBreakpoint } from "./layout";
import { readNativeAttributes } from "./native-attributes";
import { encodeEndingWhitespace, trustedEndingContent } from "./ending-content";
import type { EmailSettings, ExportOptions } from "./types";

const xmlEscapes: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};
const escapeXml = (value: string) =>
  value.replace(/[&<>"']/g, (character) => xmlEscapes[character]);

function records(value: unknown, label: string): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item))
      throw new Error(`${label} contains an invalid item`);
    return item as Record<string, unknown>;
  });
}

function nativeValue(tag: string, name: string, value: string): string {
  return readNativeAttributes(tag, [{ name, value }])[name] as string;
}

/** Native widths override the bounded numeric setting without introducing another clamp. */
export function resolveBreakpointWidth(
  settings: Pick<EmailSettings, "breakpoint" | "breakpointWidth">,
): string | undefined {
  if (settings.breakpointWidth !== undefined) {
    if (typeof settings.breakpointWidth !== "string")
      throw new Error("Native breakpoint width must be text");
    return nativeValue("mj-breakpoint", "width", settings.breakpointWidth);
  }
  return settings.breakpoint === undefined
    ? undefined
    : `${normalizeEmailBreakpoint(settings.breakpoint)}px`;
}

/** Serialize CSS syntax without entity references, which MJML does not decode in selectors. */
export function selectorAttribute(selector: string): string {
  const cssEscape = (character: string) => `\\${character.codePointAt(0)!.toString(16)} `;
  let result = "";
  let quote = "";
  let comment = false;
  for (let index = 0; index < selector.length; index += 1) {
    const character = selector[index];
    const next = selector[index + 1];
    if (comment) {
      if (character === "*" && next === "/") {
        result += "*/";
        index += 1;
        comment = false;
      } else {
        result += /["&<]/.test(character) ? cssEscape(character) : character;
      }
    } else if (character === "\\" && next) {
      result += /["&<]/.test(next) ? cssEscape(next) : character + next;
      index += 1;
    } else if (quote) {
      if (character === quote) {
        result += "'";
        quote = "";
      } else {
        result += /["'&<]/.test(character) ? cssEscape(character) : character;
      }
    } else if (character === "'" || character === '"') {
      quote = character;
      result += "'";
    } else if (character === "/" && next === "*") {
      result += "/*";
      index += 1;
      comment = true;
    } else {
      result += /[&<]/.test(character) ? cssEscape(character) : character;
    }
  }
  if (quote || comment)
    throw new Error("Generated HTML selector contains an unclosed string or comment");
  return ` path="${result}"`;
}

// Attribute names are serialized into MJML as values, then become XML attribute
// names in MJML's output DOM. Permit Unicode names and namespace prefixes, but
// never let an attribute name change the surrounding markup.
const htmlName = /^[\p{L}_:][\p{L}\p{N}\p{M}_.:\-\u00b7\u203f-\u2040]*$/u;
const activeAttributes = new Set(["srcdoc", "http-equiv", "is"]);
const linkAttributes = new Set([
  "href",
  "xlink:href",
  "action",
  "formaction",
  "cite",
  "longdesc",
  "usemap",
  "itemid",
]);
const assetAttributes = new Set([
  "src",
  "background",
  "poster",
  "data",
  "codebase",
  "classid",
  "manifest",
  "profile",
  "icon",
  "lowsrc",
  "dynsrc",
  "datasrc",
]);
const urlListAttributes = new Set(["ping", "archive", "attributionsrc", "itemtype"]);

function validateStyle(value: string): void {
  let declaration = "";
  let quote = "";
  const stack: string[] = [];
  const validateDeclaration = () => {
    if (!declaration.trim()) return;
    const colon = declaration.indexOf(":");
    const property = declaration.slice(0, colon).trim();
    if (colon === -1 || !/^(?:--[\w-]+|-?[a-z][a-z\d-]*)$/i.test(property)) {
      throw new Error("Generated HTML style must contain CSS declarations");
    }
    if (/^(?:-moz-binding|(?:-ms-)?behavior)$/i.test(property)) {
      throw new Error("Generated HTML style contains an active CSS property");
    }
    // The native string validator checks one CSS value, including escaped
    // functions, nested references, and URL schemes, without visual restrictions.
    nativeValue("mj-text", "font-family", declaration.slice(colon + 1).trim());
  };
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === "\\") {
      declaration += character + (value[index + 1] ?? "");
      index += 1;
    } else if (quote) {
      declaration += character;
      if (character === quote) quote = "";
    } else if (character === '"' || character === "'") {
      declaration += character;
      quote = character;
    } else if (character === "/" && value[index + 1] === "*") {
      const end = value.indexOf("*/", index + 2);
      if (end === -1) throw new Error("Generated HTML style contains an unclosed comment");
      // Removing comments rather than inserting whitespace also catches split
      // legacy property names such as be/**/havior.
      index = end + 1;
    } else if (character === ";" && !stack.length) {
      validateDeclaration();
      declaration = "";
    } else {
      if (character === "(" || character === "[") stack.push(character);
      if (
        (character === ")" && stack.pop() !== "(") ||
        (character === "]" && stack.pop() !== "[")
      ) {
        throw new Error("Generated HTML style contains unbalanced delimiters");
      }
      declaration += character;
    }
  }
  if (quote || stack.length)
    throw new Error("Generated HTML style contains an unclosed string or function");
  validateDeclaration();
}

function validateHtmlValue(name: string, value: string, options: ExportOptions): void {
  if (/[\u0000\u007f]/.test(value))
    throw new Error("Generated HTML attribute contains an invalid control character");
  if (options.allowRawHtml === true) return;
  const lower = name.toLowerCase();
  if (lower.startsWith("on") || activeAttributes.has(lower)) {
    throw new Error(`Generated HTML attribute ${name} requires allowRawHtml: true`);
  }
  if (lower === "style") validateStyle(value);
  else if (lower === "srcset" || lower === "imagesrcset") nativeValue("mj-image", "srcset", value);
  else if (linkAttributes.has(lower)) nativeValue("mj-button", "href", value);
  else if (assetAttributes.has(lower)) nativeValue("mj-image", "src", value);
  else if (urlListAttributes.has(lower)) {
    for (const url of value.trim().split(/\s+/).filter(Boolean))
      nativeValue("mj-image", "src", url);
  }
}

function renderHtmlAttributes(entries: unknown, options: ExportOptions): string {
  const selectors = records(entries, "Generated HTML attributes")
    .map((item) => {
      const selector = typeof item.selector === "string" ? item.selector.trim() : "";
      const name = typeof item.name === "string" ? item.name.trim() : "";
      if (!selector || /[\u0000-\u001f\u007f]/.test(selector))
        throw new Error("Generated HTML selector is invalid");
      if (!htmlName.test(name)) throw new Error("Generated HTML attribute name is invalid");
      if (typeof item.value !== "string")
        throw new Error("Generated HTML attribute value must be text");
      validateHtmlValue(name, item.value, options);
      return `<mj-selector${selectorAttribute(selector)}><mj-html-attribute name="${escapeXml(name)}">${encodeEndingWhitespace(escapeXml(item.value))}</mj-html-attribute></mj-selector>`;
    })
    .join("");
  return selectors ? `<mj-html-attributes>${selectors}</mj-html-attributes>` : "";
}

export interface RenderedHeadSettings {
  breakpoint: string;
  fontImports: string;
  styles: string;
  htmlAttributes: string;
}

/** Render native head settings; title, preview, defaults, and raw content remain with their serializers. */
export function renderHeadSettings(
  settings: EmailSettings,
  options: ExportOptions = {},
): RenderedHeadSettings {
  const width = resolveBreakpointWidth(settings);
  const fontImports = records(settings.fontImports ?? [], "Web fonts")
    .map((item) => {
      if (typeof item.name !== "string") throw new Error("Web font name is invalid");
      let name: string;
      try {
        name = nativeValue("mj-font", "name", item.name.trim());
      } catch (cause) {
        throw new Error("Web font name is invalid", { cause });
      }
      // MJML interpolates font names directly into RegExp constructors. Keep
      // literal names while avoiding invalid or unexpectedly expensive patterns.
      if (!name || /[\\^$.*+?()[\]{}|<>]/.test(name) || /[\u0000-\u001f\u007f]/.test(name)) {
        throw new Error("Web font name contains an unsupported regular-expression character");
      }
      if (typeof item.href !== "string" || !item.href.trim())
        throw new Error("Web font CSS must be a valid HTTP(S) URL");
      let cssUrl: string;
      try {
        const href = nativeValue("mj-font", "href", item.href);
        // The compiler uses this URL in both href="..." and unquoted @import url(...).
        cssUrl = nativeValue("mj-section", "background-url", href);
      } catch (cause) {
        throw new Error("Web font CSS must be a valid HTTP(S) URL", { cause });
      }
      return `<mj-font name="${escapeXml(name)}" href="${escapeXml(cssUrl)}" />`;
    })
    .join("");
  const styles = records(settings.headStyles ?? [], "Custom CSS")
    .map((item) => {
      if (
        typeof item.css !== "string" ||
        /<\s*\/\s*(?:mj-style|style)\b/i.test(item.css) ||
        /[\u0000\u007f]/.test(item.css)
      ) {
        throw new Error("Custom CSS contains an invalid style closing tag or control character");
      }
      if (item.inline !== "head" && item.inline !== "inline")
        throw new Error("Custom CSS output must be head or inline");
      // CSS is an existing document feature, but it must remain within its native
      // ending tag even when the parser encounters an ancestor's closing tag.
      trustedEndingContent("mj-style", item.css, { allowRawHtml: true });
      return `<mj-style${item.inline === "inline" ? ' inline="inline"' : ""}>${item.css}</mj-style>`;
    })
    .join("");
  return {
    breakpoint: width === undefined ? "" : `<mj-breakpoint width="${escapeXml(width)}" />`,
    fontImports,
    styles,
    htmlAttributes: renderHtmlAttributes(settings.htmlAttributes ?? [], options),
  };
}
