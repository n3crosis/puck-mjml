// @vitest-environment happy-dom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { NativeAttributeEditor } from "./NativeAttributeEditor";
import type { MjmlAttribute } from "./types";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
let container: HTMLDivElement | undefined;
const initial: MjmlAttribute[] = [
  { name: "width", value: "600px" },
  { name: "background-color", value: "#ffffff" },
  { name: "css-class", value: "email" },
];

function ControlledEditor({ entries }: { entries: MjmlAttribute[] }) {
  const [value, setValue] = useState(entries);
  return (
    <NativeAttributeEditor
      id="attributes"
      name="attributes"
      label="Body attributes"
      tag="mj-body"
      value={value}
      onChange={setValue}
    />
  );
}
async function mount(entries = initial) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(<ControlledEditor entries={entries} />));
}
afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});
const rows = () => [...container!.querySelectorAll<HTMLElement>(".pm-attribute-row")];
const summary = (index: number) => rows()[index].querySelector<HTMLElement>("summary")!;
const names = () =>
  rows().map((row) => row.querySelector<HTMLSelectElement>(".pm-attribute-name")!.value);
async function activate(index: number, action: string) {
  const menu = rows()[index].querySelector<HTMLDetailsElement>("details")!;
  await act(async () => {
    menu.open = true;
    const button = [...menu.querySelectorAll("button")].find(
      (candidate) => candidate.textContent === action,
    )!;
    button.focus();
    button.click();
  });
}

describe("native attribute keyboard action focus", () => {
  it("preserves composing Escape in a value field while another row menu is open", async () => {
    await mount(
      initial.map((entry, index) => (index === 2 ? { ...entry, value: "日本語" } : entry)),
    );
    const menu = rows()[0].querySelector<HTMLDetailsElement>("details")!;
    const input = rows()[2].querySelector<HTMLInputElement>(".pm-attribute-value")!;
    await act(async () => {
      menu.open = true;
      input.focus();
      input.setSelectionRange(0, 3);
      input.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    });
    const composingEscape = new KeyboardEvent("keydown", {
      key: "Escape",
      isComposing: true,
      bubbles: true,
      cancelable: true,
    });
    await act(async () => input.dispatchEvent(composingEscape));
    expect(composingEscape.defaultPrevented).toBe(false);
    expect(menu.open).toBe(true);
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe("日本語");
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(3);
    expect(names()).toEqual(initial.map(({ name }) => name));

    const escape = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    });
    await act(async () => {
      input.dispatchEvent(
        new CompositionEvent("compositionend", { bubbles: true, data: "日本語" }),
      );
      input.dispatchEvent(escape);
    });
    expect(escape.defaultPrevented).toBe(true);
    expect(menu.open).toBe(false);
    expect(document.activeElement).toBe(summary(0));
    expect(input.value).toBe("日本語");
  });

  it.each([
    { from: 1, action: "Move up", to: 0, order: [1, 0, 2] },
    { from: 1, action: "Move down", to: 2, order: [0, 2, 1] },
  ])("keeps focus with the moved attribute after $action", async ({ from, action, to, order }) => {
    await mount();
    await activate(from, action);
    expect(names()).toEqual(order.map((index) => initial[index].name));
    expect(document.activeElement).toBe(summary(to));
    expect(container!.querySelector("details[open]")).toBeNull();
    // The destination menu can be reopened and dismissed without losing context.
    await act(async () => {
      summary(to).click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(rows()[to].querySelector<HTMLDetailsElement>("details")!.open).toBe(true);
    await act(async () => {
      const inherit = rows()[to].querySelector<HTMLInputElement>('input[type="checkbox"]')!;
      inherit.focus();
      inherit.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
      );
    });
    expect(container!.querySelector("details[open]")).toBeNull();
    expect(document.activeElement).toBe(summary(to));
    expect(names()).toEqual(order.map((index) => initial[index].name));
  });

  it.each([
    { removed: 0, next: 0 },
    { removed: 1, next: 1 },
    { removed: 2, next: 1 },
  ])("focuses a surviving row after removing attribute $removed", async ({ removed, next }) => {
    await mount();
    await activate(removed, "Remove attribute");
    expect(names()).toEqual(
      initial.filter((_, index) => index !== removed).map(({ name }) => name),
    );
    expect(document.activeElement).toBe(summary(next));
    expect(container!.querySelector("details[open]")).toBeNull();
  });

  it("focuses Add attribute when the last attribute is removed", async () => {
    await mount([initial[0]]);
    await activate(0, "Remove attribute");
    expect(rows()).toHaveLength(0);
    expect(document.activeElement).toBe(container!.querySelector(".pm-attribute-add"));
    expect(container!.textContent).toContain("No overrides");
  });
});
