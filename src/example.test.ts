import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Window } from "happy-dom";
import { createExampleDocument } from "./document";
import { compileEmail } from "./export";
import type { EmailBlock } from "./types";

// Parse output in memory. Resource loading is disabled; no browser is launched.
const parser = new Window({
  settings: {
    disableCSSFileLoading: true,
    disableJavaScriptFileLoading: true,
    disableJavaScriptEvaluation: true,
    disableIframePageLoading: true,
  },
});
beforeAll(() => vi.stubGlobal("window", globalThis));
afterAll(() => {
  vi.unstubAllGlobals();
  return parser.happyDOM.close();
});

function descendants(blocks: EmailBlock[]): EmailBlock[] {
  return blocks.flatMap((block) => [
    block,
    ...Object.values(block.props).flatMap((value) =>
      Array.isArray(value) &&
      value.every((item) => item && typeof item === "object" && "type" in item && "props" in item)
        ? descendants(value as EmailBlock[])
        : [],
    ),
  ]);
}

describe("Collage product update example", () => {
  it("creates independent editable block trees with unique IDs and no raw HTML", () => {
    const document = createExampleDocument();
    const next = createExampleDocument();
    const blocks = descendants(document.root.props!.sections!);
    expect(document.content).toEqual([]);
    expect(blocks.every((block) => block.type !== "Raw" && Boolean(block.props.id))).toBe(true);
    expect(new Set(blocks.map((block) => block.props.id)).size).toBe(blocks.length);
    const title = blocks.find((block) => block.props.id === "intro-title")!;
    title.props.content = "<p>Edited inline</p>";
    expect(JSON.stringify(next)).toContain("Monthly roundup");
    expect(JSON.stringify(next)).not.toContain("Edited inline");
  });

  it("compiles the full template with matching artwork, typography, and native update dividers", async () => {
    const input = createExampleDocument();
    const original = JSON.stringify(input);
    const result = await compileEmail(input);
    expect(result.errors).toEqual([]);
    expect(JSON.stringify(input)).toBe(original);
    const html = new parser.DOMParser().parseFromString(result.html, "text/html");
    expect(html.title).toBe("Monthly roundup — Collage");
    expect(html.querySelector(".collage-card")?.getAttribute("style")).toContain(
      "max-width: 608px",
    );
    const titleStyle =
      html.querySelector(".collage-updates-title > div")?.getAttribute("style") ?? "";
    for (const style of [
      "font-size: 48px",
      "line-height: 1",
      "letter-spacing: -1.44px",
      "max-width: 400px",
    ])
      expect(titleStyle).toContain(style);
    for (const index of [5, 6, 7, 8, 9])
      expect(html.querySelector(`img[src$="collage-image-${index}.png"]`)).not.toBeNull();
    expect(result.mjml.match(/<mj-group\b/g)).toHaveLength(3);
    expect(result.mjml.match(/<mj-divider\b/g)).toHaveLength(4);
    expect(html.body.textContent).toContain("Smarter Search");
    expect(html.body.textContent).toContain("Shared Workspaces");
    expect(html.body.textContent).toContain("New Discovery Tools");
    expect(html.body.textContent).toContain("Open Collage");
    for (const name of ["x", "in", "yt", "gh"]) {
      const icon = html.querySelector(`img[src$="social-${name}-black.png"]`);
      expect(icon?.getAttribute("width")).toBe("20");
      expect(icon?.closest("a")?.getAttribute("href")).toBe("https://example.com/");
    }
    expect(result.html).not.toContain("sharer");
  });

  it("keeps mobile CSS selectors attached to generated MJML elements", async () => {
    const document = createExampleDocument();
    const result = await compileEmail(document);
    const html = new parser.DOMParser().parseFromString(result.html, "text/html");
    const responsiveCss = document.root.props!.headStyles!.find(
      (style) => style.inline === "head",
    )!.css;
    for (const [, selector] of responsiveCss.matchAll(/([^{}]+)\{[^{}]*\}/g)) {
      expect(html.querySelectorAll(selector.trim()).length, selector.trim()).toBeGreaterThan(0);
    }
    expect(result.html).toContain("@media only screen and (max-width: 600px)");
    expect(result.html).toContain("@media only screen and (min-width:601px)");
    expect(
      html.querySelector(".collage-feature-first > table > tbody > tr > td")?.getAttribute("style"),
    ).toContain("padding:0px 16px 0px 0px");
    expect(
      html.querySelector(".collage-updates-end > table > tbody > tr > td")?.getAttribute("style"),
    ).toContain("padding:0px 40px 80px");
  });
});
