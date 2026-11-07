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

  it("documents Escape then Tab and leaves that Tab to native focus navigation", () => {
    const onChange = vi.fn();
    const area = mount({ ariaLabel: "HTML", value: "<p>Hello</p>", onChange });
    expect(document.getElementById(area.getAttribute("aria-describedby")!)?.textContent).toContain(
      "Esc, then Tab to leave",
    );
    const tab = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    act(() => {
      area.focus();
      area.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      area.dispatchEvent(tab);
    });
    expect(tab.defaultPrevented).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
    const nextTab = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    act(() => area.dispatchEvent(nextTab));
    expect(nextTab.defaultPrevented).toBe(true);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("retains backward navigation and cancels a pending keyboard exit after typing or blur", () => {
    const onChange = vi.fn();
    const area = mount({ ariaLabel: "HTML", value: "<p>Hello</p>", onChange });
    const key = (key: string, shiftKey = false) => {
      const event = new KeyboardEvent("keydown", {
        key,
        shiftKey,
        bubbles: true,
        cancelable: true,
      });
      act(() => area.dispatchEvent(event));
      return event;
    };
    act(() => area.focus());
    expect(key("Tab", true).defaultPrevented).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
    key("Escape");
    key("a");
    expect(key("Tab").defaultPrevented).toBe(true);
    key("Escape");
    act(() => {
      area.blur();
      area.focus();
    });
    expect(key("Tab").defaultPrevented).toBe(true);
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
    expect(area.disabled).toBe(false);
    expect(area.readOnly).toBe(true);
    act(() => {
      area.focus();
      area.select();
    });
    expect(document.activeElement).toBe(area);
    expect(area.selectionStart).toBe(0);
    expect(area.selectionEnd).toBe(source.length);
    expect(document.getElementById(area.getAttribute("aria-describedby")!)?.textContent).toContain(
      "Read-only source. Select and copy with the keyboard.",
    );
    expect(container!.querySelector('[aria-label="Format HTML"]')).toBeNull();
    const tab = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
    act(() => {
      area.dispatchEvent(tab);
      setValue.call(area, "changed");
      area.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(tab.defaultPrevented).toBe(false);
    expect(area.value).toBe(source);
    expect(onChange).not.toHaveBeenCalled();
    act(() => container!.querySelector<HTMLButtonElement>("button")!.click());
    expect(area.getAttribute("rows")).toBe("16");
    expect(area.readOnly).toBe(true);
    expect(area.value).toBe(source);
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("duplicate source field instances", () => {
  it("keeps expand controls local and IDs stable across host updates", () => {
    const changes = [vi.fn(), vi.fn()];
    const view = (source = "<p>Initial</p>") => (
      <>
        {changes.map((onChange, index) => (
          <div hidden={index === 0} key={index} data-source-copy={index}>
            <CodeArea id="shared-source" ariaLabel="HTML" value={source} onChange={onChange} />
          </div>
        ))}
      </>
    );
    mountElement(view());
    const copies = [...container!.querySelectorAll<HTMLElement>("[data-source-copy]")];
    const areas = copies.map((copy) => copy.querySelector<HTMLTextAreaElement>("textarea")!);
    const ids = areas.map((area) => area.id);
    copies.forEach((copy, index) => {
      const toggle = copy.querySelector<HTMLButtonElement>("button")!;
      expect(document.getElementById(toggle.getAttribute("aria-controls")!)).toBe(areas[index]);
    });
    expect(new Set(ids).size).toBe(2);
    act(() => copies[1].querySelector<HTMLButtonElement>("button")!.click());
    expect(areas[0].getAttribute("rows")).toBe("4");
    expect(areas[1].getAttribute("rows")).toBe("16");
    act(() => root!.render(view("<p>Host update</p>")));
    expect([...container!.querySelectorAll("textarea")]).toEqual(areas);
    expect(areas.map((area) => area.id)).toEqual(ids);
    expect(areas.map((area) => area.value)).toEqual(["<p>Host update</p>", "<p>Host update</p>"]);
    expect(changes.every((change) => change.mock.calls.length === 0)).toBe(true);
  });
});
