import { nativeEndingTags } from "./native-ending-tags";
import * as cheerio from "cheerio";
import type { Element, AnyNode } from "domhandler";
import catalog from "./native-catalog.json";

/** Host-owned conversion to standard MJML, not a dynamically loaded MJML plugin. */
export type MjmlComponentAdapter = (component: {
  /** Explicit attributes only; hosts must handle inheritance before conversion. */
  attributes: Readonly<Record<string, string>>;
  /** Child source, with registered nested components already expanded. */
  content: string;
}) => string;

const standardTags = new Set([
  ...Object.keys(catalog.components),
  "mjml",
  "mj-head",
  "mj-body",
  "mj-include",
  "mj-all",
  "mj-class",
  "mj-selector",
  "mj-html-attribute",
]);

/** Convert explicitly registered custom components before fromMjml.
 * Imported data cannot supply adapters. Normal import/export safety still applies;
 * conversion produces standard editable blocks, not persistent custom components.
 */
export function expandMjmlComponents(
  source: string,
  adapters: Readonly<Record<string, MjmlComponentAdapter>>,
): string {
  for (const name of Object.keys(adapters)) {
    if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)+$/.test(name) || standardTags.has(name))
      throw new Error(`Invalid custom MJML component: ${name}`);
  }
  let remaining = 10 * 1024 * 1024;
  let calls = 0;
  const expand = (text: string, chain: string[]): string => {
    remaining -= text.length;
    if (remaining < 0 || chain.length > 32) throw new Error("Custom MJML expansion limit exceeded");
    const $ = cheerio.load(
      text,
      {
        xml: { decodeEntities: false, withStartIndices: true, withEndIndices: true },
      },
      false,
    );
    const validate = (children: AnyNode[], defaults = false, depth = 0) => {
      if (depth > 128) throw new Error("Custom MJML nesting limit exceeded");
      for (const child of children) {
        if (child.type !== "tag" || nativeEndingTags.has(child.name)) continue;
        if (defaults && Object.hasOwn(adapters, child.name))
          throw new Error(`Resolve custom MJML defaults before expansion: ${child.name}`);
        validate(child.children, defaults || child.name === "mj-attributes", depth + 1);
      }
    };
    validate($.root().contents().toArray());
    const rewrite = (children: AnyNode[], start: number, end: number, depth: number): string => {
      if (depth > 128) throw new Error("Custom MJML nesting limit exceeded");
      let result = "";
      let cursor = start;
      for (const child of children) {
        if (child.type !== "tag" || nativeEndingTags.has(child.name)) continue;
        const node = child as Element;
        const first = node.children[0];
        const last = node.children.at(-1);
        const content =
          first && last
            ? rewrite(node.children, first.startIndex!, last.endIndex! + 1, depth + 1)
            : "";
        let replacement: string;
        if (Object.hasOwn(adapters, node.name)) {
          if (chain.includes(node.name))
            throw new Error(`Circular custom MJML expansion: ${node.name}`);
          if (++calls > 1000) throw new Error("Custom MJML expansion limit exceeded");
          const attributes =
            cheerio
              .load(text.slice(node.startIndex!, node.endIndex! + 1), { xml: true }, false)
              .root()
              .children()
              .first()
              .attr() ?? {};
          const output = adapters[node.name]!({ attributes, content });
          if (typeof output !== "string")
            throw new Error(`MJML adapter must return source: ${node.name}`);
          replacement = expand(output, [...chain, node.name]);
        } else {
          replacement =
            first && last
              ? text.slice(node.startIndex!, first.startIndex!) +
                content +
                text.slice(last.endIndex! + 1, node.endIndex! + 1)
              : text.slice(node.startIndex!, node.endIndex! + 1);
        }
        result += text.slice(cursor, node.startIndex!) + replacement;
        cursor = node.endIndex! + 1;
      }
      return result + text.slice(cursor, end);
    };
    const result = rewrite($.root().contents().toArray(), 0, text.length, 0);
    if (result.length > 10 * 1024 * 1024) throw new Error("Custom MJML expansion limit exceeded");
    return result;
  };
  return expand(source, []);
}
