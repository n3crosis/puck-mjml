import * as cheerio from "cheerio";
import { parseIntrinsicMarkup, preflightIntrinsicSource } from "./intrinsic-import";
import { createNativeContext, type NativeContext } from "./native-cascade";
import { resolveIntrinsicLeaf, intrinsicLeafPresentation } from "./intrinsic-layout";
import { isLocalImageSource } from "./image-upload";
import type { Element, Text } from "domhandler";
import { normalizeMjClass, nativeCatalog, readNativeAttributes } from "./native-attributes";
import { captureImportedAttributeBaselines } from "./import-inheritance";
import {
  captureImportedAttributeSource,
  decodeImportedAttribute,
} from "./imported-attribute-source";
import { trustedEndingContent } from "./ending-content";
import { getNativeBaseAttributes } from "./native-base";
import { sanitizeEmailRichText, sanitizeEmailTableContent } from "./richtext";
import { hasSourceWhitespaceStyles, normalizeImportedWhitespace } from "./imported-whitespace";
import { renderTableContent } from "./table";
import type {
  EmailBlock,
  EmailDocument,
  EmailSettings,
  MjmlAttribute,
  MjmlClassDefinition,
  MjmlComponentDefaults,
} from "./types";

export interface ImportOptions {
  /** Explicitly preserve bounded raster data URLs in mj-image src. Disabled by default. */
  allowLocalImages?: boolean;
}

export interface ImportedEmail {
  document: EmailDocument;
  /** Human-readable notes about content the document model cannot represent. */
  warnings: string[];
}

const INVALID = Symbol("invalid");
type Parser = (value: string) => unknown | typeof INVALID;
type AttrSpec = Record<string, readonly [prop: string, parse: Parser]>;

const hexColor: Parser = (value) =>
  /^#(?:[\dA-Fa-f]{3}|[\dA-Fa-f]{6})$/.test(value.trim()) ? value.trim() : INVALID;
const colorOrTransparent: Parser = (value) => {
  const trimmed = value.trim().toLowerCase();
  if (trimmed === "transparent") return trimmed;
  return hexColor(value);
};
const spacing: Parser = (value) => {
  const trimmed = value.trim();
  const normalized = trimmed === "0" ? "0px" : trimmed;
  return /^\d+(?:\.\d+)?(?:px|%)(?:\s+\d+(?:\.\d+)?(?:px|%)){0,3}$/.test(normalized)
    ? normalized
    : INVALID;
};
const borderStyle: Parser = (value) =>
  /^(?:none|0|0px|\d+(?:\.\d+)?px\s+(?:solid|dashed|dotted|double|groove|ridge|inset|outset)\s+(?:#[\dA-Fa-f]{3}(?:[\dA-Fa-f]{3})?|transparent))$/.test(
    value.trim(),
  )
    ? value.trim()
    : INVALID;
const pxNumber =
  (min: number, max: number): Parser =>
  (value) => {
    const match =
      /^(-?\d+(?:\.\d+)?)px$/.exec(value.trim()) ?? /^(-?\d+(?:\.\d+)?)$/.exec(value.trim());
    if (!match) return INVALID;
    const parsed = Number.parseFloat(match[1]!);
    return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : INVALID;
  };
const percentNumber =
  (min: number, max: number): Parser =>
  (value) => {
    const match = /^(\d+(?:\.\d+)?)%$/.exec(value.trim());
    if (!match) return INVALID;
    const parsed = Number.parseFloat(match[1]!);
    return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : INVALID;
  };
const multiplier =
  (min: number, max: number): Parser =>
  (value) => {
    const match = /^(\d+(?:\.\d+)?)$/.exec(value.trim());
    if (!match) return INVALID;
    const parsed = Number.parseFloat(match[1]!);
    return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : INVALID;
  };
const letterSpacing: Parser = (value) => {
  const match = /^(-?\d+(?:\.\d+)?)px$/.exec(value.trim());
  if (!match) return INVALID;
  const parsed = Number.parseFloat(match[1]!);
  return parsed >= -10 && parsed <= 20 ? parsed : INVALID;
};
const enumValue =
  (...values: string[]): Parser =>
  (value) =>
    values.includes(value.trim()) ? value.trim() : INVALID;
const fontFamily: Parser = (value) =>
  /^[\p{L}\p{N} ,'"_-]{1,160}$/u.test(value.trim()) ? value.trim() : INVALID;
const cssClassName: Parser = (value) =>
  /^[A-Za-z_][\w-]*(?: [A-Za-z_][\w-]*)*$/.test(value.trim()) ? value.trim() : INVALID;
const url =
  (contact: boolean): Parser =>
  (value) => {
    if (
      Array.from(value).some((character) => {
        const code = character.charCodeAt(0);
        return code < 32 || (code >= 127 && code <= 159);
      })
    )
      return INVALID;
    const trimmed = value.trim();
    const schemes = contact ? ["http:", "https:", "mailto:", "tel:"] : ["http:", "https:"];
    try {
      const parsed = new URL(trimmed);
      if (!schemes.includes(parsed.protocol) || parsed.username || parsed.password) return INVALID;
      return parsed.href;
    } catch {
      return INVALID;
    }
  };
const plainText: Parser = (value) => value;
const tableLineHeight: Parser = (value) =>
  /^\d+(?:\.\d+)?(?:px|%)?$/.test(value.trim()) ? value.trim() : INVALID;
const tableWidth: Parser = (value) =>
  /^(?:auto|\d+(?:\.\d+)?(?:px|%))$/.test(value.trim()) ? value.trim() : INVALID;

const socialNetworks = new Set([
  "facebook",
  "x",
  "instagram",
  "linkedin",
  "youtube",
  "github",
  "web",
]);
const socialNetwork: Parser = (value) => {
  const trimmed = value.trim();
  if (socialNetworks.has(trimmed)) return trimmed;
  // The exporter appends -noshare to networks that inject share links.
  const base = trimmed.replace(/-noshare$/, "");
  if (base !== trimmed && ["facebook", "x", "linkedin"].includes(base)) return base;
  return INVALID;
};

const SECTION_ATTRS: AttrSpec = {
  "background-color": ["backgroundColor", hexColor],
  padding: ["padding", spacing],
  border: ["border", borderStyle],
  "border-radius": ["borderRadius", spacing],
  "css-class": ["cssClass", cssClassName],
};
const COLUMN_ATTRS: AttrSpec = {
  width: ["width", percentNumber(1, 100)],
  padding: ["padding", spacing],
  "vertical-align": ["verticalAlign", enumValue("top", "middle", "bottom")],
  "css-class": ["cssClass", cssClassName],
};
const GROUP_ATTRS: AttrSpec = {
  width: ["width", percentNumber(1, 100)],
  "css-class": ["cssClass", cssClassName],
};
const TYPOGRAPHY_ATTRS: Record<string, readonly [prop: string, parse: Parser]> = {
  "font-family": ["fontFamily", fontFamily],
  "font-weight": ["fontWeight", pxNumber(100, 900)],
  "line-height": ["lineHeight", multiplier(0.5, 4)],
  "letter-spacing": ["letterSpacing", letterSpacing],
};
const TEXT_ATTRS: AttrSpec = {
  color: ["color", hexColor],
  "font-size": ["fontSize", pxNumber(8, 72)],
  ...TYPOGRAPHY_ATTRS,
  align: ["align", enumValue("left", "center", "right", "justify")],
  padding: ["padding", spacing],
  "css-class": ["cssClass", cssClassName],
};
const IMAGE_ATTRS: AttrSpec = {
  src: ["src", url(false)],
  alt: ["alt", plainText],
  width: ["width", pxNumber(1, 1200)],
  align: ["align", enumValue("left", "center", "right")],
  padding: ["padding", spacing],
  href: ["href", url(true)],
  "border-radius": ["borderRadius", spacing],
  "css-class": ["cssClass", cssClassName],
};
const BUTTON_ATTRS: AttrSpec = {
  href: ["href", url(true)],
  "background-color": ["backgroundColor", hexColor],
  color: ["color", hexColor],
  "font-size": ["fontSize", pxNumber(8, 72)],
  ...TYPOGRAPHY_ATTRS,
  "inner-padding": ["innerPadding", spacing],
  "border-radius": ["borderRadius", spacing],
  align: ["align", enumValue("left", "center", "right")],
  padding: ["padding", spacing],
  "css-class": ["cssClass", cssClassName],
};
const SPACER_ATTRS: AttrSpec = { height: ["height", pxNumber(1, 500)] };
const DIVIDER_ATTRS: AttrSpec = {
  "border-color": ["color", hexColor],
  "border-width": ["thickness", pxNumber(1, 20)],
  width: ["width", percentNumber(1, 100)],
  padding: ["padding", spacing],
};
const SOCIAL_ATTRS: AttrSpec = {
  align: ["align", enumValue("left", "center", "right")],
  padding: ["padding", spacing],
  "icon-size": ["iconSize", pxNumber(1, 200)],
  "icon-padding": ["iconPadding", spacing],
  "border-radius": ["borderRadius", spacing],
};
const SOCIAL_ELEMENT_ATTRS: AttrSpec = {
  name: ["name", socialNetwork],
  href: ["href", url(true)],
  src: ["src", url(false)],
  alt: ["alt", plainText],
  "background-color": ["backgroundColor", colorOrTransparent],
  padding: ["padding", spacing],
};
const NAVBAR_ATTRS: AttrSpec = { align: ["align", enumValue("left", "center", "right")] };
const NAVBAR_LINK_ATTRS: AttrSpec = { href: ["href", url(true)] };
const HERO_ATTRS: AttrSpec = {
  mode: ["mode", enumValue("fluid-height", "fixed-height")],
  "background-url": ["backgroundUrl", url(false)],
  "background-color": ["backgroundColor", hexColor],
  "background-width": ["backgroundWidth", pxNumber(1, 2000)],
  "background-height": ["backgroundHeight", pxNumber(1, 2000)],
  height: ["height", pxNumber(1, 2000)],
  padding: ["padding", spacing],
};
const CAROUSEL_ATTRS: AttrSpec = {
  align: ["align", enumValue("left", "center", "right")],
  thumbnails: ["thumbnails", enumValue("hidden", "visible", "supported")],
};
const CAROUSEL_IMAGE_ATTRS: AttrSpec = {
  src: ["src", url(false)],
  alt: ["alt", plainText],
  href: ["href", url(true)],
};
const TABLE_ATTRS: AttrSpec = {
  color: ["color", hexColor],
  "font-family": ["fontFamily", fontFamily],
  "font-size": ["fontSize", pxNumber(1, 200)],
  "line-height": ["lineHeight", tableLineHeight],
  align: ["align", enumValue("left", "center", "right")],
  width: ["width", tableWidth],
  cellpadding: ["cellpadding", pxNumber(0, 1000)],
  cellspacing: ["cellspacing", pxNumber(0, 1000)],
  "container-background-color": ["containerBackgroundColor", hexColor],
  "css-class": ["cssClass", cssClassName],
};
const BODY_ATTRS: AttrSpec = {
  width: ["width", pxNumber(320, 1000)],
  "background-color": ["backgroundColor", hexColor],
};

/** Parsed source element: tag, attributes, and children in document order. */
interface SourceElement {
  tag: string;
  attributes: Record<string, string>;
  attributeSources?: Record<string, string>;
  ancestorClasses?: string;
  children: SourceElement[];
  textContent: string;
  innerHtml: string;
}

class Importer {
  constructor(
    readonly options: ImportOptions = {},
    readonly preserveSourceWhitespace = false,
  ) {}

  readonly warnings: string[] = [];
  intrinsicSource = new Map<string, boolean>();
  intrinsicSettings: Partial<EmailSettings> = {};
  private readonly ids = new Set<string>();
  private readonly counters: Record<string, number> = {};

  warn(message: string) {
    this.warnings.push(message);
  }

  id(prefix: string): string {
    this.counters[prefix] = (this.counters[prefix] ?? 0) + 1;
    let id = `${prefix}-${this.counters[prefix]}`;
    while (this.ids.has(id)) {
      this.counters[prefix] += 1;
      id = `${prefix}-${this.counters[prefix]}`;
    }
    this.ids.add(id);
    return id;
  }

  /**
   * Split one element's attributes into visual block props and validated native
   * attribute entries. Values the visual fields reject fall back to the native
   * cascade (which is more permissive, for example rgb() colors); anything the
   * native layer also rejects is dropped with a warning.
   */
  attributes(tag: string, element: SourceElement, spec: AttrSpec): Record<string, unknown> {
    const props: Record<string, unknown> = {};
    const native: MjmlAttribute[] = [];
    for (const [name, rawValue] of Object.entries(element.attributes)) {
      const value = rawValue.trim();
      if (!value) {
        if (name === "mj-class") props.mjClass = "";
        else if (this.pushNative(tag, native, name, rawValue)) continue;
        else if (this.knownAttribute(tag, name)) {
          native.push({ name, value: rawValue, template: true, source: "import" });
          this.warn(`Empty ${name} on ${tag} preserved; compiling it requires allowRawHtml: true.`);
        } else this.warn(`Dropped unsupported attribute ${name}="${rawValue}" on ${tag}.`);
        continue;
      }
      if (name === "mj-class") {
        try {
          const normalized = normalizeMjClass(value);
          if (normalized) props.mjClass = normalized;
        } catch {
          this.warn(`Dropped invalid mj-class "${value}" on ${tag}.`);
        }
        continue;
      }
      const visual = Object.hasOwn(spec, name) ? spec[name] : undefined;
      if (visual) {
        const parsed =
          this.options.allowLocalImages === true &&
          tag === "mj-image" &&
          name === "src" &&
          isLocalImageSource(value)
            ? value
            : visual[1](value);
        if (parsed !== INVALID) {
          props[visual[0]] = parsed;
          // A visual parser can accept values that its serializer rounds or
          // narrows (for example percentage social radii or fractional table
          // spacing). Keep their native value until that visual field is edited.
          const generated = getNativeBaseAttributes(tag, props, { nativeEnabled: true })[name];
          if (String(generated) !== rawValue || element.attributeSources?.[name]?.includes("&"))
            this.pushNative(tag, native, name, rawValue);
          continue;
        }
      }
      if (this.pushNative(tag, native, name, rawValue)) continue;
      this.warn(`Dropped unsupported attribute ${name}="${rawValue}" on ${tag}.`);
    }
    // Imported omissions mean native inheritance, not the editor's visual defaults.
    for (const name of Object.keys(getNativeBaseAttributes(tag, props, { nativeEnabled: true }))) {
      if (!Object.hasOwn(element.attributes, name))
        native.push({ name, inherit: true, source: "import" });
    }
    if (
      tag === "mj-social-element" &&
      element.attributes.name &&
      !native.some((entry) => entry.name === "name")
    )
      this.pushNative(tag, native, "name", element.attributes.name);
    for (const entry of native)
      captureImportedAttributeSource(entry, element.attributeSources?.[entry.name]);
    if (native.length) props.mjmlAttributes = native;
    return props;
  }

  knownAttribute(tag: string, name: string): boolean {
    return (
      name === "css-class" ||
      (Object.hasOwn(nativeCatalog, tag) &&
        Object.hasOwn(nativeCatalog[tag].allowedAttributes, name))
    );
  }

  private pushNative(tag: string, native: MjmlAttribute[], name: string, value: string): boolean {
    if (!this.knownAttribute(tag, name)) return false;
    try {
      readNativeAttributes(tag, [{ name, value }], this.options);
      native.push({ name, value, source: "import" });
      return true;
    } catch {
      return false;
    }
  }
}

/** Elements whose text children are structural noise rather than content. */
const STRUCTURAL_TAGS = new Set([
  "mjml",
  "mj-head",
  "mj-body",
  "mj-attributes",
  "mj-html-attributes",
  "mj-selector",
  "mj-wrapper",
  "mj-section",
  "mj-column",
  "mj-group",
  "mj-hero",
  "mj-social",
  "mj-navbar",
  "mj-accordion",
  "mj-accordion-element",
  "mj-carousel",
]);

function sourceAttribute(tag: string, name: string, value: string): string {
  // Native selectors match encoded output, while the style mode is a literal
  // compiler token rather than displayed HTML. Neither should be decoded.
  if ((tag === "mj-selector" && name === "path") || (tag === "mj-style" && name === "inline"))
    return value;
  if (!value.includes("&")) return value;
  if (name === "ico-open" || name === "ico-close") {
    // Icons become HTML text, whose legacy entity rules differ from attributes.
    // Protect markup and the first LF while decoding exactly one text layer,
    // then encode ampersands for the native reader's one normalization pass.
    const text = cheerio
      .load(
        `<textarea>_${value.replaceAll("<", "&lt;")}</textarea>`,
        {},
        false,
      )("textarea")
      .text()
      .slice(1);
    return text.replaceAll("&", "&amp;");
  }
  // MJML retains attribute references until rendering HTML. XML-only decoding
  // misses named HTML entities and must not be followed by another decode.
  return decodeImportedAttribute(value);
}

function parseElements(source: string, importer: Importer): SourceElement[] {
  // MJML ending tags contain HTML, not XML: an unclosed <br> or <img>
  // must never consume the next MJML component. Keep their source opaque.
  const endings = new Map<string, string>();
  const tokenPrefix = `__puck_mjml_${source.length}_`;
  let index = 0;
  while (source.includes(`${tokenPrefix}${index}__`)) index += 1;
  const endingTags = new Set([
    "mj-text",
    "mj-button",
    "mj-table",
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
  let protectedSource = "";
  let copied = 0;
  let active: { tag: string; contentStart: number } | undefined;
  // Scan complete markup tokens. Quotes and comments can contain strings that
  // look like MJML closing tags, but those strings are not structural tokens.
  for (let cursor = 0; cursor < source.length;) {
    const start = source.indexOf("<", cursor);
    if (start < 0) break;
    const styleContent = active?.tag === "mj-style";
    if (!styleContent && source.startsWith("<!--", start)) {
      const end = source.indexOf("-->", start + 4);
      cursor = end < 0 ? source.length : end + 3;
      continue;
    }
    if (!styleContent && source.startsWith("<![CDATA[", start)) {
      const end = source.indexOf("]]>", start + 9);
      cursor = end < 0 ? source.length : end + 3;
      continue;
    }
    // Consume each whitespace run once. Optional slash/whitespace groups in a
    // single regex can repeatedly split a long run before a non-tag character.
    let nameStart = start + 1;
    while (nameStart < source.length && /\s/.test(source[nameStart]!)) nameStart += 1;
    const closing = source[nameStart] === "/";
    if (closing) {
      nameStart += 1;
      while (nameStart < source.length && /\s/.test(source[nameStart]!)) nameStart += 1;
    }
    const match = /^[a-z][\w:-]*(?=[\s/>])/i.exec(source.slice(nameStart));
    if (!match) {
      cursor = nameStart;
      continue;
    }
    const tag = match[0].toLowerCase();
    // CSS strings/comments can contain '<' without a complete HTML token.
    // Only the style's own closing tag delimits its opaque source content.
    if (styleContent && (!closing || tag !== "mj-style")) {
      cursor = nameStart + match[0].length;
      continue;
    }
    let quote = "";
    let end = nameStart + match[0].length;
    for (; end < source.length; end += 1) {
      const character = source[end];
      if (quote) {
        if (character === quote) quote = "";
      } else if (character === '"' || character === "'") quote = character;
      else if (character === ">") break;
    }
    if (end === source.length) break;
    cursor = end + 1;
    if (active && closing && tag === active.tag) {
      let token: string;
      do token = `${tokenPrefix}${index++}__`;
      while (source.includes(token));
      endings.set(token, source.slice(active.contentStart, start));
      protectedSource +=
        source.slice(copied, active.contentStart) + token + source.slice(start, cursor);
      copied = cursor;
      active = undefined;
    } else if (
      !active &&
      !closing &&
      endingTags.has(tag) &&
      !/\/\s*>$/.test(source.slice(start, cursor))
    ) {
      active = { tag, contentStart: cursor };
    }
  }
  protectedSource += source.slice(copied);
  const $ = cheerio.load(protectedSource, { xml: { decodeEntities: false } }, false);
  const build = (node: Element): SourceElement => {
    const wrapped = $(node);
    const children = wrapped.children().toArray();
    const tag = node.tagName.toLowerCase();
    const attributes = Object.fromEntries(
      Object.entries(node.attribs).map(([name, value]) => [
        name,
        sourceAttribute(tag, name, value),
      ]),
    );
    const sourceContent = children.length === 0 ? endings.get(wrapped.html() ?? "") : undefined;
    if (sourceContent !== undefined) {
      // Intrinsic source has already passed bounded lexical preflight. Table
      // import owns parsing; avoid eager HTML repair and repeated serialization.
      if (tag === "mj-table") {
        let ancestorClasses: string | undefined;
        for (let parent = node.parent; parent; parent = parent.parent) {
          if ("attribs" in parent && Object.hasOwn(parent.attribs, "mj-class")) {
            ancestorClasses = sourceAttribute(parent.name, "mj-class", parent.attribs["mj-class"]!);
            break;
          }
        }
        return {
          tag,
          attributes,
          attributeSources: { ...node.attribs },
          children: [],
          textContent: "",
          innerHtml: sourceContent,
          ancestorClasses,
        };
      }
      const html = cheerio.load(sourceContent.trim(), {}, false);
      return {
        tag,
        attributes,
        attributeSources: { ...node.attribs },
        // Only ending-label markup detection uses these children.
        children: html
          .root()
          .children()
          .toArray()
          .map((child) => ({
            tag: child.tagName,
            attributes: { ...child.attribs },
            children: [],
            textContent: html(child).text(),
            innerHtml: html(child).html() ?? "",
          })),
        textContent: html.root().text(),
        innerHtml: sourceContent,
      };
    }
    if (STRUCTURAL_TAGS.has(tag)) {
      for (const child of wrapped.contents().toArray()) {
        if (child.type === "comment")
          importer.warn(
            `Ignored a structural comment inside <${tag}>; wrap it in mj-raw to preserve it.`,
          );
        if (child.type === "text" && (child as Text).data?.trim()) {
          importer.warn(`Ignored loose text next to <${tag}>.`);
          break;
        }
      }
    }
    return {
      tag,
      attributes,
      attributeSources: { ...node.attribs },
      children: children.map(build),
      textContent: wrapped.text(),
      innerHtml: wrapped.html() ?? "",
    };
  };
  return $.root()
    .children()
    .toArray()
    .filter((child): child is Element => child.type === "tag")
    .map(build);
}

function sanitizedRichText(innerHtml: string, importer: Importer): string {
  const sanitized = sanitizeEmailRichText(innerHtml);
  const html = importer.preserveSourceWhitespace
    ? sanitized
    : normalizeImportedWhitespace(sanitized);
  // Puck escapes tag-free rich text as plain text; wrap loose sentences once.
  // Content that already starts with a block element is left untouched.
  return html && !/^\s*<(?:p|h[1-6]|ul|ol|li|blockquote|code|pre|hr)\b/i.test(html)
    ? `<p>${html}</p>`
    : html;
}

/** Drop visual defaults that a native attribute entry overrides at export time. */
function dropShadowedDefaults(
  spec: AttrSpec,
  props: Record<string, unknown>,
  block: Record<string, unknown>,
) {
  const native = props.mjmlAttributes as MjmlAttribute[] | undefined;
  if (!Array.isArray(native) || !native.length) return;
  const overridden = new Set(native.map((entry) => entry.name));
  for (const [attribute, entry] of Object.entries(spec)) {
    if (overridden.has(attribute) && entry[0] in block) {
      // A source-only entity rule must not hide the same decoded visual value.
      const sourceOnly = native.some(
        (rule) => rule.name === attribute && rule.importSource && rule.value === props[entry[0]],
      );
      if (!sourceOnly) delete block[entry[0]];
    }
  }
}

function percentWidth(width: string | undefined, containerWidth: number): number | undefined {
  if (!width) return undefined;
  const percent = percentNumber(1, 100)(width);
  if (percent !== INVALID) return percent as number;
  const pixels = pxNumber(1, 10000)(width);
  if (pixels !== INVALID) {
    return Math.round(((pixels as number) / containerWidth) * 10000) / 100;
  }
  return undefined;
}

function columnWidths(columns: SourceElement[], containerWidth: number): number[] {
  const explicit = columns.map((column) => percentWidth(column.attributes.width, containerWidth));
  const fixed = explicit.filter((width): width is number => width !== undefined);
  const missing = explicit.length - fixed.length;
  if (!missing) return explicit as number[];
  const share = Math.max(
    1,
    Math.round(((100 - fixed.reduce((sum, value) => sum + value, 0)) / missing) * 100) / 100,
  );
  return explicit.map((width) => width ?? share);
}

function parseHead(head: SourceElement, settings: Partial<EmailSettings>, importer: Importer) {
  for (const element of head.children) {
    switch (element.tag) {
      case "mj-title": {
        settings.subject = element.textContent;
        // Native singleton head values replace earlier declarations completely,
        // including an HTML override left by an earlier value.
        delete settings.subjectHtmlContent;
        Object.assign(settings, preserveLabelHtml(element, importer, "subjectHtmlContent"));
        if (
          !element.children.length &&
          element.innerHtml.includes("&") &&
          !element.innerHtml.includes("<!--")
        ) {
          // MJML uses the title source in both text and an HTML attribute.
          // Legacy/ambiguous entities such as &notit; decode differently there.
          // Keep safe plain-text export, but disclose the accessible-name change.
          const source = element.innerHtml.trim().replaceAll('"', "&quot;");
          const label = cheerio
            .load(
              `<span data-title="${source}"></span>`,
              {},
              false,
            )("span")
            .attr("data-title");
          if (label !== element.textContent)
            importer.warn(
              "mj-title contains ambiguous HTML entities; its accessible label will be normalized to the displayed title text on export.",
            );
        }
        break;
      }
      case "mj-preview":
        settings.previewText = element.textContent;
        delete settings.previewHtmlContent;
        Object.assign(settings, preserveLabelHtml(element, importer, "previewHtmlContent"));
        break;
      case "mj-breakpoint": {
        // Clear both representations. A final declaration without width also
        // restores the native default rather than retaining an earlier width.
        delete settings.breakpoint;
        delete settings.breakpointWidth;
        const width = element.attributes.width?.trim() ?? "";
        const pixels = /^(\d+(?:\.\d+)?)px$/.exec(width);
        if (pixels) {
          const value = Number.parseFloat(pixels[1]!);
          if (value < 200 || value > 1000 || !Number.isInteger(value))
            settings.breakpointWidth = width;
          else settings.breakpoint = value;
        } else if (width) {
          settings.breakpointWidth = width;
        }
        break;
      }
      case "mj-font": {
        const name = element.attributes.name?.trim() ?? "";
        const href = element.attributes.href?.trim() ?? "";
        try {
          readNativeAttributes("mj-font", [
            { name: "name", value: name },
            { name: "href", value: href },
          ]);
          settings.fontImports = [...(settings.fontImports ?? []), { name, href }];
        } catch {
          importer.warn(`Dropped web font "${name || href}" (name or CSS URL is invalid).`);
        }
        break;
      }
      case "mj-style":
        settings.headStyles = [
          ...(settings.headStyles ?? []),
          {
            css: element.innerHtml,
            inline:
              element.attributes.inline === "inline" ? ("inline" as const) : ("head" as const),
          },
        ];
        break;
      case "mj-attributes":
        parseAttributeDefaults(element, settings, importer);
        break;
      case "mj-html-attributes":
        for (const selector of element.children.filter((child) => child.tag === "mj-selector")) {
          const target = selector.attributes.path?.trim() ?? "";
          if (!target) {
            importer.warn("Dropped an HTML attribute selector without a path.");
            continue;
          }
          for (const attribute of selector.children.filter(
            (child) => child.tag === "mj-html-attribute",
          )) {
            const name = attribute.attributes.name?.trim() ?? "";
            if (!name) {
              importer.warn(`Dropped an HTML attribute without a name under selector "${target}".`);
              continue;
            }
            settings.htmlAttributes = [
              ...(settings.htmlAttributes ?? []),
              { selector: target, name, value: attribute.textContent },
            ];
          }
        }
        break;
      case "mj-raw": {
        const fileStart = element.attributes.position?.trim() === "file-start";
        const key = fileStart ? "rawFileStart" : "rawHead";
        if (settings[key])
          importer.warn(
            "Multiple head mj-raw blocks were combined; their original positions relative to other head elements cannot be preserved.",
          );
        settings[key] = (settings[key] ?? "") + element.innerHtml;
        for (const name of Object.keys(element.attributes)) {
          if (name !== "position" || !fileStart)
            importer.warn(
              `Dropped ${name} on head mj-raw; the head raw-content model stores HTML only.`,
            );
        }
        importer.warn(
          fileStart
            ? "Head file-start mj-raw kept; compiling it requires allowRawHtml: true."
            : "Head mj-raw kept; compiling it requires allowRawHtml: true. Its original position relative to other head elements is not preserved.",
        );
        break;
      }
      default:
        importer.warn(`Ignored unsupported head element <${element.tag}>.`);
    }
  }
}

function parseAttributeDefaults(
  attributesElement: SourceElement,
  settings: Partial<EmailSettings>,
  importer: Importer,
) {
  for (const element of attributesElement.children) {
    if (element.tag === "mj-all") {
      const entries = nativeEntries("*", element, importer).map((entry) =>
        entry.name === "font-family" ? { ...entry, source: "import" as const } : entry,
      );
      if (entries.length)
        settings.attributeDefaults = [...(settings.attributeDefaults ?? []), ...entries];
    } else if (element.tag === "mj-class") {
      const name = element.attributes.name?.trim() ?? "";
      let normalized: string | undefined;
      try {
        normalized = normalizeMjClass(name);
      } catch {
        normalized = undefined;
      }
      if (!normalized || normalized.includes(" ")) {
        importer.warn(`Dropped mj-class "${name}" (needs one valid class name).`);
        continue;
      }
      const attributeEntries = nativeEntries("*", element, importer);
      const components: MjmlComponentDefaults[] = [];
      for (const child of element.children) {
        if (!Object.hasOwn(nativeCatalog, child.tag)) continue;
        const childEntries = nativeEntries(child.tag, child, importer);
        // An empty repeated child replaces the earlier complete attribute map.
        components.push({ tag: child.tag, attributes: childEntries });
      }
      const existing = (settings.mjmlClasses ?? []).find(
        (definition) => definition.name === normalized,
      );
      if (existing) {
        existing.attributes = [...existing.attributes, ...attributeEntries];
        existing.components = [...(existing.components ?? []), ...components];
      } else {
        const definition: MjmlClassDefinition = {
          name: normalized,
          attributes: attributeEntries,
          ...(components.length ? { components } : {}),
        };
        settings.mjmlClasses = [...(settings.mjmlClasses ?? []), definition];
      }
    } else if (Object.hasOwn(nativeCatalog, element.tag)) {
      const entries = nativeEntries(element.tag, element, importer);
      if (entries.length)
        settings.componentDefaults = [
          ...(settings.componentDefaults ?? []),
          { tag: element.tag, attributes: entries },
        ];
    } else {
      importer.warn(`Ignored unsupported default <${element.tag}> in mj-attributes.`);
    }
  }
}

function nativeEntries(tag: string, element: SourceElement, importer: Importer): MjmlAttribute[] {
  const entries: MjmlAttribute[] = [];
  for (const [name, rawValue] of Object.entries(element.attributes)) {
    if (name === "name" && element.tag === "mj-class") continue;
    const value = rawValue.trim();
    if (!value) {
      try {
        readNativeAttributes(tag, [{ name, inherit: true }], importer.options);
        try {
          readNativeAttributes(tag, [{ name, value: rawValue }], importer.options);
          entries.push({ name, value: rawValue });
        } catch {
          entries.push({ name, value: rawValue, template: true });
          importer.warn(
            `Empty ${name} in ${tag} defaults preserved; compiling it requires allowRawHtml: true.`,
          );
        }
      } catch {
        importer.warn(`Dropped unsupported empty ${name} in ${tag} defaults.`);
      }
      continue;
    }
    try {
      readNativeAttributes(tag, [{ name, value: rawValue }], importer.options);
      entries.push({ name, value: rawValue });
    } catch {
      importer.warn(
        `Dropped invalid ${name}="${rawValue}" in ${tag === "*" ? "mj-all" : tag} defaults.`,
      );
    }
  }
  for (const entry of entries)
    captureImportedAttributeSource(entry, element.attributeSources?.[entry.name]);
  return entries;
}

function parseBody(element: SourceElement, importer: Importer): Partial<EmailSettings> {
  const settings: Partial<EmailSettings> = {};
  const { mjClass, mjmlAttributes, ...rest } = importer.attributes("mj-body", element, BODY_ATTRS);
  Object.assign(settings, rest);
  if (mjClass) settings.bodyMjClass = mjClass as string;
  if (Array.isArray(mjmlAttributes) && mjmlAttributes.length)
    settings.bodyAttributes = mjmlAttributes;
  const bodyWidth = typeof settings.width === "number" ? settings.width : 600;
  settings.sections = parseTopLevel(element.children, importer, bodyWidth);
  return settings;
}

function parseTopLevel(
  elements: SourceElement[],
  importer: Importer,
  bodyWidth: number,
): EmailBlock[] {
  const blocks: EmailBlock[] = [];
  for (const element of elements) {
    if (element.tag === "mj-wrapper") {
      blocks.push(parseWrapper(element, importer, bodyWidth));
    } else if (element.tag === "mj-section") {
      blocks.push(parseSection(element, importer, bodyWidth));
    } else if (element.tag === "mj-hero") {
      blocks.push(parseHero(element, importer));
    } else if (element.tag === "mj-raw") {
      blocks.push({
        type: "Raw",
        props: {
          id: importer.id("raw"),
          html: element.innerHtml,
          ...importer.attributes("mj-raw", element, {}),
        },
      });
      importer.warn(
        "Body mj-raw imported as a raw HTML block; compiling requires allowRawHtml: true.",
      );
    } else {
      importer.warn(`Ignored unsupported element <${element.tag}> at the top level.`);
    }
  }
  return blocks;
}

function parseWrapper(element: SourceElement, importer: Importer, bodyWidth: number): EmailBlock {
  const props = importer.attributes("mj-wrapper", element, SECTION_ATTRS);
  const sections: EmailBlock[] = [];
  const collect = (wrapper: SourceElement) => {
    for (const child of wrapper.children) {
      if (child.tag === "mj-wrapper") {
        importer.warn("Flattened a nested mj-wrapper; its attributes were dropped.");
        collect(child);
      } else if (child.tag === "mj-section" || child.tag === "mj-hero") {
        sections.push(
          child.tag === "mj-section"
            ? parseSection(child, importer, bodyWidth)
            : parseHero(child, importer),
        );
      } else if (child.tag === "mj-raw") {
        sections.push({
          type: "Raw",
          props: {
            id: importer.id("raw"),
            html: child.innerHtml,
            ...importer.attributes("mj-raw", child, {}),
          },
        });
        importer.warn(
          "Body mj-raw imported as a raw HTML block; compiling requires allowRawHtml: true.",
        );
      } else {
        importer.warn(`Ignored unsupported element <${child.tag}> inside mj-wrapper.`);
      }
    }
  };
  collect(element);
  return {
    type: "Wrapper",
    props: { id: importer.id("wrapper"), ...props, sections },
  };
}

function parseSection(element: SourceElement, importer: Importer, bodyWidth: number): EmailBlock {
  const props = importer.attributes("mj-section", element, SECTION_ATTRS);
  const children = element.children.filter(
    (child) => child.tag === "mj-column" || child.tag === "mj-group" || child.tag === "mj-raw",
  );
  for (const child of element.children) {
    if (child.tag !== "mj-column" && child.tag !== "mj-group" && child.tag !== "mj-raw") {
      importer.warn(`Ignored unsupported element <${child.tag}> inside mj-section.`);
    }
  }
  const plainColumns = children.filter((child) => child.tag === "mj-column");
  if (
    plainColumns.length === 1 &&
    children.length === 1 &&
    !Object.keys(plainColumns[0]!.attributes).length
  ) {
    return {
      type: "Section1",
      props: {
        id: importer.id("section"),
        ...props,
        column: plainColumns[0]!.children
          .map((child) => parseContent(child, importer))
          .filter((block): block is EmailBlock => Boolean(block)),
      },
    };
  }
  const widths = columnWidths(
    children.filter((child) => child.tag === "mj-column" || child.tag === "mj-group"),
    bodyWidth,
  );
  const columns: EmailBlock[] = [];
  let widthIndex = 0;
  for (const child of children) {
    if (child.tag === "mj-column") {
      columns.push(parseColumn(child, importer, widths[widthIndex]!));
      widthIndex += 1;
    } else if (child.tag === "mj-group") {
      columns.push(parseGroup(child, importer, widths[widthIndex]!, bodyWidth));
      widthIndex += 1;
    } else {
      columns.push({
        type: "Raw",
        props: {
          id: importer.id("raw"),
          html: child.innerHtml,
          ...importer.attributes("mj-raw", child, {}),
        },
      });
      importer.warn(
        "Body mj-raw imported as a raw HTML block; compiling requires allowRawHtml: true.",
      );
    }
  }
  return {
    type: "Section",
    props: { id: importer.id("section"), ...props, columns },
  };
}

function parseColumn(
  element: SourceElement,
  importer: Importer,
  fallbackWidth: number,
): EmailBlock {
  const props = importer.attributes("mj-column", element, COLUMN_ATTRS);
  const content = element.children
    .map((child) => parseContent(child, importer))
    .filter((block): block is EmailBlock => Boolean(block));
  const blockProps = {
    id: importer.id("column"),
    width: fallbackWidth,
    padding: "0px",
    verticalAlign: "top",
    ...props,
    content,
  };
  dropShadowedDefaults(COLUMN_ATTRS, props, blockProps);
  return { type: "Column", props: blockProps };
}

function parseGroup(
  element: SourceElement,
  importer: Importer,
  fallbackWidth: number,
  bodyWidth: number,
): EmailBlock {
  const props = importer.attributes("mj-group", element, GROUP_ATTRS);
  const children = element.children.filter((child) => child.tag === "mj-column");
  for (const child of element.children) {
    if (child.tag !== "mj-column" && child.tag !== "mj-raw") {
      importer.warn(`Ignored unsupported element <${child.tag}> inside mj-group.`);
    }
  }
  const widths = columnWidths(children, bodyWidth);
  const blockProps = {
    id: importer.id("group"),
    width: fallbackWidth,
    ...props,
    columns: element.children.flatMap((child) => {
      if (child.tag === "mj-column")
        return [parseColumn(child, importer, widths[children.indexOf(child)]!)];
      if (child.tag === "mj-raw") return [parseRaw(child, importer)];
      return [];
    }),
  };
  dropShadowedDefaults(GROUP_ATTRS, props, blockProps);
  return { type: "Group", props: blockProps };
}

function parseHero(element: SourceElement, importer: Importer): EmailBlock {
  const props = importer.attributes("mj-hero", element, HERO_ATTRS);
  const content: EmailBlock[] = [];
  for (const child of element.children) {
    const block = parseContent(child, importer);
    if (block) content.push(block);
  }
  const blockProps = { id: importer.id("hero"), padding: "40px 20px", ...props, content };
  dropShadowedDefaults(HERO_ATTRS, props, blockProps);
  return { type: "Hero", props: blockProps };
}

const CONTENT_TAGS = new Set([
  "mj-text",
  "mj-image",
  "mj-button",
  "mj-spacer",
  "mj-divider",
  "mj-social",
  "mj-navbar",
  "mj-table",
  "mj-accordion",
  "mj-carousel",
  "mj-raw",
]);

function warnTrustedSource(element: SourceElement, importer: Importer) {
  try {
    trustedEndingContent(element.tag, element.innerHtml, { allowRawHtml: true });
  } catch {
    importer.warn(
      `${element.tag} source contains an unsafe MJML boundary or control character; it was retained for review but cannot be exported unchanged, even with allowRawHtml.`,
    );
  }
}

/** Keep ending-tag markup that cannot be represented by a plain label. */
function preserveLabelHtml(
  element: SourceElement,
  importer: Importer,
  property = "htmlContent",
): Record<string, unknown> {
  if (!element.children.length && !element.innerHtml.includes("<!--")) return {};
  importer.warn(`${element.tag} HTML content preserved; compiling it requires allowRawHtml: true.`);
  warnTrustedSource(element, importer);
  return { [property]: element.innerHtml };
}

function preserveRichHtml(element: SourceElement, importer: Importer): Record<string, unknown> {
  const normalize = (html: string) => cheerio.load(html, {}, false).html()?.trim();
  if (normalize(element.innerHtml) === normalize(sanitizeEmailRichText(element.innerHtml)))
    return {};
  importer.warn(
    `${element.tag} HTML outside the rich-text model preserved; compiling it requires allowRawHtml: true.`,
  );
  warnTrustedSource(element, importer);
  return { htmlContent: element.innerHtml };
}

function parseRaw(element: SourceElement, importer: Importer): EmailBlock {
  importer.warn("Body mj-raw imported as a raw HTML block; compiling requires allowRawHtml: true.");
  return {
    type: "Raw",
    props: {
      id: importer.id("raw"),
      html: element.innerHtml,
      ...importer.attributes("mj-raw", element, {}),
    },
  };
}

function parseContent(element: SourceElement, importer: Importer): EmailBlock | undefined {
  if (!CONTENT_TAGS.has(element.tag)) {
    importer.warn(`Ignored unsupported element <${element.tag}> inside a column.`);
    return undefined;
  }
  switch (element.tag) {
    case "mj-text": {
      const props = importer.attributes("mj-text", element, TEXT_ATTRS);
      const content = sanitizedRichText(element.innerHtml, importer);
      const blockProps = {
        id: importer.id("text"),
        content,
        importedRichText: {
          source: sanitizeEmailRichText(element.innerHtml.trim()),
          baseline: content,
        },
        ...preserveRichHtml(element, importer),
        fontSize: 16,
        align: "left",
        padding: "10px",
        ...props,
      };
      dropShadowedDefaults(TEXT_ATTRS, props, blockProps);
      return { type: "Text", props: blockProps };
    }
    case "mj-image": {
      const props = importer.attributes("mj-image", element, IMAGE_ATTRS);
      const blockProps = {
        id: importer.id("image"),
        width: 560,
        align: "center",
        padding: "10px",
        ...props,
      };
      dropShadowedDefaults(IMAGE_ATTRS, props, blockProps);
      return { type: "Image", props: blockProps };
    }
    case "mj-button": {
      const props = importer.attributes("mj-button", element, BUTTON_ATTRS);
      const html = preserveLabelHtml(element, importer);
      const blockProps = {
        id: importer.id("button"),
        fontSize: 13,
        align: "center",
        padding: "10px",
        ...props,
        label: element.textContent,
        ...html,
      };
      dropShadowedDefaults(BUTTON_ATTRS, props, blockProps);
      return { type: "Button", props: blockProps };
    }
    case "mj-spacer": {
      const props = importer.attributes("mj-spacer", element, SPACER_ATTRS);
      const blockProps = { id: importer.id("spacer"), height: 24, ...props };
      dropShadowedDefaults(SPACER_ATTRS, props, blockProps);
      return { type: "Spacer", props: blockProps };
    }
    case "mj-divider": {
      const props = importer.attributes("mj-divider", element, DIVIDER_ATTRS);
      const blockProps = {
        id: importer.id("divider"),
        width: 100,
        thickness: 1,
        padding: "10px",
        ...props,
      };
      dropShadowedDefaults(DIVIDER_ATTRS, props, blockProps);
      return { type: "Divider", props: blockProps };
    }
    case "mj-social": {
      const props = importer.attributes("mj-social", element, SOCIAL_ATTRS);
      const links: Record<string, unknown>[] = [];
      for (const child of element.children) {
        if (child.tag === "mj-raw") {
          const raw = parseRaw(child, importer);
          links.push({ kind: "raw", ...raw.props });
          continue;
        }
        if (child.tag !== "mj-social-element") {
          importer.warn(`Ignored unsupported element <${child.tag}> inside mj-social.`);
          continue;
        }
        const link = importer.attributes("mj-social-element", child, SOCIAL_ELEMENT_ATTRS);
        const nativeName = (link.mjmlAttributes as MjmlAttribute[] | undefined)?.some(
          (entry) => entry.name === "name" && "value" in entry,
        );
        if (link.name === undefined && !nativeName) {
          link.name = "web";
          importer.warn(
            `Social network "${child.attributes.name ?? ""}" is not supported; imported as a custom web icon.`,
          );
        }
        if (
          !link.src &&
          link.name === "web" &&
          child.attributes.name &&
          child.attributes.name !== "web"
        ) {
          importer.warn(
            `Social icon for "${child.attributes.name}" has no image URL and may render blank.`,
          );
        }
        if (link.name === undefined) link.name = "web";
        link.label = child.textContent;
        Object.assign(link, preserveLabelHtml(child, importer));
        links.push(link);
      }
      const blockProps = {
        id: importer.id("social"),
        align: "center",
        padding: "10px 25px",
        iconSize: 20,
        iconPadding: "0px",
        borderRadius: "3px",
        ...props,
        links,
      };
      dropShadowedDefaults(SOCIAL_ATTRS, props, blockProps);
      return { type: "Social", props: blockProps };
    }
    case "mj-navbar": {
      const props = importer.attributes("mj-navbar", element, NAVBAR_ATTRS);
      const links: Record<string, unknown>[] = [];
      for (const child of element.children) {
        if (child.tag === "mj-raw") {
          const raw = parseRaw(child, importer);
          links.push({ kind: "raw", ...raw.props });
          continue;
        }
        if (child.tag !== "mj-navbar-link") {
          importer.warn(`Ignored unsupported element <${child.tag}> inside mj-navbar.`);
          continue;
        }
        const link = importer.attributes("mj-navbar-link", child, NAVBAR_LINK_ATTRS);
        link.label = child.textContent;
        Object.assign(link, preserveLabelHtml(child, importer));
        links.push(link);
      }
      return {
        type: "Navbar",
        props: { id: importer.id("navbar"), ...props, links },
      };
    }
    case "mj-table":
      return parseTable(element, importer);
    case "mj-accordion": {
      const props = importer.attributes("mj-accordion", element, {});
      const items: Record<string, unknown>[] = [];
      for (const child of element.children) {
        if (child.tag === "mj-raw") {
          items.push({ kind: "raw", ...parseRaw(child, importer).props });
          continue;
        }
        if (child.tag !== "mj-accordion-element") {
          importer.warn(`Ignored unsupported element <${child.tag}> inside mj-accordion.`);
          continue;
        }
        const elementProps = importer.attributes("mj-accordion-element", child, {});
        const title = child.children.find((part) => part.tag === "mj-accordion-title");
        const text = child.children.find((part) => part.tag === "mj-accordion-text");
        const standardPair =
          child.children.length === 2 && child.children[0] === title && child.children[1] === text;
        if (!standardPair) {
          const children: Record<string, unknown>[] = [];
          for (const part of child.children) {
            if (part.tag === "mj-raw")
              children.push({ kind: "raw", ...parseRaw(part, importer).props });
            else if (part.tag === "mj-accordion-title" || part.tag === "mj-accordion-text") {
              const isTitle = part.tag === "mj-accordion-title";
              const content = isTitle
                ? part.textContent
                : sanitizedRichText(part.innerHtml, importer);
              children.push({
                kind: isTitle ? "title" : "text",
                content,
                ...(!isTitle
                  ? {
                      importedRichText: {
                        source: sanitizeEmailRichText(part.innerHtml.trim()),
                        baseline: content,
                      },
                    }
                  : {}),
                ...importer.attributes(part.tag, part, {}),
                ...(isTitle ? preserveLabelHtml(part, importer) : preserveRichHtml(part, importer)),
              });
            } else
              importer.warn(
                `Ignored unsupported element <${part.tag}> inside mj-accordion-element.`,
              );
          }
          items.push({ ...elementProps, children });
          continue;
        }
        const titleProps = title ? importer.attributes("mj-accordion-title", title, {}) : {};
        const textProps = text ? importer.attributes("mj-accordion-text", text, {}) : {};
        const content = sanitizedRichText(text?.innerHtml ?? "<p></p>", importer);
        items.push({
          title: title?.textContent ?? "",
          ...(titleProps.mjClass !== undefined ? { titleMjClass: titleProps.mjClass } : {}),
          ...(titleProps.mjmlAttributes ? { titleAttributes: titleProps.mjmlAttributes } : {}),
          ...(textProps.mjClass !== undefined ? { textMjClass: textProps.mjClass } : {}),
          ...(textProps.mjmlAttributes ? { textAttributes: textProps.mjmlAttributes } : {}),
          ...(title ? preserveLabelHtml(title, importer, "titleHtmlContent") : {}),
          content,
          ...(text
            ? {
                importedRichText: {
                  source: sanitizeEmailRichText(text.innerHtml.trim()),
                  baseline: content,
                },
              }
            : {}),
          ...(text ? preserveRichHtml(text, importer) : {}),
          ...elementProps,
        });
      }
      return { type: "Accordion", props: { id: importer.id("accordion"), ...props, items } };
    }
    case "mj-carousel": {
      const props = importer.attributes("mj-carousel", element, CAROUSEL_ATTRS);
      const images: Record<string, unknown>[] = [];
      for (const child of element.children) {
        if (child.tag !== "mj-carousel-image") {
          importer.warn(`Ignored unsupported element <${child.tag}> inside mj-carousel.`);
          continue;
        }
        images.push(importer.attributes("mj-carousel-image", child, CAROUSEL_IMAGE_ATTRS));
      }
      return {
        type: "Carousel",
        props: {
          id: importer.id("carousel"),
          ...props,
          images,
        },
      };
    }
    case "mj-raw":
      return parseRaw(element, importer);
    default:
      return undefined;
  }
}

function parseTable(element: SourceElement, importer: Importer): EmailBlock {
  if (importer.intrinsicSource.get(element.innerHtml) === true) {
    let context: NativeContext | undefined;
    const intrinsic = parseIntrinsicMarkup(
      element.innerHtml,
      element.attributes,
      importer.options,
      {
        id: (prefix) => importer.id(prefix),
        visible: (block) => {
          const settings = importer.intrinsicSettings;
          const nativeContext = (context ??= createNativeContext(
            {
              ...settings,
              attributeDefaults: settings.attributeDefaults?.some(
                (entry) => entry.name === "font-family",
              )
                ? settings.attributeDefaults
                : [
                    { name: "font-family", inherit: true, source: "import" },
                    ...(settings.attributeDefaults ?? []),
                  ],
            },
            { ...importer.options, allowRawHtml: false },
          ));
          const resolved = resolveIntrinsicLeaf(block, {
            ...importer.options,
            nativeContext,
            ancestorClasses: element.ancestorClasses,
          });
          return intrinsicLeafPresentation(resolved.tag, resolved.attributes).visible;
        },
        leaf: (tag, attributes, innerHtml) =>
          parseContent(
            {
              tag,
              attributes,
              children: [],
              textContent: "",
              innerHtml,
            },
            importer,
          )!,
      },
    );
    if (intrinsic) return intrinsic;
  }
  const props = importer.attributes("mj-table", element, TABLE_ATTRS);
  const $ = cheerio.load(`<table>${element.innerHtml}</table>`, {}, false);
  let cellLoss = false;
  const cell = (node: Element, header: boolean): Record<string, unknown> => {
    const wrapped = $(node);
    const style = (wrapped.attr("style") ?? "")
      .split(";")
      .map((declaration) => declaration.trim())
      .filter(Boolean);
    const declarations = new Map<string, string>();
    for (const declaration of style) {
      const colon = declaration.indexOf(":");
      if (colon > 0)
        declarations.set(
          declaration.slice(0, colon).trim().toLowerCase(),
          declaration.slice(colon + 1).trim(),
        );
    }
    const source = wrapped.html() ?? "";
    const content = sanitizedRichText(source, importer);
    const tableCell: Record<string, unknown> = {
      content,
      native: true,
      importedRichText: { source: sanitizeEmailRichText(source), baseline: content },
      header: node.tagName.toLowerCase() === "th" || header,
    };
    const scope = wrapped.attr("scope");
    if (tableCell.header && scope) tableCell.scope = scope;
    if (
      (scope && (!tableCell.header || !["row", "col", "rowgroup", "colgroup"].includes(scope))) ||
      (header && node.tagName.toLowerCase() !== "th")
    )
      cellLoss = true;
    const colspan = wrapped.attr("colspan");
    if (colspan && /^\d+$/.test(colspan)) tableCell.colSpan = Number.parseInt(colspan, 10);
    const rowspan = wrapped.attr("rowspan");
    if (rowspan && /^\d+$/.test(rowspan)) tableCell.rowSpan = Number.parseInt(rowspan, 10);
    const align = declarations.get("text-align");
    if (align === "left" || align === "center" || align === "right" || align === "justify")
      tableCell.align = align;
    const verticalAlign = declarations.get("vertical-align");
    if (verticalAlign === "top" || verticalAlign === "middle" || verticalAlign === "bottom")
      tableCell.verticalAlign = verticalAlign;
    const width = declarations.get("width");
    if (width && /^(?:auto|\d+(?:\.\d+)?(?:px|%))$/.test(width)) tableCell.width = width;
    for (const [styleName, propName] of [
      ["padding", "padding"],
      ["background-color", "backgroundColor"],
      ["color", "color"],
      ["border", "border"],
    ] as const) {
      const value = declarations.get(styleName);
      if (!value) continue;
      const valid =
        propName === "backgroundColor" || propName === "color"
          ? hexColor(value) !== INVALID
          : propName === "padding"
            ? spacing(value) !== INVALID
            : borderStyle(value) !== INVALID;
      if (valid) tableCell[propName] = value;
      else cellLoss = true;
    }
    if (
      (align && tableCell.align === undefined) ||
      (verticalAlign && tableCell.verticalAlign === undefined) ||
      (width && tableCell.width === undefined)
    )
      cellLoss = true;
    if (
      (colspan &&
        (!Number.isInteger(Number(colspan)) || Number(colspan) < 1 || Number(colspan) > 1000)) ||
      (rowspan &&
        (!Number.isInteger(Number(rowspan)) || Number(rowspan) < 0 || Number(rowspan) > 65534))
    )
      cellLoss = true;
    return tableCell;
  };
  const rows = (group: cheerio.Cheerio<Element>, header: boolean) =>
    group
      .children("tr")
      .toArray()
      .map((row) => ({
        cells: $(row)
          .children("th,td")
          .toArray()
          .map((node) => cell(node, header)),
      }));
  const rootTable = $("table").first();
  const headerRows = rows(rootTable.children("thead"), true);
  const bodyRows = rows(rootTable.children("tbody"), false);
  const footerRows = rows(rootTable.children("tfoot"), false);
  const loose = rootTable
    .children("tr")
    .toArray()
    .map((row) => ({
      cells: $(row)
        .children("th,td")
        .toArray()
        .map((node) => cell(node, false)),
    }));
  const caption = rootTable.children("caption").first().text().trim();
  const supportedStyles = new Set([
    "text-align",
    "vertical-align",
    "width",
    "padding",
    "background-color",
    "color",
    "border",
  ]);
  const normalizedTableHtml = (html: string) => {
    const parsed = cheerio.load(`<table>${html}</table>`, {}, false);
    parsed("[style]").each((_, node) => {
      const style = parsed(node).attr("style")!;
      parsed(node).attr(
        "style",
        style
          .trim()
          .replace(/\s*:\s*/g, ":")
          .replace(/\s*;\s*/g, ";")
          .replace(/;$/, ""),
      );
    });
    return parsed.html();
  };
  const trusted =
    element.innerHtml.includes("data-pm-layout") ||
    importer.intrinsicSource.get(element.innerHtml) === false ||
    cellLoss ||
    normalizedTableHtml(element.innerHtml) !==
      normalizedTableHtml(sanitizeEmailTableContent(element.innerHtml)) ||
    element.innerHtml.includes("<!--") ||
    ["thead", "tbody", "tfoot", "caption"].some((tag) => rootTable.children(tag).length > 1) ||
    rootTable.children("caption").children().length > 0 ||
    rootTable
      .find("*")
      .toArray()
      .some((node) => {
        const tag = node.tagName.toLowerCase();
        if (["table", "col", "colgroup"].includes(tag)) return true;
        if (["thead", "tbody", "tfoot", "tr", "caption"].includes(tag))
          return Object.keys(node.attribs).length > 0;
        if (tag !== "th" && tag !== "td") return false;
        if (
          Object.keys(node.attribs).some(
            (name) => !["style", "scope", "colspan", "rowspan"].includes(name),
          )
        )
          return true;
        const styles = (node.attribs.style ?? "").split(";").filter((part) => part.trim());
        if (styles.some((part) => !supportedStyles.has(part.split(":")[0]!.trim().toLowerCase())))
          return true;
        const content = $(node).html() ?? "";
        return (
          cheerio.load(content, {}, false).html() !==
          cheerio.load(sanitizeEmailRichText(content), {}, false).html()
        );
      });
  if (trusted)
    importer.warn(
      "mj-table HTML outside the editable table model preserved; compiling it requires allowRawHtml: true.",
    );
  const block = {
    type: "Table",
    props: {
      id: importer.id("table"),
      ...(caption ? { caption } : {}),
      ...(trusted ? { htmlContent: element.innerHtml } : {}),
      ...props,
      headerRows,
      bodyRows: [...bodyRows, ...loose],
      footerRows,
    },
  };
  if (!trusted)
    Object.assign(block.props, {
      importedTableContent: {
        source: sanitizeEmailTableContent(element.innerHtml),
        baseline: renderTableContent(block.props),
      },
    });
  return block;
}

/**
 * Parse MJML source into an editable email document. Supports the standard
 * components the editor models; unsupported constructs are skipped with a
 * warning. `mj-include` and custom components are not supported.
 */
export function fromMjml(source: string, options: ImportOptions = {}): ImportedEmail {
  const intrinsicSource = preflightIntrinsicSource(source);
  const importer = new Importer(options, hasSourceWhitespaceStyles(source));
  importer.intrinsicSource = intrinsicSource;
  const roots = parseElements(source, importer);
  const mjml = roots.find((element) => element.tag === "mjml");
  if (!mjml) throw new Error("MJML source must contain an <mjml> root element.");
  for (const element of roots) {
    if (element.tag !== "mjml") importer.warn(`Ignored element <${element.tag}> next to <mjml>.`);
  }
  const settings: Partial<EmailSettings> = {};
  const lang = mjml.attributes.lang?.trim();
  if (lang) settings.lang = lang;
  const dir = mjml.attributes.dir?.trim();
  if (dir === "ltr" || dir === "rtl" || dir === "auto") settings.dir = dir;
  const owa = mjml.attributes.owa?.trim();
  if (owa === "desktop" || owa === "none") settings.owa = owa;
  const head = mjml.children.find((element) => element.tag === "mj-head");
  if (head) parseHead(head, settings, importer);
  importer.intrinsicSettings = settings;
  for (const element of mjml.children) {
    if (element.tag === "mj-raw" && element.attributes.position?.trim() === "file-start") {
      settings.rawFileStart = (settings.rawFileStart ?? "") + element.innerHtml;
      for (const name of Object.keys(element.attributes)) {
        if (name !== "position")
          importer.warn(
            `Dropped ${name} on file-start mj-raw; the file-start model stores HTML only.`,
          );
      }
      importer.warn("File-start mj-raw kept; compiling it requires allowRawHtml: true.");
    } else if (element.tag !== "mj-head" && element.tag !== "mj-body") {
      importer.warn(`Ignored unsupported element <${element.tag}> next to mj-head and mj-body.`);
    }
  }
  const body = mjml.children.find((element) => element.tag === "mj-body");
  if (!body) throw new Error("MJML source must contain an <mj-body> element.");
  Object.assign(settings, parseBody(body, importer));
  if (!settings.attributeDefaults?.some((entry) => entry.name === "font-family"))
    settings.attributeDefaults = [
      { name: "font-family", inherit: true, source: "import" },
      ...(settings.attributeDefaults ?? []),
    ];
  const document: EmailDocument = {
    root: {
      props: {
        subject: "",
        previewText: "",
        lang: "und",
        dir: "auto",
        owa: "none",
        breakpoint: 480,
        fontImports: [],
        headStyles: [],
        htmlAttributes: [],
        rawHead: "",
        rawFileStart: "",
        bodyAttributes: [],
        bodyMjClass: "",
        attributeDefaults: [{ name: "font-family", inherit: true, source: "import" }],
        componentDefaults: [],
        mjmlClasses: [],
        ...settings,
        sections: settings.sections ?? [],
      },
    },
    content: [],
  };
  captureImportedAttributeBaselines(document);
  return { document, warnings: importer.warnings };
}
