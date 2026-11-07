// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Puck, createUsePuck, type Config, type Data, type PuckApi } from "@puckeditor/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEmailConfig } from "./config";
import { PropertyFieldLabel, PropertyInspector } from "./PropertyInspector";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const usePuck = createUsePuck();
beforeEach(() => {
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });
  style = document.createElement("style");
  style.textContent = readFileSync("src/property-inspector.css", "utf8");
  document.head.append(style);
});
let root: Root | undefined;
let container: HTMLDivElement | undefined;
let api: PuckApi | undefined;
let style: HTMLStyleElement | undefined;
function CaptureApi() {
  const state = usePuck((value) => value);
  useEffect(() => {
    api = state;
  }, [state]);
  return null;
}
afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  api = undefined;
  style?.remove();
  style = undefined;
  vi.unstubAllGlobals();
});

const data = {
  root: {
    props: {
      width: 600,
      backgroundColor: "#f5f5f5",
      sections: [
        {
          type: "Section1",
          props: {
            id: "section",
            column: [
              {
                type: "Text",
                props: { id: "copy", content: "<p>Example</p>", fontSize: 22, color: "#223344" },
              },
            ],
          },
        },
        { type: "Hero", props: { id: "hero", mode: "fluid-height", height: 360, content: [] } },
      ],
    },
  },
  content: [],
} as Data;
async function mount(document = data, config: Config = createEmailConfig()) {
  container = window.document.createElement("div");
  container.className = "pm-editor";
  window.document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root!.render(
      <Puck
        config={config}
        data={document}
        iframe={{ enabled: false }}
        overrides={{ fields: PropertyInspector, fieldLabel: PropertyFieldLabel }}
      >
        <CaptureApi />
        <Puck.Fields />
      </Puck>,
    ),
  );
}
const control = <T extends HTMLElement>(name: string, tag = "input") =>
  container!.querySelector<T>(`[data-property-name="${name}"] ${tag}`)!;
const group = (name: string) =>
  container!.querySelector<HTMLElement>(`[data-property-group="${name}"]`)!;
const toggle = (name: string) =>
  group(name).querySelector<HTMLButtonElement>(".pm-property-heading > button")!;
async function select(id: string) {
  await act(async () =>
    api!.dispatch({ type: "setUi", ui: { itemSelector: api!.getSelectorForId(id) } }),
  );
}
async function changeInput(element: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
  // Puck coalesces typing into a history entry after its normal debounce.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 350));
  });
}

describe("grouped property inspector", () => {
  it("organizes root controls without large field cards and keeps every group open", async () => {
    await mount();
    const names = [...container!.querySelectorAll<HTMLElement>("[data-property-group]")].map(
      (element) => element.dataset.propertyGroup,
    );
    expect(names).toEqual(["content", "layout", "typography", "appearance", "advanced"]);
    expect(group("content").querySelector('[data-property-name="lang"]')).not.toBeNull();
    expect(group("layout").querySelector('[data-property-name="width"]')).not.toBeNull();
    expect(
      group("appearance").querySelector('[data-property-name="backgroundColor"]'),
    ).not.toBeNull();
    expect(group("advanced").querySelector('[data-property-name="bodyAttributes"]')).not.toBeNull();
    expect(container!.querySelector('[data-property-name="sections"] > *')).toBeNull();
    expect(container!.querySelector('[data-property-name="rawHead"] > *')).toBeNull();
    expect(toggle("advanced").getAttribute("aria-expanded")).toBe("true");
    expect(group("advanced").querySelector<HTMLElement>(".pm-property-body")!.hidden).toBe(false);
    expect(control<HTMLInputElement>("lang").closest("label")?.textContent).toBe("Language");
    expect(
      control<HTMLInputElement>("lang")
        .closest("label")
        ?.querySelector("[title]")
        ?.getAttribute("title"),
    ).toContain("zh-Hant");

    const width = control<HTMLInputElement>("width");
    await changeInput(width, "640");
    expect(api!.appState.data.root.props!.width).toBe(640);
    await act(async () => toggle("layout").click());
    expect(control("width")).toBe(width);
    expect(group("layout").querySelector<HTMLElement>(".pm-property-body")!.hidden).toBe(true);
    await act(async () => toggle("layout").click());
    expect(control<HTMLInputElement>("width").value).toBe("640");
  });

  it("preserves Puck field editing, selection state, and undo/redo inside groups", async () => {
    await mount();
    await act(async () => toggle("advanced").click());
    expect(toggle("advanced").getAttribute("aria-expanded")).toBe("false");
    await select("copy");
    expect(toggle("advanced").getAttribute("aria-expanded")).toBe("true");
    expect(container!.querySelector('[data-property-group="content"]')).toBeNull();
    expect(group("typography").querySelector('[data-property-name="align"]')).not.toBeNull();
    expect(group("spacing").querySelector('[data-property-name="padding"]')).not.toBeNull();
    expect(group("advanced").querySelector('[data-property-name="mjmlAttributes"]')).not.toBeNull();

    await changeInput(control<HTMLInputElement>("fontSize"), "28");
    expect(api!.getItemById("copy")!.props.fontSize).toBe(28);
    expect(api!.history.hasPast).toBe(true);
    await act(async () => api!.history.back());
    expect(api!.getItemById("copy")!.props.fontSize).toBe(22);
    // Puck restores the selection from the history snapshot as well as values.
    expect(api!.selectedItem).toBeNull();
    expect(control<HTMLInputElement>("width").value).toBe("600");
    await act(async () => api!.history.forward());
    expect(api!.getItemById("copy")!.props.fontSize).toBe(28);
    expect(control<HTMLInputElement>("fontSize").value).toBe("28");
  });

  it("keeps native conditional visibility and read-only rules in the original field renderer", async () => {
    await mount({
      ...data,
      root: { ...data.root, readOnly: { width: true, backgroundColor: true } },
    } as Data);
    expect(control<HTMLInputElement>("width").readOnly).toBe(true);
    expect(control<HTMLInputElement>("backgroundColor", 'input[type="color"]').disabled).toBe(true);
    expect(control<HTMLInputElement>("backgroundColor", 'input[type="text"]').readOnly).toBe(true);
    expect(group("layout").querySelector('[aria-label="Read only"]')).not.toBeNull();
    await select("hero");
    expect(getComputedStyle(group("content")).display).toBe("none");
    expect(control("height")).toBeNull();
    await act(async () => {
      const mode = control<HTMLSelectElement>("mode", "select");
      mode.value = JSON.stringify({ value: "fixed-height" });
      mode.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(control<HTMLInputElement>("height").value).toBe("360");
    expect(group("advanced").querySelector('[data-property-name="mjmlAttributes"]')).not.toBeNull();
  });

  it("lets a field resolver reveal a control hidden in the initial schema", async () => {
    const config: Config<{}, { width: number; previewText: string }> = {
      components: {},
      root: {
        fields: { width: { type: "number" }, previewText: { type: "text", visible: false } },
        resolveFields: ({ props }, { fields }) => ({
          ...fields,
          previewText: { ...fields.previewText!, visible: Number(props?.width) > 600 },
        }),
      },
    };
    await mount({ root: { props: { width: 600, previewText: "" } }, content: [] } as Data, config);
    expect(control("previewText")).toBeNull();
    expect(getComputedStyle(group("content")).display).toBe("none");
    await changeInput(control<HTMLInputElement>("width"), "640");
    expect(control("previewText")).not.toBeNull();
    await changeInput(control<HTMLInputElement>("previewText"), "A new preview");
    expect(api!.appState.data.root.props!.previewText).toBe("A new preview");
  });

  it("edits inline document and element colors through picker or text with undo and redo", async () => {
    await mount();
    const color = (name: string, type: "color" | "text") =>
      control<HTMLInputElement>(name, `input[type="${type}"]`);
    const row = color("backgroundColor", "text").closest<HTMLElement>(".pm-property-row")!;
    expect(row.classList.contains("pm-property-row--inline")).toBe(true);
    expect(getComputedStyle(row.querySelector(".pm-property-label")!).gridTemplateColumns).toBe(
      "minmax(88px, 0.9fr) minmax(0, 1.3fr)",
    );
    await changeInput(color("backgroundColor", "color"), "#112233");
    expect(api!.appState.data.root.props!.backgroundColor).toBe("#112233");
    expect(color("backgroundColor", "text").value).toBe("#112233");
    await act(async () => api!.history.back());
    expect(api!.appState.data.root.props!.backgroundColor).toBe("#f5f5f5");
    expect(color("backgroundColor", "color").value).toBe("#f5f5f5");
    await act(async () => api!.history.forward());
    expect(color("backgroundColor", "text").value).toBe("#112233");

    await changeInput(color("backgroundColor", "text"), "rgba(10, 20, 30, 0.4)");
    expect(api!.appState.data.root.props!.backgroundColor).toBe("rgba(10, 20, 30, 0.4)");
    await select("copy");
    await changeInput(color("color", "text"), "rebeccapurple");
    expect(api!.getItemById("copy")!.props.color).toBe("rebeccapurple");
    await act(async () => api!.history.back());
    expect(api!.getItemById("copy")!.props.color).toBe("#223344");
    await act(async () => api!.history.forward());
    expect(color("color", "text").value).toBe("rebeccapurple");
  });
});
