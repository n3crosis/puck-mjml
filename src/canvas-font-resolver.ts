import { useEffect, useState, type RefObject } from "react";
import postcss from "postcss";
import {
  aliasFontFamilyList,
  familyKey,
  type CanvasStyleSheet,
  type FontAliasMap,
} from "./canvas-css";
import type { FontImport } from "./canvas-fonts";

/** MJML 5.4.1's default font registry (mjml-core/src/index.js). */
export const mjmlDefaultFonts: readonly FontImport[] = [
  { name: "Open Sans", href: "https://fonts.googleapis.com/css?family=Open+Sans:300,400,500,700" },
  {
    name: "Droid Sans",
    href: "https://fonts.googleapis.com/css?family=Droid+Sans:300,400,500,700",
  },
  { name: "Lato", href: "https://fonts.googleapis.com/css?family=Lato:300,400,500,700" },
  { name: "Roboto", href: "https://fonts.googleapis.com/css?family=Roboto:300,400,500,700" },
  { name: "Ubuntu", href: "https://fonts.googleapis.com/css?family=Ubuntu:300,400,500,700" },
];

/**
 * Only request built-in families used in rendered inline stacks or inline mj-style.
 * MJML's substring matcher also imports Roboto for "Roboto Slab"; that unused
 * face cannot affect typography, so use exact family tokens rather than copying
 * its false positives. Explicit declarations always own their family and URL.
 */
export function resolveImplicitFontImports(
  familyLists: string[],
  explicit: unknown,
  aliases: FontAliasMap = {},
): FontImport[] {
  const declared = new Set(
    (Array.isArray(explicit) ? explicit : [])
      .map((entry) => (entry as FontImport)?.name)
      .filter((name): name is string => typeof name === "string")
      .map(familyKey),
  );
  return mjmlDefaultFonts.filter(({ name }) => {
    if (declared.has(familyKey(name))) return false;
    const alias = aliases[familyKey(name)];
    const matches = {
      [familyKey(name)]: "pm-font-match",
      ...(alias ? { [familyKey(alias)]: "pm-font-match" } : {}),
    };
    return familyLists.some((value) => aliasFontFamilyList(value, matches) !== value);
  });
}

/** Like MJML's buildFontsTags, head-only CSS does not trigger implicit imports. */
export function inlineStyleFontFamilies(stylesheets: CanvasStyleSheet[]): string[] {
  const families: string[] = [];
  for (const entry of stylesheets) {
    if (entry?.inline !== "inline" || typeof entry.css !== "string") continue;
    try {
      postcss.parse(entry.css).walkDecls("font-family", (declaration) => {
        families.push(declaration.value);
      });
    } catch {
      // scopeDocumentCss reports malformed drafts. Never infer URLs from them.
    }
  }
  return families;
}

/**
 * Native children resolve their MJML cascades before this effect inspects the
 * actual inline styles. Observe only this canvas, including later editor changes;
 * do not inspect host styles/computed fonts or download every default up front.
 */
export function useImplicitCanvasFonts(
  canvasRef: RefObject<HTMLDivElement | null>,
  explicit: unknown,
  aliases: FontAliasMap,
  stylesheets: CanvasStyleSheet[],
): { imports: FontImport[]; settled: boolean } {
  const [observed, setObserved] = useState<{ key: string; imports: FontImport[] } | null>(null);
  let key: string;
  try {
    key = JSON.stringify({ explicit, aliases, inline: inlineStyleFontFamilies(stylesheets) });
  } catch {
    key = JSON.stringify({ explicit: [], aliases, inline: [] });
  }
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const options = JSON.parse(key) as {
      explicit: unknown;
      aliases: FontAliasMap;
      inline: string[];
    };
    const refresh = () => {
      const elements = [canvas, ...canvas.querySelectorAll<HTMLElement>("[style]")];
      const families = elements
        .filter((element) => element.closest(".pm-canvas") === canvas)
        .map((element) => element.style.fontFamily)
        .filter(Boolean);
      const next = resolveImplicitFontImports(
        [...families, ...options.inline],
        options.explicit,
        options.aliases,
      );
      setObserved((previous) =>
        previous?.key === key && JSON.stringify(previous.imports) === JSON.stringify(next)
          ? previous
          : { key, imports: next },
      );
    };
    refresh();
    const Observer = canvas.ownerDocument.defaultView?.MutationObserver;
    if (!Observer) return;
    const observer = new Observer(refresh);
    observer.observe(canvas, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["style"],
    });
    return () => observer.disconnect();
  }, [canvasRef, key]);
  // Never expose a prior document's defaults while the new canvas is inspected.
  return { imports: observed?.key === key ? observed.imports : [], settled: observed?.key === key };
}
