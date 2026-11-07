// @vitest-environment happy-dom
import { act, useEffect, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Puck, createUsePuck, type CustomField, type PuckApi } from "@puckeditor/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEmailConfig } from "./config";
import { nativeAttributeField, nativeRootFields, optionalHtmlField } from "./NativeFields";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const usePuck = createUsePuck();
let root: Root | undefined;
let container: HTMLDivElement | undefined;
let api: PuckApi;
function Capture() {
  const state = usePuck((value) => value);
  useEffect(() => {
    api = state;
  }, [state]);
  return null;
}
beforeEach(() => vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {} }));
afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  vi.unstubAllGlobals();
});
async function mountDuplicates(field: CustomField<unknown>, name: string, value: unknown) {
  const config = createEmailConfig(undefined, true);
  const changed = [vi.fn(), vi.fn()];
  const copies = (source: unknown): ReactNode => (
    <Puck
      config={config}
      data={{
        root: { props: {} },
        content: [
          {
            type: "Accordion",
            props: {
              id: "accordion",
              items: [{ title: "Question", content: "Answer", children: [] }],
            },
          },
        ],
      }}
      iframe={{ enabled: false }}
    >
      <Capture />
      {changed.map((onChange, index) => (
        <div key={index} hidden={index === 0} data-field-copy={index}>
          {field.render({ id: "repeated-field", name, field, value: source, onChange })}
        </div>
      ))}
    </Puck>
  );
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(copies(value)));
  await act(async () =>
    api.dispatch({ type: "setUi", ui: { itemSelector: api.getSelectorForId("accordion") } }),
  );
  return {
    changed,
    wrappers: () => [...container!.querySelectorAll<HTMLElement>("[data-field-copy]")],
    rerender: async (source = value) => act(async () => root!.render(copies(source))),
  };
}

describe("custom field instance associations", () => {
  it.each([false, true])(
    "keeps optional source labels attached to their own instance (multiline=%s)",
    async (multiline) => {
      const field = (
        multiline ? optionalHtmlField(true) : nativeRootFields(true).breakpointWidth
      ) as CustomField<unknown>;
      const { changed, wrappers, rerender } = await mountDuplicates(
        field,
        "source",
        "Initial source",
      );
      const ids = wrappers().map((wrapper) => {
        const label = wrapper.querySelector<HTMLLabelElement>(".pm-field-toggle")!;
        const checkbox = label.querySelector<HTMLInputElement>("input")!;
        expect(document.getElementById(label.htmlFor)).toBe(checkbox);
        return checkbox.id;
      });
      expect(new Set(ids).size).toBe(2);
      const before = api.appState.data;
      await act(async () =>
        wrappers()[1].querySelector<HTMLLabelElement>(".pm-field-toggle")!.click(),
      );
      expect(changed[0]).not.toHaveBeenCalled();
      expect(changed[1]).toHaveBeenCalledTimes(1);
      expect(changed[1].mock.calls[0][0]).toBeUndefined();
      await rerender("Host source");
      expect(
        wrappers().map(
          (wrapper) => wrapper.querySelector<HTMLInputElement>('input[type="checkbox"]')!.id,
        ),
      ).toEqual(ids);
      expect(api.appState.data).toEqual(before);
      expect(api.history.hasPast).toBe(false);
    },
  );

  it("keeps ordered-child labels local without changing document paths or history", async () => {
    const items = createEmailConfig(undefined, true).components.Accordion.fields!.items;
    if (items.type !== "array" || !("arrayFields" in items))
      throw new Error("Expected accordion array");
    const field = items.arrayFields.children as CustomField<unknown>;
    const { changed, wrappers, rerender } = await mountDuplicates(field, "items[0].children", []);
    const ids = wrappers().map((wrapper) => {
      const label = wrapper.querySelector<HTMLLabelElement>(".pm-field-toggle")!;
      const checkbox = label.querySelector<HTMLInputElement>("input")!;
      expect(document.getElementById(label.htmlFor)).toBe(checkbox);
      return checkbox.id;
    });
    expect(new Set(ids).size).toBe(2);
    await act(async () =>
      wrappers()[1].querySelector<HTMLLabelElement>(".pm-field-toggle")!.click(),
    );
    expect(changed[0]).not.toHaveBeenCalled();
    expect(changed[1]).toHaveBeenCalledTimes(1);
    expect(changed[1].mock.calls[0][0]).toBeUndefined();
    await rerender();
    expect(
      wrappers().map(
        (wrapper) => wrapper.querySelector<HTMLInputElement>('input[type="checkbox"]')!.id,
      ),
    ).toEqual(ids);
    expect(api.getItemById("accordion")!.props.items[0].children).toEqual([]);
    expect(api.history.hasPast).toBe(false);
  });

  it("keeps native-attribute group labels associated with the local rendered instance", async () => {
    const field = nativeAttributeField("mj-text") as CustomField<unknown>;
    const { wrappers, rerender, changed } = await mountDuplicates(field, "mjmlAttributes", []);
    const ids = wrappers().map((wrapper) => {
      const group = wrapper.querySelector<HTMLElement>("[aria-labelledby]")!;
      const label = document.getElementById(group.getAttribute("aria-labelledby")!)!;
      expect(wrapper.contains(label)).toBe(true);
      return label.id;
    });
    expect(new Set(ids).size).toBe(2);
    await rerender();
    expect(
      wrappers().map((wrapper) =>
        wrapper.querySelector("[aria-labelledby]")!.getAttribute("aria-labelledby"),
      ),
    ).toEqual(ids);
    expect(changed.every((callback) => callback.mock.calls.length === 0)).toBe(true);
    expect(api.history.hasPast).toBe(false);
  });
});

it("enables an optional empty source through only the visible instance label", async () => {
  const field = optionalHtmlField(true) as CustomField<unknown>;
  const { changed, wrappers, rerender } = await mountDuplicates(field, "htmlContent", undefined);
  expect(wrappers().every((wrapper) => wrapper.querySelector("textarea") === null)).toBe(true);
  expect(changed.every((callback) => callback.mock.calls.length === 0)).toBe(true);
  await act(async () => wrappers()[1].querySelector<HTMLLabelElement>(".pm-field-toggle")!.click());
  expect(changed[0]).not.toHaveBeenCalled();
  expect(changed[1]).toHaveBeenCalledExactlyOnceWith("");
  await rerender("");
  for (const wrapper of wrappers()) {
    expect(wrapper.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(true);
    expect(wrapper.querySelector<HTMLTextAreaElement>("textarea")!.value).toBe("");
  }
  expect(api.history.hasPast).toBe(false);
});
