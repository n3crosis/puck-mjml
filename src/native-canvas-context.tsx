import { createContext, useContext, type CSSProperties, type ReactNode } from "react";
import { applyNativeAttributes, createNativeContext, type NativeContext } from "./native-cascade";
import { nativeAttributeNames, readNativeAttributes } from "./native-attributes";
import { getNativeBaseAttributes, type NativeBaseOptions } from "./native-base";
import { aliasFontFamilyList, type FontAliasMap } from "./canvas-css";
import type { EmailSettings, MjmlElementOptions } from "./types";

export type NativeCanvasAttributes = Record<string, string>;
export type NativeCanvasScope = {
  context: NativeContext;
  ancestorClasses?: string;
  enabled: boolean;
  /** Per-instance web font aliases applied to every canvas font-family value. */
  fontAliases?: FontAliasMap;
};
export const NativeCanvasContext = createContext<NativeCanvasScope>({
  context: createNativeContext(),
  enabled: false,
});
export const useNativeCanvasScope = () => useContext(NativeCanvasContext);

/** The canvas never evaluates or applies an unresolved trusted template expression. */
function concreteEntries(entries: unknown): unknown {
  if (!Array.isArray(entries)) return entries;
  return entries.filter((entry) => !entry || entry.template !== true || entry.inherit === true);
}

function concreteDefinitions(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  return value.map((entry) =>
    entry && typeof entry === "object" && !Array.isArray(entry)
      ? {
          ...entry,
          attributes: concreteEntries(entry.attributes),
          ...(entry.components !== undefined
            ? { components: concreteDefinitions(entry.components) }
            : {}),
        }
      : entry,
  );
}

export function createCanvasScope(
  settings: EmailSettings = {},
  fontAliases?: FontAliasMap,
): NativeCanvasScope {
  try {
    const context = createNativeContext({
      ...settings,
      attributeDefaults: concreteEntries(settings.attributeDefaults),
      componentDefaults: concreteDefinitions(settings.componentDefaults),
      mjmlClasses: concreteDefinitions(settings.mjmlClasses),
    } as EmailSettings);
    const body = applyNativeAttributes(
      "mj-body",
      {
        ...settings,
        mjClass: settings.bodyMjClass,
        mjmlAttributes: concreteEntries(settings.bodyAttributes),
      } as MjmlElementOptions,
      {},
      context,
    );
    return {
      context,
      ancestorClasses: body.childClasses,
      enabled:
        context.hasNativeDefinitions ||
        Boolean(body.childClasses) ||
        Boolean(settings.bodyAttributes?.length),
      fontAliases,
    };
  } catch {
    // Partial sidebar drafts should not unmount the editor or lose the selection.
    return {
      context: createNativeContext({ fontFamily: settings.fontFamily }),
      enabled: false,
      fontAliases,
    };
  }
}

export function NativeCanvasProvider({
  settings,
  fontAliases,
  children,
}: {
  settings?: EmailSettings;
  fontAliases?: FontAliasMap;
  children: ReactNode;
}) {
  return (
    <NativeCanvasContext.Provider value={createCanvasScope(settings, fontAliases)}>
      {children}
    </NativeCanvasContext.Provider>
  );
}

export function hasNativeCanvasOptions(
  props: Record<string, unknown>,
  scope: NativeCanvasScope,
): boolean {
  return (
    scope.enabled ||
    props.mjClass !== undefined ||
    (Array.isArray(props.mjmlAttributes) &&
      props.mjmlAttributes.some(
        (entry) => entry && typeof entry.name === "string" && entry.name.trim(),
      ))
  );
}

/** Resolve the same defaults, visual attributes, classes, and local overrides as export. */
export function getCanvasElement(
  tag: string,
  props: Record<string, unknown>,
  parent: NativeCanvasScope,
  options: NativeBaseOptions & {
    base?: Record<string, string | number | undefined>;
    inherited?: NativeCanvasAttributes;
  } = {},
): { attributes: NativeCanvasAttributes; scope: NativeCanvasScope } | undefined {
  try {
    const concrete = {
      ...props,
      mjmlAttributes: concreteEntries(props.mjmlAttributes),
    } as MjmlElementOptions;
    const base = {
      ...getNativeBaseAttributes(tag, props, { ...options, nativeEnabled: true }),
      ...options.base,
    };
    // Native renderChildren supplies these attributes after mj-all but before
    // child tag/class/local values. Keep the derived defaults local to this
    // render; the returned scope retains the original document context.
    const context = options.inherited
      ? { ...parent.context, all: { ...parent.context.all, ...options.inherited } }
      : parent.context;
    const result = applyNativeAttributes(tag, concrete, base, context, parent.ancestorClasses);
    const local = readNativeAttributes(
      tag,
      Object.entries(result.attributes)
        .filter(([, value]) => value !== undefined)
        .map(([name, value]) => ({ name, value: String(value) })),
    );
    const supported = new Set(nativeAttributeNames(tag));
    const attributes: NativeCanvasAttributes = {};
    for (const [name, value] of Object.entries({ ...result.effective, ...local })) {
      if (
        (supported.has(name) || Object.hasOwn(options.inherited ?? {}, name)) &&
        (typeof value === "string" || typeof value === "number")
      )
        attributes[name] = String(value);
    }
    // Web fonts register under per-instance aliases so concurrent editors with
    // the same family name never override each other.
    if (parent.fontAliases && attributes["font-family"]) {
      attributes["font-family"] = aliasFontFamilyList(
        attributes["font-family"],
        parent.fontAliases,
      );
    }
    return {
      attributes,
      scope: {
        context: parent.context,
        ancestorClasses: result.childClasses,
        enabled: hasNativeCanvasOptions(props, parent),
        fontAliases: parent.fontAliases,
      },
    };
  } catch {
    return undefined;
  }
}

export function nativeStyle(attributes: NativeCanvasAttributes, keys: string[]): CSSProperties {
  const style: Record<string, string> = {};
  for (const key of keys) {
    if (attributes[key] !== undefined)
      style[key.replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase())] = attributes[key];
  }
  return style as CSSProperties;
}

export const typographyKeys = [
  "color",
  "font-family",
  "font-size",
  "font-style",
  "font-weight",
  "line-height",
  "letter-spacing",
  "text-decoration",
  "text-transform",
];
export const boxKeys = [
  "padding",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "border",
  "border-top",
  "border-right",
  "border-bottom",
  "border-left",
  "border-radius",
  "background-color",
  "direction",
];

export function nativeBoxStyle(attributes: NativeCanvasAttributes, prefix = ""): CSSProperties {
  if (!prefix) return nativeStyle(attributes, boxKeys);
  const prefixed: NativeCanvasAttributes = {};
  for (const key of boxKeys)
    if (attributes[`${prefix}${key}`] !== undefined) prefixed[key] = attributes[`${prefix}${key}`];
  return nativeStyle(prefixed, boxKeys);
}
