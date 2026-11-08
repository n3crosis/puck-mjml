// @vitest-environment happy-dom
import { act, StrictMode, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { droppedImport, ImportSource, type ImportResult } from "./import-source";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let container: HTMLDivElement;
let root: Root;
const onImport = vi.fn<(source: File | string) => Promise<ImportResult>>();
const onClose = vi.fn();
const transfer = (text?: string, files: File[] = []) =>
  ({
    files,
    types: [...(files.length ? ["Files"] : []), ...(text === undefined ? [] : ["text/plain"])],
    getData: () => text ?? "",
  }) as unknown as DataTransfer;

function Host() {
  const [open, setOpen] = useState(true);
  const restoreRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={restoreRef} onClick={() => setOpen(true)}>
        Import
      </button>
      {open && (
        <ImportSource
          restoreRef={restoreRef}
          onImport={onImport}
          onClose={() => {
            onClose();
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

const panel = () => container.querySelector<HTMLFormElement>("form")!;
const field = () => container.querySelector<HTMLTextAreaElement>("textarea")!;
const button = (name: string) =>
  [...container.querySelectorAll("button")].find((element) => element.textContent === name)!;
const click = (name: string) => act(async () => button(name).click());
async function fill(source: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(
      field(),
      source,
    );
    field().dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function drag(type: string, data = transfer("<mjml />"), relatedTarget: Node | null = null) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    dataTransfer: { value: data },
    relatedTarget: { value: relatedTarget },
  });
  await act(async () => field().dispatchEvent(event));
  return event;
}

beforeEach(async () => {
  onImport.mockReset().mockResolvedValue({ status: "cancelled" });
  onClose.mockClear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<Host />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

it("opens a labelled modal, starts in the source field and keeps keyboard focus inside", async () => {
  const dialog = container.querySelector("dialog")!;
  expect(dialog.open).toBe(true);
  expect(document.getElementById(dialog.getAttribute("aria-labelledby")!)?.textContent).toBe(
    "Import MJML",
  );
  expect(document.activeElement).toBe(field());
  await fill("text");
  button("Import text").focus();
  await act(async () => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }),
    );
  });
  expect(document.activeElement).toBe(button("Close"));
  await act(async () => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true }),
    );
  });
  expect(document.activeElement).toBe(button("Import text"));
});

it("prefers files over accompanying plain text, and ignores HTML-only drags", () => {
  const file = new File(["<mjml />"], "email.mjml");
  expect(droppedImport(transfer("file:///email.mjml", [file]))).toBe(file);
  expect(droppedImport(transfer())).toBeUndefined();
  expect(droppedImport(transfer(""))).toBe("");
});
it("imports external plain text, prevents default insertion/navigation, and retains it for editing", async () => {
  await drag("dragover");
  expect(panel().dataset.dragging).toBe("true");
  expect((await drag("drop")).defaultPrevented).toBe(true);
  expect(onImport).toHaveBeenCalledWith("<mjml />");
  expect(field().value).toBe("<mjml />");
  expect(panel().dataset.dragging).toBeUndefined();
});
it("passes empty dropped text to validation without silently ignoring it", async () => {
  await drag("drop", transfer(""));
  expect(onImport).toHaveBeenCalledWith("");
});
it("prevents unsupported drag navigation without attempting an import", async () => {
  expect((await drag("dragover", transfer())).defaultPrevented).toBe(true);
  expect(panel().dataset.dragging).toBeUndefined();
  expect((await drag("drop", transfer())).defaultPrevented).toBe(true);
  expect(onImport).not.toHaveBeenCalled();
});
it("keeps nested drag transitions highlighted and clears on leave, blur, and drag cancellation", async () => {
  await drag("dragover");
  await drag("dragleave", transfer(), button("Close"));
  expect(panel().dataset.dragging).toBe("true");
  await drag("dragleave");
  expect(panel().dataset.dragging).toBeUndefined();
  for (const event of [new Event("blur"), new Event("dragend")]) {
    await drag("dragover");
    await act(async () => window.dispatchEvent(event));
    expect(panel().dataset.dragging).toBeUndefined();
  }
});
it("allows editing pasted text and imports only when requested", async () => {
  expect(button("Import text").disabled).toBe(true);
  await fill("edited paste");
  expect(onImport).not.toHaveBeenCalled();
  await click("Import text");
  expect(onImport).toHaveBeenCalledWith("edited paste");
  expect(container.querySelector('[role="status"]')?.textContent).toContain(
    "current email is unchanged",
  );
});
it("opens the file chooser explicitly, imports the selected file and resets it for re-selection", async () => {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
  const picker = vi.spyOn(input, "click");
  await click("Choose file");
  expect(picker).toHaveBeenCalledOnce();
  const file = new File(["<mjml />"], "email.mjml");
  Object.defineProperty(input, "files", { value: [file] });
  for (let count = 1; count <= 2; count++) {
    await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
    expect(onImport).toHaveBeenCalledTimes(count);
    expect(onImport).toHaveBeenLastCalledWith(file);
    expect(input.value).toBe("");
  }
});
it("keeps errors and source editable, then closes only after a successful retry", async () => {
  onImport.mockResolvedValueOnce({
    status: "error",
    message: "Invalid MJML. Your previous email is unchanged.",
  });
  onImport.mockResolvedValueOnce({ status: "imported" });
  await fill("bad source");
  await click("Import text");
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    "previous email is unchanged",
  );
  expect(field().value).toBe("bad source");
  expect(onClose).not.toHaveBeenCalled();
  await fill("corrected source");
  await click("Import text");
  expect(onImport).toHaveBeenLastCalledWith("corrected source");
  expect(container.querySelector("dialog")).toBeNull();
  expect(document.activeElement).toBe(button("Import"));
});

it.each(["Cancel", "Close", "Escape", "native cancel", "native close", "backdrop"])(
  "%s dismisses, restores focus and allows a clean repeated open",
  async (action) => {
    await fill("discarded paste");
    await drag("dragover");
    if (action === "Cancel" || action === "Close") await click(action);
    else
      await act(async () => {
        const dialog = container.querySelector("dialog")!;
        if (action === "Escape")
          field().dispatchEvent(
            new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
          );
        else if (action === "native cancel")
          dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
        else if (action === "native close") dialog.close();
        else dialog.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
      });
    expect(container.querySelector("dialog")).toBeNull();
    expect(document.activeElement).toBe(button("Import"));
    expect(onImport).not.toHaveBeenCalled();
    await click("Import");
    expect(container.querySelector("dialog")!.open).toBe(true);
    expect(field().value).toBe("");
    expect(panel().dataset.dragging).toBeUndefined();
    expect(container.querySelector('[role="alert"]')).toBeNull();
  },
);
it("does not close a repeated open when a dismissed import eventually finishes", async () => {
  let finish!: (result: ImportResult) => void;
  onImport.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  await fill("pending source");
  await click("Import text");
  expect(container.querySelector('[role="status"]')?.textContent).toContain("Reading and checking");
  await click("Cancel");
  await click("Import");
  await fill("new paste");
  await act(async () => finish({ status: "imported" }));
  expect(field().value).toBe("new paste");
  expect(onClose).toHaveBeenCalledOnce();
});
it("ignores older feedback when a newer import is pending or failed", async () => {
  let finish!: (result: ImportResult) => void;
  onImport.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  onImport.mockResolvedValueOnce({ status: "error", message: "Newer source failed" });
  await fill("old source");
  await click("Import text");
  await fill("new source");
  await click("Import text");
  await act(async () => finish({ status: "imported" }));
  expect(container.querySelector('[role="alert"]')?.textContent).toBe("Newer source failed");
  expect(field().value).toBe("new source");
  expect(onClose).not.toHaveBeenCalled();
});
it("stays open after StrictMode effect replay", async () => {
  await act(async () =>
    root.render(
      <StrictMode>
        <Host />
      </StrictMode>,
    ),
  );
  expect(container.querySelector("dialog")!.open).toBe(true);
  expect(onClose).not.toHaveBeenCalled();
});

it("keeps unfinished source when Escape dismisses an IME candidate", async () => {
  await fill("Unfinished composition");
  const event = new KeyboardEvent("keydown", {
    key: "Escape",
    isComposing: true,
    bubbles: true,
    cancelable: true,
  });
  await act(async () => field().dispatchEvent(event));
  expect(event.defaultPrevented).toBe(true);
  expect(field().value).toBe("Unfinished composition");
  expect(onClose).not.toHaveBeenCalled();
});
it("prevents native cancellation throughout composition, then allows Escape afterward", async () => {
  await fill("Composed draft");
  await act(async () =>
    field().dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true })),
  );
  const cancel = new Event("cancel", { cancelable: true });
  await act(async () => container.querySelector("dialog")!.dispatchEvent(cancel));
  expect(cancel.defaultPrevented).toBe(true);
  expect(field().value).toBe("Composed draft");
  expect(onClose).not.toHaveBeenCalled();
  await act(async () => {
    field().dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }));
    field().dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    );
  });
  expect(container.querySelector("dialog")).toBeNull();
});
