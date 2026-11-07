import { useId, useState, type ReactNode } from "react";
import { createUsePuck, type Overrides } from "@puckeditor/core";
import { CaretDownIcon } from "@phosphor-icons/react/dist/csr/CaretDown";
import { LockSimpleIcon } from "@phosphor-icons/react/dist/csr/LockSimple";

const usePuck = createUsePuck();

const groups = [
  {
    id: "content",
    label: "Content",
    fields: [
      "previewText",
      "lang",
      "src",
      "alt",
      "href",
      "caption",
      "content",
      "label",
      "links",
      "items",
      "images",
      "headerRows",
      "bodyRows",
      "footerRows",
      "html",
    ],
  },
  {
    id: "layout",
    label: "Layout",
    fields: [
      "mode",
      "width",
      "height",
      "align",
      "verticalAlign",
      "dir",
      "breakpoint",
      "tableLayout",
      "iconSize",
      "thumbnails",
    ],
  },
  {
    id: "spacing",
    label: "Spacing",
    fields: ["padding", "innerPadding", "iconPadding", "cellpadding", "cellspacing"],
  },
  {
    id: "typography",
    label: "Typography",
    fields: [
      "fontFamily",
      "fontSize",
      "fontWeight",
      "lineHeight",
      "letterSpacing",
      "color",
      "fontImports",
    ],
  },
  {
    id: "appearance",
    label: "Appearance",
    fields: [
      "backgroundColor",
      "containerBackgroundColor",
      "backgroundUrl",
      "backgroundWidth",
      "backgroundHeight",
      "border",
      "thickness",
      "borderRadius",
    ],
  },
  {
    id: "advanced",
    label: "Advanced",
    fields: [
      "cssClass",
      "mjClass",
      "mjmlAttributes",
      "bodyMjClass",
      "bodyAttributes",
      "attributeDefaults",
      "componentDefaults",
      "mjmlClasses",
      "breakpointWidth",
      "headStyles",
      "tailwind",
      "tailwindScriptUrl",
      "htmlAttributes",
      "owa",
      "htmlContent",
      "subjectHtmlContent",
      "previewHtmlContent",
      "rawHead",
      "rawFileStart",
    ],
  },
] as const;
type GroupId = (typeof groups)[number]["id"];
type InspectorField = { type: string; key?: string; visible?: boolean };
type InspectorEntry = { name: string; child: ReactNode; field?: InspectorField; order: number };

const wideFields = new Set([
  "previewText",
  "src",
  "href",
  "alt",
  "caption",
  "backgroundUrl",
  "fontFamily",
  "tailwindScriptUrl",
  "cssClass",
  "mjClass",
  "bodyMjClass",
]);

function groupFor(name: string, component: string): GroupId {
  if (name === "align" && component === "Text") return "typography";
  if (name === "color" && component === "Divider") return "appearance";
  if (/(?:Attributes|MjClass)$/.test(name)) return "advanced";
  return (
    groups.find((group) => (group.fields as readonly string[]).includes(name))?.id ?? "advanced"
  );
}

function InspectorSection({
  id,
  label,
  entries,
}: {
  id: GroupId;
  label: string;
  entries: InspectorEntry[];
}) {
  const [open, setOpen] = useState(true);
  const panelId = useId();
  return (
    <section className="pm-property-section" data-property-group={id}>
      <h3 className="pm-property-heading">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
        >
          <span>{label}</span>
          <CaretDownIcon size={14} aria-hidden="true" />
        </button>
      </h3>
      <div id={panelId} className="pm-property-body" hidden={!open}>
        {entries.map(({ name, child, field }) => {
          const inline =
            field &&
            (["text", "number", "select"].includes(field.type) || field.key === "color") &&
            !wideFields.has(name);
          return (
            <div
              key={name}
              className={`pm-property-row${inline ? " pm-property-row--inline" : ""}`}
              data-property-name={name}
            >
              {child}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function InspectorGroups({
  component,
  fields,
  renderedFields,
  isLoading,
}: {
  component: string;
  fields: Record<string, InspectorField>;
  renderedFields: Partial<Record<string, ReactNode>>;
  isLoading: boolean;
}) {
  const entries = new Map<GroupId, InspectorEntry[]>();
  Object.entries(renderedFields).forEach(([name, child]) => {
    // Puck 0.24 supplies visible, connected fields through its public API.
    // Preserve these nodes and let Puck resolve visibility and permissions,
    // including fields revealed dynamically from a hidden base schema.
    if (child === null || child === undefined || typeof child === "boolean") return;
    const field = fields[name];
    const id = groupFor(name, component);
    const names = groups.find((group) => group.id === id)!.fields as readonly string[];
    const rank = names.indexOf(name);
    const list = entries.get(id) ?? [];
    list.push({ name, child, field, order: rank < 0 ? names.length : rank });
    entries.set(id, list);
  });
  return (
    <div className="pm-properties" aria-busy={isLoading}>
      {groups.map(({ id, label }) => {
        const list = entries.get(id);
        return list?.length ? (
          <InspectorSection
            key={id}
            id={id}
            label={label}
            entries={list.sort((a, b) => a.order - b.order)}
          />
        ) : null;
      })}
    </div>
  );
}

/** Organize supplied fields without replacing their editors or document schema. */
export function PropertyInspector({ fields, isLoading }: Parameters<Overrides["fields"]>[0]) {
  const selectedId = usePuck((state) => state.selectedItem?.props.id ?? "root");
  const component = usePuck((state) => state.selectedItem?.type ?? "root");
  const componentConfig = usePuck((state) =>
    state.selectedItem ? state.config.components[state.selectedItem.type] : state.config.root,
  );
  return (
    <InspectorGroups
      key={selectedId}
      component={component}
      fields={componentConfig?.fields ?? {}}
      renderedFields={fields}
      isLoading={isLoading}
    />
  );
}

const conciseLabels: Record<string, string> = {
  "Email language (for example en or zh-Hant)": "Language",
  "Email width (px)": "Width (px)",
  "Mobile breakpoint (px)": "Breakpoint (px)",
  "Text direction": "Direction",
  "Default font family": "Font family",
  "Font family (blank inherits default)": "Font family",
  "Font family (blank inherits)": "Font family",
  "Background color (hex)": "Background",
  "Text color (hex)": "Text color",
  "Container background (hex)": "Container background",
  "Vertical alignment": "Vertical align",
  "Corner radius (px or %)": "Radius (px / %)",
  "Line height (multiplier)": "Line height",
  "Line height (px, %, or multiplier)": "Line height",
  "Padding (px or %)": "Padding",
  "Outer padding (px or %)": "Outer padding",
  "Inner padding (px or %)": "Inner padding",
  "Group width (%)": "Width (%)",
  "Fixed height (px)": "Height (px)",
  "Background image URL (optional)": "Background image",
  "Background image width (px)": "Image width (px)",
  "Background image height (px)": "Image height (px)",
  "Link URL (optional)": "Link URL",
  "Default cell padding (px)": "Cell padding (px)",
  "Table width (px, %, or auto)": "Width",
  "Table alignment": "Alignment",
  "Table layout": "Layout",
  "Table caption": "Caption",
  "Table border": "Border",
  "Icon corner radius (px)": "Icon radius (px)",
  "Tailwind utilities on canvas": "Tailwind utilities",
  "Tailwind script URL (blank = built-in)": "Tailwind script URL",
  "Legacy Outlook web layout": "Outlook web layout",
};

/** A quieter label; the original wording remains available as a tooltip. */
export function PropertyFieldLabel({
  children,
  label,
  el: Element = "label",
  readOnly,
  className,
}: Parameters<Overrides["fieldLabel"]>[0]) {
  return (
    <Element className={["pm-property-label", className].filter(Boolean).join(" ")}>
      <span className="pm-property-label-text" title={label}>
        {conciseLabels[label] ?? label}
        {readOnly ? (
          <span className="pm-property-readonly" aria-label="Read only" title="Read only">
            <LockSimpleIcon size={12} aria-hidden="true" />
          </span>
        ) : null}
      </span>
      {children}
    </Element>
  );
}
