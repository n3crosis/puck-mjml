// @vitest-environment happy-dom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CodeArea } from "./CodeField";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | null = null;
let container: HTMLElement | null = null;
afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
});

function mountElement(element: ReactNode) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root!.render(element);
  });
  return container.querySelector("textarea")!;
}
function mount(props: Parameters<typeof CodeArea>[0]) {
  return mountElement(<CodeArea {...props} />);
}

describe("code area source fields", () => {
  it("renders a monospace code block that reports edits", () => {
    let value = "";
    const area = mount({
      ariaLabel: "CSS",
      value: ".card { color: red; }",
      onChange: (next) => (value = next),
    });
    expect(area.className).toBe("pm-code");
    expect(area.getAttribute("aria-label")).toBe("CSS");
    expect(area.getAttribute("spellcheck")).toBe("false");
    const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
    act(() => {
      setValue.call(area, ".card { color: blue; }");
      area.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(value).toBe(".card { color: blue; }");
  });

  it("inserts two spaces on Tab and keeps the caret in place", () => {
    let value = ".a{\n  color: red;\n}";
    const area = mount({ ariaLabel: "CSS", value, onChange: (next) => (value = next) });
    act(() => {
      area.focus();
      area.setSelectionRange(5, 5);
      area.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }),
      );
    });
    expect(value).toBe(".a{\n    color: red;\n}");
  });

  it("never renders non-string values", () => {
    const area = mount({ ariaLabel: "HTML", value: undefined, onChange: () => {} });
    expect(area.value).toBe("");
  });

  it("expands and collapses the editor without changing its source", () => {
    let changed = false;
    const area = mount({
      ariaLabel: "CSS",
      value: ".card { color: red; }",
      onChange: () => {
        changed = true;
      },
    });
    const toggle = container!.querySelector<HTMLButtonElement>("button")!;
    expect(area.getAttribute("rows")).toBe("4");
    expect(toggle.getAttribute("aria-controls")).toBe(area.id);
    act(() => toggle.click());
    expect(area.getAttribute("rows")).toBe("16");
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(area.value).toBe(".card { color: red; }");
    act(() => toggle.click());
    expect(area.getAttribute("rows")).toBe("4");
    expect(changed).toBe(false);
  });

  it("leaves HTML source unchanged and blocks read-only edits", () => {
    const source = "<style>.card{color:red}</style><p>Hello</p>";
    const onChange = vi.fn();
    const area = mount({ ariaLabel: "HTML", value: source, disabled: true, onChange });
    expect(area.value).toBe(source);
    expect(area.disabled).toBe(true);
    expect(container!.querySelector('[aria-label="Format HTML"]')).toBeNull();
    const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
    act(() => {
      setValue.call(area, "changed");
      area.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(onChange).not.toHaveBeenCalled();
  });
});
