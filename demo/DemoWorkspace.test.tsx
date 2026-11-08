// @vitest-environment happy-dom
import { act, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createUsePuck, type PuckApi } from "@puckeditor/core";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fromMjml } from "../src/import";
import { EmailEditor } from "../src/EmailEditor";
import { DemoWorkspace, demoWorkspacePlugins } from "./DemoWorkspace";
import type { EmailDocument } from "../src/types";

const { compatibility } = vi.hoisted(() => ({ compatibility: vi.fn() }));
vi.mock("./EmailCompatibility", () => ({
  EmailCompatibility: (props: { active: boolean; document: EmailDocument }) => {
    compatibility(props);
    return <p>Checks {String(props.active)}</p>;
  },
}));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const usePuck = createUsePuck();
let api: PuckApi;
let current: EmailDocument;
let container: HTMLDivElement;
let root: Root;
function Capture() {
  const state = usePuck((value) => value);
  useEffect(() => {
    api = state;
  }, [state]);
  return null;
}
function Host() {
  const [document, setDocument] = useState(
    () =>
      fromMjml(
        "<mjml><mj-body><mj-section><mj-column><mj-text>Original</mj-text></mj-column></mj-section></mj-body></mjml>",
      ).document,
  );
  current = document;
  return (
    <DemoWorkspace document={document}>
      <EmailEditor
        value={document}
        onChange={setDocument}
        plugins={demoWorkspacePlugins}
        headerActions={<Capture />}
      />
    </DemoWorkspace>
  );
}
const button = (name: string) =>
  container.querySelector<HTMLButtonElement>(`.demo-plugin-button[aria-label="${name}"]`)!;
const key = async (name: string, key: string) =>
  act(async () => button(name).dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })));
beforeEach(async () => {
  compatibility.mockClear();
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 0, 800, 600),
  );
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<Host />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("places Compatibility beside native Blocks/Outline without a second workspace tab row and loads only on activation", async () => {
  const nav = button("Blocks").closest("nav");
  expect(nav).not.toBeNull();
  expect(button("Outline").closest("nav")).toBe(nav);
  expect(button("Compatibility").closest("nav")).toBe(nav);
  expect(container.querySelector(".demo-workspace-tabs")).toBeNull();
  expect(compatibility).not.toHaveBeenCalled();
  await act(async () => button("Compatibility").click());
  expect(button("Compatibility").getAttribute("aria-pressed")).toBe("true");
  expect(compatibility).toHaveBeenLastCalledWith(
    expect.objectContaining({ active: true, document: current, debounceMs: 200 }),
  );
  const controlled = document.getElementById(
    button("Compatibility").getAttribute("aria-controls")!,
  );
  expect(controlled?.getAttribute("aria-label")).toBe("Compatibility panel");
  expect(controlled?.hidden).toBe(false);
});
it("navigates native plugin controls by arrows, Home and End, and restores focus on Escape", async () => {
  await key("Blocks", "ArrowRight");
  expect(document.activeElement).toBe(button("Outline"));
  expect(api.appState.ui.plugin.current).toBe("outline");
  await key("Outline", "End");
  expect(document.activeElement).toBe(button("Compatibility"));
  expect(api.appState.ui.plugin.current).toBe("compatibility");
  const panel = container.querySelector<HTMLElement>('[aria-label="Compatibility panel"]')!;
  await act(async () =>
    panel.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, isComposing: true }),
    ),
  );
  expect(api.appState.ui.leftSideBarVisible).toBe(true);
  await act(async () =>
    panel.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })),
  );
  expect(api.appState.ui.leftSideBarVisible).toBe(false);
  expect(document.activeElement).toBe(button("Compatibility"));
  await key("Compatibility", "Home");
  expect(document.activeElement).toBe(button("Blocks"));
  expect(api.appState.ui.leftSideBarVisible).toBe(true);
});
it("preserves the canvas, live document and real undo/redo history across plugin changes", async () => {
  const puck = container.querySelector(".Puck"),
    iframe = container.querySelector("iframe");
  const original = structuredClone(api.appState.data);
  const selector = api.getSelectorForId("text-1")!,
    item = api.getItemById("text-1")!;
  await act(async () =>
    api.dispatch({
      type: "replace",
      destinationIndex: selector.index,
      destinationZone: selector.zone,
      data: { ...item, props: { ...item.props, content: "<p>Edited</p>" } },
      recordHistory: true,
    }),
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 350));
  });
  expect(api.history.hasPast).toBe(true);
  const index = api.history.index;
  await act(async () => button("Compatibility").click());
  expect(compatibility).toHaveBeenLastCalledWith(
    expect.objectContaining({ document: current, active: true }),
  );
  await key("Compatibility", "Home");
  expect(api.history.index).toBe(index);
  expect(container.querySelector(".Puck")).toBe(puck);
  expect(container.querySelector("iframe")).toBe(iframe);
  await act(async () => api.history.back());
  expect(current).toEqual(original);
  await act(async () => api.history.forward());
  expect(api.getItemById("text-1")?.props.content).toBe("<p>Edited</p>");
});

it("keeps the active sidebar's analysis input current as the canvas document changes", async () => {
  await act(async () => button("Compatibility").click());
  const before = current;
  const selector = api.getSelectorForId("text-1")!,
    item = api.getItemById("text-1")!;
  await act(async () =>
    api.dispatch({
      type: "replace",
      destinationIndex: selector.index,
      destinationZone: selector.zone,
      data: { ...item, props: { ...item.props, content: "<p>Live edit</p>" } },
      recordHistory: false,
    }),
  );
  expect(current).not.toBe(before);
  expect(compatibility).toHaveBeenLastCalledWith(
    expect.objectContaining({ document: current, active: true }),
  );
  await act(async () => button("Outline").click());
  expect(compatibility).toHaveBeenLastCalledWith(
    expect.objectContaining({ document: current, active: false }),
  );
});
