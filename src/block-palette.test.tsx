// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { Puck, type Data } from "@puckeditor/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BlockPaletteItem } from "./BlockPaletteItem";
import { createEmailConfig } from "./config";
import { createEmptyDocument } from "./document";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
let container: HTMLDivElement | undefined;
let style: HTMLStyleElement | undefined;

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  style?.remove();
  root = undefined;
  container = undefined;
  style = undefined;
  vi.unstubAllGlobals();
});

describe("compact block palette", () => {
  it("uses two columns while retaining Puck's drag handles, permissions, and collapse controls", async () => {
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });
    const config = createEmailConfig();
    config.components.Section3.permissions = { insert: false };
    container = document.createElement("div");
    container.className = "pm-editor";
    document.body.append(container);
    style = document.createElement("style");
    style.textContent = readFileSync("src/block-palette.css", "utf8");
    document.head.append(style);
    root = createRoot(container);
    await act(async () => {
      root!.render(
        <Puck
          config={config}
          data={createEmptyDocument() as Data}
          overrides={{ drawerItem: BlockPaletteItem }}
        >
          <Puck.Components />
        </Puck>,
      );
    });

    const palette = container.querySelector<HTMLElement>(
      "#puck-drawer-category-Layout [data-puck-drawer]",
    )!;
    expect(palette).not.toBeNull();
    expect(getComputedStyle(palette).display).toBe("grid");
    expect(getComputedStyle(palette).gridTemplateColumns).toBe("repeat(2, minmax(0, 1fr))");
    const enabled = palette.querySelector<HTMLElement>('[data-testid="drawer-item:Section2"]')!;
    expect(enabled.hasAttribute("data-puck-drawer-item")).toBe(true);
    expect(enabled.querySelector('[data-pm-block="Section2"]')?.textContent).toBe("2 columns");
    expect(enabled.querySelector("button, input, [tabindex]")).toBeNull();
    // Puck's own pointer handler still prevents focus from leaving the selected canvas item.
    const pointer = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    act(() => enabled.dispatchEvent(pointer));
    expect(pointer.defaultPrevented).toBe(true);

    const disabled = palette.querySelector<HTMLElement>('[data-testid="drawer-item:Section3"]')!;
    expect(disabled.className).toContain("--disabled_");
    expect(getComputedStyle(disabled.querySelector(".pm-block-tile")!).cursor).toBe("not-allowed");
    const category = container.querySelector<HTMLButtonElement>(
      '[aria-controls="puck-drawer-category-Layout"]',
    )!;
    expect(category.getAttribute("aria-expanded")).toBe("true");
    act(() => category.click());
    expect(category.getAttribute("aria-expanded")).toBe("false");
  });

  it("keeps host-defined components visible through the original drawer content", () => {
    expect(
      renderToStaticMarkup(
        <BlockPaletteItem name="HostBlock">
          <span>Host component</span>
        </BlockPaletteItem>,
      ),
    ).toBe("<span>Host component</span>");
  });
});
