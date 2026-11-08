import {
  createContext,
  forwardRef,
  useContext,
  type ComponentType,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
  type Ref,
} from "react";
import type { Config } from "@puckeditor/core";
import { nativeComponentTags } from "./NativeFields";
import { TableBlock } from "./TableBlock";
import type { TableProps } from "./table";
import { resolveImportedAttributes } from "./import-inheritance";
import { hasImportedRichTextWrapper, importedRichText } from "./imported-content";
import { NativeItems } from "./NativeItems";
import { nativeBackgroundStyle } from "./native-background";
import {
  NativeLayoutContext,
  NativeLayoutData,
  columnGutter,
  columnContentWidth,
  defaultLayoutWidth,
  columnWidthStyle,
  layoutContentWidth,
  layoutPaddingWidth,
  layoutWidth,
  useLayoutChildren,
  useLayoutRootProps,
  useLayoutBlockProps,
  useNativeLayoutMode,
} from "./native-layout-context";
import { useNativeDragPreviewBridge, useNativeDragRowRef } from "./native-drag-preview";
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
// Puck supplies visual defaultProps to renderers, while its document retains
// omitted controls. Resolve import baselines against that raw source first.
function canvasProps(props: Props, source: Props | undefined): Props {
  if (!source) return props;
  const next = { ...props };
  for (const key of ["mjmlAttributes", "bodyAttributes", "attributeDefaults"]) {
    if (!Array.isArray(source[key])) continue;
    try {
      next[key] = resolveImportedAttributes(source, key)?.map((entry) => {
        if (!entry || typeof entry !== "object" || !entry.importBaseline) return entry;
        const { importBaseline: _baseline, ...resolved } = entry;
        return resolved;
      });
    } catch {
      // Keep malformed/in-progress host data on the usual native fallback path.
      next[key] = source[key];
    }
  }
  for (const key of ["links", "items", "images", "children"]) {
    const rendered = props[key];
    const raw = source[key];
    if (Array.isArray(rendered) && Array.isArray(raw))
      next[key] = rendered.map((item, index) =>
        item && typeof item === "object" && raw[index] && typeof raw[index] === "object"
          ? canvasProps(item, raw[index])
          : item,
      );
  }
  return next;
}
function NativeRootView({ root: Root, props }: { root: ComponentType<Props>; props: Props }) {
  const source = useLayoutRootProps();
  return <Root {...canvasProps(props, source)} />;
}
const WrapperContentContext = createContext(false);
const ColumnContentContext = createContext(false);
const classes = (name: string, attributes: NativeCanvasAttributes) =>
  [name, attributes["css-class"]].filter(Boolean).join(" ");
const outerStyle = (a: NativeCanvasAttributes): CSSProperties => ({
  ...nativeStyle(a, ["padding", "padding-top", "padding-right", "padding-bottom", "padding-left"]),
  backgroundColor: a["container-background-color"],
  textAlign: a.align as CSSProperties["textAlign"],
});
const backgroundStyle = (a: NativeCanvasAttributes, section = true): CSSProperties => ({
  ...nativeBoxStyle(a),
  ...nativeBackgroundStyle(a, section),
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
  const layout = useContext(NativeLayoutContext);
  if (a["full-width"] !== "full-width") {
    return (
      <div
        className={classes(`pm-${kind}`, a)}
        data-pm-mjml-padding={a["background-url"] ? "background" : "self"}
        style={{
          ...backgroundStyle(a),
          // MJML fixes a nested section's cap from source wrapper padding,
          // even when authored CSS later exposes more available inline space.
          maxWidth: insideWrapper ? layout.width : undefined,
          marginInline: insideWrapper ? "auto" : undefined,
          textAlign: a["text-align"] as CSSProperties["textAlign"],
        }}
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
        ...nativeBackgroundStyle(a),
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
const NativeRowElement = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function NativeRowElement({ style, ...props }, ref) {
    // Puck reads the nearest dir attribute for drag orientation; CSS direction
    // alone is insufficient. Keep group content direction off its draggable box.
    return <div {...props} ref={ref} style={style} dir={style?.direction} />;
  },
);
function slot(
  props: Props,
  name: string,
  minEmptyHeight: number,
  style?: CSSProperties,
  row?: { ref: Ref<HTMLDivElement>; dynamic: boolean },
) {
  const Slot = props[name] as ComponentType<{
    minEmptyHeight: number;
    style?: CSSProperties;
    ref?: Ref<HTMLDivElement>;
    as?: typeof NativeRowElement;
    collisionAxis?: "dynamic";
  }>;
  return Slot ? (
    <Slot
      minEmptyHeight={minEmptyHeight}
      style={style}
      {...(row
        ? {
            ref: row.ref,
            as: NativeRowElement,
            collisionAxis: row.dynamic ? ("dynamic" as const) : undefined,
          }
        : {})}
    />
  ) : null;
}
/** MJML aligns inline boxes in a zero-font-size line, not against the tallest sibling. */
function rowStyle(a: NativeCanvasAttributes, flex = false): CSSProperties {
  const justify =
    a["text-align"] === "center" || !a["text-align"]
      ? "center"
      : (a["text-align"] === "right") !== (a.direction === "rtl")
        ? "flex-end"
        : "flex-start";
  return {
    display: flex ? "flex" : "block",
    flexWrap: flex ? "wrap" : undefined,
    alignItems: flex ? "flex-start" : undefined,
    justifyContent: flex ? justify : undefined,
    fontSize: 0,
    textAlign: (a["text-align"] || "center") as CSSProperties["textAlign"],
    direction: a.direction as CSSProperties["direction"],
    "--pm-native-drag-justify": justify,
  } as CSSProperties;
}
function columnStyle(a: NativeCanvasAttributes): CSSProperties {
  return {
    ...nativeBoxStyle(a),
    fontSize: 0,
    textAlign: "left",
    direction: (a.direction || "ltr") as CSSProperties["direction"],
    verticalAlign: (a["vertical-align"] || "top") as CSSProperties["verticalAlign"],
    // Keep ordinary responsive columns constrained. The scoped CSS adapter can
    // opt this column into intrinsic tables when an authored auto width wins.
    "--pm-native-table-layout": "fixed",
  } as CSSProperties;
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
  const flex = useNativeLayoutMode() === "flex";
  const style = {
    ...columnStyle(a),
    alignSelf: flex
      ? a["vertical-align"] === "middle"
        ? "center"
        : a["vertical-align"] === "bottom"
          ? "flex-end"
          : "flex-start"
      : undefined,
    ...columnWidthStyle(a.width || fallbackWidth || defaultLayoutWidth(layout), layout, !a.width),
  };
  // MJML only renders the inner column box when padding is present, including
  // an explicit zero or a value inherited from a class/component default.
  const hasPadding = [
    "padding",
    "padding-top",
    "padding-right",
    "padding-bottom",
    "padding-left",
  ].some((name) => a[name] !== undefined);
  const content = (
    <NativeLayoutContext.Provider value={{ width: columnContentWidth(a, layout) }}>
      <div style={hasPadding ? nativeBoxStyle(a, "inner-") : undefined}>
        {/* A column's compiled table exports its first row's baseline. Keep the
            Puck slot as a block inside a cell so empty heights and drag refs survive. */}
        <div className="pm-native-column-table">
          <div className="pm-native-column-cell">
            <ColumnContentContext.Provider value={true}>{children}</ColumnContentContext.Provider>
          </div>
        </div>
      </div>
    </NativeLayoutContext.Provider>
  );
  return gutter ? (
    <div
      ref={dragRef}
      data-pm-mjml-padding={hasPadding ? "child" : undefined}
      className={classes(
        `${className} pm-native-inline-column pm-native-gutter${gutter.grouped ? "" : " pm-native-gutter-stacked"}`,
        a,
      )}
      style={{
        ...columnStyle({ direction: a.direction, "vertical-align": a["vertical-align"] }),
        ...gutter.style,
        alignSelf: style.alignSelf,
      }}
    >
      <div
        className="pm-native-column-content"
        data-pm-mjml-padding-target={hasPadding ? "" : undefined}
        style={nativeBoxStyle(a)}
      >
        {content}
      </div>
    </div>
  ) : (
    <div
      ref={dragRef}
      className={classes(`${className} pm-native-inline-column`, a)}
      data-pm-mjml-padding={hasPadding ? "self" : undefined}
      style={style}
    >
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
  source,
}: {
  name: string;
  props: Props;
  attributes: NativeCanvasAttributes;
  scope: NativeCanvasScope;
  source?: Props;
}): ReactNode {
  const puck = props.puck as { dragRef?: Ref<HTMLDivElement>; isEditing?: boolean } | undefined;
  const layout = useContext(NativeLayoutContext);
  const flex = useNativeLayoutMode() === "flex";
  const bridge = useNativeDragPreviewBridge();
  const rowRef = useNativeDragRowRef(
    name === "Group" ? "group" : "section",
    Boolean(puck?.isEditing),
  );
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
            <div className="pm-flex-section pm-native-inline-section" dir={a.direction}>
              {slot(props, "columns", 100, rowStyle(a, flex), {
                ref: rowRef,
                dynamic: Boolean(bridge && puck?.isEditing),
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
              style={rowStyle(a, flex)}
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
          className={classes("pm-flex-group pm-native-inline-group", a)}
          style={{
            ...nativeStyle(a, ["background-color", "direction"]),
            ...columnWidthStyle(a.width || defaultLayoutWidth(layout), layout),
            fontSize: 0,
            lineHeight: 0,
            textAlign: "left",
            // Unlike columns, mj-group has no default vertical-align. Omission
            // must retain CSS baseline, including author styles that set it.
            verticalAlign: a["vertical-align"] as CSSProperties["verticalAlign"],
            alignSelf: flex
              ? a["vertical-align"] === "middle"
                ? "center"
                : a["vertical-align"] === "bottom"
                  ? "flex-end"
                  : "flex-start"
              : undefined,
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
            {slot(props, "columns", 80, rowStyle({ ...a, "text-align": "left" }, flex), {
              ref: rowRef,
              dynamic: Boolean(bridge && puck?.isEditing),
            })}
          </NativeLayoutContext.Provider>
        </div>
      );
    case "Hero":
      return (
        <div
          className={classes("pm-hero", a)}
          style={{
            ...backgroundStyle(a, false),
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
    case "Text": {
      const original = importedRichText(source ?? props);
      const imported = original !== undefined;
      const wrapped = imported && hasImportedRichTextWrapper(source ?? props);
      return (
        <div
          className={classes(
            `pm-text${imported ? " pm-imported-text" : ""}${wrapped ? " pm-imported-inline-text" : ""}`,
            a,
          )}
          style={{ ...outerStyle(a), ...nativeStyle(a, [...typographyKeys, "height"]) }}
        >
          {imported && !puck?.isEditing ? (
            <div dangerouslySetInnerHTML={{ __html: original }} />
          ) : (
            (props.content as ReactNode)
          )}
        </div>
      );
    }
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
              data-pm-mjml-image-width=""
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
          className={classes("pm-spacer pm-native-spacer", a)}
          style={{ ...outerStyle(a), height: a.height, lineHeight: a.height, fontSize: 0 }}
          aria-label="Spacer"
        >
          {"\u200a"}
        </div>
      );
    case "Divider":
      return (
        <div className={classes("pm-divider", a)} style={outerStyle(a)}>
          <hr
            style={{
              border: 0,
              width: a.width,
              borderTop: `${a["border-width"]} ${a["border-style"]} ${a["border-color"]}`,
              marginTop: 0,
              marginBottom: 0,
              marginLeft: a.align === "right" || a.align === "center" ? "auto" : 0,
              marginRight: a.align === "left" || a.align === "center" ? "auto" : 0,
            }}
          />
        </div>
      );
    case "Table":
      return (
        <TableBlock
          {...(props as unknown as TableProps)}
          source={source as TableProps | undefined}
          nativeAttributes={a}
        />
      );
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
  const source = useLayoutBlockProps(props.id);
  props = canvasProps(props, source);
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
  const hasNativeLayoutChildren = (blocks: typeof childBlocks): boolean =>
    blocks.some(
      (child) =>
        (child.type === "Column" || child.type === "Group") &&
        (hasNativeCanvasOptions(child.props, parent) ||
          (Array.isArray(child.props.columns) &&
            hasNativeLayoutChildren(child.props.columns as typeof childBlocks))),
    );
  const nativeLayout =
    (name === "Section" || name === "Group") && hasNativeLayoutChildren(childBlocks);
  const hasNestedAttributes = ["links", "items", "images"].some(
    (key) =>
      Array.isArray(props[key]) &&
      (props[key] as Props[]).some(
        (item) =>
          item &&
          (item.kind === "raw" ||
            Array.isArray(item.children) ||
            hasNativeCanvasOptions(item, parent) ||
            item.titleMjClass !== undefined ||
            item.textMjClass !== undefined ||
            [item.titleAttributes, item.textAttributes].some(
              (entries) => Array.isArray(entries) && entries.length > 0,
            )),
      ),
  );
  if (
    (name !== "Image" &&
      !hasNativeCanvasOptions(props, parent) &&
      !hasImplicitAttributes &&
      !hasNestedAttributes &&
      !nativeLayout) ||
    name === "Raw" ||
    props.htmlContent !== undefined
  )
    return fallback();
  const node = getCanvasElement(nativeComponentTags[name], props, parent);
  if (node && nativeLayout) node.scope.enabled = true;
  if (!node) return fallback();
  return (
    <NativeCanvasContext.Provider value={node.scope}>
      <NativeBlockView
        name={name}
        props={props}
        source={source}
        attributes={node.attributes}
        scope={node.scope}
      />
    </NativeCanvasContext.Provider>
  );
}
/** Each compiled column component occupies its own table row. A first spacer
 * must expose its own baseline instead of borrowing a later text line. */
function NativeCanvasComponent(props: Parameters<typeof NativeBlock>[0]) {
  const inColumn = useContext(ColumnContentContext);
  const content = <NativeBlock {...props} />;
  if (!inColumn || props.name === "Raw") return content;
  return (
    <div className="pm-native-content-table">
      <div className="pm-native-content-cell">
        <ColumnContentContext.Provider value={false}>{content}</ColumnContentContext.Provider>
      </div>
    </div>
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
              <NativeRootView root={Root as ComponentType<Props>} props={props as Props} />
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
            <NativeCanvasComponent
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
