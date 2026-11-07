// @vitest-environment happy-dom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ColorInput } from "./ColorInput";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
let container: HTMLDivElement | undefined;
afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
});

async function mount(value: string, readOnly = false) {
  const changed = vi.fn();
  function Harness() {
    const [color, setColor] = useState(value);
    return (
      <ColorInput
        aria-label="Background"
        value={color}
        readOnly={readOnly}
        onChange={(event) => {
          changed(event.target.value);
          setColor(event.target.value);
        }}
      />
    );
  }
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(<Harness />));
  return {
    changed,
    picker: container.querySelector<HTMLInputElement>('input[type="color"]')!,
    text: container.querySelector<HTMLInputElement>('input[type="text"]')!,
  };
}

describe("color picker with editable source", () => {
  it.each([
    ["#abc", "#aabbcc"],
    ["#12345680", "#123456"],
    ["rgba(20, 40, 60, 0.5)", "#14283c"],
    ["rgb(100% 0% 50%)", "#ff0080"],
    ["transparent", "#000000"],
    ["", "#000000"],
  ])("initializes the picker without rewriting %s", async (value, hex) => {
    const { picker, text, changed } = await mount(value);
    expect(picker.value).toBe(hex);
    expect(text.value).toBe(value);
    expect(changed).not.toHaveBeenCalled();
  });

  it("emits an explicit picker choice while preserving subsequent text edits", async () => {
    const { picker, text, changed } = await mount("rgba(20, 40, 60, 0.5)");
    const input = async (element: HTMLInputElement, value: string) =>
      act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
          element,
          value,
        );
        element.dispatchEvent(new Event("input", { bubbles: true }));
      });
    await input(picker, "#aabbcc");
    expect(text.value).toBe("#aabbcc");
    await input(text, "transparent");
    expect(text.value).toBe("transparent");
    expect(changed.mock.calls.map(([value]) => value)).toEqual(["#aabbcc", "transparent"]);
  });

  it("disables picking and retains the source text in read-only fields", async () => {
    const { picker, text, changed } = await mount("#345678", true);
    expect(picker.disabled).toBe(true);
    expect(text.readOnly).toBe(true);
    expect(text.value).toBe("#345678");
    expect(changed).not.toHaveBeenCalled();
  });
});
