import { readFileSync } from "node:fs";
import { Render, type Data } from "@puckeditor/core";
import { Window } from "happy-dom";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createEmailConfig } from "./config";
import type { EmailBlock, EmailDocument, EmailSettings, MjmlAttribute } from "./types";

beforeAll(() => vi.stubGlobal("window", globalThis));
afterAll(() => vi.unstubAllGlobals());

const values = (entries: Record<string, string>): MjmlAttribute[] =>
  Object.entries(entries).map(([name, value]) => ({ name, value }));
const block = (type: string, id: string, props: EmailBlock["props"] = {}): EmailBlock => ({
  type,
  props: { id, ...props },
});
const render = (document: EmailDocument) =>
  renderToStaticMarkup(<Render config={createEmailConfig()} data={document as Data} />);
function parse(html: string) {
  const window = new Window({
    settings: {
      enableJavaScriptEvaluation: false,
      disableCSSFileLoading: true,
      disableJavaScriptFileLoading: true,
      enableImageFileLoading: false,
      disableIframePageLoading: true,
    },
  });
  window.document.body.innerHTML = html;
  return window.document;
}

describe("scoped custom CSS on the canvas", () => {
  const documentWith = (settings: EmailSettings): EmailDocument => ({
    root: { props: { width: 700, sections: [], ...settings } },
    content: [],
  });

  it("applies document CSS scoped to the canvas root", () => {
    const html = render(
      documentWith({
        headStyles: [
          {
            inline: "inline",
            css: "body { padding: 0 16px !important; } .card { box-shadow: 0 1px #000; }",
          },
          { inline: "head", css: "@media (max-width: 600px) { .card { padding: 0 !important; } }" },
        ],
      }),
    );
    const canvas = parse(html);
    const root = canvas.querySelector(".pm-canvas")!;
    const scope = [...root.classList].find((name) => name.startsWith("pm-canvas-"))!;
    const custom = canvas.querySelector(`style[data-pm-canvas-css="${scope}"]`)!.textContent;
    expect(custom).toContain(`.${scope} { padding: 0 16px !important; }`);
    expect(custom).toContain(`.${scope} .card { box-shadow: 0 1px #000; }`);
    expect(custom).toContain(`.${scope} .card { padding: 0 !important; }`);
  });

  it("renders no custom style element without document CSS", () => {
    const html = render(documentWith({}));
    expect(html).not.toContain("data-pm-canvas-css");
    expect(html).not.toContain("data-pm-canvas-fonts");
  });

  it("aliases the canvas font stack for declared web fonts", () => {
    const html = render(
      documentWith({
        fontFamily: "Inter, Arial, sans-serif",
        fontImports: [{ name: "Inter", href: "https://fonts.example.com/inter.css" }],
      }),
    );
    const canvas = parse(html);
    const root = canvas.querySelector(".pm-canvas")!;
    const scope = [...root.classList].find((name) => name.startsWith("pm-canvas-"))!;
    expect(root.getAttribute("style")).toContain(`font-family:"Inter-${scope}"`);
    // Fonts load on the client only; server rendering never fetches.
    expect(
      canvas.querySelector("style[data-pm-canvas-fonts]")?.getAttribute("data-pm-font-status"),
    ).toBe("loading");
    expect(canvas.querySelector("style[data-pm-canvas-fonts]")?.textContent).toBe("");
  });

  it("aliases native font-family attributes on canvas content", () => {
    const html = render({
      root: {
        props: {
          width: 700,
          fontFamily: "Inter, Arial, sans-serif",
          fontImports: [{ name: "Inter", href: "https://fonts.example.com/inter.css" }],
          sections: [
            block("Section1", "section", {
              column: [
                block("Text", "copy", {
                  content: "<p>Styled text</p>",
                  mjmlAttributes: values({
                    "font-family": "Inter, monospace",
                    "css-class": "copy",
                  }),
                }),
              ],
            }),
          ],
        } as EmailSettings,
      },
      content: [],
    });
    const canvas = parse(html);
    const scope = [...canvas.querySelector(".pm-canvas")!.classList].find((name) =>
      name.startsWith("pm-canvas-"),
    )!;
    const text = canvas.querySelector(".copy")!;
    expect(text.getAttribute("style")).toContain(`font-family:"Inter-${scope}", monospace`);
  });

  it("does not fetch font stylesheets during server rendering", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    try {
      render(
        documentWith({
          fontImports: [{ name: "Inter", href: "https://fonts.example.com/inter.css" }],
        }),
      );
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("Tailwind canvas runtime", () => {
  const documentWith = (settings: EmailSettings): EmailDocument => ({
    root: { props: { width: 700, sections: [], ...settings } },
    content: [],
  });

  it("never serializes document-controlled scripts or executable runtime markup", () => {
    const html = render(
      documentWith({
        tailwind: true,
        tailwindScriptUrl: "https://attacker.example/script.js",
      }),
    );
    expect(html).not.toContain("attacker.example");
    expect(html).not.toContain("text/tailwindcss");
    expect(parse(html).querySelector("script")).toBeNull();
  });
});

describe("selection frame containment", () => {
  it("keeps the inline menu and Puck's action bar inside the selected block", () => {
    const stylesheet = readFileSync(new URL("./style.css", import.meta.url), "utf8");
    // Formatting stays inside the dark action surface, instead of white icons
    // floating over the email. Every containing flex level can wrap.
    expect(stylesheet).toMatch(
      /\.pm-richtext-toolbar--inline\s*{[^}]*position:\s*relative[^}]*background:/,
    );
    expect(stylesheet).toMatch(/\[class\*="_ActionBar-group_"\][^}]*flex-wrap:\s*wrap/);
    expect(stylesheet).toMatch(
      /\.pm-richtext-toolbar--inline \[data-puck-rte-menu\] > div\s*{\s*display:\s*contents/,
    );
    expect(stylesheet).toMatch(
      /\.pm-richtext-toolbar--inline \.pm-richtext-link\s*{[^}]*flex:\s*1 1 100%[^}]*max-width:\s*100%/,
    );
    expect(stylesheet).not.toMatch(/\.pm-richtext-toolbar[^}]*overflow:\s*(hidden|clip)/);
  });
});
