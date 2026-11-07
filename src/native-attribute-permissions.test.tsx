// @vitest-environment happy-dom
import { act, useEffect, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Puck, createUsePuck, type Config, type Data, type PuckApi } from "@puckeditor/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nativeAttributeField } from "./NativeFields";
import { NativeAttributeEditor } from "./NativeAttributeEditor";
import type { MjmlAttribute } from "./types";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const usePuck = createUsePuck();
let root: Root | undefined;
let container: HTMLDivElement | undefined;
let api: PuckApi | undefined;
beforeEach(() => vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined }));
afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
  api = undefined;
  vi.unstubAllGlobals();
});
function Capture() {
  const current = usePuck((state) => state);
  useEffect(() => {
    api = current;
  }, [current]);
  return null;
}
async function render(children: ReactNode) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(children));
}
const initial: MjmlAttribute[] = [
  { name: "color", value: "#123456", inherit: false, template: false },
  { name: "font-size", value: "16px", inherit: false, template: false },
];
async function mount(readOnly: Record<string, boolean>, rootField = false, edit = true) {
  const fields = { mjmlAttributes: nativeAttributeField("mj-text", undefined, false, true) };
  const config: Config = {
    components: { Text: { fields, permissions: { edit }, render: () => <div /> } },
    root: { fields, permissions: { edit } },
  };
  const data = rootField
    ? { root: { props: { mjmlAttributes: initial }, readOnly }, content: [] }
    : {
        root: { props: {} },
        content: [{ type: "Text", props: { id: "text", mjmlAttributes: initial }, readOnly }],
      };
  await render(
    <Puck config={config} data={data as Data} iframe={{ enabled: false }}>
      <Capture />
      <Puck.Fields />
    </Puck>,
  );
  if (!rootField)
    await act(async () =>
      api!.dispatch({ type: "setUi", ui: { itemSelector: api!.getSelectorForId("text") } }),
    );
}
const rows = () => [...container!.querySelectorAll<HTMLElement>(".pm-attribute-row")];
const control = (row: number, selector: string) =>
  rows()[row].querySelector<HTMLInputElement>(selector)!;
const button = (row: number, text: string) =>
  [...rows()[row].querySelectorAll<HTMLButtonElement>("button")].find(
    (el) => el.textContent === text,
  )!;
const saved = () =>
  (api!.appState.data.content.find((item) => item.props.id === "text")?.props ??
    api!.appState.data.root.props)!.mjmlAttributes as MjmlAttribute[];
async function input(element: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("native attribute permissions", () => {
  it.each([false, true])(
    "honors exact and wildcard field locks for root=%s without locking unrelated edits",
    async (rootField) => {
      await mount(
        {
          "mjmlAttributes[0].name": true,
          "mjmlAttributes[*].value": true,
          "mjmlAttributes[1].value": false,
          "mjmlAttributes[0].inherit": true,
          "mjmlAttributes[1].template": true,
        },
        rootField,
      );
      expect(control(0, ".pm-attribute-name").disabled).toBe(true);
      expect(control(1, ".pm-attribute-name").disabled).toBe(false);
      expect(control(0, ".pm-attribute-value").disabled).toBe(true);
      expect(control(0, 'input[type="color"]').disabled).toBe(true);
      expect(control(1, ".pm-attribute-value").disabled).toBe(false);
      expect(control(0, '[aria-label="Inherit attribute 1"]').disabled).toBe(true);
      expect(control(1, '[aria-label="Inherit attribute 2"]').disabled).toBe(false);
      expect(control(0, '[aria-label="Template value for attribute 1"]').disabled).toBe(false);
      expect(control(1, '[aria-label="Template value for attribute 2"]').disabled).toBe(true);
      await input(control(0, ".pm-attribute-value"), "red");
      expect(saved()[0]).toEqual(initial[0]);
      await input(control(1, ".pm-attribute-value"), "22px");
      expect(saved()[1].value).toBe("22px");
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 300));
      });
      await act(async () => api!.history.back());
      expect(saved()).toEqual(initial);
    },
  );

  it("prevents structural controls and drag/drop from bypassing a protected row", async () => {
    await mount({ "mjmlAttributes[0]": true });
    expect(control(0, ".pm-attribute-name").disabled).toBe(true);
    expect(control(0, '[aria-label="Template value for attribute 1"]').disabled).toBe(true);
    expect(control(1, ".pm-attribute-value").disabled).toBe(false);
    const add = container!.querySelector<HTMLButtonElement>(".pm-attribute-add")!;
    expect(add.disabled).toBe(true);
    expect(button(1, "Move up").disabled).toBe(true);
    expect(button(0, "Remove attribute").disabled).toBe(true);
    expect(control(1, ".pm-attribute-grip").getAttribute("draggable")).toBe("false");
    await act(async () => {
      add.click();
      button(1, "Move up").click();
      button(0, "Remove attribute").click();
      const dataTransfer = new DataTransfer();
      control(1, ".pm-attribute-grip").dispatchEvent(
        new DragEvent("dragstart", { bubbles: true, dataTransfer }),
      );
      rows()[0].dispatchEvent(
        new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer }),
      );
    });
    expect(saved()).toEqual(initial);
  });

  it.each([false, true])(
    "honors whole-field locks and edit permissions for root=%s",
    async (rootField) => {
      await mount({ mjmlAttributes: true, "mjmlAttributes[0].value": false }, rootField);
      expect(container!.querySelector(".pm-attribute-add")).toBeNull();
      expect(control(0, ".pm-attribute-value").disabled).toBe(true);
      expect(control(1, ".pm-attribute-name").disabled).toBe(true);
    },
  );

  it.each([false, true])("honors denied edit permission for root=%s", async (rootField) => {
    await mount({}, rootField, false);
    expect(container!.querySelector(".pm-attribute-add")).toBeNull();
    expect(control(0, ".pm-attribute-value").disabled).toBe(true);
  });

  it("matches nested component paths while retaining dynamic raw-entry attribute choices", async () => {
    const attributes = nativeAttributeField(
      "mj-social-element",
      undefined,
      "mj-social-element",
      true,
    );
    const config: Config = {
      components: {
        Social: {
          render: () => <div />,
          fields: {
            links: { type: "array", arrayFields: { mjmlAttributes: attributes } },
          },
        },
      },
    };
    await render(
      <Puck
        config={config}
        iframe={{ enabled: false }}
        data={
          {
            root: { props: {} },
            content: [
              {
                type: "Social",
                props: {
                  id: "social",
                  links: [
                    { kind: "raw", mjmlAttributes: [{ name: "position", value: "file-start" }] },
                    { kind: "link", mjmlAttributes: [{ name: "icon-size", value: "20px" }] },
                  ],
                },
                readOnly: {
                  "links[*].mjmlAttributes[*].value": true,
                  "links[1].mjmlAttributes[*].value": false,
                },
              },
            ],
          } as Data
        }
      >
        <Capture />
        <Puck.Fields />
      </Puck>,
    );
    await act(async () =>
      api!.dispatch({ type: "setUi", ui: { itemSelector: api!.getSelectorForId("social") } }),
    );
    const expand = (index: number) =>
      act(async () =>
        container!
          .querySelectorAll<HTMLElement>('[class*="_ArrayFieldItem-summary_"]')
          [index].click(),
      );
    await expand(0);
    expect(rows()).toHaveLength(1);
    expect(
      control(0, ".pm-attribute-name").querySelector('option[value="position"]'),
    ).not.toBeNull();
    expect(control(0, ".pm-attribute-value").disabled).toBe(true);
    await expand(1);
    expect(
      control(0, ".pm-attribute-name").querySelector('option[value="icon-size"]'),
    ).not.toBeNull();
    expect(control(0, ".pm-attribute-value").disabled).toBe(false);
    await input(control(0, ".pm-attribute-value"), "24px");
    expect(api!.selectedItem!.props.links[1].mjmlAttributes[0].value).toBe("24px");
    expect(api!.selectedItem!.props.links[0].mjmlAttributes[0].value).toBe("file-start");
  });

  it("keeps the standalone editor available without a Puck provider", async () => {
    const onChange = vi.fn();
    await render(
      <NativeAttributeEditor
        id="standalone"
        name="attributes"
        label="Attributes"
        tag="mj-text"
        value={initial}
        onChange={onChange}
        readOnlyFields={{ "attributes[0].value": true }}
      />,
    );
    expect(control(0, ".pm-attribute-value").disabled).toBe(true);
    await input(control(1, ".pm-attribute-value"), "24px");
    expect(onChange).toHaveBeenLastCalledWith([initial[0], { ...initial[1], value: "24px" }]);
  });

  it("reads root default permissions and retains the default component's attribute choices", async () => {
    const config: Config = {
      components: {},
      root: {
        fields: {
          componentDefaults: {
            type: "array",
            arrayFields: {
              tag: { type: "text" },
              attributes: nativeAttributeField("*", "Default attributes", true, true),
            },
          },
        },
      },
    };
    await render(
      <Puck
        config={config}
        iframe={{ enabled: false }}
        data={
          {
            root: {
              props: {
                componentDefaults: [
                  { tag: "mj-text", attributes: [{ name: "align", value: "left" }] },
                ],
              },
              readOnly: {
                "componentDefaults[0].attributes[0].value": true,
                "componentDefaults[*].attributes[*].inherit": true,
              },
            },
            content: [],
          } as Data
        }
      >
        <Capture />
        <Puck.Fields />
      </Puck>,
    );
    await act(async () =>
      container!.querySelector<HTMLElement>('[class*="_ArrayFieldItem-summary_"]')!.click(),
    );
    expect(
      control(0, ".pm-attribute-value").querySelector('option[value="justify"]'),
    ).not.toBeNull();
    expect(control(0, ".pm-attribute-value").disabled).toBe(true);
    expect(control(0, '[aria-label="Inherit attribute 1"]').disabled).toBe(true);
    expect(control(0, ".pm-attribute-name").disabled).toBe(false);
    expect(container!.querySelector<HTMLButtonElement>(".pm-attribute-add")!.disabled).toBe(true);
  });
});
