import { decodeImportedAttribute } from "./imported-attribute-source";

const BYTE_LIMIT = 64 * 1024 * 1024;
const SCALAR_LIMIT = 64 * 1024;
const voids = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);
export function intrinsicSourceBytes(value: string): number {
  let total = 0;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 0x80) total++;
    else if (code < 0x800) total += 2;
    else if (
      code >= 0xd800 &&
      code <= 0xdbff &&
      i + 1 < value.length &&
      value.charCodeAt(i + 1) >= 0xdc00 &&
      value.charCodeAt(i + 1) <= 0xdfff
    ) {
      total += 4;
      i++;
    } else total += 3;
  }
  return total;
}
const bytes = intrinsicSourceBytes;
export class IntrinsicResourceError extends Error {
  constructor(message: string) {
    super(`Intrinsic layout resource limit: ${message}`);
    this.name = "IntrinsicResourceError";
  }
}
function limit(condition: boolean, message: string): void {
  if (!condition) throw new IntrinsicResourceError(message);
}
function requireValue(condition: unknown): asserts condition {
  if (!condition) throw new Error("Unsupported intrinsic layout markup");
}
interface Token {
  start: number;
  end: number;
  tag?: string;
  close?: boolean;
  self?: boolean;
  rawAttrs?: string;
  special?: boolean;
}
/** Quote-aware lexical scan. It never invokes an HTML parser or repairs source. */
export function* intrinsicTokens(source: string, startOffset = 0): Generator<Token> {
  let cursor = startOffset;
  while (cursor < source.length) {
    const start = source.indexOf("<", cursor);
    if (start < 0) {
      yield { start: cursor, end: source.length };
      return;
    }
    if (start > cursor) yield { start: cursor, end: start };
    if (source.startsWith("<!--", start)) {
      const at = source.indexOf("-->", start + 4);
      const end = at < 0 ? source.length : at + 3;
      yield { start, end, special: true };
      cursor = end;
      continue;
    }
    const match = /^<(\/?)([A-Za-z][\w:-]*)(?=[\s/>])/.exec(source.slice(start, start + 256));
    let quote = "";
    let end = start + (match?.[0].length ?? 1);
    for (; end < source.length; end++) {
      const c = source[end];
      if (quote) {
        if (c === quote) quote = "";
      } else if (c === '"' || c === "'") quote = c;
      else if (c === ">") break;
    }
    if (end === source.length) {
      yield { start, end, special: true };
      return;
    }
    end++;
    if (!match) yield { start, end, special: true };
    else {
      const tail = source.slice(start + match[0].length, end - 1);
      const self = /\/\s*$/.test(tail);
      yield {
        start,
        end,
        tag: match[2]!.toLowerCase(),
        close: !!match[1],
        self,
        rawAttrs: self ? tail.replace(/\/\s*$/, "") : tail,
      };
    }
    cursor = end;
  }
}
export interface IntrinsicSourceNode {
  tag: string;
  attrs: Record<string, string>;
  children: IntrinsicSourceNode[];
  start: number;
  contentStart: number;
  contentEnd: number;
  end: number;
  text?: string;
}
function attributes(raw: string): { values: Record<string, string>; valid: boolean } {
  const result: Record<string, string> = Object.create(null);
  let cursor = 0;
  let invalid = false;
  while (cursor < raw.length) {
    const before = cursor;
    while (cursor < raw.length && /\s/.test(raw[cursor]!)) cursor++;
    if (cursor === raw.length) break;
    if (cursor === before) invalid = true;
    const start = cursor;
    if (!/[A-Za-z_:]/.test(raw[cursor]!)) {
      while (cursor < raw.length && !/\s/.test(raw[cursor]!)) cursor++;
      limit(cursor - start <= SCALAR_LIMIT, "attribute exceeds 64 KiB");
      invalid = true;
      continue;
    }
    cursor++;
    while (cursor < raw.length && /[\w:.-]/.test(raw[cursor]!)) {
      cursor++;
      limit(cursor - start <= SCALAR_LIMIT, "attribute name exceeds 64 KiB");
    }
    const name = raw.slice(start, cursor).toLowerCase();
    while (cursor < raw.length && /\s/.test(raw[cursor]!)) cursor++;
    if (raw[cursor] !== "=") {
      invalid = true;
      continue;
    }
    cursor++;
    while (cursor < raw.length && /\s/.test(raw[cursor]!)) cursor++;
    const quote = raw[cursor] === '"' || raw[cursor] === "'" ? raw[cursor++] : undefined;
    const valueStart = cursor;
    if (quote) while (cursor < raw.length && raw[cursor] !== quote) cursor++;
    else while (cursor < raw.length && !/\s/.test(raw[cursor]!)) cursor++;
    const value = raw.slice(valueStart, cursor);
    if (quote) {
      if (cursor === raw.length) invalid = true;
      else cursor++;
    } else if (!value || /["'=<>`]/.test(value)) invalid = true;
    if (Object.hasOwn(result, name)) invalid = true;
    if (name === "data-pm-origin")
      limit(bytes(value) <= 48 * 1024, "origin hint exceeds 48 KiB encoded");
    else if (name === "src" && value.startsWith("data:"))
      limit(
        bytes(value) <= Math.ceil((5 * 1024 * 1024) / 3) * 4 + 32,
        "encoded image src exceeds the 5 MiB raster encoding limit",
      );
    else limit(bytes(value) <= SCALAR_LIMIT, "attribute exceeds 64 KiB");
    const decoded = decodeImportedAttribute(value);
    if (name === "data-pm-origin")
      limit(bytes(decoded) <= 8 * 1024, "origin hint exceeds 8 KiB decoded");
    else if (name === "src" && decoded.startsWith("data:"))
      limit(
        bytes(decoded) <= Math.ceil((5 * 1024 * 1024) / 3) * 4 + 32,
        "image src exceeds the 5 MiB raster encoding limit",
      );
    else limit(bytes(decoded) <= SCALAR_LIMIT, "attribute exceeds 64 KiB");
    result[name] = decoded;
  }
  return { values: result, valid: !invalid };
}
export function parseIntrinsicTree(source: string): IntrinsicSourceNode[] {
  limit(bytes(source) <= BYTE_LIMIT, "source exceeds 64 MiB");
  const root: IntrinsicSourceNode = {
    tag: "",
    attrs: {},
    children: [],
    start: 0,
    contentStart: 0,
    contentEnd: source.length,
    end: source.length,
  };
  const stack = [root];
  let count = 0;
  let layoutCount = 0;
  let invalid = false;
  for (const token of intrinsicTokens(source)) {
    limit(++count <= 4096, "more than 4096 HTML tokens");
    if (token.special) {
      limit(
        bytes(source.slice(token.start, token.end)) <= SCALAR_LIMIT,
        "malformed token or comment exceeds 64 KiB",
      );
      invalid = true;
      continue;
    }
    if (!token.tag) {
      const text = source.slice(token.start, token.end);
      limit(bytes(text) <= SCALAR_LIMIT, "text exceeds 64 KiB");
      stack.at(-1)!.children.push({
        tag: "#text",
        attrs: {},
        children: [],
        text,
        start: token.start,
        contentStart: token.start,
        contentEnd: token.end,
        end: token.end,
      });
      continue;
    }
    let attrs: Record<string, string> = {};
    try {
      const parsed = attributes(token.rawAttrs ?? "");
      attrs = parsed.values;
      if (!parsed.valid) invalid = true;
    } catch (error) {
      if (error instanceof IntrinsicResourceError) throw error;
      invalid = true;
    }
    if (token.close) {
      if (
        token.self ||
        Object.keys(attrs).length ||
        token.rawAttrs?.trim() ||
        stack.length === 1 ||
        stack.at(-1)!.tag !== token.tag
      ) {
        invalid = true;
        continue;
      }
      const node = stack.pop()!;
      node.contentEnd = token.start;
      node.end = token.end;
      if (node.tag === "div" && Object.hasOwn(stack.at(-1)!.attrs, "data-pm-text"))
        limit(
          bytes(source.slice(node.contentStart, node.contentEnd)) <= SCALAR_LIMIT,
          "text leaf HTML exceeds 64 KiB",
        );
    } else {
      if (
        ["data-pm-row", "data-pm-cell", "data-pm-text", "data-pm-image"].some((name) =>
          Object.hasOwn(attrs, name),
        )
      )
        limit(++layoutCount <= 256, "more than 256 layout nodes");
      if (Object.hasOwn(attrs, "data-pm-row"))
        limit(
          stack.filter((node) => Object.hasOwn(node.attrs, "data-pm-row")).length < 8,
          "row nesting exceeds 8 levels",
        );
      const node: IntrinsicSourceNode = {
        tag: token.tag,
        attrs,
        children: [],
        start: token.start,
        contentStart: token.end,
        contentEnd: token.end,
        end: token.end,
      };
      stack.at(-1)!.children.push(node);
      if (!token.self && !voids.has(token.tag)) stack.push(node);
      limit(stack.length - 1 <= 64, "HTML nesting exceeds 64 levels");
    }
  }
  requireValue(!invalid && stack.length === 1);
  return root.children;
}

/** Resource-only check for a bounded HTML island or generated complete row. */
export function assertIntrinsicSourceBounds(source: string): void {
  try {
    parseIntrinsicTree(source);
  } catch (error) {
    if (error instanceof IntrinsicResourceError) throw error;
  }
}
