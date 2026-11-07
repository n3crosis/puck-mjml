import { normalizeEmailWidth } from "./layout";
import { getTableAttributes } from "./table";
import { normalizeColor as color } from "./native-attributes";

export interface NativeBaseOptions {
  nativeEnabled?: boolean;
  implicitColumn?: boolean;
  rawPosition?: "file-start";
}

type Attributes = Record<string, string | number | undefined>;
type Props = Record<string, unknown>;
const stringValue = (value: unknown) => (typeof value === "string" ? value : "");
const numberProp = (props: Props, key: string, fallback: number) =>
  typeof props[key] === "number" && Number.isFinite(props[key]) ? props[key] : fallback;
const boundedNumber = (props: Props, key: string, fallback: number, min: number, max: number) =>
  Math.max(min, Math.min(max, numberProp(props, key, fallback)));
const spacing = (value: unknown, fallback: string) =>
  typeof value === "string" &&
  /^\d+(?:\.\d+)?(?:px|%)(?:\s+\d+(?:\.\d+)?(?:px|%)){0,3}$/.test(value.trim())
    ? value.trim()
    : fallback;
const fontFamily = (value: unknown) =>
  typeof value === "string" && /^[\p{L}\p{N} ,'"_-]{1,160}$/u.test(value.trim())
    ? value.trim()
    : undefined;
const alignment = (value: unknown, fallback: "left" | "center" | "right" = "center") =>
  value === "left" || value === "center" || value === "right" ? value : fallback;
const typography = (props: Props, lineHeight: number): Attributes => ({
  "font-family": fontFamily(props.fontFamily),
  "font-weight": Math.round(boundedNumber(props, "fontWeight", 400, 100, 900)),
  "line-height": boundedNumber(props, "lineHeight", lineHeight, 0.5, 4),
  "letter-spacing": `${boundedNumber(props, "letterSpacing", 0, -10, 20)}px`,
});

function cssClasses(value: unknown): string | undefined {
  if (value === undefined || value === "") return undefined;
  if (typeof value !== "string" || !/^[A-Za-z_][\w-]*(?: [A-Za-z_][\w-]*)*$/.test(value)) {
    throw new Error("CSS class must contain class names separated by single spaces");
  }
  return value;
}

function border(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (/^(?:none|0|0px)$/.test(trimmed)) return trimmed;
  return /^\d+(?:\.\d+)?px\s+(?:solid|dashed|dotted|double|groove|ridge|inset|outset)\s+(?:#[\da-fA-F]{3}(?:[\da-fA-F]{3})?|transparent)$/.test(
    trimmed,
  )
    ? trimmed
    : undefined;
}

const layoutStyle = (props: Props): Attributes => ({
  border: border(props.border),
  "border-radius": props.borderRadius ? spacing(props.borderRadius, "0px") : undefined,
  "css-class": cssClasses(props.cssClass),
});

function hasNativeOptions(props: Props, options: NativeBaseOptions): boolean {
  return Boolean(
    options.nativeEnabled ||
    props.mjClass ||
    (Array.isArray(props.mjmlAttributes) &&
      props.mjmlAttributes.some(
        (entry) => entry && typeof entry.name === "string" && entry.name.trim(),
      )),
  );
}

function safeUrl(value: unknown, protocols: string[]): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    Array.from(value).some(
      (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    )
  )
    return "";
  try {
    const url = new URL(value.trim());
    if (!protocols.includes(url.protocol) || url.username || url.password) return "";
    if ((url.protocol === "http:" || url.protocol === "https:") && !url.hostname) return "";
    if ((url.protocol === "mailto:" || url.protocol === "tel:") && !url.pathname) return "";
    return url.href;
  } catch {
    return "";
  }
}

function blockUrl(
  value: unknown,
  label: string,
  protocols: string[],
  props: Props,
  options: NativeBaseOptions,
): string {
  // Native overrides and inheritance may replace this value. The caller must
  // validate the final native URL after resolving the attribute cascade.
  if (hasNativeOptions(props, options)) return stringValue(value);
  const url = safeUrl(value, protocols);
  if (!url) throw new Error(`${label} must be a valid ${protocols.join(" or ")} URL`);
  return url;
}

const assetProtocols = ["http:", "https:"];
const linkProtocols = [...assetProtocols, "mailto:", "tel:"];
const socialNames = new Set(["facebook", "x", "instagram", "linkedin", "youtube", "github", "web"]);
const sharingSocialNames = new Set(["facebook", "x", "linkedin"]);

/** Concrete attributes contributed by visual fields, before the native cascade. */
export function getNativeBaseAttributes(
  tag: string,
  props: Props,
  options: NativeBaseOptions = {},
): Attributes {
  switch (tag) {
    case "mj-body":
      return {
        width: `${normalizeEmailWidth(props.width)}px`,
        "background-color": color(props.backgroundColor, "#f5f5f5"),
      };
    case "mj-wrapper":
      return {
        "background-color": color(props.backgroundColor, "#f3f4f6"),
        padding: spacing(props.padding, "20px"),
        ...layoutStyle(props),
      };
    case "mj-section":
      return {
        "background-color": color(props.backgroundColor, "#ffffff"),
        padding: spacing(props.padding, "0px"),
        ...layoutStyle(props),
      };
    case "mj-column":
      return options.implicitColumn
        ? {}
        : {
            width: `${boundedNumber(props, "width", 50, 1, 100)}%`,
            padding: spacing(props.padding, "0px"),
            "vertical-align": ["top", "middle", "bottom"].includes(stringValue(props.verticalAlign))
              ? stringValue(props.verticalAlign)
              : "top",
            "css-class": cssClasses(props.cssClass),
          };
    case "mj-group":
      return {
        width: `${boundedNumber(props, "width", 100, 1, 100)}%`,
        "css-class": cssClasses(props.cssClass),
      };
    case "mj-hero": {
      const mode = props.mode === "fixed-height" ? "fixed-height" : "fluid-height";
      return {
        mode,
        "background-url": props.backgroundUrl
          ? blockUrl(props.backgroundUrl, "Hero background", assetProtocols, props, options)
          : undefined,
        "background-color": color(props.backgroundColor, "#16324f"),
        "background-width": `${boundedNumber(props, "backgroundWidth", 600, 1, 2000)}px`,
        "background-height": `${boundedNumber(props, "backgroundHeight", 300, 1, 2000)}px`,
        height:
          mode === "fixed-height" ? `${boundedNumber(props, "height", 300, 1, 2000)}px` : undefined,
        padding: spacing(props.padding, "40px 20px"),
      };
    }
    case "mj-text":
      return {
        color: color(props.color, "#222222"),
        "font-size": `${boundedNumber(props, "fontSize", 16, 8, 72)}px`,
        ...typography(props, 1.5),
        align: props.align === "justify" ? "justify" : alignment(props.align, "left"),
        padding: spacing(props.padding, "10px"),
        "css-class": cssClasses(props.cssClass),
      };
    case "mj-image":
      return {
        src: blockUrl(props.src, "Image source", assetProtocols, props, options),
        alt: stringValue(props.alt),
        width: `${boundedNumber(props, "width", 560, 1, 1200)}px`,
        align: alignment(props.align),
        padding: spacing(props.padding, "10px"),
        href: props.href
          ? blockUrl(props.href, "Image link", linkProtocols, props, options)
          : undefined,
        "border-radius": spacing(props.borderRadius, "0px"),
        "css-class": cssClasses(props.cssClass),
      };
    case "mj-button":
      return {
        href: blockUrl(props.href, "Button link", linkProtocols, props, options),
        "background-color": color(props.backgroundColor, "#2563eb"),
        color: color(props.color, "#ffffff"),
        "font-size": `${boundedNumber(props, "fontSize", 13, 8, 72)}px`,
        ...typography(props, 1.2),
        "inner-padding": spacing(props.innerPadding, "10px 25px"),
        "border-radius": spacing(props.borderRadius, "3px"),
        align: alignment(props.align),
        padding: spacing(props.padding, "10px"),
        "css-class": cssClasses(props.cssClass),
      };
    case "mj-spacer":
      return { height: `${boundedNumber(props, "height", 24, 1, 500)}px` };
    case "mj-divider":
      return {
        "border-color": color(props.color, "#d1d5db"),
        "border-width": `${boundedNumber(props, "thickness", 1, 1, 20)}px`,
        width: `${boundedNumber(props, "width", 100, 1, 100)}%`,
        padding: spacing(props.padding, "10px"),
      };
    case "mj-table":
      return { ...getTableAttributes(props), "css-class": cssClasses(props.cssClass) };
    case "mj-social":
      return {
        align: alignment(props.align),
        padding: spacing(props.padding, "10px 25px"),
        "icon-size": `${boundedNumber(props, "iconSize", 20, 1, 200)}px`,
        "icon-padding": spacing(props.iconPadding, "0px"),
        "border-radius":
          typeof props.borderRadius === "string" &&
          /^\d+(?:\.\d+)?px$/.test(props.borderRadius.trim())
            ? props.borderRadius.trim()
            : "3px",
      };
    case "mj-social-element": {
      const name = stringValue(props.name);
      if (!socialNames.has(name) && !hasNativeOptions(props, options))
        throw new Error(`Unsupported social network: ${name}`);
      const src = props.src
        ? blockUrl(props.src, "Social icon source", assetProtocols, props, options)
        : undefined;
      return {
        name: sharingSocialNames.has(name) ? `${name}-noshare` : name,
        href: blockUrl(props.href, "Social link", linkProtocols, props, options),
        src,
        alt: stringValue(props.alt),
        "background-color":
          src && props.backgroundColor === "transparent"
            ? "transparent"
            : color(props.backgroundColor, src ? "transparent" : ""),
        padding: props.padding ? spacing(props.padding, "4px") : undefined,
      };
    }
    case "mj-navbar":
      return { align: alignment(props.align) };
    case "mj-navbar-link":
      return { href: blockUrl(props.href, "Navigation link", linkProtocols, props, options) };
    case "mj-accordion":
    case "mj-accordion-element":
    case "mj-accordion-title":
    case "mj-accordion-text":
      return {};
    case "mj-carousel":
      return {
        align: alignment(props.align),
        thumbnails: ["hidden", "visible", "supported"].includes(stringValue(props.thumbnails))
          ? stringValue(props.thumbnails)
          : "hidden",
      };
    case "mj-carousel-image":
      return {
        src: blockUrl(props.src, "Carousel image", assetProtocols, props, options),
        alt: stringValue(props.alt),
        href: props.href
          ? blockUrl(props.href, "Carousel link", linkProtocols, props, options)
          : undefined,
      };
    case "mj-raw":
      return { position: options.rawPosition };
    default:
      throw new Error(`Unsupported native body component: ${tag}`);
  }
}
