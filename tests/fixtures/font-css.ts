import { mjmlDefaultFonts } from "../../src/canvas-font-resolver";

const defaults = new Map(mjmlDefaultFonts.map(({ name, href }) => [href, name]));

/**
 * Detached-DOM interaction tests exercise CSS discovery and component lifecycle,
 * not font binary loading or real glyph metrics. Intercept only MJML's exact five
 * default stylesheet URLs; every other request keeps the caller's fetch behavior.
 */
export function withDefaultFontFixtures(fallback: typeof fetch): typeof fetch {
  return async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const family = defaults.get(url);
    if (!family) return fallback(input, init);
    return new Response(
      `@font-face { font-family: ${JSON.stringify(family)}; font-style: normal; font-weight: 100 900; src: local("puck-mjml-unit-test-font"); }`,
      { status: 200, headers: { "content-type": "text/css" } },
    );
  };
}
