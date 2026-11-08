// @vitest-environment happy-dom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AttributeNameInput, htmlAttributeNameGroups } from "./AttributeNameInput";
import { NativeAttributeEditor } from "./NativeAttributeEditor";
import { nativeAttributeNames, readNativeAttributes } from "./native-attributes";
import type { MjmlAttribute } from "./types";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
let container: HTMLDivElement | undefined;
afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});
function mount(element: React.ReactNode) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root!.render(element));
}
const name = (index = 0) =>
  container!.querySelectorAll<HTMLInputElement>(".pm-attribute-name")[index];
const options = () => [
  ...container!.querySelectorAll<HTMLElement>(
    '.pm-attribute-suggestions:not([hidden]) [role="option"]',
  ),
];
function type(input: HTMLInputElement, value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
function key(input: HTMLInputElement, key: string, isComposing = false) {
  const event = new KeyboardEvent("keydown", { key, isComposing, bubbles: true, cancelable: true });
  act(() => input.dispatchEvent(event));
  return event;
}

function controlled(entries: MjmlAttribute[]) {
  const changes = vi.fn();
  let saved = entries;
  function Editor() {
    const [value, setValue] = useState(entries);
    saved = value;
    return (
      <NativeAttributeEditor
        id="attributes"
        name="attributes"
        label="Attributes"
        tag="mj-text"
        value={value}
        allowRawHtml
        onChange={(next) => {
          changes(next);
          setValue(next);
        }}
      />
    );
  }
  mount(<Editor />);
  return { changes, saved: () => saved };
}

describe("searchable attribute names", () => {
  it("searches names without writing drafts, accepts completion, and focuses the retained rich value control", () => {
    const editor = controlled([
      { name: "font-size", value: "#112233", template: false, inherit: false },
    ]);
    act(() => name().focus());
    expect(name().getAttribute("role")).toBe("combobox");
    expect(name().selectionEnd).toBe("font-size".length);
    expect(
      options()
        .map((option) => option.dataset.property)
        .sort(),
    ).toEqual(nativeAttributeNames("mj-text"));
    type(name(), "BACKGROUND COLOR");
    expect(options()[0].dataset.property).toBe("background-color");
    expect(editor.changes).not.toHaveBeenCalled();
    expect(
      document
        .getElementById(name().getAttribute("aria-activedescendant")!)
        ?.getAttribute("aria-selected"),
    ).toBe("true");
    key(name(), "Enter");
    expect(editor.changes).toHaveBeenCalledTimes(1);
    expect(editor.saved()).toEqual([
      { name: "background-color", value: "#112233", template: false, inherit: false },
    ]);
    expect(document.activeElement).toBe(
      container!.querySelector('.pm-color-input input[type="text"]'),
    );
    expect(container!.querySelector('input[type="color"]')).not.toBeNull();
    expect(name().getAttribute("aria-expanded")).toBe("false");
  });

  it("cancels draft names without dropping imported ownership, value, or inheritance", () => {
    const entry: MjmlAttribute = {
      name: "color",
      value: "{{ theme }}",
      inherit: true,
      template: true,
      source: "import",
      importBaseline: { native: "original", controls: {} },
    };
    const editor = controlled([entry]);
    act(() => name().focus());
    type(name(), "font si");
    expect(key(name(), "Escape").defaultPrevented).toBe(true);
    expect(name().value).toBe("color");
    act(() => name().blur());
    expect(editor.changes).not.toHaveBeenCalled();
    expect(editor.saved()).toEqual([entry]);
    expect(container!.querySelector<HTMLInputElement>(".pm-attribute-value")!.value).toBe(
      "Inherited",
    );
  });

  it("accepts custom names by click, blur, and Tab without reinterpreting values or duplicating commits", () => {
    const editor = controlled([
      { name: "vendor-old", value: "literal value", template: true },
      { name: "font-size", value: "18px" },
    ]);
    act(() => name().focus());
    type(name(), "data-custom");
    expect(options()).toHaveLength(1);
    expect(options()[0].textContent).toContain("Use custom name");
    act(() => options()[0].click());
    expect(editor.saved()[0]).toEqual({
      name: "data-custom",
      value: "literal value",
      template: true,
    });
    expect(editor.changes).toHaveBeenCalledTimes(1);
    act(() => name().focus());
    type(name(), "data-other");
    act(() => name().blur());
    expect(editor.saved()[0].name).toBe("data-other");
    act(() => name().focus());
    type(name(), "font-size");
    key(name(), "Tab");
    act(() => name().blur());
    expect(editor.changes).toHaveBeenCalledTimes(3);
    expect(editor.saved().map((entry) => entry.name)).toEqual(["font-size", "font-size"]);
    expect(editor.saved()[0].value).toBe("literal value");
  });

  it("opens suggestions for added rows and keeps IME candidate keys untouched", () => {
    const editor = controlled([]);
    act(() => container!.querySelector<HTMLButtonElement>(".pm-attribute-add")!.click());
    expect(document.activeElement).toBe(name());
    expect(name().getAttribute("aria-expanded")).toBe("true");
    type(name(), "font");
    for (const candidate of ["ArrowDown", "Enter", "Tab", "Escape"]) {
      expect(key(name(), candidate, true).defaultPrevented).toBe(false);
      expect(editor.saved()).toEqual([{ name: "", value: "", inherit: false }]);
    }
    const first = options()[0].dataset.property;
    key(name(), "ArrowDown");
    const selected = options().find((option) => option.getAttribute("aria-selected") === "true")!
      .dataset.property;
    expect(selected).not.toBe(first);
    key(name(), "Enter");
    expect(editor.saved()[0].name).toBe(selected);
  });

  it("cancels completion before an unrelated row menu can blur and save its draft", () => {
    const editor = controlled([{ name: "color", value: "red" }]);
    act(() => {
      container!.querySelector<HTMLDetailsElement>("details")!.open = true;
      name().focus();
    });
    type(name(), "width");
    key(name(), "Escape");
    expect(document.activeElement).toBe(name());
    expect(name().value).toBe("color");
    expect(editor.changes).not.toHaveBeenCalled();
  });

  it("syncs host replacements and locks without emitting edits, including generated HTML names", () => {
    const onChange = vi.fn();
    const render = (value: string, disabled = false) => (
      <AttributeNameInput
        id="html-name"
        name="htmlAttributes[0].name"
        value={value}
        groups={htmlAttributeNameGroups}
        ariaLabel="Attribute name"
        disabled={disabled}
        onChange={onChange}
      />
    );
    mount(render("data-imported"));
    act(() => name().focus());
    type(name(), "aria");
    expect(options().some((option) => option.dataset.property === "aria-label")).toBe(true);
    act(() => root!.render(render("title", true)));
    expect(name().value).toBe("title");
    expect(name().disabled).toBe(true);
    expect(name().getAttribute("aria-expanded")).toBe("false");
    key(name(), "Enter");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("opens upward at the last option and wraps arrow navigation in both directions", () => {
    controlled([{ name: "color", value: "red" }]);
    act(() => name().focus());
    const names = options().map((option) => option.dataset.property);
    const selected = () =>
      options().find((option) => option.getAttribute("aria-selected") === "true")?.dataset.property;
    key(name(), "ArrowUp");
    expect(selected()).toBe(names.at(-1));
    key(name(), "ArrowDown");
    expect(selected()).toBe(names[0]);
    key(name(), "ArrowUp");
    expect(selected()).toBe(names.at(-1));
    key(name(), "Escape");
    key(name(), "ArrowDown");
    expect(selected()).toBe(names[0]);
  });

  it("retains drafts through cloned host echoes but discards them on row changes, reorder, or locking", () => {
    const entries = [
      { name: "font-size", value: "16px" },
      { name: "font-size", value: "24px" },
    ];
    const onChange = vi.fn();
    const render = (value = entries, readOnly = false) => (
      <NativeAttributeEditor
        id="attributes"
        name="attributes"
        label="Attributes"
        tag="mj-text"
        value={value}
        readOnly={readOnly}
        onChange={onChange}
      />
    );
    mount(render());
    act(() => name().focus());
    type(name(), "color");
    act(() => root!.render(render(structuredClone(entries))));
    expect(name().value).toBe("color");
    act(() => root!.render(render([...entries].reverse())));
    expect(name().value).toBe("font-size");
    expect(container!.querySelector<HTMLInputElement>(".pm-attribute-value")!.value).toBe("24px");
    type(name(), "width");
    act(() => root!.render(render([...entries].reverse(), true)));
    expect(name().value).toBe("font-size");
    expect(name().disabled).toBe(true);
    expect(onChange).not.toHaveBeenCalled();
  });

  it.each(["data-custom", "onclick", "__proto__", 'width" injected="yes'])(
    "retains the existing export validation for custom name %s",
    (custom) => {
      const editor = controlled([{ name: "font-size", value: "18px" }]);
      act(() => name().focus());
      type(name(), custom);
      key(name(), "Enter");
      expect(editor.saved()[0]).toEqual({ name: custom, value: "18px" });
      expect(() => readNativeAttributes("mj-text", editor.saved())).toThrow();
    },
  );
});
