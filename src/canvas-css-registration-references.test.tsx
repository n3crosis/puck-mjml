import { load } from "cheerio";
import postcss from "postcss";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { createFontAliases, scopeDocumentCss } from "./canvas-css";
import { EmailCanvas } from "./EmailCanvas";
import { toMjml } from "./export";
import { fromMjml } from "./import";

const scope = "pm-canvas-references";
const apply = (css: string) => scopeDocumentCss([{ css }], { scope });
const globals =
  "@font-face{font-family:Ghost;src:url(ghost.woff2)}@keyframes ghost{from,to{opacity:0.3}}";
const reference = ".copy{font-family:Ghost,serif;animation:ghost 1s linear}";
const omittedAncestors = [
  `@scope (.inside){${globals}}`,
  `@starting-style{${globals}}`,
  `@unsupported{${globals}}`,
  `@media all{@supports(display:block){@scope (.inside){${globals}}}}`,
  `body + .host{${globals}}`,
  `:root{& + .host{${globals}}}`,
  `:root{.safe,& + .host{${globals}}}`,
  `:root{@layer local{@media all{& ~ .host{${globals}}}}}`,
  `@keyframes "unsupported"{${globals}}`,
  `@font-face{font-family:Invalid;${globals}}`,
];

describe("aliases come only from retained registrations", () => {
  it.each(omittedAncestors)(
    "does not alias references from an omitted ancestor: %s",
    (ancestor) => {
      const result = apply(ancestor + reference);
      expect(result.fontAliases).toEqual({});
      expect(result.css).not.toMatch(/@font-face|@keyframes/);
      expect(result.css).toContain("font-family:Ghost,serif;animation:ghost 1s linear");
      expect(result.notes.length).toBeGreaterThan(0);
    },
  );

  it("warns once for an unsupported wrapper without processing its discarded descendants", () => {
    const result = apply(
      "@scope (.inside){@font-face{font-family:F;font-family:12;src:url(f)}}" + reference,
    );
    expect(result.notes).toEqual([
      "Custom CSS 1 contains an unsupported @scope rule, which is not applied on the canvas.",
    ]);
    expect(result.fontAliases).toEqual({});
  });

  it.each([
    "@media (min-width:99999px)",
    "@supports (unknown: value)",
    "@container (min-width:99999px)",
    "@layer local",
  ])("retains aliases in supported conditional/layer structure: %s", (wrapper) => {
    const result = apply(reference + `${wrapper}{${globals}}`);
    expect(result.fontAliases).toEqual({ ghost: `Ghost-${scope}` });
    expect(result.css).toContain(`animation:${scope}-ghost 1s linear`);
    expect(result.css).toContain(`@keyframes ${scope}-ghost`);
    expect(result.css).toContain(`font-family:"Ghost-${scope}",serif`);
  });

  it("resolves forward references from a retained registration after an omitted duplicate", () => {
    const sheets = [{ css: reference }, { css: `@scope (.inside){${globals}}` }, { css: globals }];
    const result = scopeDocumentCss(sheets, { scope });
    expect(result.css.match(/@keyframes/g)).toHaveLength(1);
    expect(result.css).toContain(`animation:${scope}-ghost 1s linear`);
    expect(result.css).toContain(`font-family:"Ghost-${scope}",serif`);
    expect(result.fontAliases).toEqual({ ghost: `Ghost-${scope}` });
    expect(result.notes).toHaveLength(1);
  });

  it("preserves supplied imported aliases when only a head registration is omitted", () => {
    const aliases = createFontAliases(["Ghost", "constructor", "__proto__"], scope);
    const before = JSON.stringify(aliases);
    const result = scopeDocumentCss([{ css: `@scope (.inside){${globals}}${reference}` }], {
      scope,
      fontAliases: aliases,
    });
    expect(result.fontAliases).toEqual(aliases);
    expect(result.css).toContain(`font-family:"Ghost-${scope}",serif;animation:ghost 1s linear`);
    expect(JSON.stringify(aliases)).toBe(before);
    expect(Object.hasOwn(result.fontAliases, "__proto__")).toBe(true);
  });

  it("does not collect invalid registration descendants from keyframe steps", () => {
    const result = apply(`@keyframes valid{from{${globals}}}${reference}`);
    expect(result.fontAliases).toEqual({});
    expect(result.css).toContain("animation:ghost 1s linear");
  });
});

describe("literal font references in keyframe steps", () => {
  it.each(["Local,,serif", ",Local", "Local,", "Local, ,serif"])(
    "does not repair an invalid empty-item font list: %s",
    (value) => {
      const result = apply(
        `@font-face{font-family:Local;src:url(local.woff2)}@keyframes swap{to{font-family:${value}}}`,
      );
      expect(result.css).toContain(`to{font-family:${value}}`);
    },
  );

  it.each([
    String.raw`Other\,Local`,
    String.raw`Local\,Other`,
    String.raw`"Other\,Local",Local`,
    "Lo/**/cal,Local",
  ])("does not partially rewrite unsupported escaped or commented values: %s", (value) => {
    const result = apply(
      `@font-face{font-family:Local;src:url(local.woff2)}@keyframes swap{to{font-family:${value}}}`,
    );
    expect(result.css).toContain(`to{font-family:${value}}`);
  });

  it("preserves quoted commas while aliasing a valid font list", () => {
    const result = apply(
      '@font-face{font-family:"Comma, Family";src:url(local.woff2)}@keyframes swap{to{font-family:"Comma, Family",serif}}',
    );
    expect(result.css).toContain(`to{font-family:"CommaFamily-${scope}",serif}`);
  });

  it("rewrites direct font-family steps after collecting later stylesheet registrations", () => {
    const result = scopeDocumentCss(
      [
        {
          css: '@keyframes swap{from,to{font-family:Local,serif}50%{FONT-FAMILY:"LOCAL";animation-timing-function:steps(2)}}.copy{animation:swap 1s paused}',
        },
        { css: "@font-face{font-family:Local;src:url(local.woff2)}" },
      ],
      { scope },
    );
    expect(result.css).toContain(
      `@keyframes ${scope}-swap{from,to{font-family:"Local-${scope}",serif}50%{FONT-FAMILY:"Local-${scope}";animation-timing-function:steps(2)}}`,
    );
    expect(result.css).toContain(`animation:${scope}-swap 1s paused`);
    expect(result.notes).toEqual([]);
  });

  it("preserves step selectors, invalid important declarations, variables, shorthand, and animation properties", () => {
    const result = apply(
      "@font-face{font-family:Local;src:url(local.woff2)}@keyframes linear{from,to{font-family:Local;--family:Local;font-family:var(--family,Local);font:20px Local;animation-name:linear;animation-timing-function:linear}30%,60%{font-family:Local!important}}.copy{animation-name:linear}",
    );
    const rules: postcss.Rule[] = [];
    postcss.parse(result.css).walkAtRules("keyframes", (atRule) => {
      for (const node of atRule.nodes ?? []) if (node.type === "rule") rules.push(node);
    });
    expect(rules.map((rule) => rule.selector)).toEqual(["from,to", "30%,60%"]);
    expect(rules[0].toString()).toContain(`font-family:"Local-${scope}";`);
    for (const unchanged of [
      "--family:Local",
      "font-family:var(--family,Local)",
      "font:20px Local",
      "animation-name:linear",
      "animation-timing-function:linear",
    ])
      expect(rules[0].toString()).toContain(unchanged);
    expect(rules[1].toString()).toContain("font-family:Local!important");
    expect(result.css).toContain(`.copy{animation-name:${scope}-linear}`);
  });

  it("keeps generic keywords unaliased and quoted keyword families aliased in steps", () => {
    const result = apply(
      '@font-face{font-family:"serif";src:url(serif.woff2)}@keyframes swap{from{font-family:serif}to{font-family:"serif",serif}}',
    );
    expect(result.css).toContain(`from{font-family:serif}to{font-family:"serif-${scope}",serif}`);
  });

  it("does not reinterpret nested step content as supported style rules", () => {
    const result = apply(
      "@font-face{font-family:Local;src:url(local.woff2)}@keyframes swap{from{font-family:Local;@media all{font-family:Local}}}",
    );
    expect(result.css).toContain(
      `from{font-family:"Local-${scope}";@media all{font-family:Local}}`,
    );
  });
});

describe("registration reference SSR/export boundary", () => {
  it("keeps sibling animations independent and leaves omitted host references unchanged without mutating source", () => {
    const css = `@scope (.inside){${globals}}@font-face{font-family:Local;src:url(local.woff2)}@keyframes swap{from,to{font-family:Local}}${reference}.animated{animation:swap 1s paused}`;
    const { document } = fromMjml(
      `<mjml><mj-head><mj-style>${css}</mj-style></mj-head><mj-body><mj-section><mj-column><mj-text>References</mj-text></mj-column></mj-section></mj-body></mjml>`,
    );
    const before = JSON.stringify(document);
    const exported = toMjml(document);
    const fetch = vi.spyOn(globalThis, "fetch");
    try {
      const $ = load(
        renderToStaticMarkup(
          <>
            <EmailCanvas headStyles={document.root.props?.headStyles}>
              <div className="copy animated">First</div>
            </EmailCanvas>
            <EmailCanvas headStyles={document.root.props?.headStyles}>
              <div className="copy animated">Sibling</div>
            </EmailCanvas>
          </>,
        ),
      );
      const styles = $("style[data-pm-canvas-css]")
        .toArray()
        .map((element) => ({
          scope: $(element).attr("data-pm-canvas-css")!,
          css: $(element).text(),
        }));
      expect(styles).toHaveLength(2);
      expect(styles[0].scope).not.toBe(styles[1].scope);
      for (const entry of styles) {
        expect(entry.css).toContain(
          `@keyframes ${entry.scope}-swap{from,to{font-family:"Local-${entry.scope}"}}`,
        );
        expect(entry.css).toContain("font-family:Ghost,serif;animation:ghost 1s linear");
        expect(entry.css).not.toContain("Ghost-pm-canvas");
      }
      expect(fetch).not.toHaveBeenCalled();
      expect(JSON.stringify(document)).toBe(before);
      expect(toMjml(document)).toBe(exported);
      expect(exported).toContain(css);
    } finally {
      fetch.mockRestore();
    }
  });
});
