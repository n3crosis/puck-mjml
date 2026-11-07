// Regenerates src/native-catalog.json from the installed mjml-browser bundle.
//
// Component statics (allowedAttributes, defaultAttributes, endingTag) are read from
// the bundle's component definitions. mj-wrapper composes its attributes from a
// shared base class, so its attribute set is confirmed by compiling candidate
// attributes against the installed compiler and collecting "illegal" errors.
// kind, allowedChildren, and colorKeywords are carried over from the existing
// catalog; the registered component set must not change between runs.
//
// Usage: bun scripts/regenerate-native-catalog.ts

import { readFileSync, writeFileSync } from "node:fs";
import oldCatalog from "../src/native-catalog.json";

globalThis.window = globalThis as unknown as Window;

interface ComponentStatic {
  tag: string;
  endingTag?: boolean;
  allowedAttributes?: Record<string, unknown>;
  defaultAttributes?: Record<string, unknown>;
}

/** Read the value expression of one defineProperty call, string- and bracket-aware. */
function readCallValue(source: string, start: number): { value: string; end: number } {
  let depth = 0;
  let quote = "";
  let index = start;
  while (index < source.length) {
    const character = source[index];
    if (quote) {
      if (character === "\\") index += 1;
      else if (character === quote) quote = "";
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === "(" || character === "{" || character === "[") {
      depth += 1;
    } else if (character === ")") {
      if (depth === 0) return { value: source.slice(start, index), end: index };
      depth -= 1;
    } else if (character === "}" || character === "]") {
      depth -= 1;
    }
    index += 1;
  }
  throw new Error("Unterminated defineProperty call in the mjml-browser bundle");
}

const evaluate = (expression: string): unknown => new Function(`return (${expression})`)();

function extractComponents(bundle: string): ComponentStatic[] {
  const components: ComponentStatic[] = [];
  const componentName = /\(0,([\w$]+)\.default\)\(([\w$]+),"componentName","([^"]+)"\)/g;
  let match: RegExpExecArray | null;
  while ((match = componentName.exec(bundle))) {
    const [, helper, receiver, tag] = match;
    const entry: ComponentStatic = { tag };
    let cursor = match.index + match[0].length;
    // Statics are chained defineProperty calls on the same receiver; unrelated
    // statics such as rawElement sit between the ones extracted here.
    const sibling = new RegExp(`^,\\(0,${helper}\\.default\\)\\(${receiver},"([\\w$]+)",`);
    while (true) {
      const next = bundle.slice(cursor).match(sibling);
      if (!next) break;
      const { value, end } = readCallValue(bundle, cursor + next[0].length);
      if (next[1] === "endingTag") entry.endingTag = value === "!0" || value === "true";
      else if (next[1] === "allowedAttributes" && !value.includes("_objectSpread")) {
        entry.allowedAttributes = evaluate(value) as Record<string, unknown>;
      } else if (next[1] === "defaultAttributes") {
        entry.defaultAttributes = evaluate(value) as Record<string, unknown>;
      }
      cursor = end + 1;
    }
    components.push(entry);
  }
  return components;
}

function sampleValue(descriptor: string, name: string): string {
  if (descriptor === "color") return "#123456";
  if (descriptor === "integer") return "2";
  if (descriptor === "boolean") return "true";
  if (descriptor.startsWith("enum(")) return descriptor.slice(5, -1).split(",")[0];
  if (descriptor.startsWith("unit")) return name.includes("width") ? "200px" : "12px";
  return name.endsWith("-url") || name === "src" || name === "href"
    ? "https://example.com/sample.png"
    : "sample";
}

/** Compile candidates on mj-wrapper and keep the attributes the compiler accepts. */
async function resolveWrapperAttributes(
  candidates: Record<string, string>,
): Promise<Record<string, string>> {
  const { default: mjml2html } = await import("mjml-browser");
  const attributes = Object.entries(candidates)
    .map(([name, value]) => `${name}="${value}"`)
    .join(" ");
  const result = await mjml2html(
    `<mjml><mj-body><mj-wrapper ${attributes}><mj-section><mj-column><mj-text>x</mj-text></mj-column></mj-section></mj-wrapper></mj-body></mjml>`,
    { validationLevel: "soft" },
  );
  const illegal = new Set(
    ((result.errors ?? []) as { message: string }[])
      .map((error) => error.message.match(/^Attribute (\S+) is illegal$/)?.[1])
      .filter(Boolean) as string[],
  );
  const allowed: Record<string, string> = {};
  for (const [name, value] of Object.entries(candidates))
    if (!illegal.has(name)) allowed[name] = value;
  return allowed;
}

const bundle = readFileSync("node_modules/mjml-browser/lib/index.js", "utf8");
const manifest = JSON.parse(readFileSync("node_modules/mjml-browser/package.json", "utf8")) as {
  version: string;
  gitHead?: string;
};
const extracted = extractComponents(bundle);

if (extracted.length !== Object.keys(oldCatalog.components).length)
  throw new Error(
    `The registered component set changed: ${extracted.length} bundle components vs ${
      Object.keys(oldCatalog.components).length
    } catalog components. Review kind/allowedChildren manually.`,
  );
for (const entry of extracted)
  if (!oldCatalog.components[entry.tag])
    throw new Error(`Unknown component ${entry.tag}: update kind/allowedChildren manually.`);

const components: Record<string, unknown> = {};
const notes: string[] = [];
for (const entry of extracted) {
  const old = oldCatalog.components[entry.tag]!;
  // Head components without an allowedAttributes static accept no native attributes.
  let allowed = (entry.allowedAttributes ?? {}) as Record<string, string>;
  if (entry.tag === "mj-wrapper") {
    const candidates: Record<string, string> = {
      ...old.allowedAttributes,
      ...(extracted.find((component) => component.tag === "mj-section")!
        .allowedAttributes as Record<string, string>),
      gap: "unit(px)",
    };
    const sampleNames = await resolveWrapperAttributes(
      Object.fromEntries(
        Object.entries(candidates).map(([name, descriptor]) => [
          name,
          sampleValue(descriptor, name),
        ]),
      ),
    );
    allowed = Object.fromEntries(Object.keys(sampleNames).map((name) => [name, candidates[name]!]));
    notes.push(
      "mj-wrapper attributes were resolved by compiling candidates (prior catalog, current mj-section, gap) against the installed compiler.",
    );
  }
  const defaults: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(entry.defaultAttributes ?? {})) {
    if (value === undefined) continue;
    try {
      JSON.stringify(value);
      defaults[name] = value;
    } catch {
      notes.push(`${entry.tag} default ${name} is not serializable and was dropped.`);
    }
  }
  for (const [name, value] of Object.entries(old.defaultAttributes ?? {})) {
    if (!(name in defaults) && !(name in (entry.defaultAttributes ?? {}))) {
      notes.push(`${entry.tag} default ${name} is no longer declared and was removed.`);
    }
  }
  components[entry.tag] = {
    kind: old.kind,
    allowedAttributes: allowed,
    defaultAttributes: defaults,
    endingTag: Boolean(entry.endingTag),
    allowedChildren: old.allowedChildren,
  };
}

const catalog = {
  provenance: {
    package: "mjml-browser",
    version: manifest.version,
    commit: manifest.gitHead ?? oldCatalog.provenance.commit,
    source: `https://github.com/mjmlio/mjml/tree/${manifest.gitHead ?? oldCatalog.provenance.commit}/packages`,
  },
  components,
  colorKeywords: oldCatalog.colorKeywords,
};

writeFileSync("src/native-catalog.json", `${JSON.stringify(catalog, null, 2)}\n`);

const bodyTags = Object.entries(components).filter(
  ([, spec]) => (spec as { kind: string }).kind === "body",
);
const attributeCount = (tag: string) =>
  Object.keys((components[tag] as { allowedAttributes: Record<string, unknown> }).allowedAttributes)
    .length;
console.log(`Regenerated src/native-catalog.json for mjml-browser ${manifest.version}.`);
console.log(
  `Components: ${Object.keys(components).length} (${bodyTags.length} body, ${
    Object.keys(components).length - bodyTags.length
  } head). Declared attributes: ${Object.keys(components).reduce(
    (total, tag) => total + attributeCount(tag),
    0,
  )} total, ${bodyTags.reduce((total, [tag]) => total + attributeCount(tag), 0)} body.`,
);
for (const tag of Object.keys(components)) {
  const oldSpec = oldCatalog.components[tag]!;
  const newSpec = components[tag]! as {
    allowedAttributes: Record<string, string>;
    endingTag: boolean;
  };
  const oldAttrs = new Set(Object.keys(oldSpec.allowedAttributes ?? {}));
  const newAttrs = new Set(Object.keys(newSpec.allowedAttributes));
  for (const name of newAttrs) if (!oldAttrs.has(name)) console.log(`  ${tag}: + ${name}`);
  for (const name of oldAttrs) if (!newAttrs.has(name)) console.log(`  ${tag}: - ${name}`);
  for (const name of newAttrs)
    if (oldAttrs.has(name) && oldSpec.allowedAttributes[name] !== newSpec.allowedAttributes[name])
      console.log(
        `  ${tag}: ~ ${name}: ${oldSpec.allowedAttributes[name]} -> ${newSpec.allowedAttributes[name]}`,
      );
  if (Boolean(oldSpec.endingTag) !== newSpec.endingTag)
    console.log(`  ${tag}: endingTag ${oldSpec.endingTag} -> ${newSpec.endingTag}`);
  for (const name of new Set([
    ...Object.keys(oldSpec.defaultAttributes ?? {}),
    ...Object.keys(
      (components[tag] as { defaultAttributes: Record<string, unknown> }).defaultAttributes ?? {},
    ),
  ])) {
    const before = JSON.stringify((oldSpec.defaultAttributes ?? {})[name]);
    const after = JSON.stringify(
      (components[tag] as { defaultAttributes: Record<string, unknown> }).defaultAttributes?.[name],
    );
    if (before !== after) console.log(`  ${tag}: default ${name}: ${before} -> ${after}`);
  }
}
for (const note of notes) console.log(`note: ${note}`);
