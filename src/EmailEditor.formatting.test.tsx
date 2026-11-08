// @vitest-environment happy-dom
import { act, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createUsePuck, type PuckApi } from "@puckeditor/core";
import type { Editor } from "@tiptap/core";
import { afterEach, expect, it, vi } from "vitest";
import { EmailEditor } from "./EmailEditor";
import { fromMjml } from "./import";
import { toMjml } from "./export";
import type { EmailDocument } from "./types";
import { richTextInteractionSource } from "../tests/browser/fixtures/richtext-interaction-source";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const usePuck = createUsePuck();
let root: Root | undefined;
let container: HTMLElement;
let api: PuckApi;
let current: EmailDocument;
function Capture() {
  const value = usePuck((state) => state);
  useEffect(() => {
    api = value;
  }, [value]);
  return null;
}
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  container?.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const settle = () => act(async () => new Promise((resolve) => setTimeout(resolve, 400)));

it.each(["canvas", "sidebar"])(
  "actual Puck %s toolbar persists formatting and links through controlled edits and history",
  async (surface) => {
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 0, 800, 600),
    );
    const initial = fromMjml(richTextInteractionSource).document;
    function Host() {
      const [value, setValue] = useState(initial);
      current = value;
      return (
        <EmailEditor
          value={value}
          onChange={(next) => setValue(JSON.parse(JSON.stringify(next)))}
          headerActions={<Capture />}
        />
      );
    }
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root!.render(<Host />));
    const before = toMjml(current);
    await act(async () =>
      api.dispatch({
        type: "setUi",
        ui: { itemSelector: api.getSelectorForId(surface === "canvas" ? "text-1" : "table-1") },
        recordHistory: false,
      }),
    );
    const canvas = () => container.querySelector("iframe")!.contentDocument!;
    const scope = () => (surface === "canvas" ? canvas() : container);
    const editorElement = () =>
      scope().querySelector<HTMLElement & { editor: Editor }>(
        surface === "canvas"
          ? '.formatting-target [contenteditable="true"]'
          : '[data-table-cell-property="content"] [contenteditable="true"]',
      )!;
    for (let retry = 0; retry < 20 && !editorElement()?.editor; retry++)
      await act(async () => new Promise((resolve) => setTimeout(resolve, 50)));
    const element = editorElement();
    expect(element?.editor).toBeDefined();
    expect(
      element.editor.extensionManager.extensions.filter(({ name }) => name === "bold"),
    ).toHaveLength(1);
    await act(async () => {
      element.focus();
      element.editor.commands.setTextSelection({ from: 7, to: 16 });
    });
    const bold = () =>
      scope().querySelector<HTMLButtonElement>(
        '.pm-richtext-toolbar button[title="Bold"], .pm-richtext-toolbar button[aria-label="Bold"]',
      )!;
    expect(bold()).not.toBeNull();
    expect(bold().disabled).toBe(false);
    await act(async () => bold().click());
    await settle();
    const formatted = toMjml(current);
    expect(formatted).toContain('<strong style="font-weight:bold">selection</strong>');
    expect(formatted).toContain("<strong>relative</strong>");
    expect(editorElement()).toBe(element);
    expect(element.editor.state.selection.to - element.editor.state.selection.from).toBe(9);
    const marked = canvas().querySelector(
      surface === "canvas" ? ".formatting-target strong" : ".formatting-table strong",
    ) as HTMLElement;
    expect(marked.style.fontWeight).toBe("bold");
    // Pointer activation of the header history controls leaves the content
    // editor. Happy DOM's programmatic API call alone does not move focus.
    await act(async () => {
      editorElement().blur();
      api.history.back();
    });
    expect(toMjml(current)).toBe(before);
    await act(async () => api.history.forward());
    expect(toMjml(current)).toBe(formatted);
    await settle();
    expect(editorElement().editor.getHTML()).toContain(
      '<strong style="font-weight: bold;">selection</strong>',
    );
    await act(async () => {
      editorElement().focus();
      editorElement().editor.commands.setTextSelection({ from: 7, to: 16 });
    });
    expect(editorElement().editor.isActive("bold")).toBe(true);
    expect(bold().disabled).toBe(false);
    await act(async () => bold().click());
    expect(editorElement().editor.isActive("bold")).toBe(false);
    await settle();
    expect(toMjml(current)).not.toContain('style="font-weight:bold"');
    await act(async () => bold().click());
    await settle();
    expect(toMjml(current)).toBe(formatted);
    const control = (label: string) =>
      [...scope().querySelectorAll<HTMLButtonElement>(".pm-richtext-toolbar button")].find(
        (button) =>
          button.title === label ||
          button.getAttribute("aria-label") === label ||
          button.textContent === label,
      )!;
    await act(async () => control("Add link").click());
    const input = scope().querySelector<HTMLInputElement>(".pm-richtext-link input")!;
    await act(async () => {
      input.focus();
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
        input,
        "https://example.com/saved-link",
      );
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => control("Apply").click());
    await settle();
    expect(toMjml(current)).toContain('href="https://example.com/saved-link"');
    expect(
      canvas().querySelector(surface === "canvas" ? ".formatting-target a" : ".formatting-table a")
        ?.textContent,
    ).toBe("selection");
    const linked = toMjml(current);
    for (const dismissal of ["Cancel", "Escape"]) {
      const focusedField = api.appState.ui.field.focus;
      await act(async () => control("Edit link").click());
      const linkInput = scope().querySelector<HTMLInputElement>(".pm-richtext-link input")!;
      await act(async () => {
        linkInput.focus();
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
          linkInput,
          "https://example.com/not-saved",
        );
        linkInput.dispatchEvent(new Event("input", { bubbles: true }));
      });
      expect(api.appState.ui.field.focus).toBe(focusedField);
      await act(async () => {
        if (dismissal === "Cancel") control("Cancel").click();
        else
          linkInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      });
      await settle();
      expect(editorElement().ownerDocument.activeElement).toBe(editorElement());
      expect(toMjml(current)).toBe(linked);
      expect(scope().querySelector(".pm-richtext-link")).toBeNull();
    }
    await act(async () => control("Edit link").click());
    await act(async () => control("Remove link").click());
    await settle();
    expect(toMjml(current)).toBe(formatted);
    // Leaving an open link form for another ordinary field must still select
    // that field and let its changes flow to the controlled host.
    await act(async () => control("Add link").click());
    const padding = container.querySelector<HTMLInputElement>(
      surface === "sidebar"
        ? '[data-table-cell-property="padding"] input'
        : '[data-property-name="padding"] input',
    )!;
    await act(async () => {
      padding.focus();
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
        padding,
        "14px",
      );
      padding.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await settle();
    expect(document.activeElement).toBe(padding);
    expect(toMjml(current)).toContain(surface === "sidebar" ? "padding:14px" : 'padding="14px"');
    expect(toMjml(current)).not.toContain("example.com/not-saved");
  },
  20_000,
);
