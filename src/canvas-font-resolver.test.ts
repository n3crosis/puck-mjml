import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createFontAliases } from "./canvas-css";
import {
  inlineStyleFontFamilies,
  mjmlDefaultFonts,
  resolveImplicitFontImports,
} from "./canvas-font-resolver";

beforeAll(() => vi.stubGlobal("window", globalThis));
afterAll(() => vi.unstubAllGlobals());
const aliases = createFontAliases(
  mjmlDefaultFonts.map(({ name }) => name),
  "pm-canvas-test",
);

describe("bounded MJML implicit font resolution", () => {
  it("recognizes case-insensitive quoted stack entries and their per-editor aliases", () => {
    expect(
      resolveImplicitFontImports(
        [`Arial, 'rObOtO', "Ubuntu-pm-canvas-test", sans-serif`],
        [],
        aliases,
      ).map(({ name }) => name),
    ).toEqual(["Roboto", "Ubuntu"]);
    expect(
      resolveImplicitFontImports(
        ["Roboto Slab, Arial", "Custom Font", "var(--family)"],
        [],
        aliases,
      ),
    ).toEqual([]);
  });

  it.each(["OpenSans", "opensans", "OPEN_SANS"])(
    "does not mistake a distinct custom %s family for implicit Open Sans",
    (name) => {
      const imports = [{ name, href: "https://example.com/custom.css" }];
      const distinct = createFontAliases(
        [name, ...mjmlDefaultFonts.map(({ name }) => name)],
        "pm-canvas-test",
      );
      const custom = distinct[name.toLowerCase()];
      expect(custom.toLowerCase()).not.toBe(distinct["open sans"].toLowerCase());
      expect(resolveImplicitFontImports([`"${custom}", Arial`], imports, distinct)).toEqual([]);
      expect(
        resolveImplicitFontImports([`"${distinct["open sans"]}", Arial`], imports, distinct).map(
          ({ name }) => name,
        ),
      ).toEqual(["Open Sans"]);
    },
  );

  it("keeps explicit URLs authoritative, including invalid drafts, without a surprise fallback request", () => {
    expect(
      resolveImplicitFontImports(
        ["Roboto, Ubuntu"],
        [
          { name: " rObOtO ", href: "https://example.com/custom.css" },
          { name: "Ubuntu", href: "javascript:invalid" },
        ],
      ),
    ).toEqual([]);
  });

  it("only scans inline styles, ignoring head-only, malformed, and non-font declarations", () => {
    expect(
      inlineStyleFontFamilies([
        { inline: "head", css: ".a { font-family: Lato; }" },
        {
          inline: "inline",
          css: ".a { font-family: 'Open Sans'; } @media screen { .b { font-family: Ubuntu, Arial; } }",
        },
        { inline: "inline", css: ".broken {" },
        { inline: "inline", css: ".a { font: 12px Roboto; content: 'Lato'; }" },
      ]),
    ).toEqual(["'Open Sans'", "Ubuntu, Arial"]);
  });

  it.each(mjmlDefaultFonts)(
    "matches installed MJML's $name URL and stack matching",
    async (font) => {
      const { default: mjml } = await import("mjml-browser");
      const result = await mjml(
        `<mjml><mj-body><mj-section><mj-column><mj-text font-family="Arial, ${font.name}, sans-serif">Text</mj-text></mj-column></mj-section></mj-body></mjml>`,
      );
      expect(result.errors).toEqual([]);
      const links = [...result.html.matchAll(/<link href="([^"]+)" rel="stylesheet"/g)].map(
        (match) => match[1],
      );
      expect(links).toEqual([font.href]);
      expect(resolveImplicitFontImports([`Arial, ${font.name}, sans-serif`], [])).toEqual([font]);
    },
  );

  it("matches compiler head-versus-inline CSS discovery and exact explicit overrides", async () => {
    const { default: mjml } = await import("mjml-browser");
    for (const inline of ["head", "inline"] as const) {
      const css = ".copy { font-family: Lato; }";
      const result = await mjml(
        `<mjml><mj-head><mj-style${inline === "inline" ? ' inline="inline"' : ""}>${css}</mj-style></mj-head><mj-body><mj-section><mj-column><mj-text css-class="copy" font-family="Arial">Text</mj-text></mj-column></mj-section></mj-body></mjml>`,
      );
      const fonts = resolveImplicitFontImports(inlineStyleFontFamilies([{ inline, css }]), []);
      expect(result.html.includes("fonts.googleapis.com")).toBe(inline === "inline");
      expect(fonts.map(({ name }) => name)).toEqual(inline === "inline" ? ["Lato"] : []);
    }
    const result = await mjml(
      '<mjml><mj-head><mj-font name="Roboto" href="https://example.com/custom.css" /></mj-head><mj-body><mj-section><mj-column><mj-text font-family="Roboto">Text</mj-text></mj-column></mj-section></mj-body></mjml>',
    );
    expect(result.html).toContain('href="https://example.com/custom.css"');
    expect(result.html).not.toContain("fonts.googleapis.com");
  });
});
