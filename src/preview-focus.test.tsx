// @vitest-environment happy-dom
import { act, StrictMode, useRef } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { usePreviewFocus } from "./preview-focus";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
it("moves focus inside, cycles both ways, prevents focus escape and restores the opener", () => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  function View({ open }: { open: boolean }) {
    const ref = useRef<HTMLElement>(null);
    usePreviewFocus(open, ref);
    return (
      <>
        <button id="opener">Preview</button>
        {open && (
          <section ref={ref} tabIndex={-1}>
            <span tabIndex={0} data-preview-focus-guard="start" />
            <button id="first">Desktop</button>
            <button id="last">Close</button>
            <span tabIndex={0} data-preview-focus-guard="end" />
          </section>
        )}
      </>
    );
  }
  try {
    act(() => root.render(<View open={false} />));
    const opener = container.querySelector<HTMLButtonElement>("#opener")!;
    opener.focus();
    act(() => root.render(<View open />));
    const first = container.querySelector<HTMLButtonElement>("#first")!;
    const last = container.querySelector<HTMLButtonElement>("#last")!;
    expect(document.activeElement).toBe(first);
    first.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true }),
    );
    expect(document.activeElement).toBe(last);
    last.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }),
    );
    expect(document.activeElement).toBe(first);
    container.querySelector<HTMLElement>('[data-preview-focus-guard="start"]')!.focus();
    expect(document.activeElement).toBe(last);
    container.querySelector<HTMLElement>('[data-preview-focus-guard="end"]')!.focus();
    expect(document.activeElement).toBe(first);
    opener.focus();
    expect(document.activeElement).toBe(first);
    act(() => root.render(<View open={false} />));
    expect(document.activeElement).toBe(opener);
  } finally {
    act(() => root.unmount());
    container.remove();
  }
});

it("opens a native modal and releases it on cleanup, including StrictMode replay", () => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  function View({ open }: { open: boolean }) {
    const ref = useRef<HTMLDialogElement>(null);
    const opener = useRef<HTMLButtonElement>(null);
    usePreviewFocus(open, ref, opener);
    return (
      <>
        <button ref={opener}>Preview</button>
        {open && (
          <dialog ref={ref} aria-label="Email preview">
            <button>Close</button>
          </dialog>
        )}
      </>
    );
  }
  try {
    act(() =>
      root.render(
        <StrictMode>
          <View open />
        </StrictMode>,
      ),
    );
    const dialog = container.querySelector("dialog")!;
    expect(dialog.open).toBe(true);
    expect(document.activeElement).toBe(dialog.querySelector("button"));
    act(() =>
      root.render(
        <StrictMode>
          <View open={false} />
        </StrictMode>,
      ),
    );
    expect(dialog.open).toBe(false);
    expect(document.activeElement).toBe(container.querySelector("button"));
  } finally {
    act(() => root.unmount());
    container.remove();
  }
});
