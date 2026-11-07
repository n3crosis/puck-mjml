// @vitest-environment happy-dom
import { act, useState, type ReactNode } from "react";
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

function typeSource(area: HTMLTextAreaElement, text: string, caret = text.length) {
  const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
  act(() => {
    setValue.call(area, text);
    area.setSelectionRange(caret, caret);
    area.dispatchEvent(new Event("input", { bubbles: true }));
  });
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

  it("shows formatted CSS initially without writing the host document", () => {
    const onChange = vi.fn();
    const area = mount({ ariaLabel: "CSS", format: "css", value: ".card{color:red}", onChange });
    expect(area.value).toBe(".card {\n  color: red;\n}\n");
    expect(area.getAttribute("wrap")).toBe("off");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("preserves active typing and caret, commits explicit formatting once, and accepts undo", () => {
    const commits: string[] = [];
    let undo: (source: string) => void = () => undefined;
    function Controlled() {
      const [source, setSource] = useState(".card{color:red}");
      undo = setSource;
      return (
        <CodeArea
          ariaLabel="CSS"
          format="css"
          value={source}
          onChange={(next) => {
            commits.push(next);
            setSource(next);
          }}
        />
      );
    }
    const area = mountElement(<Controlled />);
    act(() => area.focus());
    const draft = ".card{color:blue}";
    typeSource(area, draft, 12);
    expect(area.value).toBe(draft);
    expect(area.selectionStart).toBe(12);
    expect(commits).toEqual([draft]);
    const format = container!.querySelector<HTMLButtonElement>('[aria-label="Format CSS"]')!;
    act(() => format.click());
    expect(area.value).toBe(".card {\n  color: blue;\n}\n");
    expect(commits).toEqual([draft, area.value]);
    act(() => format.click());
    expect(commits).toHaveLength(2);
    act(() => undo(draft));
    expect(area.value).toBe(draft);
    expect(commits).toHaveLength(2);
    typeSource(area, ".card{color:");
    act(() => format.click());
    expect(area.value).toBe(".card{color:");
    expect(commits).toHaveLength(3);
  });

  it("leaves HTML source unchanged and disables CSS formatting when read-only", () => {
    const source = "<style>.card{color:red}</style><p>Hello</p>";
    const area = mount({ ariaLabel: "HTML", value: source, onChange: vi.fn() });
    expect(area.value).toBe(source);
    expect(container!.querySelector('[aria-label="Format HTML"]')).toBeNull();
    const onChange = vi.fn();
    act(() =>
      root!.render(
        <CodeArea
          ariaLabel="CSS"
          format="css"
          value=".card{color:red}"
          disabled
          onChange={onChange}
        />,
      ),
    );
    const format = container!.querySelector<HTMLButtonElement>('[aria-label="Format CSS"]')!;
    expect(format.disabled).toBe(true);
    act(() => format.click());
    expect(onChange).not.toHaveBeenCalled();
  });
});
