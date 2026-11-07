import browserPackage from "@tailwindcss/browser/package.json";

/**
 * Default Tailwind runtime: the official browser build from jsDelivr, pinned to
 * the installed @tailwindcss/browser version. Hosts can self-host or pin a
 * different build through root.props.tailwindScriptUrl.
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
 * Resolve the Tailwind runtime script URL for one canvas: a validated custom
 * HTTP(S) URL wins, otherwise the pinned CDN build. Returns undefined when the
 * document does not enable Tailwind.
 */
export function resolveTailwindScript(enabled: unknown, customUrl: unknown): string | undefined {
  if (!tailwindEnabled(enabled)) return undefined;
  if (typeof customUrl === "string" && customUrl.trim()) {
    try {
      const url = new URL(customUrl.trim());
      if (["http:", "https:"].includes(url.protocol) && !url.username && !url.password) {
        return url.href;
      }
    } catch {
      // Invalid URLs fall back to the pinned runtime.
    }
  }
  return bundledTailwindScript;
}
