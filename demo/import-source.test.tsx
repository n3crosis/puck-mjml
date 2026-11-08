// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { droppedImport, ImportSource } from "./import-source";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let container: HTMLDivElement;
let root: Root;
const onImport = vi.fn();
const transfer = (text?: string, files: File[] = []) =>
  ({
    files,
    types: [...(files.length ? ["Files"] : []), ...(text === undefined ? [] : ["text/plain"])],
    getData: () => text ?? "",
  }) as unknown as DataTransfer;

beforeEach(async () => {
  onImport.mockClear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<ImportSource onImport={onImport} />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
async function drag(type: string, data = transfer("<mjml />"), relatedTarget: Node | null = null) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    dataTransfer: { value: data },
    relatedTarget: { value: relatedTarget },
  });
  await act(async () => container.querySelector("textarea")!.dispatchEvent(event));
  return event;
}
it("prefers files over accompanying plain text, and ignores HTML-only drags", () => {
  const file = new File(["<mjml />"], "email.mjml");
  expect(droppedImport(transfer("file:///email.mjml", [file]))).toBe(file);
  expect(droppedImport(transfer())).toBeUndefined();
  expect(droppedImport(transfer(""))).toBe("");
});
it("imports external plain text, prevents default insertion/navigation, and retains it for editing", async () => {
  await drag("dragover");
  expect(container.querySelector("details")!.dataset.dragging).toBe("true");
  expect((await drag("drop")).defaultPrevented).toBe(true);
  expect(onImport).toHaveBeenCalledWith("<mjml />");
  expect(container.querySelector("textarea")!.value).toBe("<mjml />");
  expect(container.querySelector("details")!.dataset.dragging).toBeUndefined();
});
it("passes empty dropped text to validation without silently ignoring it", async () => {
  await drag("drop", transfer(""));
  expect(onImport).toHaveBeenCalledWith("");
});
it("keeps nested drag transitions highlighted and clears on leave, escape, blur, and drag cancellation", async () => {
  await drag("dragover");
  await drag("dragleave", transfer(), container.querySelector("summary"));
  expect(container.querySelector("details")!.dataset.dragging).toBe("true");
  await drag("dragleave");
  expect(container.querySelector("details")!.dataset.dragging).toBeUndefined();
  for (const event of [
    new KeyboardEvent("keydown", { key: "Escape" }),
    new Event("blur"),
    new Event("dragend"),
  ]) {
    await drag("dragover");
    await act(async () => window.dispatchEvent(event));
    expect(container.querySelector("details")!.dataset.dragging).toBeUndefined();
  }
});
it("allows editing pasted text and imports only when requested", async () => {
  const field = container.querySelector("textarea")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(
      field,
      "edited paste",
    );
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(onImport).not.toHaveBeenCalled();
  await act(async () => container.querySelector("button")!.click());
  expect(onImport).toHaveBeenCalledWith("edited paste");
});
