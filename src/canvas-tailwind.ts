import browserPackage from "@tailwindcss/browser/package.json";
import { createContext } from "react";
import postcss from "postcss";
import { scopeDocumentCss } from "./canvas-css";

/** Executable code is a host decision, never a persisted document setting. */
export const TailwindRuntimeContext = createContext<true | string | undefined>(undefined);

/**
 * Default Tailwind runtime: the official browser build from jsDelivr, pinned to
 * the installed @tailwindcss/browser version. Hosts can self-host or pin a
 * different build through the host's tailwindRuntime prop.
 */
export const bundledTailwindScript = `https://cdn.jsdelivr.net/npm/@tailwindcss/browser@${browserPackage.version}/dist/index.global.js`;

/**
 * Tailwind entry for the canvas. Preflight is deliberately excluded: it would
 * reset typography and box model defaults across the whole canvas document.
 */
export const TAILWIND_CANVAS_CONFIG = `@layer theme, utilities;
@import "tailwindcss/theme.css" layer(theme);
@import "tailwindcss/utilities.css" layer(utilities);
`;

/** Accept the boolean toggle or the radio field's string values. */
export function tailwindEnabled(value: unknown): boolean {
  return value === true || value === "true";
}

/**
 * Resolve only the host's explicit permission. The document's deprecated
 * tailwindScriptUrl is deliberately not an input to this function.
 */
export function resolveTailwindScript(enabled: unknown, runtime: unknown): string | undefined {
  if (!tailwindEnabled(enabled)) return undefined;
  if (runtime === true) return bundledTailwindScript;
  if (typeof runtime === "string" && runtime.trim()) {
    try {
      const url = new URL(runtime.trim());
      if (["http:", "https:"].includes(url.protocol) && !url.username && !url.password) {
        return url.href;
      }
    } catch {
      // Invalid host configuration must not silently authorize a different source.
    }
  }
  return undefined;
}

/** Keep registrations and utility variables private, as well as selectors. */
export function scopeTailwindCss(css: string, scope: string): string {
  const root = postcss.parse(css);
  const animations = new Set<string>();
  root.walkAtRules("keyframes", (rule) => {
    if (/^[a-zA-Z_][\w-]*$/.test(rule.params)) animations.add(rule.params);
  });
  const namespace = (value: string) =>
    value.replace(/--tw-[\w-]+/g, (name) => `--${scope}-${name.slice(2)}`);
  root.walkDecls((declaration) => {
    declaration.prop = namespace(declaration.prop);
    // Rewrite variable references, not literal content strings or asset URLs.
    declaration.value = declaration.value.replace(
      /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|var\(\s*--tw-[\w-]+/g,
      (token) => (token.startsWith("var(") ? namespace(token) : token),
    );
    // Tailwind references keyframes through theme variables. The generic CSS
    // scoper rewrites animation declarations, not arbitrary variable values.
    if (declaration.prop.startsWith("--animate-")) {
      declaration.value = declaration.value.replace(/[a-zA-Z_][\w-]*/g, (name) =>
        animations.has(name) ? `${scope}-${name}` : name,
      );
    }
  });
  const registrations: string[] = [];
  root.walkAtRules("property", (rule) => {
    // Tailwind only registers its own --tw-* variables. Never copy a global
    // registration supplied by a different runtime into the host document.
    if (/^--tw-[\w-]+$/.test(rule.params)) {
      rule.params = namespace(rule.params);
      registrations.push(rule.toString());
    }
    rule.remove();
  });
  return (
    registrations.join("\n") + "\n" + scopeDocumentCss([{ css: root.toString() }], { scope }).css
  );
}

/**
 * One compiler document per canvas. Only inert class tokens are mirrored, not
 * document HTML, styles or URLs. The host-approved script runs in that frame;
 * it cannot scan/style another editor, and removing the frame stops its work.
 * This is lifecycle/CSS isolation, not a sandbox for untrusted host scripts.
 */
export function mountTailwindCanvas(
  canvas: HTMLElement,
  scope: string,
  scriptUrl: string,
  onCss: (css: string) => void,
): () => void {
  const host = canvas.ownerDocument;
  const frame = host.createElement("iframe");
  frame.hidden = true;
  frame.title = "Tailwind canvas compiler";
  frame.setAttribute("aria-hidden", "true");
  frame.setAttribute("data-pm-tailwind-compiler", scope);
  let disposed = false;
  let sourceObserver: MutationObserver | undefined;
  let outputObserver: MutationObserver | undefined;
  const start = () => {
    if (disposed || sourceObserver) return;
    const document = frame.contentDocument;
    const Window = frame.contentWindow;
    if (!document || !Window) return;
    const Observer = (Window as unknown as { MutationObserver: typeof MutationObserver })
      .MutationObserver;
    const input = document.createElement("style");
    input.type = "text/tailwindcss";
    input.textContent = TAILWIND_CANVAS_CONFIG;
    document.head.append(input);
    let previousClasses = "";
    const syncClasses = () => {
      const classes = new Set<string>();
      for (const element of [canvas, ...canvas.querySelectorAll("[class]")]) {
        for (const token of element.classList) classes.add(token);
      }
      const value = [...classes].sort().join(" ");
      if (value === previousClasses) return;
      previousClasses = value;
      // DOM assignment, never HTML parsing or script source interpolation.
      document.body.className = value;
    };
    syncClasses();
    const HostObserver = host.defaultView!.MutationObserver;
    sourceObserver = new HostObserver(syncClasses);
    sourceObserver.observe(canvas, {
      attributes: true,
      attributeFilter: ["class"],
      childList: true,
      subtree: true,
    });
    outputObserver = new Observer(() => {
      if (disposed) return;
      const css = [...document.head.querySelectorAll("style:not([type])")]
        .map((style) => style.textContent ?? "")
        .join("\n");
      try {
        onCss(scopeTailwindCss(css, scope));
      } catch {
        onCss("");
        console.warn(
          "[puck-mjml] Tailwind generated invalid CSS; canvas utilities were not applied.",
        );
      }
    });
    outputObserver.observe(document.head, { childList: true, subtree: true, characterData: true });
    const script = document.createElement("script");
    script.src = scriptUrl;
    script.onerror = () => {
      if (!disposed)
        console.warn("[puck-mjml] The host-approved Tailwind runtime could not be loaded.");
    };
    document.head.append(script);
  };
  frame.addEventListener("load", start);
  host.body.append(frame);
  return () => {
    disposed = true;
    sourceObserver?.disconnect();
    outputObserver?.disconnect();
    frame.removeEventListener("load", start);
    frame.remove();
    onCss("");
  };
}
