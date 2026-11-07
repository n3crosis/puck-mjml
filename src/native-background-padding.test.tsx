import { Render, type Data } from "@puckeditor/core";
import { load } from "cheerio";
import { readFileSync } from "node:fs";
import postcss, { type Rule } from "postcss";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { scopeDocumentCss } from "./canvas-css";
import { createEmailConfig } from "./config";
import { compileEmail, toMjml } from "./export";
import { fromMjml } from "./import";
import { backgroundPaddingSource } from "../tests/browser/fixtures/native-background-padding-source";

beforeAll(() => vi.stubGlobal("window", globalThis));
afterAll(() => vi.unstubAllGlobals());

const ordinary = ".inset > table > tbody > tr > td";
const background = ".inset > div > table > tbody > tr > td";
const scope = "pm-canvas-background-test";
const rulesFor = (css: string) => {
  const rules: Rule[] = [];
  postcss.parse(scopeDocumentCss([{ css }], { scope }).css).walkRules((rule) => {
    rules.push(rule);
  });
  return rules;
};
const canvasFor = (source: string) => {
  const result = fromMjml(source);
  expect(result.warnings).toEqual([]);
  return {
    document: result.document,
    canvas: load(
      renderToStaticMarkup(<Render config={createEmailConfig()} data={result.document as Data} />),
    ),
  };
};

describe("bounded background padding CSS aliases", () => {
  it("keeps the authored selector and five-type specificity, cloning only physical padding", () => {
    const [authored, alias] = rulesFor(
      `${background} { color: red; padding: 40px; padding-left: 24px !important; padding-inline: 5px; --padding: 9px; }`,
    );
    expect(authored.selector).toBe(`.${scope} ${background}`);
    expect(authored.toString()).toContain("color: red");
    const target = `:where(.${scope} .inset[data-pm-mjml-padding="background"])`;
    expect(alias.selector).toBe(`:is(.${scope} ${background}, ${target})${target}`);
    expect(alias.nodes.map((node) => node.toString())).toEqual([
      "padding: 40px",
      "padding-left: 24px !important",
    ]);
  });

  it("separates ordinary and background targets without aliasing authored tables or other scopes", () => {
    const [, ordinaryAlias, , backgroundAlias] = rulesFor(
      `${ordinary} { padding: 12px !important; } ${background} { padding: 24px !important; }`,
    );
    const $ = load(`<div class="${scope}">
      <div id="ordinary" class="inset" data-pm-mjml-padding="self"></div>
      <div class="inset" data-pm-mjml-padding="child"><div id="gutter" data-pm-mjml-padding-target></div></div>
      <div id="background" class="inset" data-pm-mjml-padding="background"></div>
      <div id="unmarked" class="inset"><div><table><tbody><tr><td id="authored">Keep original CSS<table><tbody><tr><td id="nested">Nested</td></tr></tbody></table></td></tr></tbody></table></div></div>
      <div id="full" class="inset"><div class="pm-native-layout-content"></div></div>
    </div>
    <div class="pm-canvas-other"><div id="other" class="inset" data-pm-mjml-padding="background"></div></div>
    <div id="host" class="inset" data-pm-mjml-padding="background"></div>`);
    const ids = (selector: string) =>
      $(selector)
        .toArray()
        .map((node) => $(node).attr("id"));
    expect(ids(ordinaryAlias.selector)).toEqual(["ordinary", "gutter"]);
    expect(ids(backgroundAlias.selector)).toEqual(["background"]);
    expect(ids(`.${scope} ${background}`)).toEqual(["authored"]);
  });

  it("keeps mixed selector lists, importance and source order independent", () => {
    const sheets = [
      {
        css: `${ordinary}, ${background}, #unrelated { padding: 12px; padding-left: 24px !important; }\n.inset { padding-left: 1px !important; }\n${background} { padding-left: 18px !important; }`,
      },
    ];
    const saved = JSON.stringify(sheets);
    const rules = rulesFor(sheets[0].css);
    expect(rules).toHaveLength(5);
    expect(rules[1].selector.match(/:is\(/g)).toHaveLength(2);
    expect(rules[1].selector).toContain(`:is(.${scope} ${ordinary},`);
    expect(rules[1].selector).toContain(`:is(.${scope} ${background},`);
    expect(rules[1].selector).not.toContain("#unrelated");
    expect(rules[1].nodes.map((node) => node.toString())).toEqual([
      "padding: 12px",
      "padding-left: 24px !important",
    ]);
    expect(rules[2].selector).toBe(`.${scope} .inset`);
    expect(rules[4].nodes[0].toString()).toBe("padding-left: 18px !important");
    scopeDocumentCss(sheets, { scope });
    expect(JSON.stringify(sheets)).toBe(saved);
  });

  it.each(["media (max-width: 600px)", "supports (display: block)", "container (width < 600px)"])(
    "keeps background aliases inside @%s",
    (conditional) => {
      const [original, alias] = rulesFor(
        `@${conditional} { ${background} { padding-right: 24px !important; } }`,
      );
      expect(alias.parent).toBe(original.parent);
      expect(alias.parent?.toString()).toContain(`@${conditional}`);
    },
  );

  it.each([
    ".inset div table td",
    ".inset > div > div > table > tbody > tr > td",
    ".inset > tbody > tr > td > div > div > table > tbody > tr > td",
    ".inset > div table > tbody > tr > td",
    ".inset > div > table > tbody > tr > td:first-child",
    ".inset.more > div > table > tbody > tr > td",
    ".inset:hover > div > table > tbody > tr > td",
    ".inset[title] > div > table > tbody > tr > td",
    "#inset > div > table > tbody > tr > td",
    "body .inset > div > table > tbody > tr > td",
    ".outer .inset > div > table > tbody > tr > td",
    ".inset + div > table > tbody > tr > td",
  ])("does not expand unsupported selector %s", (selector) => {
    expect(rulesFor(`${selector} { padding: 2px; }`)).toHaveLength(1);
  });

  it.each([
    "padding-inline: 2px; color: red;",
    "padding: 2px; all: unset;",
    "padding: 2px; & { padding: 4px; }",
    "padding: 2px; @media (max-width: 600px) { padding: 4px; }",
  ])("preserves the adapter exclusions for %s", (declarations) => {
    expect(
      scopeDocumentCss([{ css: `${background} { ${declarations} }` }], { scope }).css,
    ).not.toContain('data-pm-mjml-padding="background"');
  });

  it("does not alias a background selector that can escape the canvas root", () => {
    const result = scopeDocumentCss([{ css: `body + ${background} { padding: 99px; }` }], {
      scope,
    });
    expect(result.css).toBe("");
    expect(result.notes).toHaveLength(1);
  });
});

describe("compiler-backed background padding targets", () => {
  it("caps nested sections at the compiler width when wrapper CSS reduces padding", async () => {
    const { document, canvas } = canvasFor(backgroundPaddingSource(24, true));
    const result = await compileEmail(document);
    expect(result.errors).toEqual([]);
    const compiled = load(result.html);
    const nativeSection = canvas(".shell .pm-section").first();
    const compiledSection = compiled(".shell div[style*='max-width:576px']").first();
    expect(compiledSection).toHaveLength(1);
    expect(nativeSection.css("max-width")).toBe(compiledSection.css("max-width"));
    expect(nativeSection.css("margin-inline")).toBe("auto");
    // Mobile CSS exposes 584px in a 600px viewport, but MJML keeps the 576px
    // source-derived cap. The 390/601px viewports fit underneath that cap.
    expect(nativeSection.css("max-width")).toBe("576px");
    expect(canvas(".shell").css("max-width")).toBeUndefined();
  });

  it.each([true, false])(
    "compiles the browser fixture with background=%s and keeps authored tables unmarked",
    async (hasBackground) => {
      const { document, warnings } = fromMjml(backgroundPaddingSource(24, hasBackground));
      expect(warnings).toEqual([]);
      const result = await compileEmail(document);
      expect(result.errors).toEqual([]);
      const compiled = load(result.html);
      const canvas = load(
        renderToStaticMarkup(<Render config={createEmailConfig()} data={document as Data} />),
      );
      for (const $ of [canvas, compiled]) {
        expect($(".authored td")).toHaveLength(1);
        expect($(".authored").attr("data-pm-mjml-padding")).toBeUndefined();
      }
      expect(
        compiled(`.background ${hasBackground ? "> div" : ""} > table > tbody > tr > td`),
      ).toHaveLength(1);
      expect(canvas(".background").attr("data-pm-mjml-padding")).toBe(
        hasBackground ? "background" : "self",
      );
    },
  );

  for (const tag of ["mj-section", "mj-wrapper"]) {
    for (const hasBackground of [false, true]) {
      it.each([false, true])(
        `${tag}, background=${hasBackground}, full-width=%s keeps the exact generated box contract`,
        async (fullWidth) => {
          const column =
            '<mj-column padding="0px"><mj-text padding="0px">Fixture</mj-text></mj-column>';
          const content =
            tag === "mj-wrapper" ? `<mj-section padding="0px">${column}</mj-section>` : column;
          const source = `<mjml><mj-body><${tag} css-class="inset" padding="12px 32px"${hasBackground ? ' background-url="https://example.com/background.png"' : ""}${fullWidth ? ' full-width="full-width"' : ""}>${content}</${tag}></mj-body></mjml>`;
          const { canvas, document } = canvasFor(source);
          const result = await compileEmail(document);
          expect(result.errors).toEqual([]);
          const compiled = load(result.html);
          const selector = hasBackground ? background : ordinary;
          expect(compiled(selector)).toHaveLength(fullWidth ? 0 : 1);
          expect(compiled(hasBackground ? ordinary : background)).toHaveLength(0);
          expect(canvas(".inset").attr("data-pm-mjml-padding")).toBe(
            fullWidth ? undefined : hasBackground ? "background" : "self",
          );
          if (!fullWidth) {
            expect(canvas(".inset").attr("style")).toContain("padding:12px 32px");
            expect(compiled(selector).attr("style")).toContain("padding:12px 32px");
          } else {
            expect(canvas(".inset [data-pm-mjml-padding-target]")).toHaveLength(0);
            expect(canvas(".inset > .pm-native-layout-content").attr("style")).toContain(
              "padding:12px 32px",
            );
          }
          expect(toMjml(document)).not.toContain("data-pm-mjml-padding");
        },
      );
    }
  }

  it("marks inherited backgrounds and removes/replaces the marker on source updates", () => {
    const source = (attributes: string) =>
      `<mjml><mj-head><mj-attributes><mj-class name="background" background-url="https://example.com/background.png" /></mj-attributes></mj-head><mj-body><mj-section css-class="inset" ${attributes}><mj-column><mj-text>Fixture</mj-text></mj-column></mj-section></mj-body></mjml>`;
    for (const [attributes, marker] of [
      ['mj-class="background"', "background"],
      ["", "self"],
      ['mj-class="background" full-width="full-width"', undefined],
      ['mj-class="background"', "background"],
    ]) {
      const { canvas } = canvasFor(source(attributes!));
      expect(canvas(".inset").attr("data-pm-mjml-padding")).toBe(marker);
    }
  });

  it("corrects Arcane promo's compiled background cell without changing source into canvas CSS", async () => {
    const source = readFileSync(
      new URL("../templates/04-Arcane/promo.mjml", import.meta.url),
      "utf8",
    );
    const { canvas, document } = canvasFor(source);
    const result = await compileEmail(document);
    expect(result.errors).toEqual([]);
    const compiled = load(result.html);
    expect(compiled(".arcane-inset > div > table > tbody > tr > td")).toHaveLength(1);
    const style =
      document.root.props?.headStyles?.find(({ css }) => css.includes("@media"))?.css ?? "";
    const rules = rulesFor(style);
    const rule = rules.find(({ selector }) =>
      selector.includes('data-pm-mjml-padding="background"'),
    );
    expect(rule?.parent?.toString()).toContain("max-width: 600px");
    expect(rule?.nodes.map((node) => node.toString())).toEqual([
      "padding-left: 24px !important",
      "padding-right: 24px !important",
    ]);
    expect(canvas('.arcane-inset[data-pm-mjml-padding="background"]')).toHaveLength(1);
    expect(source).not.toContain("data-pm-");
    expect(source).not.toContain("pm-canvas");
    expect(toMjml(document)).toContain(".arcane-inset > div > table > tbody > tr > td");
  });
});
