import {
  AutoField,
  createUsePuck,
  type ArrayField,
  type Config,
  type CustomField,
  type Field,
} from "@puckeditor/core";
import { nativeCatalog } from "./native-attributes";
import { NativeAttributeEditor } from "./NativeAttributeEditor";
import { CodeArea } from "./CodeField";
import type { MjmlAttribute } from "./types";

export const nativeComponentTags: Record<string, string> = {
  Wrapper: "mj-wrapper",
  Section: "mj-section",
  Section1: "mj-section",
  Section2: "mj-section",
  Section3: "mj-section",
  Column: "mj-column",
  Group: "mj-group",
  Hero: "mj-hero",
  Text: "mj-text",
  Image: "mj-image",
  Button: "mj-button",
  Spacer: "mj-spacer",
  Divider: "mj-divider",
  Social: "mj-social",
  Navbar: "mj-navbar",
  Table: "mj-table",
  Accordion: "mj-accordion",
  Carousel: "mj-carousel",
  Raw: "mj-raw",
};

const usePuck = createUsePuck();
const classField = (label = "MJML classes"): Field => ({
  type: "text",
  label,
  placeholder: "class-one class-two",
});
const nativeDefaults = () => ({ mjmlAttributes: [] as MjmlAttribute[] });

/** Puck passes the full nested field path to custom array fields. */
export function nativeAttributeTagFromPath(root: unknown, path: string): string {
  const segments = path.replace(/\[(\d+)\]/g, ".$1").split(".");
  const attributesIndex = segments.lastIndexOf("attributes");
  if (attributesIndex < 0) return "*";
  let parent = root;
  for (const segment of segments.slice(0, attributesIndex)) {
    if (!parent || typeof parent !== "object") return "*";
    parent = (parent as Record<string, unknown>)[segment];
  }
  return parent &&
    typeof parent === "object" &&
    typeof (parent as { tag?: unknown }).tag === "string"
    ? (parent as { tag: string }).tag
    : "*";
}

export function nativeEntryTagFromPath(props: unknown, path: string, fallbackTag: string): string {
  const segments = path.replace(/\[(\d+)\]/g, ".$1").split(".");
  const attributesIndex = segments.lastIndexOf("mjmlAttributes");
  if (attributesIndex < 0) return fallbackTag;
  let parent = props;
  for (const segment of segments.slice(0, attributesIndex)) {
    if (!parent || typeof parent !== "object") return fallbackTag;
    parent = (parent as Record<string, unknown>)[segment];
  }
  if (parent && typeof parent === "object") {
    const kind = (parent as { kind?: unknown }).kind;
    if (kind === "raw") return "mj-raw";
    if (fallbackTag === "mj-accordion-title" && kind === "text") return "mj-accordion-text";
  }
  return fallbackTag;
}

function OrderedAccordionChildren({
  array,
  ...props
}: Parameters<CustomField<unknown>["render"]>[0] & { array: ArrayField }) {
  const enabled = Array.isArray(props.value);
  const locks = usePuck((state) => state.selectedItem?.readOnly ?? {});
  const selected = usePuck((state) => state.selectedItem?.props);
  const canEdit = usePuck((state) =>
    state.selectedItem ? state.getPermissions({ item: state.selectedItem }).edit : false,
  );
  const path = (value: string) => value.replace(/\[(\d+|\*)\]/g, ".$1").split(".");
  const fieldPath = path(props.name);
  const locked =
    props.readOnly ||
    !canEdit ||
    Object.entries(locks).some(([name, value]) => {
      const rule = path(name);
      return (
        value &&
        rule
          .slice(0, fieldPath.length)
          .every(
            (part, index) =>
              part === fieldPath[index] || (part === "*" && /^\d+$/.test(fieldPath[index])),
          )
      );
    });
  const initialChildren = () => {
    let parent: unknown = selected;
    for (const segment of fieldPath.slice(0, -1))
      parent =
        parent && typeof parent === "object"
          ? (parent as Record<string, unknown>)[segment]
          : undefined;
    const item = parent && typeof parent === "object" ? (parent as Record<string, unknown>) : {};
    return [
      {
        kind: "title",
        content: item.title ?? "",
        htmlContent: item.titleHtmlContent,
        mjClass: item.titleMjClass,
        mjmlAttributes: item.titleAttributes ?? [],
      },
      {
        kind: "text",
        content: item.content ?? "",
        htmlContent: item.htmlContent,
        mjClass: item.textMjClass,
        mjmlAttributes: item.textAttributes ?? [],
      },
    ];
  };
  return (
    <div className="pm-field">
      <label htmlFor={`${props.id}-enabled`} className="pm-field-toggle">
        <input
          id={`${props.id}-enabled`}
          type="checkbox"
          checked={enabled}
          disabled={locked}
          onChange={(event) => props.onChange(event.target.checked ? initialChildren() : undefined)}
        />
        Use ordered native children
      </label>
      {enabled && (
        <>
          <p>
            Replaces the title and answer fields above. Add title, answer, or raw HTML children in
            source order.
          </p>
          <AutoField {...props} field={array} readOnly={locked} />
        </>
      )}
    </div>
  );
}

function orderedAccordionField(allowRawHtml: boolean): CustomField<unknown> {
  const array: ArrayField = {
    type: "array",
    label: "Ordered native children",
    arrayFields: {
      kind: {
        type: "select",
        label: "Child type",
        options: [
          { label: "Title", value: "title" },
          { label: "Answer", value: "text" },
          ...(allowRawHtml ? [{ label: "Raw HTML", value: "raw" }] : []),
        ],
      },
      content: { type: "textarea", label: "Title text or answer HTML" },
      htmlContent: optionalHtmlField(allowRawHtml),
      html: {
        type: "custom",
        label: "Raw HTML source",
        visible: allowRawHtml,
        render: ({ id, value, onChange, readOnly }) => (
          <CodeArea
            id={id}
            value={value}
            ariaLabel="Raw HTML source"
            onChange={onChange}
            disabled={readOnly}
          />
        ),
      },
      mjClass: classField(),
      mjmlAttributes: nativeAttributeField(
        "mj-accordion-title",
        "Element attributes",
        "mj-accordion-title",
        allowRawHtml,
      ),
    },
    defaultItemProps: { kind: "text", content: "", mjmlAttributes: [] },
    getItemSummary: (item) =>
      item.kind === "raw" ? "Raw HTML" : item.kind === "title" ? "Title" : "Answer",
  };
  return {
    type: "custom",
    label: "Ordered native children",
    render: (props) => <OrderedAccordionChildren {...props} array={array} />,
  };
}

function ContextAttributeEditor({
  tag,
  dynamicTag,
  ...props
}: Parameters<typeof NativeAttributeEditor>[0] & { dynamicTag: boolean | string }) {
  const resolvedTag = usePuck((state) =>
    typeof dynamicTag === "string"
      ? nativeEntryTagFromPath(state.selectedItem?.props, props.name, dynamicTag)
      : dynamicTag
        ? nativeAttributeTagFromPath(state.appState.data.root.props, props.name)
        : tag,
  );
  const readOnlyFields = usePuck((state) =>
    state.selectedItem ? state.selectedItem.readOnly : state.appState.data.root.readOnly,
  );
  const canEdit = usePuck(
    (state) =>
      state.getPermissions(state.selectedItem ? { item: state.selectedItem } : { root: true }).edit,
  );
  return (
    <NativeAttributeEditor
      {...props}
      tag={resolvedTag || tag}
      readOnly={props.readOnly || !canEdit}
      readOnlyFields={readOnlyFields}
    />
  );
}

export function nativeAttributeField(
  tag: string,
  label = "Element attributes",
  dynamicTag: boolean | string = false,
  allowRawHtml = false,
): CustomField<MjmlAttribute[]> {
  return {
    type: "custom",
    key: "native-attributes",
    label,
    render: (props) => (
      <ContextAttributeEditor
        {...props}
        tag={tag}
        dynamicTag={dynamicTag}
        label={label}
        allowRawHtml={allowRawHtml}
      />
    ),
  };
}

export function nativeElementFields(tag: string, allowRawHtml = false): Record<string, Field> {
  return {
    mjClass: classField(),
    mjmlAttributes: nativeAttributeField(tag, undefined, false, allowRawHtml),
  };
}

function namedElementFields(
  prefix: string,
  tag: string,
  label: string,
  allowRawHtml = false,
): Record<string, Field> {
  return {
    [`${prefix}MjClass`]: classField(`${label} MJML classes`),
    [`${prefix}Attributes`]: nativeAttributeField(tag, `${label} attributes`, false, allowRawHtml),
  };
}

function namedElementDefaults(prefix: string) {
  return { [`${prefix}Attributes`]: [] };
}

export function TrustedHtmlPreview({
  html,
  label = "Trusted HTML source",
  inline = false,
}: {
  html: string;
  label?: string;
  inline?: boolean;
}) {
  const Element = inline ? "span" : "div";
  return (
    <Element className="pm-raw">
      <strong>{label}</strong>
      <code>{html === "" ? "(empty HTML)" : html}</code>
    </Element>
  );
}

function optionalSourceField(visible: boolean, label: string, multiline: boolean): Field {
  return {
    type: "custom",
    label,
    visible,
    render: ({ id, value, onChange, readOnly }) => {
      const enabled = typeof value === "string";
      return (
        <div className="pm-field pm-source-field">
          <label htmlFor={`${id}-enabled`} className="pm-field-toggle">
            <input
              id={`${id}-enabled`}
              type="checkbox"
              checked={enabled}
              disabled={readOnly}
              onChange={(event) => onChange(event.target.checked ? "" : undefined)}
            />
            {label}
          </label>
          {enabled &&
            (multiline ? (
              <CodeArea
                id={id}
                value={value}
                disabled={readOnly}
                ariaLabel={label}
                onChange={onChange}
              />
            ) : (
              <input
                id={id}
                type="text"
                value={value}
                disabled={readOnly}
                onChange={(event) => onChange(event.target.value)}
                aria-label={label}
                className="pm-source-value"
              />
            ))}
        </div>
      );
    },
  };
}

export function optionalHtmlField(allowRawHtml: boolean, label = "Trusted HTML content"): Field {
  return optionalSourceField(allowRawHtml, label, true);
}

function componentDefaultsField(label: string, allowRawHtml = false): ArrayField {
  const tags = Object.entries(nativeCatalog)
    .filter(([, component]) => component.kind === "body")
    .map(([tag]) => tag)
    .sort();
  return {
    type: "array",
    label,
    arrayFields: {
      tag: {
        type: "select",
        label: "MJML element",
        options: tags.map((tag) => ({ label: tag, value: tag })),
      },
      attributes: nativeAttributeField("*", "Default attributes", true, allowRawHtml),
    },
    defaultItemProps: { tag: "mj-text", attributes: [] },
    getItemSummary: (item) => item.tag || "MJML element",
  };
}

export function nativeRootFields(allowRawHtml = false): Record<string, Field> {
  return {
    breakpointWidth: optionalSourceField(true, "Native breakpoint width", false),
    subjectHtmlContent: optionalHtmlField(allowRawHtml, "Trusted document title HTML"),
    previewHtmlContent: optionalHtmlField(allowRawHtml, "Trusted preview HTML"),
    bodyMjClass: classField("Body classes"),
    bodyAttributes: nativeAttributeField("mj-body", "Body attributes", false, allowRawHtml),
    attributeDefaults: nativeAttributeField("*", "Global attribute defaults", false, allowRawHtml),
    componentDefaults: componentDefaultsField("Element defaults", allowRawHtml),
    mjmlClasses: {
      type: "array",
      label: "MJML classes",
      arrayFields: {
        name: { type: "text", label: "Class name" },
        attributes: nativeAttributeField("*", "Class attributes", false, allowRawHtml),
        components: componentDefaultsField("Element defaults", allowRawHtml),
      },
      defaultItemProps: { name: "custom", attributes: [], components: [] },
      getItemSummary: (item) => item.name || "MJML class",
    },
  };
}

function extendNestedArray(
  component: Config["components"][string],
  property: string,
  fields: Record<string, Field>,
  defaults: Record<string, unknown>,
) {
  const field = component.fields?.[property];
  if (!field || field.type !== "array" || !("arrayFields" in field))
    throw new Error(`Missing array field: ${property}`);
  const array = field as ArrayField;
  const itemDefaults = array.defaultItemProps;
  const initialItems = component.defaultProps?.[property];
  return {
    ...component,
    fields: {
      ...component.fields,
      [property]: {
        ...array,
        arrayFields: { ...array.arrayFields, ...fields },
        defaultItemProps:
          typeof itemDefaults === "function"
            ? (index: number) => ({ ...defaults, ...itemDefaults(index) })
            : { ...defaults, ...itemDefaults },
      },
    },
    defaultProps: {
      ...component.defaultProps,
      ...(Array.isArray(initialItems)
        ? { [property]: initialItems.map((item) => ({ ...defaults, ...item })) }
        : {}),
    },
  };
}

/** Add native controls without changing any visual field or renderer. */
export function withNativeFields(config: Config, allowRawHtml = false): Config {
  const components = Object.fromEntries(
    Object.entries(config.components).map(([name, component]) => {
      const tag = nativeComponentTags[name];
      if (!tag) throw new Error(`Missing native MJML tag for ${name}`);
      return [
        name,
        {
          ...component,
          fields: { ...component.fields, ...nativeElementFields(tag, allowRawHtml) },
          defaultProps: { ...nativeDefaults(), ...component.defaultProps },
        },
      ];
    }),
  );

  for (const [name, property, tag] of [
    ["Social", "links", "mj-social-element"],
    ["Navbar", "links", "mj-navbar-link"],
    ["Carousel", "images", "mj-carousel-image"],
  ]) {
    components[name] = extendNestedArray(
      components[name],
      property,
      nativeElementFields(tag, allowRawHtml),
      nativeDefaults(),
    );
  }
  components.Accordion = extendNestedArray(
    components.Accordion,
    "items",
    {
      ...nativeElementFields("mj-accordion-element", allowRawHtml),
      ...namedElementFields("title", "mj-accordion-title", "Title", allowRawHtml),
      ...namedElementFields("text", "mj-accordion-text", "Text", allowRawHtml),
      titleHtmlContent: optionalHtmlField(allowRawHtml, "Trusted title HTML"),
      htmlContent: optionalHtmlField(allowRawHtml, "Trusted content HTML"),
      kind: {
        type: "select",
        label: "Entry type",
        visible: allowRawHtml,
        options: [
          { label: "Accordion element", value: "element" },
          { label: "Raw HTML", value: "raw" },
        ],
      },
      html: {
        type: "custom",
        label: "Raw HTML source",
        visible: allowRawHtml,
        render: ({ id, value, onChange, readOnly }) => (
          <CodeArea
            id={id}
            value={value}
            ariaLabel="Raw HTML source"
            onChange={onChange}
            disabled={readOnly}
          />
        ),
      },
      mjmlAttributes: nativeAttributeField(
        "mj-accordion-element",
        "Element attributes",
        "mj-accordion-element",
        allowRawHtml,
      ),
      children: orderedAccordionField(allowRawHtml),
    },
    { ...nativeDefaults(), ...namedElementDefaults("title"), ...namedElementDefaults("text") },
  );

  for (const name of ["Text", "Button", "Table"]) {
    const component = components[name];
    const RenderComponent = component.render;
    components[name] = {
      ...component,
      fields: { ...component.fields, htmlContent: optionalHtmlField(allowRawHtml) },
      render: (props) =>
        typeof props.htmlContent === "string" ? (
          <TrustedHtmlPreview html={props.htmlContent} />
        ) : (
          <RenderComponent {...props} />
        ),
    };
  }

  for (const name of ["Social", "Navbar"]) {
    components[name] = extendNestedArray(
      components[name],
      "links",
      {
        kind: {
          type: "select",
          label: "Entry type",
          visible: allowRawHtml,
          options: [
            { label: "Link", value: "link" },
            { label: "Raw HTML", value: "raw" },
          ],
        },
        html: {
          type: "custom",
          label: "Raw HTML source",
          visible: allowRawHtml,
          render: ({ value, onChange, readOnly }) => (
            <CodeArea
              ariaLabel="Raw HTML source"
              value={value}
              disabled={readOnly}
              onChange={onChange}
            />
          ),
        },
        htmlContent: optionalHtmlField(allowRawHtml),
        mjmlAttributes: nativeAttributeField(
          name === "Social" ? "mj-social-element" : "mj-navbar-link",
          "Element attributes",
          name === "Social" ? "mj-social-element" : "mj-navbar-link",
          allowRawHtml,
        ),
      },
      {},
    );
    const links = components[name].fields?.links as ArrayField;
    const summarize = links.getItemSummary;
    links.getItemSummary = (item, index) =>
      item.kind === "raw" ? "Raw HTML" : summarize?.(item, index) || "Link";
  }

  for (const [name, columns] of Object.entries({
    Section1: ["column"],
    Section2: ["left", "right"],
    Section3: ["left", "middle", "right"],
  })) {
    for (const column of columns) {
      const component = components[name];
      const label =
        column === "column" ? "Column" : `${column[0].toUpperCase()}${column.slice(1)} column`;
      components[name] = {
        ...component,
        fields: {
          ...component.fields,
          ...namedElementFields(column, "mj-column", label, allowRawHtml),
        },
        defaultProps: { ...namedElementDefaults(column), ...component.defaultProps },
      };
    }
  }

  return {
    ...config,
    root: {
      ...config.root,
      fields: { ...config.root?.fields, ...nativeRootFields(allowRawHtml) },
      defaultProps: {
        bodyAttributes: [],
        attributeDefaults: [],
        componentDefaults: [],
        mjmlClasses: [],
        ...config.root?.defaultProps,
      },
    },
    components,
  };
}
