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
    expect(view.contentDOM.id).toBe("custom-css");
    expect(view.contentDOM.getAttribute("aria-label")).toBe("CSS");
    expect(view.contentDOM.getAttribute("role")).toBe("textbox");
    expect(view.contentDOM.getAttribute("aria-multiline")).toBe("true");
    expect(view.contentDOM.getAttribute("spellcheck")).toBe("false");
    expect(
      container!.querySelector(`#${view.contentDOM.getAttribute("aria-describedby")}`)!.textContent,
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
