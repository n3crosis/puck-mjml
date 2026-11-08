import { sanitizeEmailRichText } from "./richtext";
import { importedRichText } from "./imported-content";
import { importedTableContent } from "./imported-table-content";
import { renderTableContent } from "./table";
import { normalizeEmailDirection, normalizeEmailLanguage, normalizeOutlookWeb } from "./metadata";
import { getNativeBaseAttributes } from "./native-base";
import { applyNativeAttributes, createNativeContext, type NativeContext } from "./native-cascade";
import { readNativeAttributes } from "./native-attributes";
import { encodeEndingWhitespace, trustedEndingContent } from "./ending-content";
import type { NativeAttributeSources } from "./imported-attribute-source";
import { renderHeadSettings } from "./head";
import { resolveBreakpointWidth } from "./head";
import {
  wrapIntrinsicContent,
  intrinsicResponsiveCss,
  isIntrinsicResponsiveCss,
  renderIntrinsicContent,
} from "./intrinsic-layout";
import type {
  CompiledEmail,
  EmailBlock,
  EmailDocument,
  ExportOptions,
  MjmlElementOptions,
} from "./types";

export { sanitizeEmailRichText } from "./richtext";

const XML_ESCAPE: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};
const escapeXml = (value: unknown) =>
  String(value ?? "").replace(/[&<>"']/g, (match) => XML_ESCAPE[match]);
const endingText = (value: unknown) => encodeEndingWhitespace(escapeXml(value));
const attributes = (
  values: Record<string, string | number | undefined>,
  preserveEmpty = false,
  sources: NativeAttributeSources = {},
) =>
  Object.entries(values)
    .filter(([, value]) => value !== undefined && (preserveEmpty || value !== ""))
    .map(
      ([key, value]) =>
        ` ${key}="${Object.hasOwn(sources, key) && sources[key].value === String(value) ? sources[key].source : escapeXml(value)}"`,
    )
    .join("");
function records(value: unknown, label: string): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item))
      throw new Error(`${label} contains an invalid item`);
    return item as Record<string, unknown>;
  });
}
const richTextStyles = `
.pm-email-text p { margin: 0; }
.pm-email-text h1, .pm-email-text h2, .pm-email-text h3, .pm-email-text h4, .pm-email-text h5, .pm-email-text h6 { margin: 0 0 0.5em; font-weight: bold; }
.pm-email-text h1 { font-size: 1.7em; line-height: 1.15; }
.pm-email-text h2 { font-size: 1.3em; line-height: 1.2; }
.pm-email-text h3 { font-size: 1.17em; line-height: inherit; }
.pm-email-text h4 { font-size: 1em; line-height: inherit; }
.pm-email-text h5 { font-size: 0.83em; line-height: inherit; }
.pm-email-text h6 { font-size: 0.67em; line-height: inherit; }
.pm-email-text h1:last-child, .pm-email-text h2:last-child, .pm-email-text h3:last-child, .pm-email-text h4:last-child, .pm-email-text h5:last-child, .pm-email-text h6:last-child { margin-bottom: 0; }
`;

type RenderOptions = ExportOptions & {
  nativeContext: NativeContext;
  ancestorClasses?: string;
  nativeEnabled: boolean;
};

function nativeAttributes(
  tag: string,
  props: Record<string, unknown>,
  base: Record<string, string | number | undefined>,
  options: RenderOptions,
): string {
  const richText = tag === "mj-text" || tag === "mj-table";
  const result = applyNativeAttributes(
    tag,
    props as MjmlElementOptions,
    base,
    options.nativeContext,
    options.ancestorClasses,
  );
  const validated = readNativeAttributes(
    tag,
    Object.entries(result.attributes)
      .filter(([, value]) => value !== undefined)
      .map(([name, value]) => ({
        name,
        value: String(value),
        template: result.templateAttributes.includes(name),
      })),
    options,
  );
  const output: Record<string, string | undefined> = {};
  for (const [name, value] of Object.entries(validated)) {
    if (value === null) continue;
    // Local icons were already normalized by applyNativeAttributes. Revalidate
    // their safety above without decoding an escaped literal a second time.
    output[name] =
      name === "ico-open" || name === "ico-close" ? String(result.attributes[name]) : value;
  }
  if (
    richText &&
    props.htmlContent === undefined &&
    importedRichText(props) === undefined &&
    importedTableContent(props) === undefined
  )
    output["css-class"] = ["pm-email-text", String(result.effective["css-class"] ?? "")]
      .filter(Boolean)
      .join(" ");
  return attributes(output, true, result.attributeSources);
}

function childOptions(
  tag: string,
  props: Record<string, unknown>,
  options: RenderOptions,
): RenderOptions {
  const { childClasses } = applyNativeAttributes(
    tag,
    props as MjmlElementOptions,
    {},
    options.nativeContext,
    options.ancestorClasses,
  );
  return {
    ...options,
    ancestorClasses: childClasses,
    nativeEnabled: hasNativeOptions(props, options),
  };
}

function hasNativeOptions(props: Record<string, unknown>, options: RenderOptions): boolean {
  return (
    options.nativeEnabled ||
    Boolean(props.mjClass) ||
    (Array.isArray(props.mjmlAttributes) &&
      props.mjmlAttributes.some(
        (entry) => entry && typeof entry.name === "string" && entry.name.trim(),
      ))
  );
}

function endingContent(
  tag: string,
  props: Record<string, unknown>,
  fallback: () => string,
  options: RenderOptions,
): string {
  return props.htmlContent === undefined
    ? fallback()
    : trustedEndingContent(tag, props.htmlContent, options);
}

function isRawItem(item: Record<string, unknown>, label: string, kind = "link"): boolean {
  if (item.kind === "raw") return true;
  if (item.kind === undefined || item.kind === kind) return false;
  throw new Error(`${label} contains an unsupported item kind: ${String(item.kind)}`);
}

function renderRaw(
  value: unknown,
  options: RenderOptions,
  position?: "file-start",
  props: Record<string, unknown> = {},
): string {
  if (options.allowRawHtml !== true) throw new Error("Raw HTML requires allowRawHtml: true");
  if (
    typeof value !== "string" ||
    /<\s*\/\s*mj-raw\b/i.test(value) ||
    Array.from(value).some(
      (character) => character.charCodeAt(0) === 0 || character.charCodeAt(0) === 127,
    )
  ) {
    throw new Error("Raw HTML contains an invalid mj-raw closing tag or control character");
  }
  return `<mj-raw${nativeAttributes("mj-raw", props, getNativeBaseAttributes("mj-raw", props, { ...options, rawPosition: position }), options)}>${trustedEndingContent("mj-raw", value, options)}</mj-raw>`;
}

function renderContent(block: EmailBlock, options: RenderOptions): string {
  switch (block.type) {
    case "IntrinsicRow":
      return wrapIntrinsicContent(renderIntrinsicContent(block, options));
    case "Text":
      return `<mj-text${nativeAttributes("mj-text", block.props, getNativeBaseAttributes("mj-text", block.props, options), options)}>${endingContent("mj-text", block.props, () => importedRichText(block.props) ?? sanitizeEmailRichText(block.props.content), options)}</mj-text>`;
    case "Image":
      return `<mj-image${nativeAttributes("mj-image", block.props, getNativeBaseAttributes("mj-image", block.props, options), options)} />`;
    case "Button":
      return `<mj-button${nativeAttributes("mj-button", block.props, getNativeBaseAttributes("mj-button", block.props, options), options)}>${endingContent("mj-button", block.props, () => endingText(block.props.label), options)}</mj-button>`;
    case "Spacer":
      return `<mj-spacer${nativeAttributes("mj-spacer", block.props, getNativeBaseAttributes("mj-spacer", block.props, options), options)} />`;
    case "Divider":
      return `<mj-divider${nativeAttributes("mj-divider", block.props, getNativeBaseAttributes("mj-divider", block.props, options), options)} />`;
    case "Social":
      return `<mj-social${nativeAttributes("mj-social", block.props, getNativeBaseAttributes("mj-social", block.props, options), options)}>${records(
        block.props.links,
        "Social links",
      )
        .map((link) => {
          if (isRawItem(link, "Social links"))
            return renderRaw(
              link.html,
              childOptions("mj-social", block.props, options),
              undefined,
              link,
            );
          return `<mj-social-element${nativeAttributes("mj-social-element", link, getNativeBaseAttributes("mj-social-element", link, childOptions("mj-social", block.props, options)), childOptions("mj-social", block.props, options))}>${endingContent("mj-social-element", link, () => endingText(link.label), options)}</mj-social-element>`;
        })
        .join("")}</mj-social>`;
    case "Navbar":
      return `<mj-navbar${nativeAttributes("mj-navbar", block.props, getNativeBaseAttributes("mj-navbar", block.props, options), options)}>${records(
        block.props.links,
        "Navigation links",
      )
        .map((link) =>
          isRawItem(link, "Navigation links")
            ? renderRaw(link.html, childOptions("mj-navbar", block.props, options), undefined, link)
            : `<mj-navbar-link${nativeAttributes("mj-navbar-link", link, getNativeBaseAttributes("mj-navbar-link", link, childOptions("mj-navbar", block.props, options)), childOptions("mj-navbar", block.props, options))}>${endingContent("mj-navbar-link", link, () => endingText(link.label), options)}</mj-navbar-link>`,
        )
        .join("")}</mj-navbar>`;
    case "Table":
      return `<mj-table${nativeAttributes("mj-table", block.props, getNativeBaseAttributes("mj-table", block.props, options), options)}>${endingContent("mj-table", block.props, () => importedTableContent(block.props) ?? renderTableContent(block.props), options)}</mj-table>`;
    case "Accordion": {
      const elementOptions = childOptions("mj-accordion", block.props, options);
      return `<mj-accordion${nativeAttributes("mj-accordion", block.props, getNativeBaseAttributes("mj-accordion", block.props, options), options)}>${records(
        block.props.items,
        "Accordion items",
      )
        .map((item) => {
          if (isRawItem(item, "Accordion items", "element"))
            return renderRaw(item.html, elementOptions, undefined, item);
          const contentOptions = childOptions("mj-accordion-element", item, elementOptions);
          const title = { mjClass: item.titleMjClass, mjmlAttributes: item.titleAttributes };
          const text = { mjClass: item.textMjClass, mjmlAttributes: item.textAttributes };
          const children =
            item.children === undefined
              ? [
                  {
                    kind: "title",
                    content: item.title,
                    htmlContent: item.titleHtmlContent,
                    ...title,
                  },
                  {
                    kind: "text",
                    content: item.content,
                    htmlContent: item.htmlContent,
                    importedRichText: item.importedRichText,
                    ...text,
                  },
                ]
              : records(item.children, "Accordion element children");
          const markup = children
            .map((child) => {
              if (child.kind === "raw")
                return renderRaw(child.html, contentOptions, undefined, child);
              if (child.kind !== "title" && child.kind !== "text")
                throw new Error(
                  `Accordion element contains an unsupported child kind: ${String(child.kind)}`,
                );
              const tag = child.kind === "title" ? "mj-accordion-title" : "mj-accordion-text";
              return `<${tag}${nativeAttributes(tag, child, getNativeBaseAttributes(tag, child, contentOptions), contentOptions)}>${endingContent(tag, child, () => (child.kind === "title" ? endingText(child.content) : (importedRichText(child) ?? sanitizeEmailRichText(child.content))), contentOptions)}</${tag}>`;
            })
            .join("");
          return `<mj-accordion-element${nativeAttributes("mj-accordion-element", item, getNativeBaseAttributes("mj-accordion-element", item, elementOptions), elementOptions)}>${markup}</mj-accordion-element>`;
        })
        .join("")}</mj-accordion>`;
    }
    case "Carousel": {
      const images = records(block.props.images, "Carousel images");
      return `<mj-carousel${nativeAttributes("mj-carousel", block.props, getNativeBaseAttributes("mj-carousel", block.props, options), options)}>${images.map((item) => `<mj-carousel-image${nativeAttributes("mj-carousel-image", item, getNativeBaseAttributes("mj-carousel-image", item, childOptions("mj-carousel", block.props, options)), childOptions("mj-carousel", block.props, options))} />`).join("")}</mj-carousel>`;
    }
    case "Raw":
      return renderRaw(block.props.html, options, undefined, block.props);
    default:
      throw new Error(`Unsupported content block: ${block.type}`);
  }
}

function renderColumn(
  value: unknown,
  options: RenderOptions,
  props: Record<string, unknown> = {},
): string {
  return `<mj-column${nativeAttributes("mj-column", props, getNativeBaseAttributes("mj-column", props, { ...options, implicitColumn: true }), options)}>${blocks(
    value,
    "Section column content",
  )
    .map((block) => renderContent(block, childOptions("mj-column", props, options)))
    .join("")}</mj-column>`;
}

function blocks(value: unknown, label: string): EmailBlock[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value.map((item) => {
    if (
      !item ||
      typeof item !== "object" ||
      typeof item.type !== "string" ||
      !item.props ||
      typeof item.props !== "object" ||
      Array.isArray(item.props)
    ) {
      throw new Error(`${label} contains an invalid block`);
    }
    return item as EmailBlock;
  });
}

function renderSection(block: EmailBlock, options: RenderOptions): string {
  if (block.type === "Section") {
    const children = blocks(block.props.columns ?? [], "Flexible section columns");
    return `<mj-section${nativeAttributes("mj-section", block.props, getNativeBaseAttributes("mj-section", block.props, options), options)}>${children.map((child) => renderFlexibleChild(child, childOptions("mj-section", block.props, options))).join("")}</mj-section>`;
  }
  const slots: Record<string, string[]> = {
    Section1: ["column"],
    Section2: ["left", "right"],
    Section3: ["left", "middle", "right"],
  };
  const names = Object.prototype.hasOwnProperty.call(slots, block.type)
    ? slots[block.type]
    : undefined;
  if (!names) throw new Error(`Top-level blocks must be Sections; received ${block.type}`);
  return `<mj-section${nativeAttributes("mj-section", block.props, getNativeBaseAttributes("mj-section", block.props, options), options)}>${names.map((name) => renderColumn(block.props[name] ?? [], childOptions("mj-section", block.props, options), { mjClass: block.props[`${name}MjClass`], mjmlAttributes: block.props[`${name}Attributes`] })).join("")}</mj-section>`;
}

function renderColumnBlock(block: EmailBlock, options: RenderOptions): string {
  if (block.type === "Raw") return renderRaw(block.props.html, options, undefined, block.props);
  if (block.type !== "Column")
    throw new Error(`Groups accept only Columns or Raw blocks; received ${block.type}`);
  return `<mj-column${nativeAttributes("mj-column", block.props, getNativeBaseAttributes("mj-column", block.props, options), options)}>${blocks(
    block.props.content ?? [],
    "Column content",
  )
    .map((item) => renderContent(item, childOptions("mj-column", block.props, options)))
    .join("")}</mj-column>`;
}

function renderGroupBlock(block: EmailBlock, options: RenderOptions): string {
  const columns = blocks(block.props.columns ?? [], "Group columns");
  return `<mj-group${nativeAttributes("mj-group", block.props, getNativeBaseAttributes("mj-group", block.props, options), options)}>${columns.map((column) => renderColumnBlock(column, childOptions("mj-group", block.props, options))).join("")}</mj-group>`;
}

function renderFlexibleChild(block: EmailBlock, options: RenderOptions): string {
  if (block.type === "Raw") return renderRaw(block.props.html, options, undefined, block.props);
  if (block.type === "Column") return renderColumnBlock(block, options);
  if (block.type === "Group") return renderGroupBlock(block, options);
  throw new Error(
    `Flexible sections accept only Columns and Groups or Raw blocks; received ${block.type}`,
  );
}

function renderTopLevel(block: EmailBlock, options: RenderOptions): string {
  if (block.type === "Raw") return renderRaw(block.props.html, options, undefined, block.props);
  if (block.type === "Wrapper") {
    const children = blocks(block.props.sections ?? [], "Wrapper sections");
    return `<mj-wrapper${nativeAttributes("mj-wrapper", block.props, getNativeBaseAttributes("mj-wrapper", block.props, options), options)}>${children.map((child) => renderLayout(child, childOptions("mj-wrapper", block.props, options))).join("")}</mj-wrapper>`;
  }
  return renderLayout(block, options);
}

function renderLayout(block: EmailBlock, options: RenderOptions): string {
  if (block.type === "Raw") return renderRaw(block.props.html, options, undefined, block.props);
  if (block.type !== "Hero") return renderSection(block, options);
  const content = blocks(block.props.content ?? [], "Hero content");
  const allowed = new Set([
    "Text",
    "Image",
    "Button",
    "Spacer",
    "Divider",
    "Social",
    "Navbar",
    "Table",
    "IntrinsicRow",
    "Accordion",
    "Carousel",
    "Raw",
  ]);
  for (const item of content)
    if (!allowed.has(item.type)) throw new Error(`Unsupported hero content block: ${item.type}`);
  return `<mj-hero${nativeAttributes("mj-hero", block.props, getNativeBaseAttributes("mj-hero", block.props, options), options)}>${content.map((item) => renderContent(item, childOptions("mj-hero", block.props, options))).join("")}</mj-hero>`;
}

function renderNativeDefaults(context: NativeContext): string {
  const components = (
    entries: NativeContext["components"],
    sources: NativeContext["sources"]["components"],
  ) =>
    Object.entries(entries)
      .map(([tag, values]) => `<${tag}${attributes(values, true, sources[tag])} />`)
      .join("");
  const classes = Object.entries(context.classes)
    .map(
      ([name, definition]) =>
        `<mj-class${attributes({ name, ...definition.attributes }, true, context.sources.classes[name]?.attributes)}>${components(definition.components, context.sources.classes[name]?.components ?? {})}</mj-class>`,
    )
    .join("");
  return `<mj-attributes><mj-all${attributes(context.all, true, context.sources.all)} />${components(context.components, context.sources.components)}${classes}</mj-attributes>`;
}

function renderHead(
  settings: NonNullable<EmailDocument["root"]["props"]>,
  options: RenderOptions,
): string {
  const hasIntrinsic = (value: unknown): boolean =>
    Array.isArray(value)
      ? value.some(hasIntrinsic)
      : Boolean(
          value &&
          typeof value === "object" &&
          ((value as { type?: string }).type === "IntrinsicRow" ||
            Object.values(value).some(hasIntrinsic)),
        );
  const intrinsic = hasIntrinsic(settings.sections);
  const headSettings = intrinsic
    ? {
        ...settings,
        headStyles: settings.headStyles?.filter(
          (entry) =>
            !(entry.inline === "head" && isIntrinsicResponsiveCss(entry.css)) &&
            !(entry.inline === "inline" && entry.css.trim() === richTextStyles.trim()),
        ),
      }
    : settings;
  const { breakpoint, fontImports, styles, htmlAttributes } = renderHeadSettings(
    headSettings,
    options,
  );
  const rawHead = settings.rawHead ? renderRaw(settings.rawHead, options) : "";
  const intrinsicStyles = intrinsic
    ? `<mj-style>${intrinsicResponsiveCss(resolveBreakpointWidth(settings) || "480px")}</mj-style>`
    : "";
  return `<mj-head><mj-title>${endingContent("mj-title", { htmlContent: settings.subjectHtmlContent }, () => endingText(settings.subject), options)}</mj-title><mj-preview>${endingContent("mj-preview", { htmlContent: settings.previewHtmlContent }, () => endingText(settings.previewText), options)}</mj-preview>${breakpoint}${fontImports}${renderNativeDefaults(options.nativeContext)}<mj-style inline="inline">${richTextStyles}</mj-style>${intrinsicStyles}${styles}${htmlAttributes}${rawHead}</mj-head>`;
}

export function toMjml(document: EmailDocument, options: ExportOptions = {}): string {
  const settings = document.root?.props ?? {};
  if (document.content.length) throw new Error("Email blocks must be placed in the sections slot");
  const sections = settings.sections ?? [];
  if (!Array.isArray(sections)) throw new Error("Email sections must be an array");
  const nativeContext = createNativeContext(settings, options);
  const renderOptions: RenderOptions = {
    ...options,
    nativeContext,
    nativeEnabled: nativeContext.hasNativeDefinitions,
  };
  const bodyOptions = {
    ...settings,
    mjClass: settings.bodyMjClass,
    mjmlAttributes: settings.bodyAttributes,
  };
  const rawFileStart = settings.rawFileStart
    ? renderRaw(settings.rawFileStart, renderOptions, "file-start")
    : "";
  return `<mjml${attributes({ lang: settings.lang === undefined ? undefined : normalizeEmailLanguage(settings.lang), dir: settings.dir === undefined ? undefined : normalizeEmailDirection(settings.dir), owa: settings.owa === undefined ? undefined : normalizeOutlookWeb(settings.owa) })}>${rawFileStart}${renderHead(settings, renderOptions)}<mj-body${nativeAttributes("mj-body", bodyOptions, getNativeBaseAttributes("mj-body", { ...settings }, renderOptions), renderOptions)}>${blocks(
    sections,
    "Email sections",
  )
    .map((block) => renderTopLevel(block, childOptions("mj-body", bodyOptions, renderOptions)))
    .join("")}</mj-body></mjml>`;
}

export async function compileEmail(
  document: EmailDocument,
  options: ExportOptions = {},
): Promise<CompiledEmail> {
  const mjml = toMjml(document, options);
  const { default: mjml2html } = await import("mjml-browser");
  const result = await mjml2html(mjml, { validationLevel: "soft" });
  return {
    mjml,
    html: result.html,
    errors: (result.errors ?? []).map(
      (error: { line?: number; message: string; tagName?: string }) => ({
        line: error.line,
        message: error.message,
        tagName: error.tagName,
      }),
    ),
  };
}
