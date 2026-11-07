/* eslint-disable no-control-regex -- These validators explicitly reject unsafe control characters. */
import sanitizeHtml from "sanitize-html";
import { isLocalImageSource } from "./image-upload";
import catalogData from "./native-catalog.json";
import type { ExportOptions } from "./types";

export interface NativeComponentSpec {
  kind: "body" | "head";
  allowedAttributes: Record<string, string>;
  defaultAttributes: Record<string, unknown>;
  endingTag: boolean;
  allowedChildren: (string | { pattern: string; flags: string })[];
}

export const nativeCatalog: Record<string, NativeComponentSpec> = Object.assign(
  Object.create(null),
  catalogData.components,
);

const reservedNames = new Set(["__proto__", "constructor", "prototype"]);
const globalAttributes = ["css-class", "mj-class"];
const colorKeywords = new Set<string>(catalogData.colorKeywords);
const assetAttributes = new Set([
  "src",
  "background-url",
  "base-url",
  "icon-wrapped-url",
  "icon-unwrapped-url",
  "left-icon",
  "right-icon",
  "thumbnails-src",
]);
const literalAttributes = new Set([
  "alt",
  "title",
  "name",
  "rel",
  "target",
  "usemap",
  "icon-wrapped-alt",
  "icon-unwrapped-alt",
  "ico-open",
  "ico-close",
  "inline",
  "mode",
  "hamburger",
]);
const allDescriptors = new Map<string, Set<string>>();
for (const component of Object.values(nativeCatalog)) {
  for (const [name, descriptor] of Object.entries(component.allowedAttributes)) {
    if (!allDescriptors.has(name)) allDescriptors.set(name, new Set());
    allDescriptors.get(name)!.add(descriptor);
  }
}
for (const name of globalAttributes) allDescriptors.set(name, new Set(["string"]));

function componentFor(tag: string): NativeComponentSpec {
  if (!Object.hasOwn(nativeCatalog, tag)) throw new Error(`Unknown MJML component: ${tag}`);
  return nativeCatalog[tag];
}

export function nativeAttributeNames(tag: string): string[] {
  return tag === "*"
    ? [...allDescriptors.keys()].sort()
    : [...Object.keys(componentFor(tag).allowedAttributes), ...globalAttributes].sort();
}

/** Normalize whitespace without restricting names to JavaScript identifiers. */
export function normalizeMjClass(value: unknown): string | undefined {
  if (value === undefined || value === "") return undefined;
  if (typeof value !== "string") throw new Error("MJML classes must be text");
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f<>"'`=&]/.test(value)) {
    throw new Error("MJML classes contain an invalid character");
  }
  const names = value.trim().split(/\s+/).filter(Boolean);
  if (names.some((name) => reservedNames.has(name))) throw new Error("MJML class name is reserved");
  return names.length ? names.join(" ") : undefined;
}

// Use the already-installed HTML parser to recognize named and numeric entities.
// Validation decodes them; serialization still receives the original literal value.
function decodeEntitiesOnce(value: string): string {
  let decoded = value;
  sanitizeHtml(`<a data-value="${value.replace(/"/g, "&quot;")}"></a>`, {
    allowedTags: ["a"],
    allowedAttributes: {},
    transformTags: {
      a: (_tag, attributes) => {
        decoded = attributes["data-value"] ?? "";
        return { tagName: "a", attribs: {} };
      },
    },
  });
  return decoded;
}

function decodeEntities(value: string): string {
  let current = value;
  for (let round = 0; round < 8; round += 1) {
    const decoded = decodeEntitiesOnce(current);
    if (decoded === current) return current;
    current = decoded;
  }
  throw new Error("Native attribute contains excessively nested character references");
}

function validateUrl(value: string, allowRelative: boolean, allowContact: boolean): string {
  if (value === "") return "";
  const original = value.trim();
  const decodedValue = decodeEntities(original);
  const decoded = decodedValue.trim();
  if (
    !original ||
    /[\u0000-\u001f\u007f-\u009f\\]/.test(value) ||
    /[\u0000-\u001f\u007f-\u009f\\]/.test(decodedValue)
  ) {
    throw new Error("Native URL contains a control character or a backslash");
  }
  if (decoded.startsWith("//")) throw new Error("Protocol-relative native URLs are not supported");
  const relativeBase = "https://relative.invalid/";
  let parsed: URL;
  try {
    parsed = new URL(decoded, allowRelative ? relativeBase : undefined);
  } catch {
    throw new Error("Native URL must be an absolute HTTP(S) URL or a safe relative link");
  }
  const schemes = allowContact ? ["http:", "https:", "mailto:", "tel:"] : ["http:", "https:"];
  if (!schemes.includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error("Native URL uses an unsupported scheme or contains credentials");
  }
  if ((parsed.protocol === "mailto:" || parsed.protocol === "tel:") && !parsed.pathname) {
    throw new Error("Native contact URL must have a destination");
  }
  const hasScheme = /^[A-Za-z][A-Za-z\d+.-]*:/.test(decoded);
  if (!hasScheme && (!allowRelative || parsed.origin !== new URL(relativeBase).origin)) {
    throw new Error("Native asset URL must be an absolute HTTP(S) URL");
  }
  // Encoded schemes must never become executable after another HTML parsing pass.
  const schemePrefix = decoded.split(/[/?#]/, 1)[0];
  if (!hasScheme && schemePrefix.includes(":")) throw new Error("Native URL has an invalid scheme");
  return original;
}

function backgroundUrl(value: string): string {
  const original = validateUrl(value, false, false);
  const decoded = decodeEntities(original);
  const delimiters = /['"()<>\s]/g;
  if ((decoded.match(delimiters) ?? []).join("") !== (original.match(delimiters) ?? []).join("")) {
    throw new Error("Native background URL contains encoded CSS delimiters");
  }
  return original.replace(
    delimiters,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function validateSrcset(value: string): string {
  if (value === "") return "";
  if (/[\u0000-\u001f\u007f-\u009f]/.test(value))
    throw new Error("Native srcset contains a control character");
  const candidates: string[] = [];
  let position = 0;
  while (position < value.length) {
    while (/[\s,]/.test(value[position] ?? "") && position < value.length) position += 1;
    if (position >= value.length) break;
    const start = position;
    while (position < value.length && !/\s/.test(value[position])) position += 1;
    let url = value.slice(start, position);
    if (url.endsWith(",")) {
      url = url.replace(/,+$/, "");
      candidates.push(validateUrl(url, false, false));
      continue;
    }
    const descriptorStart = position;
    while (position < value.length && value[position] !== ",") position += 1;
    const descriptor = value.slice(descriptorStart, position).trim();
    if (descriptor && !/^(?:[1-9]\d*w|(?:\d+(?:\.\d+)?|\.\d+)x)$/.test(descriptor)) {
      throw new Error("Native srcset needs a positive width or density descriptor");
    }
    if (descriptor.endsWith("x") && Number.parseFloat(descriptor) <= 0) {
      throw new Error("Native srcset density must be positive");
    }
    candidates.push(`${validateUrl(url, false, false)}${descriptor ? ` ${descriptor}` : ""}`);
    position += 1;
  }
  if (!candidates.length) throw new Error("Native srcset must contain an image URL");
  return candidates.join(", ");
}

function decodeCss(value: string): string {
  return value
    .replace(/\\(?:\r\n|[\n\r\f])/g, "")
    .replace(/\\([\da-f]{1,6})(?:\r\n|[ \n\r\t\f])?|\\([^\n\r\f])/gi, (_match, hex, character) => {
      if (!hex) return character;
      const codePoint = Number.parseInt(hex, 16);
      return codePoint === 0 || codePoint > 0x10ffff ? "\ufffd" : String.fromCodePoint(codePoint);
    });
}

function validateCss(value: string): void {
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f<>]/.test(value)) {
    throw new Error("Native CSS contains markup or a control character");
  }
  let cleaned = "";
  let quote = "";
  const stack: string[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === "\\") {
      cleaned += character + (value[index + 1] ?? "");
      index += 1;
      continue;
    }
    if (quote) {
      cleaned += character;
      if (character === quote) quote = "";
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      cleaned += character;
    } else if (character === "/" && value[index + 1] === "*") {
      const end = value.indexOf("*/", index + 2);
      if (end === -1) throw new Error("Native CSS contains an unclosed comment");
      index = end + 1;
    } else {
      if (/[;{}@]/.test(character))
        throw new Error("Native CSS must contain one value, not declarations");
      if (character === "(" || character === "[") stack.push(character);
      if (
        (character === ")" && stack.pop() !== "(") ||
        (character === "]" && stack.pop() !== "[")
      ) {
        throw new Error("Native CSS contains unbalanced delimiters");
      }
      cleaned += character;
    }
  }
  if (quote || stack.length) throw new Error("Native CSS contains an unclosed string or function");
  const decoded = decodeCss(decodeEntities(cleaned));
  if (
    /(?:expression\s*\(|-moz-binding|(?:java|vb)script\s*:|behavior\s*:|<|>|[\u0000-\u0008\u007f])/i.test(
      decoded,
    )
  ) {
    throw new Error("Native CSS contains active or unsafe content");
  }
  // Decode escapes before finding url(), so escaped protocol/function names cannot bypass validation.
  for (const match of decoded.matchAll(/url\s*\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/gi)) {
    validateUrl(match[1] ?? match[2] ?? match[3].trim(), false, false);
  }
  // Escaped declaration delimiters should not reach a second CSS/HTML parsing pass.
  if (decoded !== cleaned && /[;{}@]/.test(decoded.replace(/"[^"]*"|'[^']*'/g, ""))) {
    throw new Error("Native CSS contains an encoded declaration");
  }
}

/** Use the same supported color syntax for visual fields and native attributes. */
export function normalizeColor(value: unknown, fallback = ""): string {
  return typeof value === "string" ? (matchDescriptor(value, "color") ?? fallback) : fallback;
}

function matchDescriptor(value: string, descriptor: string): string | undefined {
  if (descriptor === "string") return value;
  const trimmed = value.trim();
  if (descriptor === "boolean")
    return /^(?:true|false)$/i.test(trimmed) ? trimmed.toLowerCase() : undefined;
  // MJML's integer descriptor also accepts decimals. Keep that safe numeric
  // subset without copying its unanchored matcher, which accepts arbitrary text.
  if (descriptor === "integer")
    return /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(trimmed) ? trimmed : undefined;
  if (descriptor === "color") {
    const lower = trimmed.toLowerCase();
    if (colorKeywords.has(lower) || /^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(trimmed)) return trimmed;
    if (
      /^rgb\(\d{1,3},\s*\d{1,3},\s*\d{1,3}\)$/i.test(trimmed) ||
      /^rgba\(\d{1,3},\s*\d{1,3},\s*\d{1,3},\s*\d(?:\.\d{1,3})?\)$/i.test(trimmed)
    ) {
      return trimmed.replace(/,\s+/g, ", ");
    }
    return undefined;
  }
  if (descriptor.startsWith("enum(")) {
    return descriptor.slice(5, -1).split(",").includes(trimmed) ? trimmed : undefined;
  }
  const unit = /^(unit|unitWithNegative)\(([^)]+)\)(?:\{(\d+)(?:,(\d+))?\})?$/.exec(descriptor);
  if (unit) {
    const units = unit[2].split(",");
    const parts = trimmed ? trimmed.split(/\s+/) : [];
    const min = Number(unit[3] ?? 1);
    const max = Number(unit[4] ?? unit[3] ?? 1);
    if (parts.length < min || parts.length > max) return undefined;
    const number =
      unit[1] === "unitWithNegative"
        ? "-?(?:\\d+(?:\\.\\d+)?|\\.\\d+)"
        : "(?:\\d+(?:\\.\\d+)?|\\.\\d+)";
    if (
      !parts.every(
        (part) =>
          part === "0" ||
          (part === "auto" && units.includes("auto")) ||
          units.some(
            (suffix) => suffix !== "auto" && new RegExp(`^${number}${suffix}$`).test(part),
          ),
      )
    )
      return undefined;
    return parts.join(" ");
  }
  throw new Error(`Unsupported native attribute descriptor: ${descriptor}`);
}

function validateValue(
  tag: string,
  name: string,
  value: string,
  descriptors: Set<string>,
  options: ExportOptions,
): string {
  if (
    options.allowLocalImages === true &&
    tag === "mj-image" &&
    name === "src" &&
    isLocalImageSource(value)
  )
    return value;
  if (name === "css-class" || name === "mj-class") return normalizeMjClass(value) ?? "";
  if (name === "srcset") return validateSrcset(value);
  if (name === "background-url") return backgroundUrl(value);
  if (assetAttributes.has(name)) return validateUrl(value, false, false);
  if (name === "href") return validateUrl(value, tag !== "mj-font", tag !== "mj-font");
  if (name === "ico-open" || name === "ico-close") {
    if (/[<>\u0000\u007f]/.test(decodeEntities(value))) {
      throw new Error("Native navbar icon content must be text, not HTML");
    }
    // These attributes become HTML text, so decode one entity layer before XML escaping.
    return decodeEntitiesOnce(value);
  }
  if (!literalAttributes.has(name)) validateCss(value);
  else if (/[\u0000\u007f]/.test(value))
    throw new Error("Native text contains an invalid control character");
  for (const descriptor of descriptors) {
    const normalized = matchDescriptor(value, descriptor);
    if (normalized !== undefined) return normalized;
  }
  throw new Error(
    `Invalid native ${name} value for ${tag}; expected ${[...descriptors].join(" or ")}`,
  );
}

export function readNativeAttributes(
  tag: string,
  entries: unknown,
  options: ExportOptions = {},
): Record<string, string | null> {
  const component = tag === "*" ? undefined : componentFor(tag);
  const result: Record<string, string | null> = Object.create(null);
  if (entries === undefined) return result;
  if (!Array.isArray(entries)) throw new Error("Native MJML attributes must be an array");
  for (const entry of entries) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry))
      throw new Error("Native MJML attributes contain an invalid entry");
    if (!Object.hasOwn(entry, "name") || typeof entry.name !== "string")
      throw new Error("Native MJML attribute name must be text");
    const value = Object.hasOwn(entry, "value") ? entry.value : undefined;
    const inherit = Object.hasOwn(entry, "inherit") ? entry.inherit : undefined;
    const template = Object.hasOwn(entry, "template") ? entry.template : undefined;
    if (template !== undefined && typeof template !== "boolean")
      throw new Error("Native attribute template must be a boolean");
    const name = entry.name.trim();
    if (!name && (value === undefined || (typeof value === "string" && !value.trim()))) continue;
    if (reservedNames.has(name)) throw new Error(`Native MJML attribute name is reserved: ${name}`);
    const descriptors =
      tag === "*"
        ? allDescriptors.get(name)
        : globalAttributes.includes(name)
          ? new Set(["string"])
          : Object.hasOwn(component!.allowedAttributes, name)
            ? new Set([component!.allowedAttributes[name]])
            : undefined;
    if (!descriptors) throw new Error(`Unsupported native attribute ${name} on ${tag}`);
    if (inherit !== undefined && typeof inherit !== "boolean")
      throw new Error("Native attribute inherit must be a boolean");
    if (inherit === true) {
      result[name] = null;
      continue;
    }
    if (value === undefined) continue;
    if (typeof value !== "string") throw new Error(`Native attribute ${name} value must be text`);
    if (template === true) {
      if (options.allowRawHtml !== true)
        throw new Error("Native template attributes require allowRawHtml: true");
      if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value))
        throw new Error("Native template attribute contains an invalid XML control character");
      result[name] = value;
    } else {
      result[name] = validateValue(tag, name, value, descriptors, options);
    }
  }
  return result;
}
