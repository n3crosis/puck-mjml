// @vitest-environment happy-dom
import { Render, type Data } from "@puckeditor/core";
import { load } from "cheerio";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createEmailConfig } from "./config";
import { compileEmail } from "./export";
import { fromMjml } from "./import";
import { nativeBackgroundStyle, sectionBackgroundPosition } from "./native-background";
import { backgroundStates } from "../tests/browser/fixtures/native-background-source";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const config = createEmailConfig();
const cases: [string, Record<string, string>, string][] = [
  ["default", {}, "center top"],
  ["top", { "background-position": "top" }, "center top"],
  ["bottom", { "background-position": "bottom" }, "center bottom"],
  ["right", { "background-position": "right" }, "right center"],
  ["reversed", { "background-position": "bottom left" }, "left bottom"],
  ["center first", { "background-position": "center right" }, "right center"],
  ["coordinates", { "background-position": "25% 75%" }, "25% 75%"],
  ["pixels", { "background-position": "12px 24px" }, "12px 24px"],
  ["compiler fallback", { "background-position": "left 12px top 24px" }, "center top"],
  [
    "x override",
    { "background-position": "top center", "background-position-x": "25%" },
    "25% top",
  ],
  [
    "y override",
    { "background-position": "top center", "background-position-y": "75%" },
    "center 75%",
  ],
  [
    "both overrides",
    {
      "background-position": "bottom right",
      "background-position-x": "12px",
      "background-position-y": "24px",
    },
    "12px 24px",
  ],
];

describe("native background position", () => {
  it.each(cases)(
    "matches compiler precedence for %s on sections and wrappers",
    async (_name, attributes, expected) => {
      expect(sectionBackgroundPosition(attributes)).toBe(expected);
      const extra = Object.entries(attributes)
        .map(([key, value]) => `${key}="${value}"`)
        .join(" ");
      for (const tag of ["mj-section", "mj-wrapper"]) {
        const content = "<mj-column><mj-text>Position</mj-text></mj-column>";
        const source = `<mjml><mj-body><${tag} css-class="position" background-url="https://example.com/background.svg" ${extra}>${tag === "mj-wrapper" ? `<mj-section>${content}</mj-section>` : content}</${tag}></mj-body></mjml>`;
        const { document, warnings } = fromMjml(source);
        expect(warnings).toEqual([]);
        const canvas = load(
          renderToStaticMarkup(<Render config={config} data={document as Data} />),
        );
        const result = await compileEmail(document);
        expect(result.errors).toEqual([]);
        const compiled = load(result.html);
        expect(compiled(".position").css("background-position")).toBe(expected);
        expect(canvas(".position").css("background-position")).toBe(expected);
        expect(canvas(".position").attr("style")).not.toMatch(/background-position-[xy]:/);
      }
    },
  );

  it("preserves hero CSS positions instead of applying the section parser", async () => {
    const { document } = fromMjml(
      '<mjml><mj-body><mj-hero css-class="hero" mode="fixed-height" height="300px" background-url="https://example.com/background.svg" background-position="right 12px bottom 24px"><mj-text>Hero</mj-text></mj-hero></mj-body></mjml>',
    );
    const canvas = load(renderToStaticMarkup(<Render config={config} data={document as Data} />));
    expect(canvas(".hero").css("background-position")).toBe("right 12px bottom 24px");
    const result = await compileEmail(document);
    expect(result.errors).toEqual([]);
    expect(result.html).toContain("right 12px bottom 24px");
  });

  it("updates one position property through overrides, removal and source replacement without remounting", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    let original: Element | null = null;
    try {
      for (const [state, expected] of [
        ["initial", "center top"],
        ["x", "25% top"],
        ["xy", "25% 75%"],
        ["removed", "center top"],
        ["changed", "right bottom"],
        ["replacement", "left bottom"],
        ["initial", "center top"],
      ] as const) {
        await act(async () =>
          root.render(
            <div
              className="background-target"
              style={nativeBackgroundStyle(backgroundStates[state])}
            />,
          ),
        );
        const target = host.querySelector<HTMLElement>(".background-target")!;
        expect(target).not.toBeNull();
        original ??= target;
        expect(target).toBe(original);
        expect(target.style.backgroundPosition).toBe(expected);
        expect(target.getAttribute("style")).not.toMatch(/background-position-[xy]:/);
      }
    } finally {
      await act(async () => root.unmount());
      host.remove();
    }
  });
});
