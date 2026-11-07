// @vitest-environment happy-dom
import { act, StrictMode, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { redo, undo, undoDepth } from "@codemirror/commands";
import { EditorView } from "@codemirror/view";
import { Transaction } from "@codemirror/state";
import { CodeArea } from "./CodeField";
import { CSSCodeEditor } from "./CSSCodeEditor";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | null = null;
let container: HTMLDivElement | null = null;
beforeEach(() => {
  // Browsers queue selectionchange, whereas Happy DOM dispatches it inside
  // Selection.collapse. CodeMirror must finish its DOM update before observing it.
  const dispatch = document.dispatchEvent.bind(document);
  vi.spyOn(document, "dispatchEvent").mockImplementation((event) => {
    if (event.type !== "selectionchange") return dispatch(event);
    queueMicrotask(() => dispatch(event));
    return true;
  });
});
afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.restoreAllMocks();
});
function mount(element: ReactNode) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root!.render(element));
  return EditorView.findFromDOM(container.querySelector(".cm-editor")!)!;
}
function replace(view: EditorView, source: string, cursor = source.length) {
  act(() =>
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: source },
      selection: { anchor: cursor },
      annotations: Transaction.userEvent.of("input.type"),
    }),
  );
}
function formatButton() {
  return container!.querySelector<HTMLButtonElement>('[aria-label="Format CSS"]')!;
}

describe("CSS code editor", () => {
  it("integrates through CodeArea with highlighting, line numbers, and an accessible label", () => {
    const onChange = vi.fn();
    const view = mount(
      <CodeArea
        id="custom-css"
        ariaLabel="CSS"
        format="css"
        value=".card{color:red}"
        onChange={onChange}
      />,
    );
    expect(container!.querySelector("textarea")).toBeNull();
    expect(view.state.doc.toString()).toBe(".card {\n  color: red;\n}\n");
    expect(container!.querySelector(".cm-lineNumbers")).not.toBeNull();
    expect(container!.querySelector(".pm-css-property")!.textContent).toBe("color");
    expect(view.contentDOM.id).toMatch(/^custom-css-/);
    expect(view.contentDOM.getAttribute("aria-label")).toBe("CSS");
    expect(view.contentDOM.getAttribute("role")).toBe("textbox");
    expect(view.contentDOM.getAttribute("aria-multiline")).toBe("true");
    expect(view.contentDOM.getAttribute("spellcheck")).toBe("false");
    expect(
      document.getElementById(view.contentDOM.getAttribute("aria-describedby")!)!.textContent,
    ).toContain("Esc, then Tab to leave");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("keeps the view, focus, cursor, and local history through controlled host echoes", () => {
    const commits: string[] = [];
    function Controlled() {
      const [value, setValue] = useState(".card{color:red}");
      return (
        <CSSCodeEditor
          ariaLabel="CSS"
          value={value}
          onChange={(next) => {
            commits.push(next);
            setValue(next);
          }}
        />
      );
    }
    const view = mount(
      <StrictMode>
        <Controlled />
      </StrictMode>,
    );
    act(() => view.focus());
    replace(view, ".card{color:blue}", 12);
    expect(EditorView.findFromDOM(container!.querySelector(".cm-editor")!)).toBe(view);
    expect(document.activeElement).toBe(view.contentDOM);
    expect(view.state.selection.main.head).toBe(12);
    expect(view.state.doc.toString()).toBe(".card{color:blue}");
    expect(commits).toEqual([".card{color:blue}"]);
    expect(undoDepth(view.state)).toBe(1);
    act(() => {
      expect(undo(view)).toBe(true);
    });
    expect(view.state.doc.toString()).toBe(".card {\n  color: red;\n}\n");
    act(() => {
      expect(redo(view)).toBe(true);
    });
    expect(view.state.doc.toString()).toBe(".card{color:blue}");
    expect(commits).toHaveLength(3);
  });

  it("undoes and redoes each Tab and Shift+Tab indentation step through the keyboard", () => {
    const commits: string[] = [];
    function Controlled() {
      const [value, setValue] = useState(".card{color:red}");
      return (
        <CSSCodeEditor
          ariaLabel="CSS"
          value={value}
          onChange={(next) => {
            commits.push(next);
            setValue(next);
          }}
        />
      );
    }
    const view = mount(<Controlled />);
    act(() => view.focus());
    const original = ".card {\n  color: blue;\n}";
    const indented = ".card {\n    color: blue;\n}";
    replace(view, original, 8);
    const press = (key: string, keyCode: number, modifiers: KeyboardEventInit = {}) => {
      const event = new KeyboardEvent("keydown", {
        key,
        keyCode,
        bubbles: true,
        cancelable: true,
        ...modifiers,
      });
      act(() => view.contentDOM.dispatchEvent(event));
      expect(event.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(view.contentDOM);
    };
    press("Tab", 9);
    expect(view.state.doc.toString()).toBe(indented);
    press("Tab", 9, { shiftKey: true });
    expect(view.state.doc.toString()).toBe(original);
    press("z", 90, { ctrlKey: true });
    expect(view.state.doc.toString()).toBe(indented);
    press("z", 90, { ctrlKey: true });
    expect(view.state.doc.toString()).toBe(original);
    press("Z", 90, { ctrlKey: true, shiftKey: true });
    expect(view.state.doc.toString()).toBe(indented);
    press("Z", 90, { ctrlKey: true, shiftKey: true });
    expect(view.state.doc.toString()).toBe(original);
    expect(commits).toEqual([original, indented, original, indented, original, indented, original]);
  });

  it("uses the latest callback and applies external history without stale local undo", () => {
    const first = vi.fn();
    const latest = vi.fn();
    const view = mount(<CSSCodeEditor ariaLabel="CSS" value=".card{color:red}" onChange={first} />);
    act(() => view.focus());
    act(() =>
      root!.render(<CSSCodeEditor ariaLabel="CSS" value=".card{color:red}" onChange={latest} />),
    );
    replace(view, ".card{color:blue}", 12);
    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledWith(".card{color:blue}");
    act(() =>
      root!.render(<CSSCodeEditor ariaLabel="CSS" value=".card{color:green}" onChange={latest} />),
    );
    expect(view.state.doc.toString()).toBe(".card{color:green}");
    expect(document.activeElement).toBe(view.contentDOM);
    expect(view.state.selection.main.head).toBe(12);
    expect(undoDepth(view.state)).toBe(0);
    expect(latest).toHaveBeenCalledTimes(1);
  });

  it("formats only on request, keeps invalid drafts, and can undo explicit formatting", () => {
    const onChange = vi.fn();
    function Controlled() {
      const [value, setValue] = useState(".card{color:red}");
      return (
        <CSSCodeEditor
          ariaLabel="CSS"
          value={value}
          onChange={(next) => {
            onChange(next);
            setValue(next);
          }}
        />
      );
    }
    const view = mount(<Controlled />);
    act(() => view.focus());
    replace(view, ".card{color:blue}", 12);
    act(() => formatButton().click());
    expect(view.state.doc.toString()).toBe(".card {\n  color: blue;\n}\n");
    expect(onChange).toHaveBeenCalledTimes(2);
    act(() => formatButton().click());
    expect(onChange).toHaveBeenCalledTimes(2);
    act(() => {
      expect(undo(view)).toBe(true);
    });
    expect(view.state.doc.toString()).toBe(".card{color:blue}");
    replace(view, ".card{color:");
    act(() => formatButton().click());
    expect(view.state.doc.toString()).toBe(".card{color:");
    expect(onChange).toHaveBeenCalledTimes(4);
  });

  it("enforces read-only across editing, formatting, and permission changes but accepts host updates", () => {
    const onChange = vi.fn();
    const render = (disabled: boolean, value = ".card{color:red}") => (
      <CSSCodeEditor
        id="css"
        ariaLabel="CSS"
        value={value}
        disabled={disabled}
        onChange={onChange}
      />
    );
    const view = mount(render(false));
    act(() => root!.render(render(true)));
    const original = view.state.doc.toString();
    expect(view.contentDOM.getAttribute("contenteditable")).toBe("false");
    expect(view.contentDOM.getAttribute("aria-readonly")).toBe("true");
    expect(view.contentDOM.getAttribute("tabindex")).toBe("0");
    act(() => view.focus());
    expect(document.activeElement).toBe(view.contentDOM);
    replace(view, "changed");
    act(() => formatButton().click());
    expect(formatButton().disabled).toBe(true);
    expect(view.state.doc.toString()).toBe(original);
    expect(onChange).not.toHaveBeenCalled();
    act(() => root!.render(render(true, ".host{color:green}")));
    expect(view.state.doc.toString()).toBe(".host{color:green}");
    expect(onChange).not.toHaveBeenCalled();
    act(() => root!.render(render(false, ".host{color:green}")));
    replace(view, ".host{color:blue}");
    expect(onChange).toHaveBeenCalledWith(".host{color:blue}");
  });

  it("expands within the panel without resetting selection, history, or document data", () => {
    const onChange = vi.fn();
    const view = mount(
      <CSSCodeEditor ariaLabel="CSS" value=".card{color:red}" rows={10} onChange={onChange} />,
    );
    act(() => view.dispatch({ selection: { anchor: 6 } }));
    const toggle = container!.querySelector<HTMLButtonElement>('[aria-label="Expand CSS editor"]')!;
    const host = container!.querySelector<HTMLElement>(".pm-css-editor-host")!;
    expect(host.style.getPropertyValue("--pm-code-height")).toBe("196px");
    act(() => toggle.click());
    expect(toggle.getAttribute("aria-controls")).toBe(view.contentDOM.id);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(host.style.getPropertyValue("--pm-code-height")).toBe("304px");
    expect(EditorView.findFromDOM(container!.querySelector(".cm-editor")!)).toBe(view);
    expect(view.state.selection.main.head).toBe(6);
    act(() => toggle.click());
    expect(host.style.getPropertyValue("--pm-code-height")).toBe("196px");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("handles non-string values without rendering or emitting them", () => {
    const onChange = vi.fn();
    const view = mount(<CSSCodeEditor ariaLabel="CSS" value={undefined} onChange={onChange} />);
    expect(view.state.doc.toString()).toBe("");
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("duplicate CSS field instances", () => {
  it("keeps controls and help local without resetting view identity, source, or history", () => {
    const changed = [vi.fn(), vi.fn()];
    const element = () => (
      <>
        {changed.map((onChange, index) => (
          <div hidden={index === 0} key={index} data-css-copy={index}>
            <CSSCodeEditor
              id="shared-css"
              ariaLabel="CSS"
              value=".a{color:red}"
              onChange={onChange}
            />
          </div>
        ))}
      </>
    );
    mount(element());
    const copies = [...container!.querySelectorAll<HTMLElement>("[data-css-copy]")];
    const views = copies.map((copy) => EditorView.findFromDOM(copy.querySelector(".cm-editor")!)!);
    const ids = views.map((view) => view.contentDOM.id);
    copies.forEach((copy, index) => {
      const toggle = copy.querySelector<HTMLButtonElement>("[aria-controls]")!;
      expect(document.getElementById(toggle.getAttribute("aria-controls")!)).toBe(
        views[index].contentDOM,
      );
      const help = document.getElementById(
        views[index].contentDOM.getAttribute("aria-describedby")!,
      )!;
      expect(copy.contains(help)).toBe(true);
    });
    expect(new Set(ids).size).toBe(2);
    act(() => views[1].focus());
    replace(views[1], ".a{color:blue}", 10);
    const history = undoDepth(views[1].state);
    act(() => copies[1].querySelector<HTMLButtonElement>("[aria-controls]")!.click());
    expect(copies[0].querySelector("[aria-controls]")!.getAttribute("aria-expanded")).toBe("false");
    expect(copies[1].querySelector("[aria-controls]")!.getAttribute("aria-expanded")).toBe("true");
    act(() => root!.render(element()));
    expect(views.map((view) => view.contentDOM.id)).toEqual(ids);
    copies.forEach((copy, index) =>
      expect(EditorView.findFromDOM(copy.querySelector(".cm-editor")!)).toBe(views[index]),
    );
    expect(views[1].state.doc.toString()).toBe(".a{color:blue}");
    expect(views[1].state.selection.main.head).toBe(10);
    expect(undoDepth(views[1].state)).toBe(history);
    expect(changed[0]).not.toHaveBeenCalled();
    expect(changed[1]).toHaveBeenCalledExactlyOnceWith(".a{color:blue}");
    act(() => {
      expect(undo(views[1])).toBe(true);
    });
    expect(views[1].state.doc.toString()).toBe(".a {\n  color: red;\n}\n");
  });
});
