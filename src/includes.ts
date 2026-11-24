import { nativeEndingTags } from "./native-ending-tags";
import * as cheerio from "cheerio";
import type { Element } from "domhandler";

const limit = 10 * 1024 * 1024;

function pathKey(path: string, parent = ""): string {
  if (
    !path ||
    /[\\:?#%]/.test(path) ||
    Array.from(path).some((c) => c.charCodeAt(0) < 32) ||
    path.startsWith("/")
  )
    throw new Error(`Invalid MJML include path: ${path}`);
  const parts = parent.split("/").slice(0, -1);
  for (const part of path.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (!parts.length) throw new Error(`MJML include escapes file map: ${path}`);
      parts.pop();
    } else parts.push(part);
  }
  if (!parts.length) throw new Error(`Invalid MJML include path: ${path}`);
  return parts.join("/");
}

/** Expand includes from an explicit virtual file map before calling fromMjml.
 * No filesystem or network access. Paths are relative POSIX paths, not URLs.
 * HTML includes become trusted mj-raw; normal import/export safety still applies.
 */
export function resolveMjmlIncludes(
  source: string,
  files: Readonly<Record<string, string>>,
  sourcePath = "index.mjml",
): string {
  const contents = new Map<string, string>();
  for (const [name, value] of Object.entries(files)) {
    const key = pathKey(name);
    if (contents.has(key)) throw new Error(`Duplicate MJML include path: ${key}`);
    contents.set(key, value);
  }
  let remaining = limit;
  let count = 0;
  const parse = (text: string) =>
    cheerio.load(
      text,
      {
        xml: { decodeEntities: false, withStartIndices: true, withEndIndices: true },
      },
      false,
    );
  const inner = (text: string, node: Element) => {
    const first = node.children[0];
    const last = node.children.at(-1);
    return first && last ? text.slice(first.startIndex!, last.endIndex! + 1) : "";
  };
  const expand = (text: string, path: string, stack: string[]): string => {
    remaining -= text.length;
    if (remaining < 0 || stack.length > 32)
      throw new Error("MJML include expansion limit exceeded");
    const head: string[] = [];
    const css: string[] = [];
    const $ = parse(text);
    const edits: { start: number; end: number; value: string }[] = [];
    const visit = (node: Element, depth = 0) => {
      if (depth > 128) throw new Error("MJML include nesting limit exceeded");
      if (nativeEndingTags.has(node.name)) return;
      if (node.name !== "mj-include") {
        $(node)
          .children()
          .each((_, child) => visit(child, depth + 1));
        return;
      }
      if (++count > 1000) throw new Error("MJML include expansion limit exceeded");
      const attributes =
        cheerio
          .load(
            text.slice(node.startIndex!, node.endIndex! + 1),
            { xml: true },
            false,
          )("mj-include")
          .first()
          .attr() ?? {};
      const key = pathKey(attributes.path ?? "", path);
      const value = contents.get(key);
      if (value === undefined) throw new Error(`Missing MJML include: ${key}`);
      if (stack.includes(key))
        throw new Error(`Circular MJML include: ${[...stack, key].join(" -> ")}`);
      let replacement: string;
      if (attributes.type === "html" || attributes.type === "css") {
        remaining -= value.length;
        if (remaining < 0) throw new Error("MJML include expansion limit exceeded");
        const tag = attributes.type === "html" ? "mj-raw" : "mj-style";
        if (new RegExp(`<\\s*/\\s*${tag}\\b`, "i").test(value))
          throw new Error(`Unsafe ${tag} boundary in MJML include: ${key}`);
        replacement = `<${tag}${tag === "mj-style" && attributes["css-inline"] === "inline" ? ' inline="inline"' : ""}>${value}</${tag}>`;
        if (tag === "mj-style") {
          css.push(replacement);
          replacement = "";
        }
      } else {
        if (attributes.type && attributes.type !== "mjml")
          throw new Error(`Unsupported MJML include type: ${attributes.type}`);
        if (value.length > remaining) throw new Error("MJML include expansion limit exceeded");
        const input = parse(value).root().children("mjml").length
          ? value
          : `<mjml><mj-body>${value}</mj-body></mjml>`;
        const expanded = expand(input, key, [...stack, key]);
        const partial = parse(expanded);
        const root = partial.root().children("mjml").first();
        if (root.length) {
          const header = root.children("mj-head").get(0);
          const body = root.children("mj-body").get(0);
          replacement = body ? inner(expanded, body) : "";
          if (header) {
            const content = inner(expanded, header);
            if (node.parent?.type === "tag" && node.parent.name === "mj-head")
              replacement += content;
            else head.push(content);
          }
        } else replacement = expanded;
      }
      edits.push({ start: node.startIndex!, end: node.endIndex! + 1, value: replacement });
    };
    $.root()
      .children()
      .each((_, node) => visit(node));
    for (const edit of edits.reverse())
      text = text.slice(0, edit.start) + edit.value + text.slice(edit.end);
    let result = text;
    head.push(...css);
    if (head.length) {
      const $ = parse(result);
      const root = $.root().children("mjml").get(0);
      if (!root) throw new Error("MJML includes require an mjml root");
      const header = $(root).children("mj-head").get(0);
      const addition = head.join("");
      if (header) {
        const markup = result.slice(header.startIndex!, header.endIndex! + 1);
        if (/\/\s*>$/.test(markup)) {
          result =
            result.slice(0, header.startIndex!) +
            `<mj-head>${addition}</mj-head>` +
            result.slice(header.endIndex! + 1);
        } else {
          const close = result.lastIndexOf("</", header.endIndex!);
          result = result.slice(0, close) + addition + result.slice(close);
        }
      } else {
        const body = $(root).children("mj-body").get(0);
        if (!body) throw new Error("MJML includes require an mj-body element");
        result =
          result.slice(0, body.startIndex!) +
          `<mj-head>${addition}</mj-head>` +
          result.slice(body.startIndex!);
      }
    }
    if (result.length > limit) throw new Error("MJML include expansion limit exceeded");
    return result;
  };
  const path = pathKey(sourcePath);
  return expand(source, path, [path]);
}
