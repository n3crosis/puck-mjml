import * as cheerio from "cheerio";
import type { Element, Text } from "domhandler";
import { normalizeMjClass, nativeCatalog, readNativeAttributes } from "./native-attributes";
import { sanitizeEmailRichText } from "./richtext";
import type {
  EmailBlock,
  EmailDocument,
  EmailSettings,
  MjmlAttribute,
  MjmlClassDefinition,
  MjmlComponentDefaults,
} from "./types";

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
  return match ? Number.parseFloat(match[1]!) : INVALID;
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
  children: SourceElement[];
  textContent: string;
  innerHtml: string;
}

class Importer {
  readonly warnings: string[] = [];
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
      if (!value) continue;
      if (name === "mj-class") {
        try {
          const normalized = normalizeMjClass(value);
          if (normalized) props.mjClass = normalized;
        } catch {
          this.warn(`Dropped invalid mj-class "${value}" on ${tag}.`);
        }
        continue;
      }
      const visual = spec[name];
      if (visual) {
        const parsed = visual[1](value);
        if (parsed !== INVALID) {
          props[visual[0]] = parsed;
          continue;
        }
      }
      if (this.pushNative(tag, native, name, rawValue)) continue;
      this.warn(`Dropped unsupported attribute ${name}="${rawValue}" on ${tag}.`);
    }
    if (native.length) props.mjmlAttributes = native;
    return props;
  }

  private pushNative(tag: string, native: MjmlAttribute[], name: string, value: string): boolean {
    const known =
      name === "css-class" ||
      (Object.hasOwn(nativeCatalog, tag) &&
        Object.hasOwn(nativeCatalog[tag].allowedAttributes, name));
    if (!known) return false;
    try {
      readNativeAttributes(tag, [{ name, value }]);
      native.push({ name, value });
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

function parseElements(source: string, importer: Importer): SourceElement[] {
  const $ = cheerio.load(source, { xmlMode: true }, false);
  const build = (node: Element): SourceElement => {
    const wrapped = $(node);
    const children = wrapped.children().toArray();
    const tag = node.tagName.toLowerCase();
    if (STRUCTURAL_TAGS.has(tag)) {
      for (const child of wrapped.contents().toArray()) {
        if (child.type === "text" && (child as Text).data?.trim()) {
          importer.warn(`Ignored loose text next to <${tag}>.`);
          break;
        }
      }
    }
    return {
      tag,
      attributes: { ...node.attribs },
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

function sanitizedRichText(innerHtml: string): string {
  const html = sanitizeEmailRichText(innerHtml);
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
    if (overridden.has(attribute) && entry[0] in block) delete block[entry[0]];
  }
}

function percentWidth(
  width: string | undefined,
  containerWidth: number,
  importer: Importer,
): number | undefined {
  if (!width) return undefined;
  const percent = percentNumber(1, 100)(width);
  if (percent !== INVALID) return percent as number;
  const pixels = pxNumber(1, 10000)(width);
  if (pixels !== INVALID) {
    importer.warn(
      `Pixel column width ${width} converted to a percentage of the ${containerWidth}px email.`,
    );
    return Math.round(((pixels as number) / containerWidth) * 10000) / 100;
  }
  return undefined;
}

function columnWidths(
  columns: SourceElement[],
  containerWidth: number,
  importer: Importer,
): number[] {
  const explicit = columns.map((column) =>
    percentWidth(column.attributes.width, containerWidth, importer),
  );
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
      case "mj-title":
        settings.subject = element.textContent.trim();
        break;
      case "mj-preview":
        settings.previewText = element.textContent.trim();
        break;
      case "mj-breakpoint": {
        const width = element.attributes.width?.trim() ?? "";
        const pixels = /^(\d+(?:\.\d+)?)px$/.exec(width);
        if (pixels) {
          const value = Number.parseFloat(pixels[1]!);
          if (value < 200 || value > 1000)
            importer.warn(`Breakpoint ${width} clamped to the 200-1000px range.`);
          settings.breakpoint = Math.max(200, Math.min(1000, Math.round(value)));
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
              element.attributes.inline?.trim() === "inline"
                ? ("inline" as const)
                : ("head" as const),
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
      case "mj-raw":
        settings.rawHead = (settings.rawHead ?? "") + element.innerHtml;
        importer.warn("Head mj-raw kept; compiling it requires allowRawHtml: true.");
        break;
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
      const entries = nativeEntries("*", element, importer);
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
        if (childEntries.length) components.push({ tag: child.tag, attributes: childEntries });
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
    if (!value) continue;
    try {
      readNativeAttributes(tag, [{ name, value }]);
      entries.push({ name, value });
    } catch {
      importer.warn(
        `Dropped invalid ${name}="${rawValue}" in ${tag === "*" ? "mj-all" : tag} defaults.`,
      );
    }
  }
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
        props: { id: importer.id("raw"), html: element.innerHtml },
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
        sections.push({ type: "Raw", props: { id: importer.id("raw"), html: child.innerHtml } });
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
    props: { id: importer.id("wrapper"), padding: "0px", ...props, sections },
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
        padding: "0px",
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
    importer,
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
      columns.push({ type: "Raw", props: { id: importer.id("raw"), html: child.innerHtml } });
      importer.warn(
        "Body mj-raw imported as a raw HTML block; compiling requires allowRawHtml: true.",
      );
    }
  }
  return {
    type: "Section",
    props: { id: importer.id("section"), padding: "0px", ...props, columns },
  };
}

/** Column widths are always represented as visual percentages; drop native px copies. */
function preferVisualWidth(props: Record<string, unknown>) {
  const native = props.mjmlAttributes as MjmlAttribute[] | undefined;
  if (!Array.isArray(native)) return;
  const filtered = native.filter((entry) => entry.name !== "width");
  if (filtered.length === native.length) return;
  if (filtered.length) props.mjmlAttributes = filtered;
  else delete props.mjmlAttributes;
}

function parseColumn(
  element: SourceElement,
  importer: Importer,
  fallbackWidth: number,
): EmailBlock {
  const props = importer.attributes("mj-column", element, COLUMN_ATTRS);
  preferVisualWidth(props);
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
  preferVisualWidth(props);
  const children = element.children.filter((child) => child.tag === "mj-column");
  for (const child of element.children) {
    if (child.tag !== "mj-column") {
      importer.warn(`Ignored unsupported element <${child.tag}> inside mj-group.`);
    }
  }
  const widths = columnWidths(children, bodyWidth, importer);
  return {
    type: "Group",
    props: {
      id: importer.id("group"),
      width: fallbackWidth,
      ...props,
      columns: children.map((child, index) => parseColumn(child, importer, widths[index]!)),
    },
  };
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

function parseContent(element: SourceElement, importer: Importer): EmailBlock | undefined {
  if (!CONTENT_TAGS.has(element.tag)) {
    importer.warn(`Ignored unsupported element <${element.tag}> inside a column.`);
    return undefined;
  }
  switch (element.tag) {
    case "mj-text": {
      const props = importer.attributes("mj-text", element, TEXT_ATTRS);
      if (typeof props.cssClass === "string") {
        const classes = props.cssClass
          .split(/\s+/)
          .filter((name) => name && name !== "pm-email-text");
        if (classes.length) props.cssClass = classes.join(" ");
        else delete props.cssClass;
      }
      const blockProps = {
        id: importer.id("text"),
        content: sanitizedRichText(element.innerHtml),
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
      if (element.children.length) {
        importer.warn("Button HTML content was simplified to its text.");
      }
      const blockProps = {
        id: importer.id("button"),
        fontSize: 13,
        align: "center",
        padding: "10px",
        ...props,
        label: element.textContent.trim(),
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
        if (child.tag !== "mj-social-element") {
          importer.warn(`Ignored unsupported element <${child.tag}> inside mj-social.`);
          continue;
        }
        const link = importer.attributes("mj-social-element", child, SOCIAL_ELEMENT_ATTRS);
        if (link.name === undefined) {
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
        link.label = child.textContent.trim();
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
        if (child.tag !== "mj-navbar-link") {
          importer.warn(`Ignored unsupported element <${child.tag}> inside mj-navbar.`);
          continue;
        }
        const link = importer.attributes("mj-navbar-link", child, NAVBAR_LINK_ATTRS);
        link.label = child.textContent.trim();
        links.push(link);
      }
      return {
        type: "Navbar",
        props: { id: importer.id("navbar"), align: "center", ...props, links },
      };
    }
    case "mj-table":
      return parseTable(element, importer);
    case "mj-accordion": {
      const items: Record<string, unknown>[] = [];
      for (const child of element.children) {
        if (child.tag !== "mj-accordion-element") {
          importer.warn(`Ignored unsupported element <${child.tag}> inside mj-accordion.`);
          continue;
        }
        const elementProps = importer.attributes("mj-accordion-element", child, {});
        const title = child.children.find((part) => part.tag === "mj-accordion-title");
        const text = child.children.find((part) => part.tag === "mj-accordion-text");
        items.push({
          title: title?.textContent.trim() ?? "",
          content: sanitizedRichText(text?.innerHtml ?? "<p></p>"),
          ...elementProps,
        });
      }
      return { type: "Accordion", props: { id: importer.id("accordion"), items } };
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
          align: "center",
          thumbnails: "visible",
          ...props,
          images,
        },
      };
    }
    case "mj-raw":
      importer.warn(
        "Column mj-raw imported as a raw HTML block; compiling requires allowRawHtml: true.",
      );
      return { type: "Raw", props: { id: importer.id("raw"), html: element.innerHtml } };
    default:
      return undefined;
  }
}

function parseTable(element: SourceElement, importer: Importer): EmailBlock {
  const props = importer.attributes("mj-table", element, TABLE_ATTRS);
  const $ = cheerio.load(`<table>${element.innerHtml}</table>`, {}, false);
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
    const tableCell: Record<string, unknown> = {
      content: sanitizedRichText(wrapped.html() ?? ""),
      header: node.tagName.toLowerCase() === "th" || header,
    };
    const scope = wrapped.attr("scope");
    if (tableCell.header && scope) tableCell.scope = scope;
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
    }
    return tableCell;
  };
  const rows = (group: cheerio.Cheerio<Element>, header: boolean) =>
    group
      .find("tr")
      .toArray()
      .map((row) => ({
        cells: $(row)
          .children("th,td")
          .toArray()
          .map((node) => cell(node, header)),
      }));
  const headerRows = rows($("thead"), true);
  const bodyRows = rows($("tbody"), false);
  const footerRows = rows($("tfoot"), false);
  const loose = $("table > tr")
    .toArray()
    .map((row) => ({
      cells: $(row)
        .children("th,td")
        .toArray()
        .map((node) => cell(node, false)),
    }));
  const caption = $("caption").first().text().trim();
  return {
    type: "Table",
    props: {
      id: importer.id("table"),
      ...(caption ? { caption } : {}),
      ...props,
      headerRows,
      bodyRows: [...bodyRows, ...loose],
      footerRows,
    },
  };
}

/**
 * Parse MJML source into an editable email document. Supports the standard
 * components the editor models; unsupported constructs are skipped with a
 * warning. `mj-include` and custom components are not supported.
 */
export function fromMjml(source: string): ImportedEmail {
  const importer = new Importer();
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
  for (const element of mjml.children) {
    if (element.tag === "mj-raw" && element.attributes.position?.trim() === "file-start") {
      settings.rawFileStart = (settings.rawFileStart ?? "") + element.innerHtml;
      importer.warn("File-start mj-raw kept; compiling it requires allowRawHtml: true.");
    } else if (element.tag !== "mj-head" && element.tag !== "mj-body") {
      importer.warn(`Ignored unsupported element <${element.tag}> next to mj-head and mj-body.`);
    }
  }
  const body = mjml.children.find((element) => element.tag === "mj-body");
  if (!body) throw new Error("MJML source must contain an <mj-body> element.");
  Object.assign(settings, parseBody(body, importer));
  const document: EmailDocument = {
    root: {
      props: {
        subject: "",
        previewText: "",
        lang: "und",
        dir: "auto",
        owa: "none",
        width: 600,
        backgroundColor: "#f5f5f5",
        fontFamily: "Arial, sans-serif",
        breakpoint: 480,
        fontImports: [],
        headStyles: [],
        htmlAttributes: [],
        rawHead: "",
        rawFileStart: "",
        bodyAttributes: [],
        bodyMjClass: "",
        attributeDefaults: [],
        componentDefaults: [],
        mjmlClasses: [],
        ...settings,
        sections: settings.sections ?? [],
      },
    },
    content: [],
  };
  return { document, warnings: importer.warnings };
}
