// @vitest-environment happy-dom
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SelectionActionBar, selectionActionPlacement } from "./SelectionActionBar";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
let container: HTMLDivElement | undefined;
afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  vi.restoreAllMocks();
  root = undefined;
});
const bounds = (left: number, top: number, width: number, height: number) =>
  new DOMRect(left, top, width, height);

describe("selection action positioning", () => {
  it("keeps a wrapped toolbar outside narrow elements and falls below at the viewport top", () => {
    const tools = { width: 120, height: 64 };
    const column = bounds(100, 150, 120, 48);
    const above = selectionActionPlacement(column, tools, 800, 600);
    expect(above.left).toBe(column.left);
    expect(above.top + tools.height).toBeLessThan(column.top);
    expect(above.side).toBe("above");
    const firstCell = bounds(100, 4, 120, 48);
    const below = selectionActionPlacement(firstCell, tools, 800, 600);
    expect(below.top).toBeGreaterThan(firstCell.bottom);
    expect(below.side).toBe("below");
    const rightEdge = selectionActionPlacement(bounds(700, 150, 120, 48), tools, 800, 600);
    expect(rightEdge.left + tools.width).toBeLessThan(800);
  });

  it("keeps actions visible for tall, partially scrolled, and offscreen selections", () => {
    const tools = { width: 240, height: 64 };
    for (const target of [
      bounds(100, -100, 600, 1000),
      bounds(100, 4, 600, 1000),
      bounds(100, -400, 600, 450),
      bounds(100, 700, 600, 100),
    ]) {
      const placement = selectionActionPlacement(target, tools, 800, 600);
      expect(placement.top).toBeGreaterThanOrEqual(8);
      expect(placement.top + tools.height).toBeLessThanOrEqual(592);
    }
    const nearBottom = selectionActionPlacement(bounds(100, 560, 600, 48), tools, 800, 600);
    expect(nearBottom.side).toBe("above");
    expect(nearBottom.top + tools.height).toBeLessThan(560);
  });

  it.each([0.5, 1, 2])(
    "repositions controls at %sx action scale without losing focus or callbacks",
    async (scale) => {
      vi.spyOn(window, "innerHeight", "get").mockReturnValue(600);
      let target = bounds(100, 150, 120, 48);
      let height = 64;
      const original = HTMLElement.prototype.getBoundingClientRect;
      vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
        this: HTMLElement,
      ) {
        if (this.hasAttribute("data-puck-overlay")) return target;
        if (this.classList.contains("pm-selection-actions")) {
          const [x = 0, y = 0] = this.style.translate
            .split(" ")
            .map((value) => parseFloat(value) || 0);
          const width = Math.min(240, parseFloat(this.style.maxWidth) || 240) * scale;
          return bounds(
            target.right - width + x * scale,
            target.top + 8 + y * scale,
            width,
            Math.min(height, parseFloat(this.style.maxHeight) || height) * scale,
          );
        }
        return original.call(this);
      });
      vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(function (
        this: HTMLElement,
      ) {
        return this.classList.contains("pm-selection-actions")
          ? Math.min(240, parseFloat(this.style.maxWidth) || 240)
          : 0;
      });
      vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(function (
        this: HTMLElement,
      ) {
        return this.classList.contains("pm-selection-actions") ? height : 0;
      });
      const duplicate = vi.fn();
      container = document.createElement("div");
      document.body.append(container);
      root = createRoot(container);
      await act(async () =>
        root!.render(
          <StrictMode>
            <div data-puck-overlay>
              <div className="_DraggableComponent-actions_test">
                <SelectionActionBar
                  label="Table"
                  parentAction={<button type="button">Parent</button>}
                >
                  <input aria-label="Link URL" defaultValue="https://example.com" />
                  <button type="button" onClick={duplicate}>
                    Duplicate
                  </button>
                </SelectionActionBar>
              </div>
            </div>
          </StrictMode>,
        ),
      );
      const bar = container.querySelector<HTMLElement>(".pm-selection-actions")!;
      const input = container.querySelector<HTMLInputElement>("input")!;
      expect(bar.getBoundingClientRect().bottom).toBeLessThan(target.top);
      expect(bar.getBoundingClientRect().left).toBeGreaterThanOrEqual(target.left);
      expect(bar.getBoundingClientRect().right).toBeLessThanOrEqual(target.right);
      expect(bar.style.maxWidth).toBe(`${120 / scale}px`);
      expect(bar.getBoundingClientRect().width).toBeLessThanOrEqual(target.width);
      input.focus();
      input.setSelectionRange(8, 8);
      height = 110;
      target = bounds(100, 4, 120, 48);
      await act(async () => {
        window.dispatchEvent(new Event("resize"));
        await new Promise((resolve) => setTimeout(resolve, 30));
      });
      expect(bar.dataset.placement).toBe("below");
      expect(bar.getBoundingClientRect().top).toBeGreaterThan(target.bottom);
      expect(document.activeElement).toBe(input);
      expect(input.selectionStart).toBe(8);
      target = bounds(100, -100, 120, 1000);
      await act(async () => {
        document.dispatchEvent(new Event("scroll"));
        await new Promise((resolve) => setTimeout(resolve, 30));
      });
      expect(bar.getBoundingClientRect().top).toBeGreaterThanOrEqual(8);
      expect(bar.getBoundingClientRect().bottom).toBeLessThanOrEqual(592);
      expect(document.activeElement).toBe(input);
      expect(input.selectionStart).toBe(8);
      height = 1500;
      await act(async () => {
        window.dispatchEvent(new Event("resize"));
        await new Promise((resolve) => setTimeout(resolve, 30));
      });
      expect(bar.style.maxHeight).toBe(`${584 / scale}px`);
      expect(bar.style.overflowY).toBe("auto");
      expect(bar.getBoundingClientRect().top).toBeGreaterThanOrEqual(8);
      expect(bar.getBoundingClientRect().bottom).toBeLessThanOrEqual(592);
      expect(document.activeElement).toBe(input);
      await act(async () =>
        [...container!.querySelectorAll<HTMLButtonElement>("button")]
          .find((button) => button.textContent === "Duplicate")!
          .click(),
      );
      expect(duplicate).toHaveBeenCalledOnce();
    },
  );
});
