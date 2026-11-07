// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { act, useEffect } from "react";
import { createPortal } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import {
  Puck,
  Render,
  createUsePuck,
  type Config,
  type Data,
  type PuckApi,
} from "@puckeditor/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SpacingOverlay,
  componentSpacingTargets,
  measureComponentSpacing,
  measureSpacing,
} from "./SpacingOverlay";
import { createEmailConfig } from "./config";
import { createEmptyDocument } from "./document";
import type { EmailBlock } from "./types";
import { SelectionActionBar } from "./SelectionActionBar";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const usePuck = createUsePuck();
const config: Config = {
  components: {
    Text: { render: () => <p>Read-only content</p> },
    Column: { inline: true, render: () => <div /> },
  },
};
const data = { root: { props: { padding: 10 } }, content: [] } as Data;
let root: Root | undefined;
let container: HTMLDivElement | undefined;
let frame: HTMLIFrameElement | undefined;
let api: PuckApi | undefined;
let target: HTMLElement | undefined;
let host: HTMLElement | undefined;
const styles: HTMLStyleElement[] = [];
const renderedFixtures: HTMLElement[] = [];
let rect = { left: 100, top: 50, width: 200, height: 100 };

function geometry(
  element: HTMLElement,
  dimensions: typeof rect,
  offsetWidth = dimensions.width,
  offsetHeight = dimensions.height,
) {
  const box = () => ({
    ...dimensions,
    x: dimensions.left,
    y: dimensions.top,
    right: dimensions.left + dimensions.width,
    bottom: dimensions.top + dimensions.height,
    toJSON: () => dimensions,
  });
  element.getBoundingClientRect = box;
  Object.defineProperties(element, {
    offsetWidth: { configurable: true, value: offsetWidth },
    offsetHeight: { configurable: true, value: offsetHeight },
  });
}
function fixture() {
  const parent = document.createElement("div");
  const element = document.createElement("div");
  const overlay = document.createElement("div");
  document.body.append(parent);
  parent.append(element, overlay);
  geometry(element, rect);
  geometry(overlay, rect);
  return { parent, element, overlay };
}
async function flush(view: Window = window) {
  await act(async () => {
    await new Promise<void>((resolve) =>
      view.requestAnimationFrame(() => view.requestAnimationFrame(() => resolve())),
    );
  });
}
afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  frame?.remove();
  for (const style of styles.splice(0)) style.remove();
  for (const fixture of renderedFixtures.splice(0)) fixture.remove();
  root = undefined;
  container = undefined;
  frame = undefined;
  api = undefined;
  target = undefined;
  host = undefined;
  rect = { left: 100, top: 50, width: 200, height: 100 };
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function renderedBlock(block: EmailBlock, selector: string, componentType: string) {
  const data = createEmptyDocument();
  data.root.props!.sections = [block];
  const fixture = document.createElement("div");
  fixture.innerHTML = renderToStaticMarkup(
    <Render config={createEmailConfig()} data={data as Data} />,
  );
  document.body.append(fixture);
  renderedFixtures.push(fixture);
  const root = fixture.querySelector<HTMLElement>(selector)!;
  expect(root).not.toBeNull();
  const targets = componentSpacingTargets(root, componentType);
  const host = document.createElement("div");
  geometry(host, rect);
  targets.forEach(({ element }, index) => {
    geometry(element, {
      left: rect.left + index * 10,
      top: rect.top + index * 10,
      width: rect.width - index * 20,
      height: rect.height - index * 20,
    });
  });
  return { fixture, root, host, targets };
}

describe("rendered component spacing boxes", () => {
  const nestedText: EmailBlock = {
    type: "Text",
    props: { id: "nested-copy", content: "Nested copy", padding: "91px", cssClass: "nested-copy" },
  };

  it.each(["Section1", "Wrapper"])(
    "includes the authored padding inside a full-width %s without inspecting child blocks",
    (componentType) => {
      const block: EmailBlock = {
        type: componentType,
        props: {
          id: "full-width",
          padding: "32px",
          mjmlAttributes: [{ name: "full-width", value: "full-width" }],
          ...(componentType === "Wrapper"
            ? {
                sections: [
                  {
                    type: "Section1",
                    props: { id: "child-section", padding: "93px", column: [nestedText] },
                  },
                ],
              }
            : { column: [nestedText] }),
        },
      };
      const { root, host, targets } = renderedBlock(block, ".pm-native-full-width", componentType);
      const content = root.querySelector<HTMLElement>(".pm-native-layout-content")!;
      expect(content.style.padding).toBe("32px");
      expect(targets.some(({ element }) => element === content)).toBe(true);
      const spacing = measureComponentSpacing(root, host, componentType)!;
      const authored = spacing.boxes.find((box) => box.label === "")!;
      expect(authored.padding).toEqual([32, 32, 32, 32]);
      expect(authored.bands[0]).toMatchObject({ top: 10, left: 10, height: 32 });
      expect(
        spacing.boxes.some((box) => box.padding.includes(91) || box.padding.includes(93)),
      ).toBe(false);
    },
  );

  it("distinguishes gutter spacing from a column's own padding", () => {
    const { root, host, targets } = renderedBlock(
      {
        type: "Section",
        props: {
          id: "section",
          mjmlAttributes: [{ name: "gutter", value: "20px" }],
          columns: [
            { type: "Column", props: { id: "left", padding: "12px", content: [nestedText] } },
            { type: "Column", props: { id: "right", padding: "14px", content: [] } },
          ],
        },
      },
      ".pm-flex-column",
      "Column",
    );
    expect(root.classList.contains("pm-native-gutter")).toBe(true);
    // Detached DOM does not lay out the containing slot for percent gutters.
    Object.defineProperty(root.parentElement!, "clientWidth", { configurable: true, value: 600 });
    expect(targets.map(({ label }) => label)).toEqual(["Gutter", "", "Inner"]);
    const spacing = measureComponentSpacing(root, host, "Column")!;
    expect(spacing.boxes.find((box) => box.label === "")!.padding).toEqual([12, 12, 12, 12]);
    const gutter = spacing.boxes.find((box) => box.label === "Gutter")!.padding;
    expect(gutter[1]).toBeCloseTo(10);
    expect([gutter[0], gutter[2], gutter[3]]).toEqual([0, 0, 0]);
    expect(targets.some(({ element }) => element.closest(".nested-copy"))).toBe(false);
  });

  it("includes a hero's separate inner padding and preserves outer padding", () => {
    const { root, host } = renderedBlock(
      {
        type: "Hero",
        props: {
          id: "hero",
          padding: "8px",
          mjmlAttributes: [{ name: "inner-padding", value: "16px 24px" }],
          content: [nestedText],
        },
      },
      ".pm-hero",
      "Hero",
    );
    const spacing = measureComponentSpacing(root, host, "Hero")!;
    expect(spacing.boxes.map(({ label, padding }) => ({ label, padding }))).toEqual([
      { label: "", padding: [8, 8, 8, 8] },
      { label: "Inner", padding: [16, 24, 16, 24] },
    ]);
  });

  it.each([false, true])("includes inner button padding with native rendering=%s", (native) => {
    const { root, host } = renderedBlock(
      {
        type: "Section1",
        props: {
          id: "section",
          column: [
            {
              type: "Button",
              props: {
                id: "button",
                label: "Click",
                padding: "4px",
                innerPadding: "10px 25px",
                ...(native
                  ? { mjmlAttributes: [{ name: "inner-padding", value: "15px 30px" }] }
                  : {}),
              },
            },
          ],
        },
      },
      ".pm-button-block",
      "Button",
    );
    const spacing = measureComponentSpacing(root, host, "Button")!;
    expect(spacing.boxes[0].padding).toEqual([4, 4, 4, 4]);
    expect(spacing.boxes[1].label).toBe("Inner");
    expect(spacing.boxes[1].padding).toEqual(native ? [15, 30, 15, 30] : [10, 25, 10, 25]);
  });

  it("includes implicit column attributes but never slot descendants with matching classes", () => {
    const { root, host, targets } = renderedBlock(
      {
        type: "Section2",
        props: {
          id: "section",
          padding: "0px",
          leftAttributes: [{ name: "padding", value: "6px" }],
          rightAttributes: [{ name: "padding", value: "9px" }],
          left: [
            {
              ...nestedText,
              props: { ...nestedText.props, cssClass: "pm-native-column nested-copy" },
            },
          ],
          right: [],
        },
      },
      ".pm-section",
      "Section2",
    );
    const spacing = measureComponentSpacing(root, host, "Section2")!;
    expect(spacing.boxes.map(({ label, padding }) => ({ label, padding }))).toEqual([
      { label: "Left column", padding: [6, 6, 6, 6] },
      { label: "Right column", padding: [9, 9, 9, 9] },
    ]);
    expect(targets.some(({ element }) => element.classList.contains("nested-copy"))).toBe(false);
  });
});

function Canvas({
  active,
  scoped = true,
  inline = false,
  selected = false,
  actions = false,
  nestedActions = false,
}: {
  active: boolean;
  scoped?: boolean;
  inline?: boolean;
  selected?: boolean;
  actions?: boolean;
  nestedActions?: boolean;
}) {
  const current = usePuck((state) => state);
  useEffect(() => {
    api = current;
  }, [current]);
  const component = (
    <div
      data-puck-component={inline ? "copy" : undefined}
      className={inline ? "pm-flex-column" : "pm-text"}
      style={{
        padding: `${current.appState.data.root.props?.padding ?? 10}px`,
        margin: "4px 6px",
        border: "2px solid black",
      }}
      ref={(element) => {
        if (element) {
          target = element;
          geometry(element, rect);
        }
      }}
    />
  );
  return (
    <div data-puck-preview={scoped || undefined}>
      {inline ? component : <div data-puck-component="copy">{component}</div>}
      <div data-puck-overlay>
        {nestedActions && (
          <div data-puck-overlay>
            <div className="pm-selection-actions" data-placement="below" data-nested-actions />
          </div>
        )}
        {actions && (
          <div className="test-actions-parent">
            <SelectionActionBar label="Text" parentAction={null}>
              <button type="button">Duplicate</button>
            </SelectionActionBar>
          </div>
        )}
        <div
          className="overlay-host"
          ref={(element) => {
            if (element) {
              host = element;
              geometry(element, rect);
            }
          }}
        >
          <SpacingOverlay
            hover={active}
            isSelected={selected}
            componentId="copy"
            componentType={inline ? "Column" : "Text"}
          >
            <div className="native-overlay">Native selection</div>
          </SpacingOverlay>
        </div>
      </div>
    </div>
  );
}
async function mount(
  active = true,
  inFrame = false,
  inline = false,
  controls: { selected?: boolean; actions?: boolean; nestedActions?: boolean } = {},
) {
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });
  container = document.createElement("div");
  document.body.append(container);
  if (inFrame) {
    frame = document.createElement("iframe");
    document.body.append(frame);
  }
  const owner = frame?.contentDocument ?? document;
  const style = owner.createElement("style");
  style.textContent = readFileSync("src/spacing-overlay.css", "utf8");
  owner.head.append(style);
  styles.push(style);
  root = createRoot(container);
  await act(async () =>
    root!.render(
      <Puck config={config} data={data}>
        {inFrame ? (
          createPortal(
            <Canvas active={active} scoped={false} inline={inline} {...controls} />,
            owner.body,
          )
        ) : (
          <Canvas active={active} inline={inline} {...controls} />
        )}
      </Puck>,
    ),
  );
  await flush(owner.defaultView!);
  return owner;
}

describe("spacing geometry", () => {
  it("draws padding inside the border and margins outside without overlapping corner bands", () => {
    const { parent, element, overlay } = fixture();
    element.style.cssText =
      "padding:10px 20px 15px 5px;border:2px solid black;margin:8px 12px 6px 4px";
    const measured = measureSpacing(element, overlay)!;
    expect(measured.padding).toEqual([10, 20, 15, 5]);
    expect(measured.margin).toEqual([8, 12, 6, 4]);
    expect(measured.bands).toContainEqual({
      kind: "padding",
      side: "top",
      left: 2,
      top: 2,
      width: 196,
      height: 10,
    });
    expect(measured.bands).toContainEqual({
      kind: "padding",
      side: "right",
      left: 178,
      top: 12,
      width: 20,
      height: 71,
    });
    expect(measured.bands).toContainEqual({
      kind: "margin",
      side: "top",
      left: -4,
      top: -8,
      width: 216,
      height: 8,
    });
    expect(measured.bands).toContainEqual({
      kind: "margin",
      side: "right",
      left: 200,
      top: 0,
      width: 12,
      height: 100,
    });
    parent.remove();
  });

  it("normalizes target transforms and shared canvas zoom into overlay coordinates", () => {
    const { parent, element, overlay } = fixture();
    element.style.padding = "10px";
    const zoomed = { left: 50, top: 25, width: 100, height: 50 };
    geometry(element, zoomed, 200, 100);
    geometry(overlay, zoomed, 100, 50);
    expect(measureSpacing(element, overlay)!.bands[0].height).toBe(5);
    geometry(overlay, zoomed, 200, 100);
    expect(measureSpacing(element, overlay)!.bands[0].height).toBe(10);
    expect(measureSpacing(element, overlay)!.bands[0].width).toBe(200);
    parent.remove();
  });

  it("uses containing-block widths for percentages and accepts browser-resolved px values", () => {
    const { parent, element, overlay } = fixture();
    Object.defineProperty(parent, "clientWidth", { value: 400 });
    parent.style.padding = "20px";
    element.style.cssText = "padding:10%;margin:5%";
    const percent = measureSpacing(element, overlay)!;
    expect(percent.padding).toEqual([36, 36, 36, 36]);
    expect(percent.margin).toEqual([18, 18, 18, 18]);
    element.style.cssText = "padding:36px;margin:18px";
    expect(measureSpacing(element, overlay)).toEqual(percent);
    parent.remove();
  });

  it("omits blank and zero boxes and does not invent outside space for negative margins", () => {
    const { parent, element, overlay } = fixture();
    expect(measureSpacing(element, overlay)).toBeNull();
    element.style.marginTop = "-8px";
    const negative = measureSpacing(element, overlay)!;
    expect(negative.margin).toEqual([-8, 0, 0, 0]);
    expect(negative.bands).toEqual([]);
    element.style.padding = "20px";
    geometry(element, { left: 0, top: 0, width: 0, height: 0 });
    expect(measureSpacing(element, overlay)).toBeNull();
    parent.remove();
  });
});

describe("spacing overlay integration", () => {
  function toolbarGeometry() {
    rect = { left: 100, top: 0, width: 200, height: 100 };
    let height = 64;
    const original = HTMLElement.prototype.getBoundingClientRect;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
      this: HTMLElement,
    ) {
      if (this.hasAttribute("data-nested-actions")) return new DOMRect(100, 600, 200, 100);
      if (this.hasAttribute("data-puck-overlay"))
        return new DOMRect(rect.left, rect.top, rect.width, rect.height);
      if (this.classList.contains("pm-selection-actions")) {
        const [x = 0, y = 0] = this.style.translate
          .split(" ")
          .map((value) => parseFloat(value) || 0);
        const width = Math.min(240, parseFloat(this.style.maxWidth) || 240);
        return new DOMRect(rect.left + rect.width - width + x, rect.top + 8 + y, width, height);
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
    return (value: number) => {
      height = value;
    };
  }

  it("keeps the legend below its own selected toolbar through expansion, placement changes and zoom", async () => {
    const setHeight = toolbarGeometry();
    const resizeObservers: { elements: Set<Element>; notify: () => void }[] = [];
    vi.spyOn(window, "ResizeObserver").mockImplementation(function (callback) {
      const elements = new Set<Element>();
      const observer: ResizeObserver = {
        observe: (element) => {
          elements.add(element);
        },
        unobserve: (element) => {
          elements.delete(element);
        },
        disconnect: () => elements.clear(),
      };
      resizeObservers.push({ elements, notify: () => callback([], observer) });
      return observer;
    });
    await mount(true, false, false, { selected: true, actions: true, nestedActions: true });
    const bar = container!.querySelector<HTMLElement>(
      ".test-actions-parent .pm-selection-actions",
    )!;
    const legend = () => host!.querySelector<HTMLElement>(".pm-spacing-legend")!;
    expect(bar.dataset.placement).toBe("below");
    expect(parseFloat(legend().style.top)).toBe(bar.getBoundingClientRect().bottom + 4);
    expect(parseFloat(legend().style.top)).toBeLessThan(600);
    setHeight(110);
    await act(async () => {
      resizeObservers.filter(({ elements }) => elements.has(bar)).forEach(({ notify }) => notify());
    });
    await flush();
    expect(parseFloat(legend().style.top)).toBe(bar.getBoundingClientRect().bottom + 4);
    bar.dataset.placement = "above";
    await flush();
    expect(legend().style.top).toBe("108px");
    geometry(host!, rect, 400, 200);
    bar.dataset.placement = "below";
    bar.style.translate = "0px 160px";
    await flush();
    expect(parseFloat(legend().style.top)).toBe((bar.getBoundingClientRect().bottom + 4) / 0.5);
  });

  it.each([
    { selected: false, actions: true, nestedActions: false },
    { selected: true, actions: false, nestedActions: true },
    { selected: true, actions: false, nestedActions: false },
  ])(
    "does not reserve toolbar space for hidden, descendant or absent actions: %j",
    async (controls) => {
      toolbarGeometry();
      await mount(true, false, false, controls);
      expect(host!.querySelector<HTMLElement>(".pm-spacing-legend")!.style.top).toBe("108px");
    },
  );

  it("preserves native direct children and uses distinct pointer-transparent padding and margin colors", async () => {
    await mount();
    expect(target!.className).toBe("pm-text");
    expect(target!.hasAttribute("data-puck-component")).toBe(false);
    expect(target!.parentElement!.getAttribute("data-puck-component")).toBe("copy");
    expect(host!.firstElementChild?.className).toBe("native-overlay");
    const padding = host!.querySelector<HTMLElement>(".pm-spacing-band--padding")!;
    const margin = host!.querySelector<HTMLElement>(".pm-spacing-band--margin")!;
    expect(getComputedStyle(padding).backgroundColor).not.toBe(
      getComputedStyle(margin).backgroundColor,
    );
    expect(getComputedStyle(padding).pointerEvents).toBe("none");
    expect(host!.querySelector(".pm-spacing-legend")?.textContent).toContain(
      "Padding T 10  R 10  B 10  L 10 px",
    );
    expect(host!.querySelector(".pm-spacing-legend")?.textContent).toContain(
      "Margin T 4  R 6  B 4  L 6 px",
    );
    expect(api!.appState.data).toEqual({ ...data, zones: {} });
  });

  it("measures inline columns on the component ref itself", async () => {
    await mount(true, false, true);
    expect(target!.className).toBe("pm-flex-column");
    expect(target!.getAttribute("data-puck-component")).toBe("copy");
    expect(target!.firstElementChild).toBeNull();
    expect(host!.querySelector(".pm-spacing-legend")?.textContent).toContain("Padding T 10");
  });

  it("updates after document edits, resizing, scrolling, and ancestor zoom changes", async () => {
    await mount();
    await act(async () =>
      api!.dispatch({
        type: "setData",
        data: (previous) => ({
          ...previous,
          root: { ...previous.root, props: { ...previous.root.props, padding: 20 } },
        }),
      }),
    );
    await flush();
    expect(
      host!.querySelector<HTMLElement>('.pm-spacing-band--padding[data-spacing-side="top"]')!.style
        .height,
    ).toBe("20px");
    geometry(target!, { ...rect, left: 120 });
    window.dispatchEvent(new Event("scroll"));
    await flush();
    expect(
      host!.querySelector<HTMLElement>('.pm-spacing-band--padding[data-spacing-side="top"]')!.style
        .left,
    ).toBe("22px");
    geometry(target!, { ...rect, width: 300 }, 300, 100);
    window.dispatchEvent(new Event("resize"));
    await flush();
    expect(
      host!.querySelector<HTMLElement>('.pm-spacing-band--padding[data-spacing-side="top"]')!.style
        .width,
    ).toBe("296px");
    geometry(target!, { ...rect, width: 150, height: 50 }, 300, 100);
    target!.parentElement!.style.transform = "scale(.5)";
    await flush();
    expect(
      host!.querySelector<HTMLElement>('.pm-spacing-band--padding[data-spacing-side="top"]')!.style
        .height,
    ).toBe("10px");
  });

  it("finds targets in the portal owner document, with no cross-editor id lookup", async () => {
    const foreign = document.createElement("div");
    foreign.setAttribute("data-puck-component", "copy");
    foreign.style.padding = "99px";
    document.body.append(foreign);
    try {
      const owner = await mount(true, true);
      expect(target!.ownerDocument).toBe(owner);
      expect(host!.querySelector(".pm-spacing-legend")?.textContent).toContain("T 10");
      expect(host!.querySelector(".pm-spacing-legend")?.textContent).not.toContain("99");
    } finally {
      foreign.remove();
    }
  });

  it("renders no spacing when inactive or interactive and leaves standalone output untouched", async () => {
    await mount(false);
    expect(host!.querySelector(".pm-spacing-overlay")).toBeNull();
    await act(async () =>
      root!.render(
        <Puck config={config} data={data}>
          <Canvas active />
        </Puck>,
      ),
    );
    await flush();
    expect(host!.querySelector(".pm-spacing-overlay")).not.toBeNull();
    await act(async () => api!.dispatch({ type: "setUi", ui: { previewMode: "interactive" } }));
    expect(host!.querySelector(".pm-spacing-overlay")).toBeNull();
    const standalone = renderToStaticMarkup(
      <Render
        config={config}
        data={{ root: { props: {} }, content: [{ type: "Text", props: { id: "copy" } }] }}
      />,
    );
    expect(standalone).toContain("Read-only content");
    expect(standalone).not.toContain("pm-spacing");
  });
});
