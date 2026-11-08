// @vitest-environment happy-dom
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Puck, createUsePuck, type Config, type Data, type PuckApi } from "@puckeditor/core";
import { afterEach, describe, expect, it } from "vitest";
import { nativeAttributeField } from "./NativeFields";
import { readNativeAttributes } from "./native-attributes";
import type { MjmlAttribute } from "./types";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const usePuck = createUsePuck();
let root: Root | undefined;
let container: HTMLDivElement | undefined;
let api: PuckApi | undefined;
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
});

async function mount(entries: MjmlAttribute[], readOnly = false) {
  const config: Config = {
    components: {},
    root: {
      fields: {
        attributeDefaults: nativeAttributeField("mj-body", "Body attributes", false, true),
      },
    },
  };
  const data = {
    root: { props: { attributeDefaults: entries }, readOnly: { attributeDefaults: readOnly } },
    content: [],
  } as unknown as Data;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root!.render(
      <Puck config={config} data={data} iframe={{ enabled: false }}>
        <CaptureApi />
        <Puck.Fields />
      </Puck>,
    ),
  );
}
const entries = () => api!.appState.data.root.props!.attributeDefaults as MjmlAttribute[];
const rows = () => [...container!.querySelectorAll<HTMLElement>(".pm-attribute-row")];
const input = (row: number, selector: string) =>
  rows()[row].querySelector<HTMLInputElement>(selector)!;
const option = (row: number, label: string) =>
  input(row, `input[aria-label="${label} attribute ${row + 1}"]`);
const menuButton = (row: number, text: string) =>
  [...rows()[row].querySelectorAll<HTMLButtonElement>(".pm-attribute-popover button")].find(
    (button) => button.textContent === text,
  )!;
function dragEvent(type: string, dataTransfer: DataTransfer) {
  const event = new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer });
  // Happy DOM aliases DragEvent to Event and ignores the dataTransfer initializer.
  Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
  return event;
}
async function edit(action: () => void) {
  await act(async () => {
    action();
  });
  // Puck records changes after its standard typing debounce.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 300));
  });
}
async function changeValue(row: number, value: string) {
  await edit(() => {
    const element = input(row, ".pm-attribute-value");
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("compact native attribute controls", () => {
  it("transfers imported rules to user ownership on native edits and restores metadata on undo", async () => {
    const imported: MjmlAttribute = {
      name: "width",
      value: "600px",
      source: "import",
      importBaseline: { native: "original", controls: {} },
    };
    await mount([imported]);
    await changeValue(0, "700px");
    expect(entries()[0]).toEqual({ name: "width", value: "700px" });
    await edit(() => api!.history.back());
    expect(entries()[0]).toEqual(imported);
    await edit(() => api!.history.forward());
    await changeValue(0, "600px");
    expect(entries()[0]).toEqual({ name: "width", value: "600px" });
  });

  it("edits colors with a picker and text, supports undo, and preserves template colors", async () => {
    await mount([
      { name: "background-color", value: "#123456" },
      { name: "width", value: "600px" },
    ]);
    const picker = () => input(0, 'input[type="color"]');
    expect(picker().value).toBe("#123456");
    await edit(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
        picker(),
        "#aabbcc",
      );
      picker().dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(entries()[0].value).toBe("#aabbcc");
    expect(input(0, ".pm-attribute-value").value).toBe("#aabbcc");
    expect(readNativeAttributes("mj-body", entries())["background-color"]).toBe("#aabbcc");
    await act(async () => api!.history.back());
    expect(entries()[0].value).toBe("#123456");
    expect(picker().value).toBe("#123456");
    await act(async () => api!.history.forward());
    expect(picker().value).toBe("#aabbcc");
    await changeValue(0, "rgba(10, 20, 30, 0.4)");
    expect(entries()[0].value).toBe("rgba(10, 20, 30, 0.4)");
    await edit(() => option(0, "Template value for").click());
    expect(picker()).toBeNull();
    expect(input(0, ".pm-attribute-value").value).toBe("rgba(10, 20, 30, 0.4)");
    await changeValue(0, "{{ themeColor }}");
    await edit(() => option(0, "Inherit").click());
    expect(picker()).toBeNull();
    expect(entries()[0]).toEqual({
      name: "background-color",
      value: "{{ themeColor }}",
      template: true,
      inherit: true,
    });
    await edit(() => option(0, "Inherit").click());
    expect(picker()).toBeNull();
    await edit(() => option(0, "Template value for").click());
    expect(picker()).not.toBeNull();
    expect(input(0, ".pm-attribute-value").value).toBe("{{ themeColor }}");
    expect(entries()[0].value).toBe("{{ themeColor }}");
    expect(entries()[1]).toEqual({ name: "width", value: "600px" });
  });

  it("dismisses row menus outside or with Escape and closes sibling menus", async () => {
    await mount([
      { name: "width", value: "600px" },
      { name: "background-color", value: "navy" },
    ]);
    const menu = (row: number) => rows()[row].querySelector<HTMLDetailsElement>("details")!;
    const summary = (row: number) => menu(row).querySelector("summary")!;
    const open = async (row: number) => {
      await act(async () => {
        summary(row).click();
        // Native details toggle events are queued after the click.
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    };
    await open(0);
    expect(menu(0).open).toBe(true);
    await open(1);
    expect(menu(0).open).toBe(false);
    expect(menu(1).open).toBe(true);
    await act(async () => {
      option(1, "Inherit").focus();
      option(1, "Inherit").dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
      );
    });
    expect(menu(1).open).toBe(false);
    expect(document.activeElement).toBe(summary(1));
    await open(0);
    await act(async () =>
      input(0, ".pm-attribute-value").dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true }),
      ),
    );
    expect(menu(0).open).toBe(false);
    await open(1);
    await act(async () =>
      document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })),
    );
    expect(menu(1).open).toBe(false);
    expect(entries()).toEqual([
      { name: "width", value: "600px" },
      { name: "background-color", value: "navy" },
    ]);
  });

  it("edits one property/value row, preserves inherited template values, and supports undo", async () => {
    await mount([
      { name: "width", value: "{{ width }}", template: false, inherit: false },
      { name: "background-color", value: "navy" },
    ]);
    expect(rows()).toHaveLength(2);
    expect(input(0, ".pm-attribute-value").value).toBe("{{ width }}");
    expect(input(0, ".pm-attribute-value").placeholder).toBe("e.g. 600px");
    expect(rows()[0].querySelector<HTMLDetailsElement>("details")!.open).toBe(false);
    await edit(() => option(0, "Template value for").click());
    expect(entries()[0].template).toBe(true);
    expect(rows()[0].textContent).toContain("Preserved without evaluation");
    await edit(() => option(0, "Inherit").click());
    expect(input(0, ".pm-attribute-value").value).toBe("Inherited");
    expect(input(0, ".pm-attribute-value").disabled).toBe(true);
    expect(option(0, "Template value for")).toBeNull();
    expect(entries()[0]).toEqual({
      name: "width",
      value: "{{ width }}",
      template: true,
      inherit: true,
    });
    expect(entries()[1]).toEqual({ name: "background-color", value: "navy" });
    await edit(() => option(0, "Inherit").click());
    expect(input(0, ".pm-attribute-value").value).toBe("{{ width }}");
    expect(option(0, "Template value for").checked).toBe(true);
    await changeValue(0, "{{ email_width }}");
    expect(entries()[0].value).toBe("{{ email_width }}");
    expect(api!.history.hasPast).toBe(true);
    await act(async () => api!.history.back());
    expect(entries()[0].value).toBe("{{ width }}");
    expect(input(0, ".pm-attribute-value").value).toBe("{{ width }}");
    await act(async () => api!.history.forward());
    expect(entries()[0].value).toBe("{{ email_width }}");
  });

  it("adds, reorders, drags, and removes rows without deduplicating attributes", async () => {
    const first = { name: "width", value: "600px" };
    const second = { name: "width", value: "640px" };
    await mount([first, second]);
    expect(readNativeAttributes("mj-body", entries()).width).toBe("640px");
    await edit(() => menuButton(1, "Move up").click());
    expect(entries()).toEqual([second, first]);
    expect(readNativeAttributes("mj-body", entries()).width).toBe("600px");
    await edit(() => {
      const transfer = new DataTransfer();
      const grip = rows()[0].querySelector<HTMLButtonElement>(".pm-attribute-grip")!;
      expect(grip.getAttribute("draggable")).toBe("true");
      expect(grip.disabled).toBe(false);
      const start = dragEvent("dragstart", transfer);
      grip.dispatchEvent(start);
      expect(start.dataTransfer).toBe(transfer);
      expect(transfer.effectAllowed).toBe("move");
      expect(transfer.getData("text/plain")).toBe("0");
      const over = dragEvent("dragover", transfer);
      rows()[1].dispatchEvent(over);
      expect(over.defaultPrevented).toBe(true);
      const drop = dragEvent("drop", transfer);
      rows()[1].dispatchEvent(drop);
      expect(drop.defaultPrevented).toBe(true);
      grip.dispatchEvent(dragEvent("dragend", transfer));
    });
    expect(entries()).toEqual([first, second]);
    await edit(() => container!.querySelector<HTMLButtonElement>(".pm-attribute-add")!.click());
    expect(entries()).toEqual([first, second, { name: "", value: "", inherit: false }]);
    await edit(() => menuButton(1, "Remove attribute").click());
    expect(entries()).toEqual([first, { name: "", value: "", inherit: false }]);
    await act(async () => api!.history.back());
    expect(entries()).toEqual([first, second, { name: "", value: "", inherit: false }]);
    await act(async () => api!.history.forward());
    expect(entries()).toEqual([first, { name: "", value: "", inherit: false }]);
  });

  it("ignores external drops and clears row drag state after cancellation or a drop", async () => {
    const first = { name: "width", value: "600px" };
    const second = { name: "width", value: "640px" };
    await mount([first, second]);
    const transfer = new DataTransfer();
    transfer.setData("text/plain", "1");
    const expectIgnoredDrop = async () => {
      await edit(() => {
        const over = dragEvent("dragover", transfer);
        rows()[0].dispatchEvent(over);
        expect(over.defaultPrevented).toBe(false);
        const drop = dragEvent("drop", transfer);
        rows()[0].dispatchEvent(drop);
        expect(drop.defaultPrevented).toBe(false);
      });
    };
    await expectIgnoredDrop();
    expect(entries()).toEqual([first, second]);
    await act(async () => {
      const grip = rows()[1].querySelector(".pm-attribute-grip")!;
      grip.dispatchEvent(dragEvent("dragstart", transfer));
      expect(transfer.effectAllowed).toBe("move");
      expect(transfer.getData("text/plain")).toBe("1");
      grip.dispatchEvent(dragEvent("dragend", transfer));
    });
    await expectIgnoredDrop();
    expect(entries()).toEqual([first, second]);
    await edit(() => {
      rows()[1]
        .querySelector(".pm-attribute-grip")!
        .dispatchEvent(dragEvent("dragstart", transfer));
      const drop = dragEvent("drop", transfer);
      rows()[0].dispatchEvent(drop);
      expect(drop.defaultPrevented).toBe(true);
    });
    expect(entries()).toEqual([second, first]);
    // A completed drop clears the source even before the browser sends dragend.
    await expectIgnoredDrop();
    expect(entries()).toEqual([second, first]);
  });

  it("honors Puck read-only fields for values, modes, and array actions", async () => {
    const saved = [
      { name: "width", value: "600px", inherit: false },
      { name: "width", value: "640px" },
      { name: "background-color", value: "#223344" },
    ];
    await mount(saved, true);
    expect(container!.querySelector(".pm-attribute-add")).toBeNull();
    expect(
      [
        ...container!.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>(
          "input, select, button",
        ),
      ].every((control) => control.disabled),
    ).toBe(true);
    expect(
      rows()[0].querySelector<HTMLButtonElement>(".pm-attribute-grip")!.getAttribute("draggable"),
    ).toBe("false");
    await act(async () => {
      option(0, "Inherit").click();
      menuButton(0, "Remove attribute").click();
      menuButton(1, "Move up").click();
    });
    expect(entries()).toEqual(saved);
  });
});
