import {
  readImportedAttributeSources,
  type NativeAttributeSource,
  type NativeAttributeSources,
} from "./imported-attribute-source";
import { resolveImportedAttributes } from "./import-inheritance";
import { nativeCatalog, normalizeMjClass, readNativeAttributes } from "./native-attributes";
import type { EmailSettings, ExportOptions, MjmlAttribute, MjmlElementOptions } from "./types";

export type NativeAttributeValues = Readonly<Record<string, string>>;
export type NativeClass = Readonly<{
  attributes: NativeAttributeValues;
  components: Readonly<Record<string, NativeAttributeValues>>;
}>;
type NativeSourceClass = Readonly<{
  attributes: NativeAttributeSources;
  components: Readonly<Record<string, NativeAttributeSources>>;
}>;
export type NativeContext = Readonly<{
  all: NativeAttributeValues;
  components: Readonly<Record<string, NativeAttributeValues>>;
  classes: Readonly<Record<string, NativeClass>>;
  sources: Readonly<{
    all: NativeAttributeSources;
    components: Readonly<Record<string, NativeAttributeSources>>;
    classes: Readonly<Record<string, NativeSourceClass>>;
  }>;
  hasNativeDefinitions: boolean;
  allowRawHtml: boolean;
  allowLocalImages: boolean;
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

function mergeEdits<T>(target: Record<string, T>, changes: Record<string, T | null>) {
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
  const sources = {
    all: map<NativeAttributeSource>(),
    components: map<Record<string, NativeAttributeSource>>(),
    classes: map<{
      attributes: Record<string, NativeAttributeSource>;
      components: Record<string, Record<string, NativeAttributeSource>>;
    }>(),
  };
  const font = typeof source.fontFamily === "string" ? source.fontFamily.trim() : "";
  all["font-family"] = /^[\p{L}\p{N} ,'"_-]{1,160}$/u.test(font) ? font : "Arial, sans-serif";
  const globalEntries = resolveImportedAttributes(source, "attributeDefaults");
  const globalEdits = readNativeAttributes("*", globalEntries, options);
  mergeEdits(all, globalEdits);
  mergeEdits(sources.all, readImportedAttributeSources("*", globalEntries, options));

  const components = map<Record<string, string>>();
  for (const entry of records(source.componentDefaults, "MJML component defaults")) {
    const tag = componentTag(entry.tag);
    const values = own(components, tag) ?? (components[tag] = map<string>());
    mergeEdits(values, readNativeAttributes(tag, entry.attributes, options));
    const sourceValues =
      own(sources.components, tag) ?? (sources.components[tag] = map<NativeAttributeSource>());
    mergeEdits(
      sourceValues,
      readImportedAttributeSources(tag, entry.attributes as MjmlAttribute[], options),
    );
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
    const sourceDefinition =
      own(sources.classes, name) ??
      (sources.classes[name] = {
        attributes: map<NativeAttributeSource>(),
        components: map<Record<string, NativeAttributeSource>>(),
      });
    const attributes = readNativeAttributes("*", entry.attributes, options);
    if (Object.hasOwn(attributes, "name"))
      throw new Error("MJML class attributes cannot override the reserved name attribute");
    mergeEdits(definition.attributes, attributes);
    mergeEdits(
      sourceDefinition.attributes,
      readImportedAttributeSources("*", entry.attributes as MjmlAttribute[], options),
    );
    for (const child of records(entry.components, `MJML class ${name} component defaults`)) {
      if (/\.|\[|\]/.test(name)) {
        throw new Error(
          `MJML class ${name} cannot have nested component defaults: the native compiler interprets dots and brackets as paths. Use a class name without these characters.`,
        );
      }
      const tag = componentTag(child.tag);
      // Native mj-class definitions merge by tag, replacing a repeated tag's complete map.
      const values = map<string>();
      mergeEdits(values, readNativeAttributes(tag, child.attributes, options));
      definition.components[tag] = values;
      const sourceValues = map<NativeAttributeSource>();
      mergeEdits(
        sourceValues,
        readImportedAttributeSources(tag, child.attributes as MjmlAttribute[], options),
      );
      sourceDefinition.components[tag] = sourceValues;
    }
  }

  return freeze({
    all,
    components,
    classes,
    sources,
    allowRawHtml: options.allowRawHtml === true,
    allowLocalImages: options.allowLocalImages === true,
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
  attributeSources: NativeAttributeSources;
} {
  componentTag(tag);
  const attributes = map<string | number | undefined>();
  for (const [name, value] of Object.entries(base)) {
    // Blank generated controls have always meant omitted; explicit native blanks are kept below.
    if (value !== undefined && value !== "") attributes[name] = value;
  }
  if (props.mjClass !== undefined) attributes["mj-class"] = normalizeMjClass(props.mjClass) ?? "";
  const entries = resolveImportedAttributes(props);
  const edits = readNativeAttributes(tag, entries, context);
  for (const [name, value] of Object.entries(edits)) {
    if (value === null) delete attributes[name];
    else attributes[name] = value;
  }

  const attributeSources = map<NativeAttributeSource>();
  mergeEdits(attributeSources, readImportedAttributeSources(tag, entries, context));

  // The reader has already validated every entry. Preserve the status of the
  // last local edit so final serialization bypasses value validation only for
  // explicitly trusted templates, never for unrelated generated attributes.
  const templates = new Set<string>();
  for (const entry of entries ?? []) {
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
    attributeSources,
    childClasses: ownClasses ?? inheritedClasses,
    templateAttributes: Object.freeze([...templates]),
  };
}
