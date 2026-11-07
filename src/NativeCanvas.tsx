import {
  createContext,
  useContext,
  type ComponentType,
  type CSSProperties,
  type ReactNode,
  type Ref,
} from "react";
import type { Config } from "@puckeditor/core";
import { nativeComponentTags } from "./NativeFields";
import { TableBlock } from "./TableBlock";
import type { TableProps } from "./table";
import { NativeItems } from "./NativeItems";
import {
  NativeLayoutContext,
  NativeLayoutData,
  columnGutter,
  columnContentWidth,
  defaultLayoutWidth,
  layoutContentWidth,
  layoutPaddingWidth,
  layoutWidth,
  useLayoutChildren,
} from "./native-layout-context";
import {
  NativeCanvasContext,
  getCanvasElement,
  hasNativeCanvasOptions,
  nativeBoxStyle,
  nativeStyle,
  typographyKeys,
  useNativeCanvasScope,
  type NativeCanvasAttributes,
  type NativeCanvasScope,
} from "./native-canvas-context";

type Props = Record<string, unknown>;
const WrapperContentContext = createContext(false);
const classes = (name: string, attributes: NativeCanvasAttributes) =>
  [name, attributes["css-class"]].filter(Boolean).join(" ");
const outerStyle = (a: NativeCanvasAttributes): CSSProperties => ({
  ...nativeStyle(a, ["padding", "padding-top", "padding-right", "padding-bottom", "padding-left"]),
  backgroundColor: a["container-background-color"],
  textAlign: a.align as CSSProperties["textAlign"],
});
const backgroundFillStyle = (a: NativeCanvasAttributes): CSSProperties => ({
  backgroundColor: a["background-color"],
  backgroundImage: a["background-url"] ? `url("${a["background-url"]}")` : undefined,
  backgroundPosition: a["background-position"],
  backgroundPositionX: a["background-position-x"],
  backgroundPositionY: a["background-position-y"],
  backgroundSize: a["background-size"],
  backgroundRepeat: a["background-repeat"] as CSSProperties["backgroundRepeat"],
});
const backgroundStyle = (a: NativeCanvasAttributes): CSSProperties => ({
  ...nativeBoxStyle(a),
  ...backgroundFillStyle(a),
});

function LayoutBox({
  kind,
  attributes: a,
  children,
}: {
  kind: "section" | "wrapper";
  attributes: NativeCanvasAttributes;
  children: ReactNode;
}) {
  const insideWrapper = useContext(WrapperContentContext);
  if (a["full-width"] !== "full-width") {
    return (
      <div
        className={classes(`pm-${kind}`, a)}
        style={{ ...backgroundStyle(a), textAlign: a["text-align"] as CSSProperties["textAlign"] }}
      >
        {children}
      </div>
    );
  }
  const contentStyle = nativeBoxStyle(a);
  delete contentStyle.backgroundColor;
  return (
    <div
      className={classes(`pm-${kind} pm-native-full-width`, a)}
      style={{
        ...backgroundFillStyle(a),
        // Full-width sections inside a wrapper fill that wrapper's content box.
        // Only body children extend past the centered email to the canvas edges.
        width: insideWrapper ? "100%" : "100cqw",
        marginInline: insideWrapper ? undefined : "calc((100% - 100cqw) / 2)",
      }}
    >
      <div
        className="pm-native-layout-content"
        style={{
          ...contentStyle,
          width: "100%",
          maxWidth: insideWrapper ? "100%" : "var(--pm-email-width, 100%)",
          marginInline: "auto",
          boxSizing: "border-box",
          textAlign: a["text-align"] as CSSProperties["textAlign"],
          overflow: a["border-radius"] ? "hidden" : undefined,
        }}
      >
        {children}
      </div>
    </div>
  );
}
function slot(props: Props, name: string, minEmptyHeight: number, style?: CSSProperties) {
  const Slot = props[name] as ComponentType<{ minEmptyHeight: number; style?: CSSProperties }>;
  return Slot ? <Slot minEmptyHeight={minEmptyHeight} style={style} /> : null;
}
function horizontalAlignment(
  align: string | undefined,
  direction: string | undefined,
): CSSProperties["justifyContent"] {
  if (align === "center") return "center";
  return (align === "right") !== (direction === "rtl") ? "flex-end" : "flex-start";
}
function columnStyle(a: NativeCanvasAttributes, fallbackWidth?: string): CSSProperties {
  return {
    ...nativeBoxStyle(a),
    flexBasis: a.width || fallbackWidth,
    alignSelf:
      a["vertical-align"] === "middle"
        ? "center"
        : a["vertical-align"] === "bottom"
          ? "flex-end"
          : "flex-start",
  };
}
function ColumnBox({
  attributes: a,
  id,
  className,
  fallbackWidth,
  dragRef,
  children,
}: {
  attributes: NativeCanvasAttributes;
  id: string;
  className: string;
  fallbackWidth?: string;
  dragRef?: Ref<HTMLDivElement>;
  children: ReactNode;
}) {
  const layout = useContext(NativeLayoutContext);
  const gutter = columnGutter(a, layout, id);
  const style = columnStyle(a, fallbackWidth || defaultLayoutWidth(layout));
  const content = (
    <NativeLayoutContext.Provider value={{ width: columnContentWidth(a, layout) }}>
      <div style={nativeBoxStyle(a, "inner-")}>{children}</div>
    </NativeLayoutContext.Provider>
  );
  return gutter ? (
    <div
      ref={dragRef}
      className={classes(
        `${className} pm-native-gutter${gutter.grouped ? "" : " pm-native-gutter-stacked"}`,
        a,
      )}
      style={{ ...gutter.style, alignSelf: style.alignSelf }}
    >
      <div className="pm-native-column-content" style={nativeBoxStyle(a)}>
        {content}
      </div>
    </div>
  ) : (
    <div ref={dragRef} className={classes(className, a)} style={style}>
      {content}
    </div>
  );
}
function ImplicitColumn({ props, prefix, count }: { props: Props; prefix: string; count: number }) {
  const parent = useNativeCanvasScope();
  const node = getCanvasElement(
    "mj-column",
    { mjClass: props[`${prefix}MjClass`], mjmlAttributes: props[`${prefix}Attributes`] },
    parent,
    { implicitColumn: true },
  );
  const a = node?.attributes ?? {};
  return (
    <NativeCanvasContext.Provider value={node?.scope ?? parent}>
      <ColumnBox
        attributes={a}
        id={prefix}
        className="pm-native-column"
        fallbackWidth={`${100 / count}%`}
      >
        {slot(props, prefix, 120)}
      </ColumnBox>
    </NativeCanvasContext.Provider>
  );
}
function NativeBlockView({
  name,
  props,
  attributes: a,
  scope,
}: {
  name: string;
  props: Props;
  attributes: NativeCanvasAttributes;
  scope: NativeCanvasScope;
}): ReactNode {
  const puck = props.puck as { dragRef?: Ref<HTMLDivElement>; isEditing?: boolean } | undefined;
  const layout = useContext(NativeLayoutContext);
  const children = useLayoutChildren(props.id, "columns");
  const siblings = children.map((child) => ({
    id: String(child.props.id),
    raw: child.type === "Raw",
  }));
  const sectionLayout = {
    width: layoutContentWidth(a, layout.width),
    gutter: a.gutter,
    direction: a.direction,
    siblings,
  };
  switch (name) {
    case "Wrapper":
      return (
        <LayoutBox kind="wrapper" attributes={a}>
          <NativeLayoutContext.Provider value={sectionLayout}>
            <WrapperContentContext.Provider value={true}>
              {slot(props, "sections", 120)}
            </WrapperContentContext.Provider>
          </NativeLayoutContext.Provider>
        </LayoutBox>
      );
    case "Section":
      return (
        <LayoutBox kind="section" attributes={a}>
          <NativeLayoutContext.Provider value={sectionLayout}>
            <div className="pm-flex-section">
              {slot(props, "columns", 100, {
                justifyContent: horizontalAlignment(a["text-align"], a.direction),
              })}
            </div>
          </NativeLayoutContext.Provider>
        </LayoutBox>
      );
    case "Section1":
    case "Section2":
    case "Section3": {
      const columns =
        name === "Section1"
          ? ["column"]
          : name === "Section2"
            ? ["left", "right"]
            : ["left", "middle", "right"];
      return (
        <LayoutBox kind="section" attributes={a}>
          <NativeLayoutContext.Provider
            value={{ ...sectionLayout, siblings: columns.map((id) => ({ id })) }}
          >
            <div
              className={`pm-columns pm-columns-${columns.length} pm-native-columns`}
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "flex-start",
                justifyContent: horizontalAlignment(a["text-align"], a.direction),
              }}
            >
              {columns.map((prefix) => (
                <ImplicitColumn key={prefix} props={props} prefix={prefix} count={columns.length} />
              ))}
            </div>
          </NativeLayoutContext.Provider>
        </LayoutBox>
      );
    }
    case "Column":
      return (
        <ColumnBox
          attributes={a}
          id={String(props.id)}
          className="pm-flex-column"
          dragRef={puck?.dragRef}
        >
          {slot(props, "content", 80)}
        </ColumnBox>
      );
    case "Group":
      return (
        <div
          ref={puck?.dragRef}
          className={classes("pm-flex-group", a)}
          style={{
            ...nativeStyle(a, ["background-color", "direction"]),
            flexBasis: a.width || defaultLayoutWidth(layout),
            alignSelf: columnStyle(a).alignSelf,
          }}
        >
          <NativeLayoutContext.Provider
            value={{
              ...layout,
              width: layoutWidth(
                a.width,
                layout.width,
                layout.width / (layout.siblings?.filter((entry) => !entry.raw).length || 1),
              ),
              direction: a.direction,
              grouped: true,
              siblings,
            }}
          >
            {slot(props, "columns", 80, {
              justifyContent: horizontalAlignment("left", a.direction),
            })}
          </NativeLayoutContext.Provider>
        </div>
      );
    case "Hero":
      return (
        <div
          className={classes("pm-hero", a)}
          style={{
            ...backgroundStyle(a),
            backgroundSize: "cover",
            minHeight: a.mode === "fixed-height" ? a.height : undefined,
            boxSizing: "border-box",
            aspectRatio:
              a.mode === "fluid-height" &&
              Number.parseFloat(a["background-width"]) > 0 &&
              Number.parseFloat(a["background-height"]) > 0
                ? `${Number.parseFloat(a["background-width"])} / ${Number.parseFloat(a["background-height"])}`
                : undefined,
            display: "flex",
            flexDirection: "column",
            justifyContent:
              a["vertical-align"] === "middle"
                ? "center"
                : a["vertical-align"] === "bottom"
                  ? "flex-end"
                  : "flex-start",
          }}
        >
          <div className="pm-hero-content" style={nativeBoxStyle(a, "inner-")}>
            <NativeLayoutContext.Provider value={{ width: layoutPaddingWidth(a, layout.width) }}>
              {slot(props, "content", 120)}
            </NativeLayoutContext.Provider>
          </div>
        </div>
      );
    case "Text":
      return (
        <div
          className={classes("pm-text", a)}
          style={{ ...outerStyle(a), ...nativeStyle(a, [...typographyKeys, "height"]) }}
        >
          {props.content as ReactNode}
        </div>
      );
    case "Image":
      return (
        <div
          className={classes(
            a["fluid-on-mobile"] === "true" ? "pm-image pm-native-image-fluid" : "pm-image",
            a,
          )}
          style={outerStyle(a)}
        >
          {a.src ? (
            <a
              href={a.href || undefined}
              target={a.target}
              rel={a.rel}
              style={{
                display: "inline-block",
                width: `${Math.min(layoutContentWidth(a, layout.width), a.width ? Number.parseInt(a.width, 10) : Infinity)}px`,
                maxWidth: "100%",
              }}
              onClick={puck?.isEditing ? (event) => event.preventDefault() : undefined}
            >
              <img
                src={a.src}
                srcSet={a.srcset || undefined}
                sizes={a.sizes || undefined}
                alt={a.alt || ""}
                title={a.title}
                useMap={a.usemap}
                style={{
                  ...nativeStyle(a, [
                    "height",
                    "max-height",
                    "font-size",
                    "border",
                    "border-top",
                    "border-right",
                    "border-bottom",
                    "border-left",
                    "border-radius",
                  ]),
                  display: "block",
                  width: "100%",
                  maxWidth: "100%",
                }}
              />
            </a>
          ) : (
            <div className="pm-image-empty">Select an image URL</div>
          )}
        </div>
      );
    case "Button":
      return (
        <div className={classes("pm-button-block", a)} style={outerStyle(a)}>
          <span
            className="pm-button"
            style={{
              ...nativeStyle(a, [
                ...typographyKeys,
                "background-color",
                "border",
                "border-top",
                "border-right",
                "border-bottom",
                "border-left",
                "border-radius",
                "width",
              ]),
              display: "inline-flex",
              flexDirection: "column",
              textAlign: (a["text-align"] || "center") as CSSProperties["textAlign"],
              minHeight: a.height,
              justifyContent:
                a["vertical-align"] === "top"
                  ? "flex-start"
                  : a["vertical-align"] === "bottom"
                    ? "flex-end"
                    : "center",
              padding: a["inner-padding"],
              boxSizing: "border-box",
            }}
          >
            {props.label as ReactNode}
          </span>
        </div>
      );
    case "Spacer":
      return (
        <div
          className={classes("pm-spacer", a)}
          style={{ ...outerStyle(a), height: a.height }}
          aria-label="Spacer"
        />
      );
    case "Divider":
      return (
        <div className={classes("pm-divider", a)} style={outerStyle(a)}>
          <hr
            style={{
              border: 0,
              width: a.width,
              borderTop: `${a["border-width"]} ${a["border-style"]} ${a["border-color"]}`,
              marginLeft: a.align === "right" || a.align === "center" ? "auto" : 0,
              marginRight: a.align === "left" || a.align === "center" ? "auto" : 0,
            }}
          />
        </div>
      );
    case "Table":
      return <TableBlock {...(props as unknown as TableProps)} nativeAttributes={a} />;
    case "Social":
    case "Navbar":
    case "Accordion":
    case "Carousel":
      return <NativeItems name={name} props={props} attributes={a} scope={scope} />;
    default:
      return null;
  }
}
function NativeBlock({
  name,
  props,
  fallback: Fallback,
}: {
  name: string;
  props: Props;
  fallback: ComponentType<Props>;
}) {
  const parent = useNativeCanvasScope();
  const layout = useContext(NativeLayoutContext);
  const childBlocks = useLayoutChildren(props.id, "columns");
  const fallback = () => {
    let content = <Fallback {...props} />;
    if (name === "Wrapper")
      content = (
        <WrapperContentContext.Provider value={true}>{content}</WrapperContentContext.Provider>
      );
    if (
      ![
        "Wrapper",
        "Section",
        "Section1",
        "Section2",
        "Section3",
        "Column",
        "Group",
        "Hero",
      ].includes(name)
    )
      return content;
    const a = getCanvasElement(nativeComponentTags[name], props, parent)?.attributes ?? {};
    const siblings = childBlocks.map((child) => ({
      id: String(child.props.id),
      raw: child.type === "Raw",
    }));
    const width =
      name === "Column"
        ? columnContentWidth(a, layout)
        : name === "Group"
          ? layoutWidth(a.width || defaultLayoutWidth(layout), layout.width, layout.width)
          : name === "Hero"
            ? layoutPaddingWidth(a, layout.width)
            : layoutContentWidth(a, layout.width);
    return (
      <NativeLayoutContext.Provider
        value={{
          width,
          siblings,
          gutter: name === "Group" ? layout.gutter : a.gutter,
          grouped: name === "Group",
          direction: a.direction,
        }}
      >
        {content}
      </NativeLayoutContext.Provider>
    );
  };
  const hasImplicitAttributes = ["column", "left", "middle", "right"].some(
    (prefix) =>
      props[`${prefix}MjClass`] !== undefined ||
      (Array.isArray(props[`${prefix}Attributes`]) &&
        (props[`${prefix}Attributes`] as unknown[]).length > 0),
  );
  const hasNestedAttributes = ["links", "items", "images"].some(
    (key) =>
      Array.isArray(props[key]) &&
      (props[key] as Props[]).some(
        (item) =>
          item &&
          (hasNativeCanvasOptions(item, parent) ||
            item.titleMjClass !== undefined ||
            item.textMjClass !== undefined ||
            [item.titleAttributes, item.textAttributes].some(
              (entries) => Array.isArray(entries) && entries.length > 0,
            )),
      ),
  );
  if (
    (!hasNativeCanvasOptions(props, parent) && !hasImplicitAttributes && !hasNestedAttributes) ||
    name === "Raw" ||
    props.htmlContent !== undefined
  )
    return fallback();
  const node = getCanvasElement(nativeComponentTags[name], props, parent);
  if (!node) return fallback();
  return (
    <NativeCanvasContext.Provider value={node.scope}>
      <NativeBlockView name={name} props={props} attributes={node.attributes} scope={node.scope} />
    </NativeCanvasContext.Provider>
  );
}
export function withNativeCanvas(config: Config): Config {
  const Root = config.root?.render;
  return {
    ...config,
    root: Root
      ? {
          ...config.root,
          render: (props: Parameters<typeof Root>[0]) => (
            <NativeLayoutData editing={Boolean(props.puck?.isEditing)}>
              <Root {...props} children={props.children as ReactNode} />
            </NativeLayoutData>
          ),
        }
      : config.root,
    components: Object.fromEntries(
      Object.entries(config.components).map(([name, component]) => [
        name,
        {
          ...component,
          render: (props: Props) => (
            <NativeBlock
              name={name}
              props={props}
              fallback={component.render as ComponentType<Props>}
            />
          ),
        },
      ]),
    ),
  };
}
