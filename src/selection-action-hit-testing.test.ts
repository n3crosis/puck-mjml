import { readFileSync } from "node:fs";
import { type HTMLButtonElement, Window } from "happy-dom";
import { describe, expect, it } from "vitest";

const puckCss = readFileSync("node_modules/@puckeditor/core/dist/index.css", "utf8");
const css = readFileSync("src/style.css", "utf8");
const puckClass = (prefix: string) => {
  const match = puckCss.match(new RegExp(`\\.(${prefix}_[\\w]+)\\b`));
  expect(match, `Puck's ${prefix} class remains available`).not.toBeNull();
  return match![1];
};

describe("relocated selection action hit testing", () => {
  it.each([
    { selected: false, dragging: false },
    { selected: true, dragging: false },
    // Actual Puck handle-drag snapshots retain selection while the registered
    // activator is grabbed and the upstream actions overlay suppresses hits.
    { selected: true, dragging: true },
  ])(
    "keeps only idle selected controls pointer-active, selected: $selected, dragging: $dragging",
    async ({ selected, dragging }) => {
      const window = new Window({ settings: { disableCSSFileLoading: true } });
      window.document.body.innerHTML = `
      <style>${puckCss}\n${css}</style>
      <div data-puck-overlay class="${puckClass("_DraggableComponent")}
        ${selected ? puckClass("_DraggableComponent--isSelected") : ""}">
        <div class="${puckClass("_DraggableComponent-actionsOverlay")}" ${dragging ? 'style="pointer-events: none"' : ""}>
          <div id="original-box" class="${puckClass("_DraggableComponent-actions")}">
            <div class="pm-selection-actions" data-placement="above" style="translate: 0 -118px">
              <button id="duplicate">Duplicate</button>
              <button id="drag" data-puck-drag-handle aria-grabbed="${dragging}">Drag to reorder</button>
              <button id="disabled" disabled>Delete</button>
              <div class="pm-richtext-toolbar--inline"><button id="bold">Bold</button></div>
            </div>
          </div>
          <div id="normal-box" class="${puckClass("_DraggableComponent-actions")}">
            <button>Ordinary Puck action</button>
          </div>
        </div>
      </div>`;
      const original = window.document.querySelector("#original-box")!;
      // Happy DOM omits inherited pointer-events in computed styles. Resolve
      // the inherited value here; the real pointer regression stays in Playwright.
      const pointerEvents = (element: typeof original): string => {
        const own = window.getComputedStyle(element).pointerEvents;
        return own || (element.parentElement ? pointerEvents(element.parentElement) : "auto");
      };
      expect(pointerEvents(original)).toBe("none");
      for (const selector of [".pm-selection-actions", "#duplicate", "#drag", "#bold", "#disabled"])
        expect(pointerEvents(window.document.querySelector(selector)!)).toBe(
          selected && !dragging ? "auto" : "none",
        );
      expect(window.document.querySelector<HTMLButtonElement>("#disabled")!.disabled).toBe(true);
      if (selected) {
        const drag = window.document.querySelector<HTMLButtonElement>("#drag")!;
        drag.focus();
        expect(window.document.activeElement).toBe(drag);
      }
      // Hosts that retain Puck's ordinary action bar keep its original hit area.
      expect(pointerEvents(window.document.querySelector("#normal-box")!)).toBe(
        selected && !dragging ? "auto" : "none",
      );
      await window.happyDOM.close();
    },
  );
});
