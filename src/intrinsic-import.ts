import * as cheerio from "cheerio";
import postcss from "postcss";
import { normalizeMjClass, readNativeAttributes } from "./native-attributes";
import { sanitizeEmailRichText } from "./richtext";
import {
  INTRINSIC_WRAPPER_ATTRIBUTES,
  textOuterStyles,
  textInnerStyles,
  imageOuterStyles,
  imageInnerStyles,
  readIntrinsicOrigin,
  intrinsicPadding,
} from "./intrinsic-layout";
import type { EmailBlock } from "./types";

import {
  parseIntrinsicTree as tree,
  intrinsicTokens as tokens,
  intrinsicSourceBytes,
  IntrinsicResourceError,
  type IntrinsicSourceNode as Node,
} from "./intrinsic-source";
export { IntrinsicResourceError } from "./intrinsic-source";
function limit(condition: boolean, message: string): void {
  if (!condition) throw new IntrinsicResourceError(message);
}
function requireValue(condition: unknown): asserts condition {
  if (!condition) throw new Error("Unsupported intrinsic layout markup");
}

function hasIntrinsicMarker(raw: string): boolean {
  let quote = "";
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i]!;
    if (quote) {
      if (c === quote) quote = "";
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      continue;
    }
    if (
      (i === 0 || /\s/.test(raw[i - 1]!)) &&
      c.toLowerCase() === "d" &&
      /^data-pm-(?:layout|row|cell|text|image)(?:\s|=)/i.test(raw.slice(i, i + 24))
    )
      return true;
  }
  return false;
}

/** Match the ordinary importer's opaque mj-style boundary, not HTML syntax
 * inside CSS strings/comments. Strict row parsing never uses this skip. */
function styleEnd(source: string, cursor: number): number | undefined {
  while (cursor < source.length) {
    const start = source.indexOf("<", cursor);
    if (start < 0) return;
    let nameStart = start + 1;
    while (nameStart < source.length && /\s/.test(source[nameStart]!)) nameStart++;
    if (source[nameStart] !== "/") {
      cursor = nameStart;
      continue;
    }
    nameStart++;
    while (nameStart < source.length && /\s/.test(source[nameStart]!)) nameStart++;
    const match = /^mj-style(?=[\s/>])/i.exec(source.slice(nameStart, nameStart + 9));
    if (!match) {
      cursor = nameStart;
      continue;
    }
    let quote = "";
    for (let end = nameStart + match[0].length; end < source.length; end++) {
      const c = source[end];
      if (quote) {
        if (c === quote) quote = "";
      } else if (c === '"' || c === "'") quote = c;
      else if (c === ">") return end + 1;
    }
    return;
  }
}

/** Run before the ordinary importer performs its eager ending-tag Cheerio parse.
 * Invalid syntax is remembered for raw fallback, whereas resource errors escape.
 */
export function preflightIntrinsicSource(source: string): Map<string, boolean> {
  const result = new Map<string, boolean>();
  let active:
    | { start: number; contentStart: number; candidate: boolean; bytes: number; tokenCount: number }
    | undefined;
  let opaque: string | undefined;
  const endings = new Set([
    "mj-text",
    "mj-button",
    "mj-raw",
    "mj-style",
    "mj-title",
    "mj-preview",
    "mj-social-element",
    "mj-navbar-link",
    "mj-accordion-title",
    "mj-accordion-text",
    "mj-html-attribute",
  ]);
  let iterator = tokens(source);
  for (let step = iterator.next(); !step.done; step = iterator.next()) {
    const token = step.value;
    if (active) {
      active.bytes += intrinsicSourceBytes(source.slice(token.start, token.end));
      active.tokenCount++;
      if (active.candidate) {
        limit(active.bytes <= 64 * 1024 * 1024, "source exceeds 64 MiB");
        limit(active.tokenCount <= 4096, "more than 4096 HTML tokens");
        if (token.special)
          limit(
            intrinsicSourceBytes(source.slice(token.start, token.end)) <= 64 * 1024,
            "malformed token or comment exceeds 64 KiB",
          );
      }
    }
    if (opaque) {
      if (token.tag === opaque && token.close) opaque = undefined;
      continue;
    }
    if (!active && token.tag && endings.has(token.tag) && !token.close && !token.self) {
      if (token.tag === "mj-style") {
        const end = styleEnd(source, token.end);
        if (end === undefined) break;
        iterator = tokens(source, end);
        continue;
      }
      opaque = token.tag;
      continue;
    }
    if (!active && token.tag === "mj-table" && !token.close && !token.self)
      active = {
        start: token.start,
        contentStart: token.end,
        candidate: false,
        tokenCount: 1,
        bytes: intrinsicSourceBytes(source.slice(token.start, token.end)),
      };
    else if (active && token.tag === "mj-table" && token.close) {
      const inner = source.slice(active.contentStart, token.start);
      if (active.candidate) {
        let valid = true;
        try {
          tree(source.slice(active.start, token.end));
        } catch (error) {
          if (error instanceof IntrinsicResourceError) throw error;
          valid = false;
        }
        result.set(inner, (result.get(inner) ?? true) && valid);
      }
      active = undefined;
    } else if (active && token.tag && hasIntrinsicMarker(token.rawAttrs ?? "")) {
      active.candidate = true;
      limit(active.tokenCount <= 4096, "more than 4096 HTML tokens");
      limit(active.bytes <= 64 * 1024 * 1024, "source exceeds 64 MiB");
    }
  }
  if (active?.candidate) {
    // Even malformed/unclosed candidates must not evade resource checks.
    try {
      tree(source.slice(active.start));
    } catch (error) {
      if (error instanceof IntrinsicResourceError) throw error;
    }
  }
  return result;
}
function allowed(node: Node, names: string[]) {
  requireValue(Object.keys(node.attrs).every((key) => names.includes(key)));
}
function children(node: Node): Node[] {
  return node.children.filter((child) => {
    if (child.tag !== "#text") return true;
    requireValue(!child.text?.trim());
    return false;
  });
}
function only(node: Node, tag: string): Node {
  const list = children(node);
  requireValue(list.length === 1 && list[0]!.tag === tag);
  return list[0]!;
}
function styles(node: Node, names: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  requireValue(!(node.attrs.style ?? "").includes("/*"));
  const parsed = postcss.parse(node.attrs.style ?? "");
  for (const decl of parsed.nodes) {
    requireValue(
      decl.type === "decl" &&
        !decl.important &&
        names.includes(decl.prop) &&
        !Object.hasOwn(result, decl.prop),
    );
    requireValue(
      !decl.raws.before?.includes("/*") &&
        !decl.raws.between?.includes("/*") &&
        !decl.value.includes("/*"),
    );
    if (decl.prop === "padding" || decl.prop === "border")
      requireValue(
        !Object.keys(result).some((key) =>
          new RegExp(`^${decl.prop}-(top|right|bottom|left)$`).test(key),
        ),
      );
    result[decl.prop] = decl.value.trim();
  }
  return result;
}
function exact(actual: Record<string, string>, expected: Record<string, string>) {
  requireValue(
    Object.keys(actual).length === Object.keys(expected).length &&
      Object.entries(expected).every(([key, value]) => actual[key] === value),
  );
}
function cssClass(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  requireValue(/^[A-Za-z_][\w-]*(?: [A-Za-z_][\w-]*)*$/.test(value));
  return value;
}
function userClasses(
  value: string | undefined,
  generated: string[],
  nativeClass = false,
): string | undefined {
  const validated = nativeClass ? normalizeMjClass(value) : cssClass(value);
  if (validated === undefined) return undefined;
  const list = validated.split(" ");
  for (const name of generated) {
    const at = list.indexOf(name);
    if (at >= 0) list.splice(at, 1);
  }
  return list.join(" ") || undefined;
}
interface Callbacks {
  visible(block: EmailBlock): Record<string, string | undefined>;
  id(prefix: string): string;
  leaf(tag: "mj-text" | "mj-image", attrs: Record<string, string>, innerHtml: string): EmailBlock;
}
export function parseIntrinsicMarkup(
  innerHtml: string,
  outerAttrs: Record<string, string>,
  options: { allowLocalImages?: boolean },
  callbacks: Callbacks,
): EmailBlock | undefined {
  if (!innerHtml.includes("data-pm-layout")) return undefined;
  try {
    exact(outerAttrs, INTRINSIC_WRAPPER_ATTRIBUTES);
    const roots = tree(innerHtml).filter((node) => {
      if (node.tag !== "#text") return true;
      requireValue(!node.text?.trim());
      return false;
    });
    requireValue(roots.length === 1 && roots[0]!.tag === "tr");
    const root = roots[0]!;
    exact(root.attrs, { "data-pm-layout": "1" });
    const holder = only(root, "td");
    allowed(holder, ["style"]);
    const holderStyle = styles(holder, ["padding", "word-break"]);
    requireValue(holderStyle.padding === "0" || holderStyle.padding === "0px");
    // Older v1 sources omitted the compiler-default reset. It is structural,
    // not an editable leaf style, and no other word-break value is supported.
    requireValue(holderStyle["word-break"] === undefined || holderStyle["word-break"] === "normal");
    let nodes = 0;
    const allocate = () => limit(++nodes <= 256, "more than 256 layout nodes");
    const leaf = (node: Node): EmailBlock => {
      allocate();
      requireValue(node.tag === "div");
      const isText = node.attrs["data-pm-text"] !== undefined;
      const tag = isText ? "mj-text" : "mj-image";
      allowed(node, [
        isText ? "data-pm-text" : "data-pm-image",
        "data-pm-origin",
        ...(!isText ? ["data-pm-fluid"] : []),
        "class",
        "style",
      ]);
      requireValue(
        isText
          ? ["rich", "native"].includes(node.attrs["data-pm-text"]!)
          : node.attrs["data-pm-image"] === "1",
      );
      const native: Record<string, string> = {};
      const mapping = isText ? textOuterStyles : imageOuterStyles;
      const outer = styles(node, [
        ...Object.values(mapping),
        ...(!isText ? ["font-size", "line-height"] : []),
      ]);
      for (const [name, css] of Object.entries(mapping))
        if (outer[css] !== undefined) native[name] = outer[css]!;
      let content = "";
      const classValue = userClasses(
        node.attrs.class,
        isText
          ? [
              "pm-intrinsic-text",
              ...(node.attrs["data-pm-text"] === "rich" ? ["pm-email-text"] : []),
            ]
          : [
              "pm-intrinsic-image",
              ...(node.attrs["data-pm-fluid"] === "true" ? ["pm-intrinsic-fluid"] : []),
            ],
        true,
      );
      if (!isText) {
        const fluid = node.attrs["data-pm-fluid"];
        const fluidClass =
          normalizeMjClass(node.attrs.class)?.split(" ").includes("pm-intrinsic-fluid") ?? false;
        if (fluid !== undefined) requireValue(["true", "false"].includes(fluid));
        requireValue(fluid !== "true" || fluidClass);
        if (fluid !== undefined) native["fluid-on-mobile"] = fluid;
      }
      if (classValue) native["css-class"] = classValue;
      if (isText) {
        const inner = only(node, "div");
        allowed(inner, ["style"]);
        Object.assign(native, styles(inner, [...textInnerStyles]));
        content = innerHtml.slice(inner.contentStart, inner.contentEnd);
        limit(intrinsicSourceBytes(content) <= 64 * 1024, "text leaf HTML exceeds 64 KiB");
        const normalized = (value: string) => cheerio.load(value, {}, false).html();
        requireValue(normalized(content) === normalized(sanitizeEmailRichText(content)));
      } else {
        // These fixed wrapper values are structural, never text native attributes.
        requireValue(
          ["0", "0px"].includes(outer["font-size"] ?? "") &&
            ["0", "0px"].includes(outer["line-height"] ?? ""),
        );
        delete native["font-size"];
        delete native["line-height"];
        const link = only(node, "a");
        allowed(link, ["href", "target", "rel", "name", "style"]);
        exact(styles(link, ["display"]), { display: "block" });
        for (const name of ["href", "target", "rel", "name"])
          if (link.attrs[name] !== undefined) native[name] = link.attrs[name]!;
        const img = only(link, "img");
        allowed(img, ["src", "alt", "title", "srcset", "sizes", "usemap", "width", "style"]);
        requireValue(children(img).length === 0 && img.attrs.src !== undefined);
        for (const name of ["src", "alt", "title", "srcset", "sizes", "usemap"])
          if (img.attrs[name] !== undefined) native[name] = img.attrs[name]!;
        const inner = styles(img, [...imageInnerStyles, "display", "box-sizing", "max-width"]);
        requireValue(
          inner.display === "block" &&
            inner["box-sizing"] === "content-box" &&
            inner["max-width"] === "100%",
        );
        delete inner.display;
        delete inner["box-sizing"];
        delete inner["max-width"];
        if (inner.width === "100%") {
          requireValue(img.attrs.width === undefined);
          delete inner.width;
        } else {
          requireValue(
            /^(?:\d+(?:\.\d+)?|\.\d+)px$/.test(inner.width ?? "") &&
              /^(?:\d+(?:\.\d+)?|\.\d+)$/.test(img.attrs.width ?? "") &&
              Number.isFinite(Number.parseFloat(inner.width!)) &&
              Number(img.attrs.width) === Number.parseFloat(inner.width!),
          );
        }
        Object.assign(native, inner);
      }
      const validated = readNativeAttributes(
        tag,
        Object.entries(native).map(([name, value]) => ({ name, value })),
        { allowRawHtml: false, allowLocalImages: options.allowLocalImages },
      );
      const origin = readIntrinsicOrigin(
        node.attrs["data-pm-origin"],
        tag,
        Object.fromEntries(
          Object.entries(validated).map(([name, value]) => [name, value ?? undefined]),
        ),
      );
      const clearable = [
        "css-class",
        ...(!isText
          ? ["href", "target", "rel", "name", "alt", "title", "srcset", "sizes", "usemap"]
          : []),
      ];
      for (const name of origin.missing ?? [])
        requireValue(clearable.includes(name) || (!isText && name === "fluid-on-mobile"));
      if (
        !isText &&
        native["fluid-on-mobile"] === undefined &&
        !origin.inherit.includes("fluid-on-mobile")
      ) {
        readNativeAttributes(tag, [{ name: "fluid-on-mobile", value: "false" }], {
          allowRawHtml: false,
        });
        native["fluid-on-mobile"] = "false";
      }
      for (const name of clearable) {
        if (native[name] === undefined && !origin.inherit.includes(name)) {
          readNativeAttributes(tag, [{ name, value: "" }], { allowRawHtml: false });
          native[name] = "";
        }
      }
      for (const name of origin.inherit) delete native[name];
      if (origin.mjClass !== undefined) native["mj-class"] = origin.mjClass;
      const block = callbacks.leaf(tag, native, content);
      if (isText) {
        for (const value of [
          block.props.content,
          block.props.importedRichText?.source,
          block.props.importedRichText?.baseline,
        ])
          if (typeof value === "string")
            limit(
              intrinsicSourceBytes(value) <= 64 * 1024,
              "imported text leaf scalar exceeds 64 KiB",
            );
      }
      requireValue(!block.props.htmlContent);
      const projected = callbacks.visible(block);
      const mappedStyles = [
        ...Object.keys(mapping),
        ...(isText ? textInnerStyles : imageInnerStyles),
      ];
      for (const name of mappedStyles) {
        if (!isText && name === "width" && native.width === undefined) continue;
        if (validated[name] === undefined && !origin.inherit.includes(name))
          requireValue(projected[name] === undefined || projected[name] === "");
      }
      if (isText && node.attrs["data-pm-text"] === "rich") delete block.props.importedRichText;
      return block;
    };
    const row = (node: Node, depth: number): EmailBlock => {
      allocate();
      limit(depth <= 8, "row nesting exceeds 8 levels");
      requireValue(node.tag === "div");
      allowed(node, ["data-pm-row", "class", "style"]);
      requireValue(["stack", "two", "keep"].includes(node.attrs["data-pm-row"]!));
      const outer = styles(node, ["padding"]);
      requireValue(outer.padding !== undefined);
      outer.padding = intrinsicPadding(outer.padding === "0" ? "0px" : outer.padding);
      const table = only(node, "table");
      allowed(table, ["role", "cellpadding", "cellspacing", "style", "class"]);
      requireValue(table.attrs.class === undefined || table.attrs.class === "pm-intrinsic-table");
      requireValue(
        table.attrs.role === "presentation" &&
          table.attrs.cellpadding === "0" &&
          table.attrs.cellspacing === "0",
      );
      const tableStyles = styles(table, [
        "border-collapse",
        "border-spacing",
        "table-layout",
        "width",
        "max-width",
      ]);
      requireValue(["auto", "100%"].includes(tableStyles.width!));
      exact(tableStyles, {
        "border-collapse": "collapse",
        "border-spacing": "0",
        "table-layout": "auto",
        width: tableStyles.width!,
        "max-width": "100%",
      });
      const tbody = only(table, "tbody");
      allowed(tbody, []);
      const tr = only(tbody, "tr");
      allowed(tr, []);
      const cells = children(tr).map((cell): EmailBlock => {
        allocate();
        requireValue(cell.tag === "td");
        allowed(cell, ["data-pm-cell", "class", "style"]);
        requireValue(cell.attrs["data-pm-cell"] === "1");
        const cellStyles = styles(cell, ["padding", "vertical-align"]);
        requireValue(
          cellStyles.padding !== undefined &&
            ["top", "middle", "bottom"].includes(cellStyles["vertical-align"]!),
        );
        cellStyles.padding = intrinsicPadding(
          cellStyles.padding === "0" ? "0px" : cellStyles.padding,
        );
        return {
          type: "IntrinsicCell",
          props: {
            id: callbacks.id("intrinsic-cell"),
            padding: cellStyles.padding,
            verticalAlign: cellStyles["vertical-align"],
            ...(cell.attrs.class !== undefined
              ? { cssClass: userClasses(cell.attrs.class, ["pm-intrinsic-cell"]) }
              : {}),
            content: children(cell).map((child) =>
              child.attrs["data-pm-row"] !== undefined ? row(child, depth + 1) : leaf(child),
            ),
          },
        };
      });
      return {
        type: "IntrinsicRow",
        props: {
          id: callbacks.id("intrinsic-row"),
          padding: outer.padding,
          width: tableStyles.width,
          mobile: node.attrs["data-pm-row"],
          ...(node.attrs.class !== undefined
            ? {
                cssClass: userClasses(node.attrs.class, [
                  "pm-intrinsic-row",
                  `pm-intrinsic-${node.attrs["data-pm-row"]}`,
                ]),
              }
            : {}),
          cells,
        },
      };
    };
    return row(only(holder, "div"), 1);
  } catch (error) {
    if (error instanceof IntrinsicResourceError) throw error;
    return undefined;
  }
}
