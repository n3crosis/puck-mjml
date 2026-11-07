import { useEffect, useState } from "react";
import postcss, { type AtRule, type Root } from "postcss";
import { familyKey, type FontAliasMap, reportCanvasNotes } from "./canvas-css";

export interface FontImport {
  name: string;
  href: string;
}

export interface FontCssResult {
  css: string;
  notes: string[];
  failures?: string[];
}

export interface FontCssResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
}
type FontCssFetcher = (url: string) => Promise<FontCssResponse>;

const httpUrl = (value: unknown): string | undefined => {
  if (typeof value !== "string" || !value.trim()) return undefined;
  try {
    const url = new URL(value.trim());
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
      return undefined;
    }
    return url.href;
  } catch {
    return undefined;
  }
};

/** Resolve url(...) sources in a font-face src value against the stylesheet URL. */
function resolveFontSources(value: string, baseUrl: string): string {
  return value.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (original, _quote, raw) => {
    const trimmed = raw.trim();
    if (/^(?:data:|blob:|about:|#)/i.test(trimmed)) return original;
    try {
      return `url("${new URL(trimmed, baseUrl).href}")`;
    } catch {
      return original;
    }
  });
}

function matchesFamily(rule: AtRule, family: string): boolean {
  let found = false;
  rule.walkDecls("font-family", (declaration) => {
    if (found) return;
    const quoted = declaration.value.trim().match(/^(['"])(.*)\1$/s);
    found = familyKey(quoted ? quoted[2] : declaration.value.trim()) === familyKey(family);
  });
  return found;
}

/**
 * Keep only the @font-face rules of one family from a web font stylesheet,
 * register them under the canvas alias, and resolve relative font URLs.
 * Conditional group rules are preserved when they still contain a matching face.
 */
export function transformFontCss(
  css: string,
  options: { family: string; alias: string; baseUrl: string },
): FontCssResult {
  const notes: string[] = [];
  let root: Root;
  try {
    root = postcss.parse(css);
  } catch {
    return {
      css: "",
      notes: [`Web font CSS for "${options.family}" could not be parsed and was not applied.`],
    };
  }
  const keepFontFace = (rule: AtRule): boolean => {
    if (!matchesFamily(rule, options.family)) return false;
    let hasSource = false;
    rule.walkDecls("src", (declaration) => {
      if (declaration.value.trim()) hasSource = true;
    });
    // The browser ignores source-less faces. A same-family static head face
    // must not hide an import that can never register.
    if (!hasSource) return false;
    rule.walkDecls((declaration) => {
      const property = declaration.prop.toLowerCase();
      if (property === "font-family") {
        declaration.value = `"${options.alias}"`;
      } else if (property === "src") {
        declaration.value = resolveFontSources(declaration.value, options.baseUrl);
      }
    });
    return true;
  };
  const processGroup = (container: Root | AtRule): boolean => {
    let kept = false;
    for (const node of container.nodes?.slice() ?? []) {
      if (node.type === "atrule") {
        const name = node.name.toLowerCase();
        if (name === "font-face") {
          if (keepFontFace(node)) kept = true;
          else node.remove();
        } else if (name === "media" || name === "supports" || name === "container") {
          if (!processGroup(node)) node.remove();
          else kept = true;
        } else {
          notes.push(
            `Web font CSS for "${options.family}" contains an @${node.name} rule, which is not applied on the canvas.`,
          );
          node.remove();
        }
      } else if (node.type === "rule") {
        notes.push(
          `Web font CSS for "${options.family}" contains element rules, which are not applied on the canvas.`,
        );
        node.remove();
      } else {
        node.remove();
      }
    }
    return kept;
  };
  if (!processGroup(root)) {
    return {
      css: "",
      notes: [`Web font CSS for "${options.family}" declares no @font-face for that family.`],
    };
  }
  return { css: root.toString(), notes };
}

/** Raw stylesheet text per URL, shared across canvas instances. */
const fontCssCache = new Map<string, Promise<string>>();

function fetchFontCss(href: string, fetcher: FontCssFetcher): Promise<string> {
  const cached = fontCssCache.get(href);
  if (cached) return cached;
  const pending = fetcher(href).then((response) => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.text();
  });
  pending.catch(() => fontCssCache.delete(href));
  fontCssCache.set(href, pending);
  return pending;
}

/**
 * Load every declared web font stylesheet, keep the relevant @font-face rules,
 * and register them under the per-instance aliases. Failures are reported as
 * notes so the canvas can keep using the remaining font stack.
 */
export async function loadFontCss(
  imports: unknown,
  aliases: FontAliasMap,
  options: { fetcher?: FontCssFetcher } = {},
): Promise<FontCssResult> {
  const fetcher = options.fetcher ?? ((url) => fetch(url));
  const notes: string[] = [];
  const css: string[] = [];
  const failures: string[] = [];
  const entries = Array.isArray(imports) ? imports : [];
  for (const entry of entries) {
    const name = (entry as FontImport)?.name;
    const href = httpUrl((entry as FontImport)?.href);
    if (typeof name !== "string" || !name.trim() || !href) {
      notes.push("A web font entry is incomplete and was not loaded.");
      failures.push("A web font entry is incomplete and was not loaded.");
      continue;
    }
    const family = name.trim();
    const key = familyKey(family);
    const alias = Object.hasOwn(aliases, key) ? aliases[key] : family;
    try {
      const stylesheet = await fetchFontCss(href, fetcher);
      const transformed = transformFontCss(stylesheet, { family, alias, baseUrl: href });
      css.push(transformed.css);
      notes.push(...transformed.notes);
      if (!transformed.css) failures.push(...transformed.notes);
    } catch (error) {
      notes.push(
        `Web font CSS for "${family}" could not be loaded (${
          error instanceof Error ? error.message : "network error"
        }); the canvas falls back to the remaining font stack.`,
      );
      failures.push(notes[notes.length - 1]);
    }
  }
  return { css: css.filter(Boolean).join("\n"), notes, failures };
}

/**
 * Load the document's web fonts for one canvas instance. The stylesheet is
 * fetched on the client after mount; until then the canvas renders with the
 * remaining font stack, matching font-display swap behavior. Unmounting
 * removes the injected style element, and results are never applied after
 * the canvas is gone.
 */
export function useCanvasFonts(
  imports: unknown,
  aliases: FontAliasMap,
): {
  css: string;
  status: "idle" | "loading" | "ready" | "error";
  failures: string[];
} {
  const [loaded, setLoaded] = useState<(FontCssResult & { key: string }) | null>(null);
  const key = (() => {
    try {
      return JSON.stringify({ imports: imports ?? [], aliases });
    } catch {
      return "{}";
    }
  })();
  useEffect(() => {
    let cancelled = false;
    if (key === "{}") {
      const message = "Canvas font imports could not be read and were not applied.";
      setLoaded({ key, css: "", notes: [message], failures: [message] });
      return;
    }
    const parsed = JSON.parse(key) as { imports: FontImport[]; aliases: FontAliasMap };
    if (!parsed.imports?.length) {
      setLoaded(null);
      return;
    }
    loadFontCss(parsed.imports, parsed.aliases ?? {})
      .then((result) => {
        if (!cancelled) setLoaded({ ...result, key });
      })
      .catch((error) => {
        const message = `Canvas font CSS could not be loaded (${error instanceof Error ? error.message : "unknown error"}).`;
        if (!cancelled) setLoaded({ key, css: "", notes: [message], failures: [message] });
      });
    return () => {
      cancelled = true;
    };
  }, [key]);
  useEffect(() => {
    if (loaded?.notes.length) reportCanvasNotes(loaded.notes);
  }, [loaded]);
  const current = loaded?.key === key ? loaded : null;
  return {
    css: current?.css ?? "",
    status:
      !Array.isArray(imports) || !imports.length
        ? "idle"
        : current
          ? current.failures?.length
            ? "error"
            : "ready"
          : "loading",
    failures: current?.failures ?? [],
  };
}
