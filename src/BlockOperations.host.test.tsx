// @vitest-environment happy-dom
import { act, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useGetPuck, type PuckApi } from "@puckeditor/core";
import { afterEach, expect, it, vi } from "vitest";
import { EmailEditor } from "./EmailEditor";
import { createEmptyDocument } from "./document";
import { fromMjml } from "./import";
import type { EmailDocument } from "./types";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let getPuck: () => PuckApi;
let root: Root | undefined;
let container: HTMLDivElement;
let value: EmailDocument;
let replace: (value: EmailDocument) => void;
const pause = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 300));
  });
function Capture() {
  const get = useGetPuck();
  useEffect(() => {
    getPuck = get;
  }, [get]);
  return null;
}
function Host({ initial }: { initial: EmailDocument }) {
  const [document, setDocument] = useState(initial);
  value = document;
  replace = setDocument;
  return (
    <EmailEditor
      value={document}
      onChange={(next) => setDocument(structuredClone(next))}
      headerActions={<Capture />}
    />
  );
}
afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it.each([false, true])(
  "preserves a real EmailEditor's clone echoes, imported omissions, history, focus and replacement (imported=%s)",
  async (imported) => {
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 0, 800, 600),
    );
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    const initial = imported
      ? fromMjml(
          "<mjml><mj-body><mj-section><mj-column><mj-text>Original</mj-text></mj-column></mj-section></mj-body></mjml>",
        ).document
      : createEmptyDocument();
    await act(async () => root!.render(<Host initial={initial} />));
    const disclosure = container.querySelector(".pm-block-operations")!;
    expect(disclosure.closest('[class*="Header"]')).toBeNull();
    expect(disclosure.parentElement!.querySelector("[data-puck-drawer]")).not.toBeNull();
    const initialState = structuredClone(getPuck().appState.data);
    const config = getPuck().config;
    await act(async () => {
      container.querySelector<HTMLDetailsElement>(".pm-block-operations")!.open = true;
      container.querySelector(".pm-block-operations")!.dispatchEvent(new Event("toggle"));
    });
    const select = container.querySelector<HTMLSelectElement>(
      ".pm-block-operations select:last-of-type",
    )!;
    await act(async () => {
      select.value = "Section1";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const add = container.querySelector<HTMLButtonElement>(".pm-block-operations-add button")!;
    add.focus();
    await act(async () => add.click());
    const id = getPuck().selectedItem!.props.id;
    expect(document.activeElement).toBe(add);
    expect(getPuck().config).toBe(config);
    expect(value).toEqual(getPuck().appState.data);
    await pause();
    await act(async () => getPuck().history.back());
    expect(value).toEqual(initialState);
    await act(async () => getPuck().history.forward());
    expect(getPuck().selectedItem!.props.id).toBe(id);
    expect(document.activeElement).toBe(add);
    await act(async () => {
      const destination = container.querySelector<HTMLSelectElement>(
        ".pm-block-operations select",
      )!;
      destination.value = `${id}:column`;
      destination.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => {
      select.value = "Text";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => add.click());
    const textId = getPuck().selectedItem!.props.id;
    await pause();
    await act(async () => getPuck().history.back());
    expect(getPuck().getItemById(id)!.props.column).toEqual([]);
    await act(async () => getPuck().history.forward());
    expect(getPuck().selectedItem!.props.id).toBe(textId);
    const replacement = createEmptyDocument();
    replacement.root.props!.previewText = "Replacement";
    await act(async () => replace(replacement));
    expect(container.querySelector<HTMLDetailsElement>(".pm-block-operations")!.open).toBe(false);
    expect(getPuck().history.hasPast).toBe(false);
    expect(value).toEqual(replacement);
  },
);

it("does not emit submit events for block actions or intercept explicit host submissions", async () => {
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 0, 800, 600),
  );
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  const submit = vi.fn((event: React.FormEvent) => event.preventDefault());
  const observe = vi.fn();
  await act(async () =>
    root!.render(
      <div onSubmit={observe}>
        <form id="host-save" onSubmit={submit} />
        <EmailEditor
          value={createEmptyDocument()}
          onChange={(next) => {
            value = next;
          }}
          headerActions={
            <>
              <Capture />
              <button type="submit" form="host-save">
                Save email
              </button>
            </>
          }
        />
      </div>,
    ),
  );
  await act(async () => {
    const disclosure = container.querySelector<HTMLDetailsElement>(".pm-block-operations")!;
    disclosure.open = true;
    disclosure.dispatchEvent(new Event("toggle"));
  });
  const panel = container.querySelector(".pm-block-operations")!;
  expect(panel.querySelector("form")).toBeNull();
  const button = (name: string) =>
    Array.from(container.querySelectorAll("button")).find((item) => item.textContent === name)!;
  const add = button("Add block");
  expect(add.type).toBe("button");
  add.focus();
  const initial = structuredClone(getPuck().appState.data);
  await act(async () => add.click());
  expect(getPuck().appState.data).toEqual(initial);
  expect(document.activeElement).toBe(add);
  const select = panel.querySelector<HTMLSelectElement>("select:last-of-type")!;
  await act(async () => {
    select.value = "Section1";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await act(async () => add.click());
  expect(value.root.props!.sections).toHaveLength(1);
  expect(document.activeElement).toBe(add);
  await act(async () => button("Move earlier").click());
  await act(async () => button("Move later").click());
  expect(value.root.props!.sections).toHaveLength(1);
  expect(submit).not.toHaveBeenCalled();
  expect(observe).not.toHaveBeenCalled();
  expect(container.querySelector("form form")).toBeNull();
  await act(async () => button("Save email").click());
  expect(submit).toHaveBeenCalledTimes(1);
  expect(observe).toHaveBeenCalledTimes(1);
});
