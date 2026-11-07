import { nativeCatalog, normalizeMjClass, readNativeAttributes } from "./native-attributes";
import type { EmailSettings, ExportOptions, MjmlElementOptions } from "./types";

export type NativeAttributeValues = Readonly<Record<string, string>>;
export type NativeClass = Readonly<{
  attributes: NativeAttributeValues;
  components: Readonly<Record<string, NativeAttributeValues>>;
}>;
export type NativeContext = Readonly<{
  all: NativeAttributeValues;
  components: Readonly<Record<string, NativeAttributeValues>>;
  classes: Readonly<Record<string, NativeClass>>;
  hasNativeDefinitions: boolean;
  allowRawHtml: boolean;
}>;
export type NativeElementAttributes = Record<string, string | number | undefined>;

const map = <T>(): Record<string, T> => Object.create(null) as Record<string, T>;
const own = <T>(values: Readonly<Record<string, T>>, key: string): T | undefined =>
  Object.hasOwn(values, key) ? values[key] : undefined;

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function records(value: unknown, label: string): Record<string, unknown>[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value.map((entry) => record(entry, `${label} entry`));
}

function componentTag(value: unknown): string {
  if (typeof value !== "string" || !Object.hasOwn(nativeCatalog, value)) {
    throw new Error(`Unknown MJML component: ${String(value)}`);
  }
  return value;
}

function mergeEdits(target: Record<string, string>, changes: Record<string, string | null>) {
  for (const [name, value] of Object.entries(changes)) {
    if (value === null) delete target[name];
    else target[name] = value;
  }
}

function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

/** Compile the exact definitions emitted in mj-attributes, without retaining host objects. */
export function createNativeContext(
  settings: EmailSettings = {},
  options: ExportOptions = {},
): NativeContext {
  const source = record(settings, "Email settings");
  const all = map<string>();
  const font = typeof source.fontFamily === "string" ? source.fontFamily.trim() : "";
  all["font-family"] = /^[\p{L}\p{N} ,'"_-]{1,160}$/u.test(font) ? font : "Arial, sans-serif";
  const globalEdits = readNativeAttributes("*", source.attributeDefaults, options);
  mergeEdits(all, globalEdits);

  const components = map<Record<string, string>>();
  for (const entry of records(source.componentDefaults, "MJML component defaults")) {
    const tag = componentTag(entry.tag);
    const values = own(components, tag) ?? (components[tag] = map<string>());
    mergeEdits(values, readNativeAttributes(tag, entry.attributes, options));
  }

  const classes = map<{
    attributes: Record<string, string>;
    components: Record<string, Record<string, string>>;
  }>();
  for (const entry of records(source.mjmlClasses, "MJML classes")) {
    const name = normalizeMjClass(entry.name);
    if (!name || name.includes(" "))
      throw new Error("MJML class definitions need one nonempty name");
    const definition =
      own(classes, name) ??
      (classes[name] = { attributes: map<string>(), components: map<Record<string, string>>() });
    const attributes = readNativeAttributes("*", entry.attributes, options);
    if (Object.hasOwn(attributes, "name"))
      throw new Error("MJML class attributes cannot override the reserved name attribute");
    mergeEdits(definition.attributes, attributes);
    for (const child of records(entry.components, `MJML class ${name} component defaults`)) {
      const tag = componentTag(child.tag);
      // Native mj-class definitions merge by tag, replacing a repeated tag's complete map.
      const values = map<string>();
      mergeEdits(values, readNativeAttributes(tag, child.attributes, options));
      definition.components[tag] = values;
    }
  }

  return freeze({
    all,
    components,
    classes,
    allowRawHtml: options.allowRawHtml === true,
    hasNativeDefinitions:
      Object.keys(globalEdits).length > 0 ||
      Object.keys(components).length > 0 ||
      Object.keys(classes).length > 0,
  });
}

/** Resolve local output and the installed compiler's cascade without serializing MJML. */
export function applyNativeAttributes(
  tag: string,
  props: MjmlElementOptions,
  base: NativeElementAttributes,
  context: NativeContext,
  ancestorClasses?: string,
): {
  attributes: NativeElementAttributes;
  effective: Record<string, unknown>;
  childClasses?: string;
  templateAttributes: readonly string[];
} {
  componentTag(tag);
  const attributes = map<string | number | undefined>();
  for (const [name, value] of Object.entries(base)) {
    // Blank generated controls have always meant omitted; explicit native blanks are kept below.
    if (value !== undefined && value !== "") attributes[name] = value;
  }
  if (props.mjClass !== undefined) attributes["mj-class"] = normalizeMjClass(props.mjClass) ?? "";
  const edits = readNativeAttributes(tag, props.mjmlAttributes, context);
  for (const [name, value] of Object.entries(edits)) {
    if (value === null) delete attributes[name];
    else attributes[name] = value;
  }

  // The reader has already validated every entry. Preserve the status of the
  // last local edit so final serialization bypasses value validation only for
  // explicitly trusted templates, never for unrelated generated attributes.
  const templates = new Set<string>();
  for (const entry of props.mjmlAttributes ?? []) {
    const name = entry.name.trim();
    if (!name) continue;
    if (Object.hasOwn(entry, "inherit") && entry.inherit === true) templates.delete(name);
    else if (Object.hasOwn(entry, "value") && entry.value !== undefined) {
      if (Object.hasOwn(entry, "template") && entry.template === true) templates.add(name);
      else templates.delete(name);
    }
  }

  const ownClasses = Object.hasOwn(attributes, "mj-class")
    ? templates.has("mj-class")
      ? String(attributes["mj-class"])
      : (normalizeMjClass(attributes["mj-class"]) ?? "")
    : undefined;
  if (ownClasses !== undefined) attributes["mj-class"] = ownClasses;
  const inheritedClasses =
    ancestorClasses === undefined
      ? undefined
      : context.allowRawHtml
        ? ancestorClasses
        : (normalizeMjClass(ancestorClasses) ?? "");

  const classAttributes = map<string>();
  for (const name of (ownClasses ?? "").split(" ")) {
    const definition = own(context.classes, name);
    if (!definition) continue;
    const concatenated =
      classAttributes["css-class"] && definition.attributes["css-class"]
        ? `${classAttributes["css-class"]} ${definition.attributes["css-class"]}`
        : undefined;
    Object.assign(classAttributes, definition.attributes);
    if (concatenated !== undefined) classAttributes["css-class"] = concatenated;
  }

  const ancestorAttributes = map<string>();
  for (const name of (inheritedClasses ?? "").split(" ")) {
    const definition = own(context.classes, name);
    const defaults = definition && own(definition.components, tag);
    if (defaults) Object.assign(ancestorAttributes, defaults);
  }

  const effective = map<unknown>();
  const serializedLocal = Object.fromEntries(
    Object.entries(attributes).map(([name, value]) => [name, String(value)]),
  );
  Object.assign(
    effective,
    structuredClone(nativeCatalog[tag].defaultAttributes),
    context.all,
    own(context.components, tag),
    classAttributes,
    ancestorAttributes,
    serializedLocal,
  );
  delete effective["mj-class"];
  return {
    attributes,
    effective,
    childClasses: ownClasses ?? inheritedClasses,
    templateAttributes: Object.freeze([...templates]),
  };
}
