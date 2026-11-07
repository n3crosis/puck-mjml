import {
  isValidElement,
  useEffect,
  useId,
  useState,
  type CSSProperties,
  type ReactNode,
  type MouseEvent,
} from "react";
import { TrustedHtmlPreview } from "./NativeFields";
import { readNativeAttributes } from "./native-attributes";
import {
  getCanvasElement,
  nativeBoxStyle,
  nativeStyle,
  typographyKeys,
  type NativeCanvasAttributes,
  type NativeCanvasScope,
} from "./native-canvas-context";

type Props = Record<string, unknown>;
type ItemProps = { props: Props; attributes: NativeCanvasAttributes; scope: NativeCanvasScope };
const record = (value: unknown): Props =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Props) : {};
const items = (value: unknown): Props[] => (Array.isArray(value) ? value.map(record) : []);
const content = (value: unknown): ReactNode => {
  if (Array.isArray(value)) return value.map(content);
  return typeof value === "string" || typeof value === "number" || isValidElement(value)
    ? value
    : null;
};
const classes = (...names: (string | undefined)[]) => names.filter(Boolean).join(" ");
const pick = (attributes: NativeCanvasAttributes, keys: string[]) =>
  Object.fromEntries(
    keys.filter((key) => attributes[key] !== undefined).map((key) => [key, attributes[key]]),
  );
const click = (props: Props) =>
  record(props.puck).isEditing ? (event: MouseEvent) => event.preventDefault() : undefined;
const outerStyle = (attributes: NativeCanvasAttributes): CSSProperties => ({
  ...nativeBoxStyle(attributes),
  backgroundColor: attributes["container-background-color"] ?? attributes["background-color"],
  textAlign: attributes.align as CSSProperties["textAlign"],
});
function element(
  tag: string,
  props: Props,
  scope: NativeCanvasScope,
  inherited: NativeCanvasAttributes = {},
) {
  return (
    getCanvasElement(tag, props, scope, { inherited }) ??
    getCanvasElement(tag, {}, scope, { inherited })
  );
}
function href(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    return readNativeAttributes("mj-button", [{ name: "href", value }]).href || undefined;
  } catch {
    return undefined;
  }
}
function source(item: Props, field = "htmlContent", inline = false) {
  return typeof item[field] === "string" ? (
    <TrustedHtmlPreview html={item[field]} inline={inline} />
  ) : undefined;
}

// These are the bundled MJML 5.4 presets. Native overrides still take priority.
const iconBase = "https://www.mailjet.com/images/theme/v1/icons/ico-social/";
const networks: Record<string, { color: string; icon?: string; share?: string }> = {
  facebook: { color: "#3b5998", share: "https://www.facebook.com/sharer/sharer.php?u=[[URL]]" },
  twitter: { color: "#55acee", share: "https://twitter.com/intent/tweet?url=[[URL]]" },
  x: { color: "#000000", icon: "twitter-x", share: "https://twitter.com/intent/tweet?url=[[URL]]" },
  google: {
    color: "#dc4e41",
    icon: "google-plus",
    share: "https://plus.google.com/share?url=[[URL]]",
  },
  pinterest: {
    color: "#bd081c",
    share: "https://pinterest.com/pin/create/button/?url=[[URL]]&media=&description=",
  },
  linkedin: {
    color: "#0077b5",
    share: "https://www.linkedin.com/shareArticle?mini=true&url=[[URL]]&title=&summary=&source=",
  },
  instagram: { color: "#3f729b" },
  web: { color: "#4BADE9" },
  snapchat: { color: "#FFFA54" },
  youtube: { color: "#EB3323" },
  tumblr: {
    color: "#344356",
    share: "https://www.tumblr.com/widgets/share/tool?canonicalUrl=[[URL]]",
  },
  github: { color: "#000000" },
  xing: { color: "#296366", share: "https://www.xing.com/app/user?op=share&url=[[URL]]" },
  vimeo: { color: "#53B4E7" },
  medium: { color: "#000000" },
  soundcloud: { color: "#EF7F31" },
  dribbble: { color: "#D95988" },
};
const socialKeys = [
  "border",
  "border-radius",
  "color",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "icon-size",
  "icon-height",
  "icon-padding",
  "text-padding",
  "line-height",
  "text-decoration",
];

function Social({ props, attributes, scope }: ItemProps) {
  const inherited = pick(attributes, socialKeys);
  if (attributes["inner-padding"]) inherited.padding = attributes["inner-padding"];
  return (
    <div
      className={classes("pm-social", attributes["css-class"])}
      // Social borders and radii belong to the icons, not the containing row.
      style={{ ...outerStyle(attributes), border: undefined, borderRadius: undefined }}
    >
      <div
        style={{
          display: "inline-flex",
          flexDirection: attributes.mode === "vertical" ? "column" : "row",
          flexWrap: "wrap",
          alignItems: "flex-start",
        }}
      >
        {items(props.links).map((item, index) => {
          if (item.kind === "raw")
            return (
              <TrustedHtmlPreview
                key={index}
                html={typeof item.html === "string" ? item.html : ""}
                label="Raw HTML"
              />
            );
          const resolved = element("mj-social-element", item, scope, inherited);
          if (!resolved) return null;
          const a = resolved.attributes;
          const name = a.name ?? "";
          const presetName = name.replace(/-noshare$/, "");
          const preset = Object.hasOwn(networks, presetName) ? networks[presetName] : undefined;
          const image =
            a.src || (preset ? `${iconBase}${preset.icon ?? presetName}.png` : undefined);
          const destination = href(
            a.href && preset?.share && !name.endsWith("-noshare")
              ? preset.share.replace("[[URL]]", a.href)
              : a.href,
          );
          const linkProps = {
            href: destination,
            target: a.target,
            rel: a.rel,
            onClick: click(props),
          };
          const label = source(item) ?? content(item.label);
          const icon = image ? (
            <span
              key="icon"
              style={{
                ...nativeStyle(a, [
                  "padding",
                  "padding-top",
                  "padding-right",
                  "padding-bottom",
                  "padding-left",
                  "vertical-align",
                ]),
              }}
            >
              <span
                className="pm-social-icon"
                style={{
                  backgroundColor: a["background-color"] || preset?.color,
                  borderRadius: a["border-radius"],
                  width: a["icon-size"],
                  minHeight: a["icon-height"] || a["icon-size"],
                  padding: a["icon-padding"],
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <a {...linkProps}>
                  <img
                    src={image}
                    alt={a.alt ?? ""}
                    title={a.title}
                    srcSet={a.srcset}
                    sizes={a.sizes}
                    width={Number.parseInt(a["icon-size"], 10) || undefined}
                    style={{
                      display: "block",
                      border: a.border,
                      borderRadius: a["border-radius"],
                    }}
                  />
                </a>
              </span>
            </span>
          ) : null;
          const text =
            label !== null && label !== "" ? (
              <span
                key="text"
                className="pm-social-label"
                style={{
                  padding: a["text-padding"],
                  textAlign: a.align as CSSProperties["textAlign"],
                }}
              >
                <a {...linkProps} style={nativeStyle(a, typographyKeys)}>
                  {label}
                </a>
              </span>
            ) : null;
          return (
            <span
              key={index}
              className={classes("pm-social-item", a["css-class"])}
              style={{
                display: "inline-flex",
                alignItems: "center",
                verticalAlign: a["vertical-align"] as CSSProperties["verticalAlign"],
              }}
            >
              {a["icon-position"] === "right" ? [text, icon] : [icon, text]}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function Navbar({ props, attributes, scope }: ItemProps) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const hamburger = attributes.hamburger === "hamburger";
  useEffect(() => {
    // Disabling the native hamburger removes its checkbox. Re-enabling it
    // starts closed again, matching a newly rendered MJML menu.
    if (!hamburger) setOpen(false);
  }, [hamburger]);
  const iconName = open ? "ico-close" : "ico-open";
  let icon = open ? "⊗" : "☰";
  try {
    icon =
      readNativeAttributes("mj-navbar", [{ name: iconName, value: attributes[iconName] ?? icon }])[
        iconName
      ] ?? icon;
  } catch {
    /* Invalid icon drafts retain a safe text glyph. */
  }
  const iconAttributes = Object.fromEntries(
    Object.entries(attributes)
      .filter(([name]) => name.startsWith("ico-"))
      .map(([name, value]) => [name.slice(4), value]),
  );
  return (
    <nav
      className={classes("pm-link-list", "pm-native-navbar", attributes["css-class"])}
      data-native-navbar-open={hamburger ? String(open) : undefined}
      style={{ padding: "0", ...outerStyle(attributes), color: "inherit" }}
    >
      {hamburger ? (
        <button
          type="button"
          className="pm-native-navbar-trigger"
          aria-label={open ? "Close navigation" : "Open navigation"}
          aria-expanded={open}
          aria-controls={menuId}
          onClick={() => setOpen((value) => !value)}
          style={{
            width: "100%",
            border: 0,
            background: "transparent",
            cursor: "pointer",
            ...nativeBoxStyle(iconAttributes),
            ...nativeStyle(iconAttributes, typographyKeys),
            textAlign: attributes["ico-align"] as CSSProperties["textAlign"],
          }}
        >
          {icon}
        </button>
      ) : null}
      <div id={menuId} className="pm-native-navbar-links">
        {items(props.links).map((item, index) => {
          if (item.kind === "raw")
            return (
              <TrustedHtmlPreview
                key={index}
                html={typeof item.html === "string" ? item.html : ""}
                label="Raw HTML"
              />
            );
          const resolved = element("mj-navbar-link", item, scope);
          if (!resolved) return null;
          const a = resolved.attributes;
          // MJML concatenates base-url literally, including relative paths and query strings.
          const destination = href(
            attributes["base-url"] ? attributes["base-url"] + (a.href ?? "") : a.href,
          );
          return (
            <a
              key={index}
              className={classes("mj-link", a["css-class"])}
              href={destination}
              target={a.target}
              rel={a.rel}
              {...{ name: a.name }}
              onClick={click(props)}
              style={{
                display: "inline-block",
                ...nativeBoxStyle(a),
                ...nativeStyle(a, typographyKeys),
              }}
            >
              {source(item) ?? content(item.label)}
            </a>
          );
        })}
      </div>
    </nav>
  );
}

const accordionKeys = [
  "border",
  "icon-align",
  "icon-width",
  "icon-height",
  "icon-position",
  "icon-wrapped-url",
  "icon-wrapped-alt",
  "icon-unwrapped-url",
  "icon-unwrapped-alt",
];

function Accordion({ props, attributes, scope }: ItemProps) {
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  return (
    <div
      className={classes("pm-accordion", attributes["css-class"])}
      style={{ ...outerStyle(attributes), border: undefined }}
    >
      <div
        style={{
          border: attributes.border,
          borderBottom: "none",
          fontFamily: attributes["font-family"],
        }}
      >
        {items(props.items).map((item, index) => {
          const resolved = element(
            "mj-accordion-element",
            item,
            scope,
            pick(attributes, accordionKeys),
          );
          if (!resolved) return null;
          const a = resolved.attributes;
          const open = expanded[index] !== false;
          const iconPrefix = open ? "icon-unwrapped" : "icon-wrapped";
          const inherited = pick(a, accordionKeys);
          const titleProps = { mjClass: item.titleMjClass, mjmlAttributes: item.titleAttributes };
          const textProps = { mjClass: item.textMjClass, mjmlAttributes: item.textAttributes };
          const title =
            element("mj-accordion-title", titleProps, resolved.scope, inherited)?.attributes ?? {};
          const text =
            element("mj-accordion-text", textProps, resolved.scope, inherited)?.attributes ?? {};
          // Native resolveFontFamily checks rawAttrs: only a direct local font
          // overrides the element/accordion context, not a class or tag default.
          const font = a["font-family"] || attributes["font-family"];
          const fontFor = (child: NativeCanvasAttributes, childProps: Props, tag: string) => {
            try {
              const entries = Array.isArray(childProps.mjmlAttributes)
                ? childProps.mjmlAttributes.filter(
                    (entry) => entry?.template !== true || entry?.inherit === true,
                  )
                : childProps.mjmlAttributes;
              const own = readNativeAttributes(tag, entries);
              if (Object.hasOwn(own, "font-family") && own["font-family"] !== null)
                return child["font-family"];
            } catch {
              /* Incomplete attribute drafts use the enclosing font. */
            }
            return font;
          };
          return (
            <details
              key={index}
              open={open}
              onToggle={(event) => {
                const next = event.currentTarget.open;
                setExpanded((current) =>
                  (current[index] ?? true) === next ? current : { ...current, [index]: next },
                );
              }}
              className={a["css-class"]}
              style={{ border: 0, backgroundColor: a["background-color"] ?? "transparent" }}
            >
              <summary
                style={{
                  padding: 0,
                  fontWeight: "normal",
                  listStyle: "none",
                  borderBottom: title.border,
                  backgroundColor: title["background-color"],
                  display: "flex",
                  flexDirection: title["icon-position"] === "left" ? "row-reverse" : "row",
                  // MJML keeps the title cell centered; icon-align changes
                  // only the icon cell's contents, not the title itself.
                  alignItems: "center",
                }}
              >
                <span
                  className={title["css-class"]}
                  style={{
                    flex: 1,
                    ...nativeBoxStyle(title),
                    border: undefined,
                    ...nativeStyle(title, typographyKeys),
                    fontFamily: fontFor(title, titleProps, "mj-accordion-title"),
                  }}
                >
                  {source(item, "titleHtmlContent", true) ?? content(item.title)}
                </span>
                {title[`${iconPrefix}-url`] ? (
                  <span
                    style={{
                      padding: "16px",
                      backgroundColor: title["background-color"],
                      flex: "none",
                      alignSelf:
                        title["icon-align"] === "top"
                          ? "flex-start"
                          : title["icon-align"] === "bottom"
                            ? "flex-end"
                            : "center",
                    }}
                  >
                    <img
                      src={title[`${iconPrefix}-url`]}
                      alt={title[`${iconPrefix}-alt`] ?? ""}
                      style={{
                        display: "block",
                        width: title["icon-width"],
                        height: title["icon-height"],
                      }}
                    />
                  </span>
                ) : null}
              </summary>
              <div
                className={classes("pm-text", text["css-class"])}
                style={{
                  ...nativeBoxStyle(text),
                  border: undefined,
                  borderBottom: text.border,
                  ...nativeStyle(text, typographyKeys),
                  fontFamily: fontFor(text, textProps, "mj-accordion-text"),
                }}
              >
                {source(item) ?? content(item.content)}
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}

function Carousel({ props, attributes, scope }: ItemProps) {
  const [selected, setSelected] = useState(0);
  const [hovered, setHovered] = useState<number>();
  useEffect(() => {
    // Removing a thumbnail does not dispatch mouseleave. Drop its transient
    // preview when the host replaces the image list or changes visibility.
    setHovered(undefined);
  }, [props.images, attributes.thumbnails]);
  const images = items(props.images)
    .map((item) =>
      element(
        "mj-carousel-image",
        item,
        scope,
        pick(attributes, ["border-radius", "tb-border", "tb-border-radius"]),
      ),
    )
    .filter((item) => item !== undefined);
  const active = Math.min(selected, Math.max(0, images.length - 1));
  // MJML previews the hovered thumbnail without changing the checked radio.
  const displayed =
    attributes.thumbnails !== "hidden" && hovered !== undefined && hovered < images.length
      ? hovered
      : active;
  const a = images[displayed]?.attributes;
  const image = a?.src ? (
    <img
      className="pm-carousel-main"
      src={a.src}
      alt={a.alt ?? ""}
      title={a.title}
      style={{
        display: "block",
        width: "100%",
        maxWidth: "100%",
        height: "auto",
        borderRadius: a["border-radius"],
      }}
    />
  ) : (
    <div className="pm-image-empty">Add carousel images</div>
  );
  const control = (direction: -1 | 1) => (
    <button
      type="button"
      aria-label={direction === -1 ? "Previous image" : "Next image"}
      onClick={() => setSelected((active + direction + images.length) % images.length)}
      style={{
        flex: "none",
        border: 0,
        padding: 0,
        background: "transparent",
        cursor: "pointer",
        width: attributes["icon-width"],
      }}
    >
      <img
        src={attributes[direction === -1 ? "left-icon" : "right-icon"]}
        alt=""
        style={{ display: "block", width: "100%", height: "auto" }}
      />
    </button>
  );
  return (
    <div className={classes("pm-carousel", attributes["css-class"])} style={outerStyle(attributes)}>
      {attributes.thumbnails !== "hidden" && images.length > 0 ? (
        <div className="pm-carousel-thumbnails" style={{ display: "block", margin: 0 }}>
          {images.map((item, index) => {
            const thumb = item.attributes;
            return (
              <button
                key={index}
                type="button"
                aria-label={`Show image ${index + 1}`}
                aria-pressed={active === index}
                onClick={() => setSelected(index)}
                onMouseEnter={() => setHovered(index)}
                onMouseLeave={() => setHovered(undefined)}
                className={thumb["css-class"]}
                style={{
                  display: "inline-block",
                  padding: 0,
                  background: "transparent",
                  verticalAlign: "middle",
                  cursor: "pointer",
                  overflow: "hidden",
                  width: attributes["tb-width"] ?? `min(${100 / images.length}%, 110px)`,
                  border: thumb["tb-border"],
                  borderColor:
                    hovered === index
                      ? attributes["tb-hover-border-color"]
                      : active === index
                        ? attributes["tb-selected-border-color"]
                        : undefined,
                  borderRadius: thumb["tb-border-radius"],
                }}
              >
                {thumb.src || thumb["thumbnails-src"] ? (
                  <img
                    src={thumb["thumbnails-src"] || thumb.src}
                    alt={thumb.alt ?? ""}
                    style={{
                      display: "block",
                      width: "100%",
                      height: "auto",
                      objectFit: "contain",
                    }}
                  />
                ) : (
                  <span>Image {index + 1}</span>
                )}
              </button>
            );
          })}
        </div>
      ) : null}
      <div style={{ display: "flex", alignItems: "center", width: "100%" }}>
        {images.length > 1 ? control(-1) : null}
        <div className={a?.["css-class"]} style={{ flex: 1, minWidth: 0 }}>
          {a?.href ? (
            <a href={href(a.href)} target="_blank" rel={a.rel} onClick={click(props)}>
              {image}
            </a>
          ) : (
            image
          )}
        </div>
        {images.length > 1 ? control(1) : null}
      </div>
    </div>
  );
}

/** Render native nested-component attributes without evaluating HTML or templates. */
export function NativeItems({
  name,
  ...props
}: ItemProps & { name: "Social" | "Navbar" | "Accordion" | "Carousel" }) {
  switch (name) {
    case "Social":
      return <Social {...props} />;
    case "Navbar":
      return <Navbar {...props} />;
    case "Accordion":
      return <Accordion {...props} />;
    case "Carousel":
      return <Carousel {...props} />;
  }
}
