// @vitest-environment happy-dom
import { act, StrictMode, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { redo, undo, undoDepth } from "@codemirror/commands";
import { completionStatus, startCompletion } from "@codemirror/autocomplete";
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
      view.contentDOM
        .getAttribute("aria-describedby")!
        .split(" ")
        .map((id) => document.getElementById(id)!.textContent)
        .join(" "),
    ).toContain("Esc, then Tab to leave");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("keeps handled syntax-selection shortcuts local without swallowing other host keys", () => {
    const hostKeyDown = vi.fn();
    const onChange = vi.fn();
    const view = mount(
      <div onKeyDown={hostKeyDown}>
        <CSSCodeEditor ariaLabel="CSS" value=".card{color:red}" onChange={onChange} />
        <button type="button">Outside the editor</button>
      </div>,
    );
    act(() => {
      view.focus();
      view.dispatch({ selection: { anchor: 10 } });
    });
    const syntax = new KeyboardEvent("keydown", {
      key: "i",
      code: "KeyI",
      keyCode: 73,
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    act(() => view.contentDOM.dispatchEvent(syntax));
    expect(view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to)).toBe(
      "color",
    );
    expect(syntax.defaultPrevented).toBe(true);
    // Puck also binds Mod-i to interactive mode and ignores defaultPrevented.
    expect(hostKeyDown).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
    expect(undoDepth(view.state)).toBe(0);

    const unhandled = new KeyboardEvent("keydown", {
      key: "F8",
      code: "F8",
      bubbles: true,
      cancelable: true,
    });
    act(() => view.contentDOM.dispatchEvent(unhandled));
    expect(unhandled.defaultPrevented).toBe(false);
    expect(hostKeyDown).toHaveBeenCalledOnce();
    act(() =>
      container!.firstElementChild!.lastElementChild!.dispatchEvent(
        new KeyboardEvent("keydown", { key: "i", code: "KeyI", ctrlKey: true, bubbles: true }),
      ),
    );
    expect(hostKeyDown).toHaveBeenCalledTimes(2);
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

  it.each([false, true])(
    "lets %s-shift Tab leave after Escape dismisses completion",
    (shiftKey) => {
      const onChange = vi.fn();
      const view = mount(<CSSCodeEditor ariaLabel="CSS" value="" onChange={onChange} />);
      act(() => view.focus());
      const source = ".card {\n  col\n}";
      replace(view, source, source.indexOf("col") + 3);
      onChange.mockClear();
      // Pending and visible completion use the same Escape command. Cancel
      // before tooltip layout, which Happy DOM cannot faithfully measure.
      act(() => expect(startCompletion(view)).toBe(true));
      expect(completionStatus(view.state)).toBe("pending");
      const escape = new KeyboardEvent("keydown", {
        key: "Escape",
        keyCode: 27,
        bubbles: true,
        cancelable: true,
      });
      act(() => view.contentDOM.dispatchEvent(escape));
      expect(completionStatus(view.state)).toBeNull();
      expect(escape.defaultPrevented).toBe(true);
      const tab = new KeyboardEvent("keydown", {
        key: "Tab",
        keyCode: 9,
        shiftKey,
        bubbles: true,
        cancelable: true,
      });
      act(() => view.contentDOM.dispatchEvent(tab));
      // Happy DOM does not perform native focus navigation. Leaving Tab
      // unprevented is the contract; Chromium verifies the next focus target.
      expect(tab.defaultPrevented).toBe(false);
      expect(view.state.doc.toString()).toBe(source);
      expect(onChange).not.toHaveBeenCalled();

      // Continuing to edit cancels temporary focus mode, restoring indentation.
      act(() =>
        view.contentDOM.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "ArrowLeft",
            keyCode: 37,
            bubbles: true,
            cancelable: true,
          }),
        ),
      );
      const indent = new KeyboardEvent("keydown", {
        key: "Tab",
        keyCode: 9,
        bubbles: true,
        cancelable: true,
      });
      act(() => view.contentDOM.dispatchEvent(indent));
      expect(indent.defaultPrevented).toBe(true);
      expect(view.state.doc.toString()).toBe(".card {\n    col\n}");
    },
  );

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
      for (const id of views[index].contentDOM.getAttribute("aria-describedby")!.split(" ")) {
        expect(copy.contains(document.getElementById(id))).toBe(true);
      }
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

describe("CSS preview diagnostics during authoring", () => {
  it("diagnoses the current view before a host echo without adding history or callbacks", () => {
    const onChange = vi.fn();
    const view = mount(
      <CSSCodeEditor ariaLabel="CSS" value=".card{color:red}" onChange={onChange} />,
    );
    act(() => view.focus());
    const draft = ".card{color:";
    replace(view, draft, 6);
    expect(container!.querySelector("li")!.textContent).toContain("Could not be parsed");
    expect(onChange).toHaveBeenCalledExactlyOnceWith(draft);
    expect(undoDepth(view.state)).toBe(1);
    expect(document.activeElement).toBe(view.contentDOM);
    expect(view.state.selection.main.head).toBe(6);
    // Echoing source, changing the label, and toggling the disclosure are not edits.
    act(() =>
      root!.render(<CSSCodeEditor ariaLabel="Custom CSS" value={draft} onChange={onChange} />),
    );
    act(() => {
      container!.querySelector("details")!.open = true;
    });
    expect(EditorView.findFromDOM(container!.querySelector(".cm-editor")!)).toBe(view);
    expect(undoDepth(view.state)).toBe(1);
    expect(onChange).toHaveBeenCalledTimes(1);
    act(() => {
      expect(undo(view)).toBe(true);
    });
    expect(container!.querySelector("details")).toBeNull();
    act(() => {
      expect(redo(view)).toBe(true);
    });
    expect(container!.querySelector("li")!.textContent).toContain("Could not be parsed");
    expect(onChange).toHaveBeenCalledTimes(3);
  });

  it("clears or replaces notes on host replacements while preserving focus and enforcing read-only", () => {
    const onChange = vi.fn();
    const render = (source: string, disabled = false) => (
      <CSSCodeEditor ariaLabel="CSS" value={source} disabled={disabled} onChange={onChange} />
    );
    const view = mount(render("@page{margin:0}"));
    expect(container!.querySelector("li")!.textContent).toContain("@page");
    act(() => view.focus());
    replace(view, ".card{color:", 5);
    act(() => root!.render(render("@scope (.card){p{color:red}}", true)));
    expect(container!.querySelectorAll("li")).toHaveLength(1);
    expect(container!.querySelector("li")!.textContent).toContain("@scope");
    expect(container!.textContent).not.toContain("Could not be parsed");
    expect(view.state.selection.main.head).toBe(5);
    expect(document.activeElement).toBe(view.contentDOM);
    expect(undoDepth(view.state)).toBe(0);
    const locked = view.state.doc.toString();
    replace(view, ".card{color:green}");
    act(() => formatButton().click());
    expect(view.state.doc.toString()).toBe(locked);
    expect(container!.querySelector("li")!.textContent).toContain("@scope");
    act(() => root!.render(render(".host{color:green}", true)));
    expect(container!.querySelector("details")).toBeNull();
    expect(view.state.doc.toString()).toBe(".host{color:green}");
    expect(onChange).toHaveBeenCalledExactlyOnceWith(".card{color:");
    expect(EditorView.findFromDOM(container!.querySelector(".cm-editor")!)).toBe(view);
  });

  it("keeps notes, source, and history coherent through format, expansion, and keyboard indentation", () => {
    const onChange = vi.fn();
    const view = mount(<CSSCodeEditor ariaLabel="CSS" value="" onChange={onChange} />);
    act(() => view.focus());
    const source = "@scope (.card){p{color:red}}";
    replace(view, source);
    act(() => {
      container!.querySelector("details")!.open = true;
    });
    const note = container!.querySelector("li")!.textContent;
    act(() => formatButton().click());
    const formatted = view.state.doc.toString();
    expect(formatted).not.toBe(source);
    expect(container!.querySelector("li")!.textContent).toBe(note);
    expect(container!.querySelector("details")!.open).toBe(true);
    const depth = undoDepth(view.state);
    act(() =>
      container!.querySelector<HTMLButtonElement>('[aria-label="Expand CSS editor"]')!.click(),
    );
    expect(undoDepth(view.state)).toBe(depth);
    expect(onChange).toHaveBeenCalledTimes(2);
    act(() => view.dispatch({ selection: { anchor: formatted.indexOf("color") } }));
    const tab = new KeyboardEvent("keydown", {
      key: "Tab",
      keyCode: 9,
      bubbles: true,
      cancelable: true,
    });
    act(() => view.contentDOM.dispatchEvent(tab));
    expect(tab.defaultPrevented).toBe(true);
    expect(container!.querySelector("li")!.textContent).toBe(note);
    act(() => {
      expect(undo(view)).toBe(true);
    });
    expect(view.state.doc.toString()).toBe(formatted);
    act(() => {
      expect(undo(view)).toBe(true);
    });
    expect(view.state.doc.toString()).toBe(source);
    expect(container!.querySelector("li")!.textContent).toBe(note);
    expect(onChange).toHaveBeenCalledTimes(5);
  });
});
