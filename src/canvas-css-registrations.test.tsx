import { load } from "cheerio";
import postcss from "postcss";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { aliasFontFamilyList, createFontAliases, scopeDocumentCss } from "./canvas-css";
import { EmailCanvas } from "./EmailCanvas";
import { toMjml } from "./export";
import { fromMjml } from "./import";

const scope = "pm-canvas-registration";
const apply = (css: string) => scopeDocumentCss([{ css }], { scope });
const faces = (css: string) => {
  const result: postcss.AtRule[] = [];
  postcss.parse(css).walkAtRules("font-face", (rule) => {
    result.push(rule);
  });
  return result;
};

describe("bounded custom CSS registrations", () => {
  it.each([
    '"pulse"',
    "'pulse'",
    String.raw`f\61 de`,
    "none",
    "initial",
    "inherit",
    "unset",
    "revert",
    "revert-layer",
    "default",
    "two names",
    "12",
  ])("omits an unsupported keyframe registration instead of leaving it global: %s", (name) => {
    const result = apply(`@keyframes ${name}{to{opacity:1}} .ok{color:red}`);
    expect(result.css).not.toContain("@keyframes");
    expect(result.css).toContain(`.${scope} .ok`);
    expect(result.notes).toHaveLength(1);
    expect(result.notes[0]).toContain("not applied on the canvas");
    expect(result.notes[0]).not.toContain("left global");
  });

  it.each(["@keyframes pulse;", "@keyframes pulse"])(
    "omits registrations without a block and does not create aliases: %s",
    (registration) => {
      const result = scopeDocumentCss(
        [{ css: registration }, { css: ".x{animation-name:pulse}" }],
        { scope },
      );
      expect(result.css).not.toContain("@keyframes");
      expect(result.css).toContain("animation-name:pulse");
      expect(result.notes).toHaveLength(1);
      expect(result.notes[0]).toContain("not applied on the canvas");
    },
  );

  it("keeps case-sensitive keyframe names and prototype-like names distinct", () => {
    const names = ["pulse", "Pulse", "constructor", "__proto__"];
    const result = apply(
      names.map((name) => `@keyframes ${name}{to{opacity:1}}`).join("") +
        `.x{animation-name:${names.join(",")}}`,
    );
    for (const name of names) expect(result.css).toContain(`@keyframes ${scope}-${name}`);
    expect(result.css).toContain(
      `animation-name:${names.map((name) => `${scope}-${name}`).join(",")}`,
    );
    expect(result.notes).toEqual([]);
  });

  it("aliases keyword-like animation-name values without rewriting shorthand keywords", () => {
    const names = ["linear", "reverse", "both", "infinite", "running"];
    const result = apply(
      names.map((name) => `@keyframes ${name}{to{opacity:1}}`).join("") +
        `@keyframes pulse{to{opacity:1}} .x{animation-name:${names.join(",")};animation:pulse 1s linear infinite reverse both running}`,
    );
    expect(result.css).toContain(
      `animation-name:${names.map((name) => `${scope}-${name}`).join(",")}`,
    );
    expect(result.css).toContain(
      `animation:${scope}-pulse 1s linear infinite reverse both running`,
    );
  });

  it("collects only the effective last supported font family across stylesheet order", () => {
    const result = scopeDocumentCss(
      [
        { css: ".x{font-family:First,SECOND,serif}" },
        { css: "@font-face{font-family:First;FONT-FAMILY:'Second';src:url(face.woff2)}" },
      ],
      { scope },
    );
    expect(result.fontAliases).toEqual({ second: `Second-${scope}` });
    const declarations = faces(result.css)[0].nodes?.filter(
      (node) => node.type === "decl" && node.prop.toLowerCase() === "font-family",
    );
    expect(declarations).toHaveLength(1);
    expect(result.css).toContain(`FONT-FAMILY:"Second-${scope}"`);
    expect(result.css).toContain(`font-family:First,"Second-${scope}",serif`);
    expect(result.notes).toEqual([]);
  });

  it.each([
    "font-family:First;_font-family:Ghost",
    "font-family:First;*font-family:Ghost",
    "_font-family:Ghost",
    "*font-family:Ghost",
    "font-family:First;font-family:12",
    "font-family:12;font-family:First",
    "font-family:First;font-family:Second!important",
    "font-family:First!important;font-family:Second",
    "font-family:First;font-family:Second,Third",
    "font-family:First;font-family:var(--family)",
    "font-family:First;font-family:serif",
    "font-family:First;font-family:initial",
    "font-family:First;font-family:default",
    "font-family:First;font-family:revert-layer",
    'font-family:First;font-family:" spaced "',
    "font-family:First;font-family:Second/**/Third",
    String.raw`font-family:First;font-family:S\65 cond`,
    String.raw`font-family:First;font-\66 amily:Second`,
    "font-weight:400",
  ])("rejects an ambiguous or unsupported face without publishing aliases: %s", (descriptors) => {
    const result = apply(
      `@font-face{${descriptors};src:url(face.woff2)}.x{font-family:First,Second}`,
    );
    expect(faces(result.css)).toHaveLength(0);
    expect(result.fontAliases).toEqual({});
    expect(result.css).toContain("font-family:First,Second");
    expect(result.notes).toHaveLength(1);
    expect(result.notes[0]).toContain("@font-face");
    expect(result.notes[0]).toContain("not applied on the canvas");
  });

  it("does not turn generic or CSS-wide font keywords into family references", () => {
    const names = ["serif", "inherit", "default", "system-ui"];
    const result = apply(
      names.map((name) => `@font-face{font-family:"${name}";src:url(face.woff2)}`).join("") +
        `.x{font-family:serif; font-family:inherit; font-family:"serif",system-ui}`,
    );
    expect(result.css).toContain("font-family:serif;");
    expect(result.css).toContain("font-family:inherit;");
    expect(result.css).toContain(`font-family:"serif-${scope}",system-ui`);
    expect(result.notes).toEqual([]);
  });

  it("retains collision, case and prototype safety for the selected families", () => {
    const aliases = createFontAliases(["Open Sans"], scope);
    const result = scopeDocumentCss(
      [
        {
          css: ['"OpenSans"', "Open_Sans", "constructor", "__proto__"]
            .map(
              (name) => `@font-face{font-family:Discarded;font-family:${name};src:url(face.woff2)}`,
            )
            .join(""),
        },
      ],
      { scope, fontAliases: aliases },
    );
    expect(Object.keys(result.fontAliases)).toHaveLength(5);
    expect(new Set(Object.values(result.fontAliases).map((name) => name.toLowerCase())).size).toBe(
      5,
    );
    expect(Object.hasOwn(result.fontAliases, "discarded")).toBe(false);
    expect(Object.hasOwn(result.fontAliases, "__proto__")).toBe(true);
    expect(Object.getPrototypeOf(result.fontAliases)).toBe(Object.prototype);
    expect(aliasFontFamilyList("CONSTRUCTOR,__proto__", result.fontAliases)).toBe(
      `"constructor-${scope}","proto-${scope}"`,
    );
    expect(aliases).toEqual({ "open sans": `OpenSans-${scope}` });
  });

  it("rewrites direct nested-layer declarations through conditional groups", () => {
    const result = apply(
      `.x{@layer first{animation:f 1s;font-family:F;@supports(display:block){@layer second{animation-name:f;font-family:F}}}}@keyframes f{to{opacity:1}}@font-face{font-family:F;src:url(face.woff2)}`,
    );
    expect(result.css).not.toContain("@layer");
    expect(result.css).toContain(`animation:${scope}-f 1s`);
    expect(result.css).toContain(`animation-name:${scope}-f`);
    expect(result.css.match(new RegExp(`font-family:"F-${scope}"`, "g"))).toHaveLength(3);
    expect(result.notes).toHaveLength(2);
  });

  it("does not rewrite variables, their fallbacks, font shorthand, or source data", () => {
    const css = `@font-face{font-family:F;src:url(face.woff2)}@keyframes f{to{opacity:1}}.x{@layer y{--font:F;--motion:f;animation:var(--motion,f) 1s;font-family:var(--font,F);font:16px F}}`;
    const input = [{ css }];
    const before = JSON.stringify(input);
    const result = scopeDocumentCss(input, { scope });
    for (const literal of [
      "--font:F",
      "--motion:f",
      "animation:var(--motion,f) 1s",
      "font-family:var(--font,F)",
      "font:16px F",
    ])
      expect(result.css).toContain(literal);
    expect(JSON.stringify(input)).toBe(before);
  });

  it("isolates rejected rules inside supported wrappers while retaining parse warnings", () => {
    const result = scopeDocumentCss(
      [
        {
          css: '@media all{@supports(display:block){@keyframes "f"{to{opacity:1}}@font-face{font-family:F;font-family:12;src:url(face.woff2)}}}',
        },
        { css: ".broken{" },
        { css: ".ok{color:red}" },
      ],
      { scope },
    );
    expect(result.css).not.toMatch(/@keyframes|@font-face/);
    expect(result.fontAliases).toEqual({});
    expect(result.css).toContain(`.${scope} .ok`);
    expect(result.notes).toHaveLength(3);
    expect(result.notes.some((note) => note.includes("could not be parsed"))).toBe(true);
  });
});

describe("registration SSR and MJML boundaries", () => {
  it("gives sibling SSR canvases distinct aliases without fetching or changing exported CSS", () => {
    const css = `.x{@layer y{animation:f 1s;font-family:Final}}@keyframes f{to{opacity:1}}@keyframes "quoted"{to{opacity:1}}@font-face{font-family:First;font-family:Final;src:url(face.woff2)}`;
    const document = fromMjml(
      `<mjml><mj-head><mj-style>${css}</mj-style></mj-head><mj-body><mj-section><mj-column><mj-text>Registration</mj-text></mj-column></mj-section></mj-body></mjml>`,
    ).document;
    const before = JSON.stringify(document);
    const exported = toMjml(document);
    const fetch = vi.spyOn(globalThis, "fetch");
    try {
      const html = renderToStaticMarkup(
        <>
          <EmailCanvas headStyles={document.root.props?.headStyles}>
            <div className="x">First</div>
          </EmailCanvas>
          <EmailCanvas headStyles={document.root.props?.headStyles}>
            <div className="x">Second</div>
          </EmailCanvas>
        </>,
      );
      const $ = load(html);
      const styles = $("style[data-pm-canvas-css]")
        .toArray()
        .map((element) => ({
          scope: $(element).attr("data-pm-canvas-css")!,
          css: $(element).text(),
        }));
      expect(styles).toHaveLength(2);
      expect(styles[0].scope).not.toBe(styles[1].scope);
      for (const entry of styles) {
        expect(entry.css).toContain(`@keyframes ${entry.scope}-f`);
        expect(entry.css).toContain(`animation:${entry.scope}-f 1s`);
        expect(entry.css).toContain(`font-family:"Final-${entry.scope}"`);
        expect(entry.css).not.toContain('@keyframes "quoted"');
        expect(entry.css).not.toContain("font-family:First");
      }
      expect(fetch).not.toHaveBeenCalled();
      expect(JSON.stringify(document)).toBe(before);
      expect(toMjml(document)).toBe(exported);
      expect(exported).toContain(css);
      expect(exported).not.toContain("pm-canvas-");
    } finally {
      fetch.mockRestore();
    }
  });
});
