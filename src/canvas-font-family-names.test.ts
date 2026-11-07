import postcss from "postcss";
import { describe, expect, it } from "vitest";
import { aliasFontFamilyList, createFontAliases, scopeDocumentCss } from "./canvas-css";

const scope = "pm-canvas-family";
const families = [
  "Instrument Serif",
  "Source Sans-Serif",
  "Project Monospace",
  "Project System-UI",
  "Noto Serif Display",
  "Studio Caption",
];
const apply = (family: string) =>
  scopeDocumentCss(
    [
      {
        css: `@font-face{font-family:${family};src:url(face.woff2)}.text{font-family:${family},serif}`,
      },
    ],
    { scope },
  );

describe("bounded multiword font family aliases", () => {
  it.each(families)(
    "aliases an imported %s without substituting the generic fallback",
    (family) => {
      const aliases = createFontAliases([family, "serif"], scope);
      const alias = aliases[family.toLowerCase()];
      expect(aliasFontFamilyList(`${family}, serif`, aliases)).toBe(`"${alias}", serif`);
      expect(aliasFontFamilyList(`"${family}", '${family.toUpperCase()}', serif`, aliases)).toBe(
        `"${alias}","${alias}", serif`,
      );
    },
  );

  it.each(families)("registers and references the same custom %s face", (family) => {
    const result = apply(family);
    const alias = result.fontAliases[family.toLowerCase()];
    expect(alias).toBeDefined();
    expect(result.notes).toEqual([]);
    const values: string[] = [];
    postcss.parse(result.css).walkDecls("font-family", (declaration) => {
      values.push(declaration.value);
    });
    expect(values).toEqual([`"${alias}"`, `"${alias}",serif`]);
  });

  it("normalizes only unquoted CSS whitespace and keeps distinct names isolated", () => {
    const aliases = createFontAliases(["Instrument Serif", "InstrumentSerif"], scope);
    expect(aliasFontFamilyList("Instrument\t\r\n\f Serif, InstrumentSerif", aliases)).toBe(
      `"${aliases["instrument serif"]}","${aliases.instrumentserif}"`,
    );
    expect(aliases["instrument serif"]).not.toBe(aliases.instrumentserif);
  });

  it.each([
    "serif",
    "serif Instrument",
    "-webkit-body",
    "-webkit-body Serif",
    "sans-serif Source",
    "monospace Project",
    "system-ui Project",
    "cursive serif",
    "initial",
    "initial Project",
    "Project inherit",
    "Project unset",
    "Project revert",
    "Project revert-layer",
    "Project default",
    "caption Project",
    String.raw`Instrument\20 Serif`,
    "Instrument/**/Serif",
    '"Instrument  Serif"',
    '" Instrument Serif "',
    '"Instrument\tSerif"',
    "Instrument 12",
    '"Instrument" Serif',
  ])("does not promote an unsupported reference or registration: %s", (family) => {
    const aliases = createFontAliases([family.replace(/^"|"$/g, ""), "Instrument Serif"], scope);
    expect(aliasFontFamilyList(family, aliases)).toBe(family);
    const result = apply(family);
    expect(result.fontAliases).toEqual({});
    expect(result.css).not.toContain("@font-face");
    expect(result.notes).toHaveLength(1);
  });

  it("keeps quoted keyword and generic-leading families separate from unquoted references", () => {
    const names = ["serif", "serif Instrument", "-webkit-body", "inherit", "Project inherit"];
    const result = scopeDocumentCss(
      [
        {
          css: names
            .map((name) => `@font-face{font-family:"${name}";src:url(face.woff2)}`)
            .join(""),
        },
      ],
      { scope },
    );
    expect(result.notes).toEqual([]);
    for (const name of names) {
      expect(aliasFontFamilyList(`"${name}"`, result.fontAliases)).toBe(
        `"${result.fontAliases[name.toLowerCase()]}"`,
      );
      expect(aliasFontFamilyList(name, result.fontAliases)).toBe(name);
    }
  });

  it("retains last-descriptor selection and keyframe references for multiword families", () => {
    const css = `@font-face{font-family:Discarded;FONT-FAMILY:Instrument Serif;src:url(face.woff2)}
      @keyframes title{from,to{font-family:Instrument Serif,serif}}
      .text{font-family:Discarded,Instrument Serif,serif;animation:title 1s}`;
    const result = scopeDocumentCss([{ css }], { scope });
    expect(result.fontAliases).toEqual({ "instrument serif": `InstrumentSerif-${scope}` });
    expect(result.css.match(new RegExp(`"InstrumentSerif-${scope}"`, "g"))).toHaveLength(3);
    expect(result.css).toContain(`font-family:Discarded,"InstrumentSerif-${scope}",serif`);
    expect(result.notes).toEqual([]);
  });
});
