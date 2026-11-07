import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Render, type Data } from "@puckeditor/core";
import { createEmailConfig } from "./config";
import { EmailCanvas } from "./EmailCanvas";
import { normalizeEmailBreakpoint, normalizeEmailWidth } from "./layout";

function renderDocument(breakpoint?: number, width = 600) {
  const data = {
    root: { props: { breakpoint, width, sections: [] } },
    content: [],
  };
  return <Render config={createEmailConfig()} data={data as Data} />;
}

describe("document responsive layout", () => {
  it.each([
    [undefined, 480],
    [Number.NaN, 480],
    [Number.POSITIVE_INFINITY, 480],
    ["720", 480],
    [100, 200],
    [480.5, 480.5],
    [720, 720],
    [1200, 1000],
  ])("normalizes breakpoint %s to %s", (input, expected) => {
    expect(normalizeEmailBreakpoint(input)).toBe(expected);
  });

  it("uses the viewport and an exclusive boundary independently of email width", () => {
    const html = renderToStaticMarkup(renderDocument(720, 320));
    expect(html).toContain("@media (width < 720px)");
    expect(html).toContain("max-width:320px");
    expect(html).not.toContain("@container");
    expect(renderToStaticMarkup(renderDocument())).toContain("@media (width < 480px)");
  });

  it("isolates differently configured documents rendered together", () => {
    const html = renderToStaticMarkup(
      <>
        {renderDocument(480)}
        {renderDocument(720)}
      </>,
    );
    const styles = [...html.matchAll(/<style data-pm-responsive="([^"]+)">([\s\S]*?)<\/style>/g)];
    expect(styles).toHaveLength(2);
    expect(styles[0][1]).not.toBe(styles[1][1]);
    for (const [index, [, scope, css]] of styles.entries()) {
      expect(html).toContain(`class="pm-canvas ${scope}"`);
      expect(css).toContain(`@media (width < ${index === 0 ? 480 : 720}px)`);
      expect(css).not.toContain(`.${styles[1 - index][1]}`);
      const selectors = css.match(/(?:\.[^{}]+|:where\([^{}]+)(?=\s*\{)/g) ?? [];
      for (const selectorList of selectors) {
        for (const selector of selectorList.split(",")) {
          expect(
            selector.trim().startsWith(`.${scope} `) ||
              selector.trim().startsWith(`:where(.${scope} `),
          ).toBe(true);
        }
      }
    }
  });

  it("stacks fixed columns and direct flex items while preserving grouped children", () => {
    const html = renderToStaticMarkup(renderDocument(600));
    expect(html).toContain(".pm-columns-2");
    expect(html).toContain(".pm-columns-3 { grid-template-columns: 1fr; }");
    expect(html).toContain(
      ".pm-flex-section:not(.pm-native-inline-section) > div > .pm-flex-column",
    );
    expect(html).toContain(
      ".pm-flex-section:not(.pm-native-inline-section) > div > .pm-flex-group { flex-basis: 100% !important; }",
    );
    expect(html).not.toContain(".pm-flex-group > div > .pm-flex-column");
    const stylesheet = readFileSync(new URL("./style.css", import.meta.url), "utf8");
    expect(stylesheet.slice(stylesheet.lastIndexOf("@media"))).not.toMatch(
      /\.pm-(?:columns|flex-)/,
    );
  });

  it("normalizes width and metadata without placing arbitrary strings into responsive CSS", () => {
    const html = renderToStaticMarkup(
      <EmailCanvas
        width={10000}
        breakpoint="480px) { body { display:none } }"
        lang="zh-Hant"
        dir="rtl"
      >
        <p>Content</p>
      </EmailCanvas>,
    );
    expect(html).toContain("max-width:1000px");
    expect(html).toContain('lang="zh-Hant" dir="rtl"');
    expect(html).toContain("@media (width < 480px)");
    expect(html).not.toContain("display:none");
    expect(normalizeEmailWidth(undefined)).toBe(600);
    expect(normalizeEmailWidth(0)).toBe(320);
    const fallback = renderToStaticMarkup(
      <EmailCanvas lang='" onclick="bad()' dir="invalid">
        Content
      </EmailCanvas>,
    );
    expect(fallback).toContain('lang="und" dir="auto"');
  });

  it("uses native breakpoint and body overrides without the visual control limits", () => {
    const html = renderToStaticMarkup(
      <EmailCanvas
        width={600}
        breakpoint={480}
        breakpointWidth="1440px"
        nativeSettings={{
          bodyAttributes: [
            { name: "width", value: "1280px" },
            { name: "background-color", inherit: true },
          ],
          bodyMjClass: "paper",
          mjmlClasses: [
            {
              name: "paper",
              attributes: [
                { name: "background-color", value: "navy" },
                { name: "css-class", value: "custom-body" },
              ],
            },
          ],
        }}
      >
        Content
      </EmailCanvas>,
    );
    expect(html).toContain("@media (width < 1440px)");
    expect(html).toContain("max-width:1280px");
    expect(html).toContain("background-color:navy");
    expect(html).toContain('class="pm-email custom-body"');
  });

  it("keeps invalid native drafts editable without interpolating them into CSS", () => {
    const html = renderToStaticMarkup(
      <EmailCanvas
        breakpointWidth="480px) { body { display:none } }"
        nativeSettings={{
          bodyAttributes: [{ name: "width", value: "unfinished" }],
        }}
      >
        Content
      </EmailCanvas>,
    );
    expect(html).toContain("max-width:600px");
    expect(html).toContain("@media (width < 480px)");
    expect(html).not.toContain("display:none");
  });

  it("lets the scoped mobile rule reveal the native navigation trigger", () => {
    const data = {
      root: {
        props: {
          breakpointWidth: "700px",
          sections: [
            {
              type: "Section1",
              props: {
                id: "s",
                column: [
                  {
                    type: "Navbar",
                    props: {
                      id: "nav",
                      links: [{ href: "https://example.com", label: "Home" }],
                      mjmlAttributes: [{ name: "hamburger", value: "hamburger" }],
                    },
                  },
                ],
              },
            },
          ],
        },
      },
      content: [],
    };
    const html = renderToStaticMarkup(<Render config={createEmailConfig()} data={data as Data} />);
    const trigger = html.match(/<button[^>]*class="pm-native-navbar-trigger"[^>]*>/)?.[0];
    expect(trigger).toBeDefined();
    expect(trigger).not.toContain("display:none");
    expect(html).toContain("@media (width < 700px)");
    expect(html).toContain(".pm-native-navbar-trigger { display: block; }");
    expect(html).toContain(
      '.pm-native-navbar[data-native-navbar-open="false"] > .pm-native-navbar-links { display: none; }',
    );
  });
});
