import { createContext, useContext, useMemo, type CSSProperties, type ReactNode } from "react";
import type { PuckContext, SlotComponent } from "@puckeditor/core";
import { useLayoutBlockProps } from "./native-layout-context";
import { hasImportedRichTextWrapper, importedRichText } from "./imported-content";
import {
  intrinsicCellValues,
  intrinsicLeafPresentation,
  intrinsicRowValues,
  validateIntrinsicContent,
  validateIntrinsicStructure,
} from "./intrinsic-layout";
import { IntrinsicResourceError } from "./intrinsic-source";
import { useNativeCanvasScope, type NativeCanvasAttributes } from "./native-canvas-context";

export const IntrinsicLayoutContext = createContext(false);
const css = (values: Record<string, string | undefined>) =>
  Object.fromEntries(
    Object.entries(values).map(([name, value]) => [
      name.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase()),
      value,
    ]),
  ) as CSSProperties;
const classes = (...values: (string | undefined)[]) => values.filter(Boolean).join(" ");

export function IntrinsicRowView(
  props: Record<string, unknown> & { cells: SlotComponent; puck: PuckContext },
) {
  const source = useLayoutBlockProps(props.id);
  const nested = useContext(IntrinsicLayoutContext);
  const native = useNativeCanvasScope();
  const validation = useMemo(() => {
    try {
      intrinsicRowValues(props);
      if (!nested && source) validateIntrinsicStructure({ type: "IntrinsicRow", props: source });
    } catch (cause) {
      return {
        message: cause instanceof Error ? cause.message : "Invalid intrinsic row",
        fatal: true,
      };
    }
    try {
      if (!nested && source)
        validateIntrinsicContent(
          { type: "IntrinsicRow", props: source },
          {
            nativeContext: native.context,
            ancestorClasses: native.ancestorClasses,
            allowLocalImages: native.context.allowLocalImages,
          },
        );
      return { message: "", fatal: false };
    } catch (cause) {
      return {
        message: cause instanceof Error ? cause.message : "Invalid intrinsic row",
        fatal: cause instanceof IntrinsicResourceError,
      };
    }
  }, [
    source,
    nested,
    native.context,
    native.ancestorClasses,
    props.padding,
    props.width,
    props.mobile,
    props.cssClass,
  ]);
  if (validation.fatal)
    return (
      <div className="pm-intrinsic-error" role="alert">
        {validation.message}. Adjust the row or use Undo.
      </div>
    );
  const row = intrinsicRowValues(props),
    Cells = props.cells;
  return (
    <div
      className={classes("pm-intrinsic-row", `pm-intrinsic-${row.mobile}`, row.cssClass)}
      data-pm-row={row.mobile}
      style={{ padding: row.padding }}
    >
      {validation.message ? (
        <div className="pm-intrinsic-error" role="alert">
          {validation.message}. Edit the highlighted content or use Undo.
        </div>
      ) : null}
      <IntrinsicLayoutContext.Provider value={true}>
        <Cells
          className="pm-intrinsic-table"
          collisionAxis="dynamic"
          minEmptyHeight={48}
          style={{
            display: "table",
            borderCollapse: "collapse",
            borderSpacing: 0,
            tableLayout: "auto",
            width: row.width,
            maxWidth: "100%",
          }}
        />
      </IntrinsicLayoutContext.Provider>
    </div>
  );
}

export function IntrinsicCellView(
  props: Record<string, unknown> & { content: SlotComponent; puck: PuckContext },
) {
  let cell: ReturnType<typeof intrinsicCellValues>;
  try {
    cell = intrinsicCellValues(props);
  } catch (cause) {
    return (
      <div role="alert" className="pm-intrinsic-error">
        {cause instanceof Error ? cause.message : "Invalid intrinsic cell"}
      </div>
    );
  }
  const Content = props.content;
  return (
    <div
      ref={props.puck.dragRef}
      className={classes("pm-intrinsic-cell", cell.cssClass)}
      data-pm-cell="1"
      style={{ display: "table-cell", padding: cell.padding, verticalAlign: cell.verticalAlign }}
    >
      {/* Puck's editing Slot defaults to height:100%. A filled cell would
          otherwise top-align its children despite the cell's verticalAlign. */}
      <Content minEmptyHeight={32} style={{ display: "block", height: "auto" }} />
    </div>
  );
}

/** Reuse the ordinary Puck leaf editors, but let the shared table size images. */
export function IntrinsicLeafView({
  name,
  props,
  source,
  attributes: a,
}: {
  name: "Text" | "Image";
  props: Record<string, unknown>;
  source?: Record<string, unknown>;
  attributes: NativeCanvasAttributes;
}) {
  const tag = name === "Text" ? "mj-text" : "mj-image";
  const p = intrinsicLeafPresentation(tag, a);
  const editing = Boolean((props.puck as PuckContext | undefined)?.isEditing);
  if (name === "Text") {
    const original = importedRichText(source ?? props);
    const imported = original !== undefined;
    return (
      <div
        data-pm-text={imported ? "native" : "rich"}
        className={classes(
          "pm-intrinsic-text",
          "pm-text",
          imported ? "pm-imported-text" : "pm-email-text",
          imported && hasImportedRichTextWrapper(source ?? props)
            ? "pm-imported-inline-text"
            : undefined,
          a["css-class"],
        )}
        style={css(p.outer)}
      >
        {imported && !editing ? (
          <div style={css(p.inner)} dangerouslySetInnerHTML={{ __html: original }} />
        ) : (
          <div style={css(p.inner)}>{props.content as ReactNode}</div>
        )}
      </div>
    );
  }
  if (!a.src) return <div className="pm-image-empty">Select an image URL</div>;
  return (
    <div
      data-pm-image="1"
      data-pm-fluid={a["fluid-on-mobile"]}
      className={classes(
        "pm-intrinsic-image",
        a["fluid-on-mobile"] === "true" ? "pm-intrinsic-fluid" : undefined,
        a["css-class"],
      )}
      style={css(p.outer)}
    >
      <a
        href={a.href || undefined}
        target={a.target}
        rel={a.rel}
        {...(a.name ? { name: a.name } : {})}
        style={{ display: "block" }}
        onClick={editing ? (event) => event.preventDefault() : undefined}
      >
        <img
          src={a.src}
          alt={a.alt ?? ""}
          title={a.title}
          srcSet={a.srcset}
          sizes={a.sizes}
          useMap={a.usemap}
          width={a.width ? Number.parseFloat(a.width) : undefined}
          style={css(p.inner)}
        />
      </a>
    </div>
  );
}
