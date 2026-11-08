import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { getNativeBaseAttributes } from "./native-base";
import { applyNativeAttributes, type NativeContext } from "./native-cascade";
import { nativeAttributeNames, normalizeMjClass, readNativeAttributes } from "./native-attributes";
import { importedRichText } from "./imported-content";
import { resolveImportedAttributes } from "./import-inheritance";
import { sanitizeEmailRichText } from "./richtext";
import type { EmailBlock, ExportOptions, MjmlElementOptions } from "./types";
import {
  assertIntrinsicSourceBounds,
  intrinsicSourceBytes,
  IntrinsicResourceError,
} from "./intrinsic-source";

export const INTRINSIC_LIMITS = {
  sourceBytes: 64 * 1024 * 1024,
  nodes: 256,
  rowDepth: 8,
  htmlTokens: 4096,
  htmlDepth: 64,
  scalarBytes: 64 * 1024,
  originBytes: 8 * 1024,
  encodedOriginBytes: 48 * 1024,
} as const;

export class IntrinsicLayoutLimitError extends IntrinsicResourceError {
  constructor(message: string) {
    super(message);
    this.name = "IntrinsicLayoutLimitError";
  }
}

export const INTRINSIC_WRAPPER_ATTRIBUTES: Record<string, string> = {
  padding: "0px",
  cellpadding: "0",
  cellspacing: "0",
  width: "100%",
  "table-layout": "auto",
  "font-size": "0px",
  "line-height": "0px",
};

export const textOuterStyles: Record<string, string> = {
  padding: "padding",
  "padding-top": "padding-top",
  "padding-right": "padding-right",
  "padding-bottom": "padding-bottom",
  "padding-left": "padding-left",
  "container-background-color": "background-color",
  align: "text-align",
  "vertical-align": "vertical-align",
};
export const textInnerStyles = [
  "color",
  "background-color",
  "font-family",
  "font-size",
  "font-style",
  "font-weight",
  "height",
  "letter-spacing",
  "line-height",
  "text-decoration",
  "text-transform",
];
export const imageOuterStyles: Record<string, string> = {
  padding: "padding",
  "padding-top": "padding-top",
  "padding-right": "padding-right",
  "padding-bottom": "padding-bottom",
  "padding-left": "padding-left",
  "container-background-color": "background-color",
  align: "text-align",
};
export const imageInnerStyles = [
  "border",
  "border-top",
  "border-right",
  "border-bottom",
  "border-left",
  "border-radius",
  "font-size",
  "height",
  "max-height",
  "width",
];
export const intrinsicImageAttributes = ["src", "alt", "title", "srcset", "sizes", "usemap"];
export const intrinsicLinkAttributes = ["href", "target", "rel", "name"];

type Values = Record<string, string | undefined>;
export type IntrinsicOptions = ExportOptions & {
  nativeContext: NativeContext;
  ancestorClasses?: string;
  /** Immutable owning props retain at most one validated asset, never history. */
  validationKey?: object;
};
type IntrinsicRenderOptions = IntrinsicOptions & { measurement?: { assetBytes: number } };
const validatedAssets = new WeakMap<object, { src: string; allowLocalImages: boolean }>();
export const intrinsicByteLength = intrinsicSourceBytes;
export const escapeIntrinsicAttribute = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!,
  );

export function intrinsicClasses(value: unknown): string {
  if (value === undefined || value === "") return "";
  if (
    typeof value !== "string" ||
    value.length > 1024 ||
    !/^[A-Za-z_][\w-]*(?: [A-Za-z_][\w-]*)*$/.test(value)
  )
    throw new Error("Intrinsic layout CSS class must contain valid class names");
  return value;
}

export function intrinsicPadding(value: unknown): string {
  const padding = value === undefined ? "0px" : value;
  if (
    typeof padding !== "string" ||
    padding.length > 128 ||
    !/^\d+(?:\.\d+)?(?:px|%)(?:\s+\d+(?:\.\d+)?(?:px|%)){0,3}$/.test(padding)
  )
    throw new Error("Intrinsic layout padding must use nonnegative px or % values");
  return padding;
}

export function intrinsicRowValues(props: Record<string, unknown>) {
  const mobile = props.mobile ?? "stack",
    width = props.width ?? "100%";
  if (!["stack", "two", "keep"].includes(String(mobile)))
    throw new Error("Invalid intrinsic mobile column count");
  if (width !== "100%" && width !== "auto")
    throw new Error("Intrinsic row width must be 100% or auto");
  return {
    padding: intrinsicPadding(props.padding),
    width,
    mobile: String(mobile),
    cssClass: intrinsicClasses(props.cssClass),
  };
}

export function intrinsicCellValues(props: Record<string, unknown>) {
  const verticalAlign = props.verticalAlign ?? "top";
  if (!["top", "middle", "bottom"].includes(String(verticalAlign)))
    throw new Error("Invalid intrinsic cell vertical alignment");
  return {
    padding: intrinsicPadding(props.padding),
    verticalAlign: String(verticalAlign),
    cssClass: intrinsicClasses(props.cssClass),
  };
}

const styleMap = (attributes: Values, mapping: Record<string, string>): Values =>
  Object.fromEntries(
    Object.entries(mapping).flatMap(([native, css]) =>
      attributes[native] === undefined ? [] : [[css, attributes[native]]],
    ),
  );
const pick = (attributes: Values, names: string[]): Values =>
  Object.fromEntries(
    names.flatMap((name) => (attributes[name] === undefined ? [] : [[name, attributes[name]]])),
  );

/** CSS key order is intentional: shorthand first, physical sides afterward. */
export function intrinsicLeafPresentation(tag: "mj-text" | "mj-image", attributes: Values) {
  const text = tag === "mj-text";
  const outer = styleMap(attributes, text ? textOuterStyles : imageOuterStyles);
  const inner = pick(attributes, text ? textInnerStyles : imageInnerStyles);
  if (!text) {
    Object.assign(outer, { "font-size": "0", "line-height": "0" });
    Object.assign(inner, {
      display: "block",
      "box-sizing": "content-box",
      width: attributes.width ?? "100%",
      "max-width": "100%",
    });
  }
  const image = text ? {} : pick(attributes, intrinsicImageAttributes);
  if (!text && attributes.width) image.width = String(Number.parseFloat(attributes.width));
  const link = text ? {} : pick(attributes, intrinsicLinkAttributes);
  const visible = pick(attributes, [
    ...Object.keys(text ? textOuterStyles : imageOuterStyles),
    ...(text ? textInnerStyles : imageInnerStyles),
    ...(text ? [] : [...intrinsicImageAttributes, ...intrinsicLinkAttributes, "fluid-on-mobile"]),
    "css-class",
  ]);
  return { outer, inner, image, link, visible };
}

const allowedOriginFields = (tag: "mj-text" | "mj-image") =>
  new Set([
    ...Object.keys(tag === "mj-text" ? textOuterStyles : imageOuterStyles),
    ...(tag === "mj-text" ? textInnerStyles : imageInnerStyles),
    ...(tag === "mj-image"
      ? [...intrinsicImageAttributes, ...intrinsicLinkAttributes, "fluid-on-mobile"]
      : []),
    "css-class",
  ]);
function binding(tag: string, name: string, value: string | undefined) {
  return bytesToHex(
    sha256(
      new TextEncoder().encode(
        JSON.stringify(["puck-mjml/intrinsic-origin/v1", tag, name, value ?? null]),
      ),
    ),
  );
}

export function createIntrinsicOrigin(
  tag: "mj-text" | "mj-image",
  props: Record<string, unknown>,
  local: Values,
  visible: Values,
  measureOnly = false,
): string | undefined {
  const inherit = [...allowedOriginFields(tag)]
    .filter((name) => local[name] === undefined)
    .sort()
    .map((name) => [name, measureOnly ? "0".repeat(64) : binding(tag, name, visible[name])]);
  const mjClass = props.mjClass === undefined ? undefined : (normalizeMjClass(props.mjClass) ?? "");
  if (mjClass !== undefined && Array.from(mjClass).length > 512)
    throw new Error("Invalid intrinsic MJML classes");
  if (!inherit.length && mjClass === undefined) return undefined;
  const result = JSON.stringify({
    v: 1,
    ...(mjClass === undefined ? {} : { mjClass }),
    ...(inherit.length ? { inherit } : {}),
  });
  if (intrinsicByteLength(result) > INTRINSIC_LIMITS.originBytes)
    throw new IntrinsicLayoutLimitError("origin hint exceeds 8 KiB");
  return result;
}

export function readIntrinsicOrigin(
  source: string | undefined,
  tag: "mj-text" | "mj-image",
  visible: Values,
): { mjClass?: string; inherit: string[]; missing?: string[] } {
  if (source === undefined) return { inherit: [] };
  if (intrinsicByteLength(source) > INTRINSIC_LIMITS.originBytes)
    throw new IntrinsicLayoutLimitError("origin hint exceeds 8 KiB");
  const value: unknown = JSON.parse(source);
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid intrinsic origin hint");
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).some((key) => !["v", "mjClass", "inherit"].includes(key)) ||
    record.v !== 1
  )
    throw new Error("Unsupported intrinsic origin hint");
  let mjClass: string | undefined;
  if (Object.hasOwn(record, "mjClass")) {
    if (typeof record.mjClass !== "string" || Array.from(record.mjClass).length > 512)
      throw new Error("Invalid intrinsic MJML classes");
    mjClass = normalizeMjClass(record.mjClass) ?? "";
    if (mjClass !== record.mjClass) throw new Error("Intrinsic MJML classes must be canonical");
  }
  const entries: [string, string][] = [];
  const allowed = allowedOriginFields(tag),
    seen = new Set<string>();
  if (Object.hasOwn(record, "inherit")) {
    if (!Array.isArray(record.inherit) || record.inherit.length > 40)
      throw new Error("Invalid intrinsic inheritance list");
    for (const entry of record.inherit) {
      if (
        !Array.isArray(entry) ||
        entry.length !== 2 ||
        typeof entry[0] !== "string" ||
        !allowed.has(entry[0]) ||
        seen.has(entry[0]) ||
        typeof entry[1] !== "string" ||
        !/^[a-f0-9]{64}$/.test(entry[1])
      )
        throw new Error("Invalid intrinsic inheritance binding");
      seen.add(entry[0]);
      entries.push([entry[0], entry[1]]);
    }
  }
  // ASCII native names use lexical order, not locale punctuation ordering.
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const canonical = {
    v: 1,
    ...(mjClass === undefined ? {} : { mjClass }),
    ...(Object.hasOwn(record, "inherit") ? { inherit: entries } : {}),
  };
  if (JSON.stringify(canonical) !== source)
    throw new Error("Intrinsic origin hint must use canonical JSON");
  return {
    ...(mjClass === undefined ? {} : { mjClass }),
    inherit: entries
      .filter(([name, digest]) => binding(tag, name, visible[name]) === digest)
      .map(([name]) => name),
    missing: entries
      .filter(
        ([name, digest]) => visible[name] === undefined && binding(tag, name, undefined) !== digest,
      )
      .map(([name]) => name),
  };
}

export function resolveIntrinsicLeaf(block: EmailBlock, options: IntrinsicOptions) {
  const tag = block.type === "Text" ? "mj-text" : block.type === "Image" ? "mj-image" : undefined;
  if (!tag) throw new Error(`Unsupported intrinsic content block: ${block.type}`);
  if (
    block.props.htmlContent !== undefined ||
    (Array.isArray(block.props.mjmlAttributes) &&
      block.props.mjmlAttributes.some((entry) => entry?.template))
  )
    throw new Error("Intrinsic layouts do not accept trusted HTML or template attributes");
  const key = options.validationKey ?? block.props;
  const cached = validatedAssets.get(key);
  let props = block.props;
  let restoreSource = false;
  if (
    tag === "mj-image" &&
    cached?.src.startsWith("data:") &&
    cached.allowLocalImages === true &&
    options.allowLocalImages === true
  ) {
    // Resolve visual-edit release before substituting only the previously
    // validated immutable raster value. All names, flags and other values
    // still pass the native reader; later src edits retain their precedence.
    const entries = resolveImportedAttributes(props);
    if (Array.isArray(entries)) {
      const measured = entries.map((entry) => {
        if (
          !entry ||
          typeof entry !== "object" ||
          Array.isArray(entry) ||
          !Object.hasOwn(entry, "name") ||
          typeof entry.name !== "string" ||
          entry.name.trim() !== "src"
        )
          return entry;
        if (Object.hasOwn(entry, "inherit") && entry.inherit === true) restoreSource = false;
        else if (Object.hasOwn(entry, "value") && entry.value !== undefined) {
          restoreSource = entry.value === cached.src;
          if (restoreSource)
            return { ...entry, value: "https://example.invalid/validated-raster.png" };
        }
        return entry;
      });
      props = { ...props, mjmlAttributes: measured };
    }
  }
  const context = {
    ...options.nativeContext,
    allowRawHtml: false,
    allowLocalImages: options.allowLocalImages === true,
  };
  const result = applyNativeAttributes(
    tag,
    props as MjmlElementOptions,
    getNativeBaseAttributes(tag, block.props, {
      nativeEnabled: true,
      // Native-enabled bases preserve raw URLs; validate the resolved source
      // below once, including local-image policy, rather than decoding twice.
      allowLocalImages: false,
    }),
    context,
    options.ancestorClasses,
  );
  if (restoreSource) {
    result.attributes.src = cached!.src;
    result.effective.src = cached!.src;
  }
  const supported = new Set(nativeAttributeNames(tag));
  for (const [name, value] of Object.entries(result.effective)) {
    if (!supported.has(name) || typeof value !== "string") continue;
    if (name !== "src" && intrinsicByteLength(value) > INTRINSIC_LIMITS.scalarBytes)
      throw new IntrinsicLayoutLimitError("resolved native values must not exceed 64 KiB");
  }
  const source = typeof result.effective.src === "string" ? result.effective.src : undefined;
  const reuseSource =
    tag === "mj-image" &&
    source !== undefined &&
    cached?.src === source &&
    cached.allowLocalImages === (options.allowLocalImages === true);
  const attributes = readNativeAttributes(
    tag,
    Object.entries(result.effective)
      .filter(
        ([name, value]) =>
          supported.has(name) && value !== undefined && !(name === "src" && reuseSource),
      )
      .map(([name, value]) => ({ name, value: String(value) })),
    { allowRawHtml: false, allowLocalImages: options.allowLocalImages },
  );
  const safe = Object.fromEntries(
    Object.entries(attributes).filter(([, value]) => value !== null),
  ) as Values;
  if (reuseSource) safe.src = source;
  if (tag === "mj-image" && !safe.src)
    throw new Error("Intrinsic image source must be a valid image URL");
  if (tag === "mj-image" && safe.src)
    validatedAssets.set(key, {
      src: safe.src,
      allowLocalImages: options.allowLocalImages === true,
    });
  return {
    tag: tag as "mj-text" | "mj-image",
    attributes: safe,
    local: Object.fromEntries(
      Object.entries(result.attributes).map(([name, value]) => [
        name,
        value === undefined ? undefined : String(value),
      ]),
    ),
  };
}

const attrs = (values: Values) =>
  Object.entries(values)
    .filter(([, value]) => value !== undefined)
    .map(([name, value]) => ` ${name}="${escapeIntrinsicAttribute(value!)}"`)
    .join("");
export const intrinsicStyleText = (values: Values) =>
  Object.entries(values)
    .filter(([, value]) => value !== undefined)
    .map(([name, value]) => `${name}:${value}`)
    .join(";");
const style = (values: Values) => attrs({ style: intrinsicStyleText(values) });
const classes = (...values: (string | undefined)[]) => values.filter(Boolean).join(" ");

function children(value: unknown, label: string): EmailBlock[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value.map((block) => {
    if (
      !block ||
      typeof block !== "object" ||
      typeof block.type !== "string" ||
      !block.props ||
      typeof block.props !== "object" ||
      Array.isArray(block.props)
    )
      throw new Error(`${label} contains an invalid block`);
    return block;
  });
}

/** Cheap structural status, without hashing, decoding assets, or serializing subtrees. */
export function validateIntrinsicStructure(block: EmailBlock): void {
  let nodes = 0,
    bytes = 0;
  const seen = new Set<object>();
  const visit = (item: EmailBlock, depth: number, expected?: string) => {
    if (seen.has(item)) throw new Error("Intrinsic layouts cannot contain cyclic or shared blocks");
    seen.add(item);
    if (++nodes > INTRINSIC_LIMITS.nodes)
      throw new IntrinsicLayoutLimitError("at most 256 blocks per row");
    if (depth > INTRINSIC_LIMITS.rowDepth)
      throw new IntrinsicLayoutLimitError("at most 8 nested rows");
    if (expected && item.type !== expected)
      throw new Error(`Intrinsic rows accept only ${expected} blocks`);
    for (const [name, value] of Object.entries(item.props)) {
      if (typeof value !== "string") continue;
      // Base64 raster data is ASCII. Counting it must not allocate another
      // multi-megabyte UTF-8 buffer on each adjacent text edit.
      const size =
        name === "src" && value.startsWith("data:image/")
          ? value.length
          : intrinsicByteLength(value);
      bytes += size;
      if (name !== "src" && size > INTRINSIC_LIMITS.scalarBytes)
        throw new IntrinsicLayoutLimitError("text and ordinary values must not exceed 64 KiB");
      if (bytes > INTRINSIC_LIMITS.sourceBytes)
        throw new IntrinsicLayoutLimitError("row source must not exceed 64 MiB");
    }
    if (item.props.htmlContent !== undefined)
      throw new Error("Intrinsic layouts do not accept trusted HTML");
    if (item.type === "IntrinsicRow") {
      intrinsicRowValues(item.props);
      for (const cell of children(item.props.cells ?? [], "Intrinsic cells"))
        visit(cell, depth, "IntrinsicCell");
    } else if (item.type === "IntrinsicCell") {
      intrinsicCellValues(item.props);
      for (const child of children(item.props.content ?? [], "Intrinsic cell content")) {
        if (!["Text", "Image", "IntrinsicRow"].includes(child.type))
          throw new Error(`Unsupported intrinsic content block: ${child.type}`);
        visit(child, depth + (child.type === "IntrinsicRow" ? 1 : 0));
      }
    } else if (item.type !== "Text" && item.type !== "Image")
      throw new Error(`Unsupported intrinsic block: ${item.type}`);
  };
  if (block.type !== "IntrinsicRow") throw new Error("Intrinsic layout must start with a row");
  visit(block, 1);
}

function renderLeaf(block: EmailBlock, options: IntrinsicRenderOptions): string {
  if (block.type === "Text") {
    for (const value of [
      block.props.content,
      block.props.importedRichText?.source,
      block.props.importedRichText?.baseline,
    ])
      if (typeof value === "string") {
        if (intrinsicByteLength(value) > INTRINSIC_LIMITS.scalarBytes)
          throw new IntrinsicLayoutLimitError("text source and baseline must not exceed 64 KiB");
        assertIntrinsicSourceBounds(value);
      }
  }
  const { tag, attributes: a, local } = resolveIntrinsicLeaf(block, options);
  const p = intrinsicLeafPresentation(tag, a);
  const origin = createIntrinsicOrigin(
    tag,
    block.props,
    local,
    p.visible,
    Boolean(options.measurement),
  );
  if (tag === "mj-text") {
    const imported = importedRichText(block.props);
    const mode = imported === undefined ? "rich" : "native";
    return `<div${attrs({ "data-pm-text": mode, "data-pm-origin": origin, class: classes("pm-intrinsic-text", mode === "rich" ? "pm-email-text" : undefined, a["css-class"]) })}${style(p.outer)}><div${style(p.inner)}>${imported ?? sanitizeEmailRichText(block.props.content)}</div></div>`;
  }
  if (options.measurement && p.image.src?.startsWith("data:")) {
    // Validated raster data is ASCII without HTML delimiters. A short stand-in
    // preserves grammar checks while counting the real asset without copying,
    // decoding or hashing it again during adjacent text edits.
    const placeholder = "https://example.invalid/asset.png";
    options.measurement.assetBytes += p.image.src.length - placeholder.length;
    p.image.src = placeholder;
    if (options.measurement.assetBytes > INTRINSIC_LIMITS.sourceBytes)
      throw new IntrinsicLayoutLimitError("row source must not exceed 64 MiB");
  }
  return `<div${attrs({ "data-pm-image": "1", "data-pm-origin": origin, "data-pm-fluid": a["fluid-on-mobile"], class: classes("pm-intrinsic-image", a["fluid-on-mobile"] === "true" ? "pm-intrinsic-fluid" : undefined, a["css-class"]) })}${style(p.outer)}><a${attrs(p.link)} style="display:block"><img${attrs(p.image)}${style(p.inner)} /></a></div>`;
}

function renderRow(block: EmailBlock, options: IntrinsicRenderOptions): string {
  const row = intrinsicRowValues(block.props);
  const cells = children(block.props.cells ?? [], "Intrinsic cells")
    .map((cell) => {
      const c = intrinsicCellValues(cell.props);
      return `<td data-pm-cell="1"${attrs({ class: classes("pm-intrinsic-cell", c.cssClass) })}${style({ padding: c.padding, "vertical-align": c.verticalAlign })}>${children(
        cell.props.content ?? [],
        "Intrinsic cell content",
      )
        .map((child) =>
          child.type === "IntrinsicRow" ? renderRow(child, options) : renderLeaf(child, options),
        )
        .join("")}</td>`;
    })
    .join("");
  return `<div${attrs({ "data-pm-row": row.mobile, class: classes("pm-intrinsic-row", `pm-intrinsic-${row.mobile}`, row.cssClass) })}${style({ padding: row.padding })}><table role="presentation" cellpadding="0" cellspacing="0" class="pm-intrinsic-table"${style({ "border-collapse": "collapse", "border-spacing": "0", "table-layout": "auto", width: row.width, "max-width": "100%" })}><tbody><tr>${cells}</tr></tbody></table></div>`;
}

export const wrapIntrinsicContent = (html: string) =>
  `<mj-table${attrs(INTRINSIC_WRAPPER_ATTRIBUTES)}>${html}</mj-table>`;

export function renderIntrinsicContent(block: EmailBlock, options: IntrinsicOptions): string {
  validateIntrinsicStructure(block);
  const html = `<tr data-pm-layout="1"><td style="padding:0">${renderRow(block, options)}</td></tr>`;
  const source = wrapIntrinsicContent(html);
  if (intrinsicByteLength(source) > INTRINSIC_LIMITS.sourceBytes)
    throw new IntrinsicLayoutLimitError("row source must not exceed 64 MiB");
  assertIntrinsicSourceBounds(source);
  return html;
}

/** Exact serialized size/grammar check with bounded asset stand-ins. Hints use
 * fixed-length zero digests here; actual export/import computes their hashes. */
export function validateIntrinsicContent(block: EmailBlock, options: IntrinsicOptions): void {
  validateIntrinsicStructure(block);
  const measurement = { assetBytes: 0 };
  const html = `<tr data-pm-layout="1"><td style="padding:0">${renderRow(block, { ...options, measurement })}</td></tr>`;
  const source = wrapIntrinsicContent(html);
  if (intrinsicByteLength(source) + measurement.assetBytes > INTRINSIC_LIMITS.sourceBytes)
    throw new IntrinsicLayoutLimitError("row source must not exceed 64 MiB");
  assertIntrinsicSourceBounds(source);
}

/** The compiler and canvas use the document's actual breakpoint. */
export function intrinsicResponsiveCss(breakpoint: string, scope = "") {
  const p = scope ? `.${scope} ` : "";
  // mj-breakpoint accepts px only; MJML truncates then subtracts one pixel.
  if (!/^\d+(?:\.\d+)?px$/.test(breakpoint)) throw new Error("Intrinsic breakpoint must use px");
  const maximum = Math.max(0, Number.parseInt(breakpoint, 10) - 1);
  return `/* puck-mjml:intrinsic-layout:v1 */\n@media only screen and (max-width:${maximum}px) {\n${p}.pm-intrinsic-stack > .pm-intrinsic-table, ${p}.pm-intrinsic-stack > .pm-intrinsic-table > tbody, ${p}.pm-intrinsic-stack > .pm-intrinsic-table > tbody > tr { display:block!important; width:100%!important; }\n${p}.pm-intrinsic-stack > .pm-intrinsic-table > .pm-intrinsic-cell, ${p}.pm-intrinsic-stack > .pm-intrinsic-table > tbody > tr > .pm-intrinsic-cell { display:block!important; width:100%!important; box-sizing:border-box; }\n${p}.pm-intrinsic-two > .pm-intrinsic-table, ${p}.pm-intrinsic-two > .pm-intrinsic-table > tbody, ${p}.pm-intrinsic-two > .pm-intrinsic-table > tbody > tr { display:block!important; width:100%!important; font-size:0; }\n${p}.pm-intrinsic-two > .pm-intrinsic-table > .pm-intrinsic-cell, ${p}.pm-intrinsic-two > .pm-intrinsic-table > tbody > tr > .pm-intrinsic-cell { display:inline-block!important; width:50%!important; box-sizing:border-box; }\n${p}.pm-intrinsic-fluid img { width:100%!important; }\n}`;
}

/** Only a complete unchanged generated sheet is replaceable. Authored CSS,
 * including a modified copy of these rules, stays in its original order. */
export function isIntrinsicResponsiveCss(value: string): boolean {
  const match =
    /^\/\* puck-mjml:intrinsic-layout:v1 \*\/\n@media only screen and \(max-width:(\d+)px\)/.exec(
      value.trim(),
    );
  const width = match ? Number(match[1]) + 1 : NaN;
  return Boolean(
    match &&
    Number.isSafeInteger(width) &&
    width > 0 &&
    value.trim() === intrinsicResponsiveCss(`${width}px`).trim(),
  );
}
