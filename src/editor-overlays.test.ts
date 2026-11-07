// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const puckCss = readFileSync(require.resolve("@puckeditor/core/puck.css"), "utf8");
const overlayCss = readFileSync("src/editor-overlays.css", "utf8");
let container: HTMLDivElement | undefined;
let style: HTMLStyleElement | undefined;

afterEach(() => {
  container?.remove();
  style?.remove();
});

describe("inline edit outline containment", () => {
  it("insets hovered/focused nested portals without clipping tools or changing other Puck canvases", () => {
    style = document.createElement("style");
    // Load Puck last, as happens when its interaction styles arrive in the preview iframe.
    // The detached DOM does not implement hover/focus-within state. Substitute attributes
    // of equal specificity so the installed Puck rules and our override still compete.
    style.textContent = `${overlayCss}\n${puckCss}`
      .replaceAll(":focus-within", "[data-test-focus-within]")
      .replaceAll(":hover", "[data-test-hover]");
    document.head.append(style);
    container = document.createElement("div");
    container.innerHTML = `<div data-puck-entry data-puck-preview-mode="edit">
      <div class="pm-canvas"><div data-puck-overlay-portal>
        <div data-puck-overlay-portal><input aria-label="Email text"></div>
      </div></div>
      <div data-puck-overlay-portal><input aria-label="Other canvas text"></div>
    </div>`;
    document.body.append(container);
    const portals = [
      ...container.querySelectorAll<HTMLElement>(".pm-canvas [data-puck-overlay-portal]"),
    ];
    expect(portals).toHaveLength(2);
    for (const portal of portals) {
      for (const state of ["data-test-focus-within", "data-test-hover"]) {
        portal.setAttribute(state, "");
        expect(getComputedStyle(portal).outlineOffset).toBe("-2px");
        portal.removeAttribute(state);
      }
      expect(getComputedStyle(portal).overflow).not.toBe("hidden");
      expect(getComputedStyle(portal).pointerEvents).toBe("auto");
    }
    const other = container.querySelector<HTMLInputElement>('[aria-label="Other canvas text"]')!;
    other.parentElement!.setAttribute("data-test-focus-within", "");
    expect(getComputedStyle(other.parentElement!).outlineOffset).toBe("2px");
  });
});
