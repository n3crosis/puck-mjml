// @vitest-environment happy-dom
import { act, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createUsePuck, type PuckApi } from "@puckeditor/core";
import { afterEach, expect, it, vi } from "vitest";
import { EmailEditor } from "./EmailEditor";
import { fromMjml } from "./import";
import type { EmailDocument } from "./types";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const usePuck = createUsePuck();
let root: Root | undefined;
let container: HTMLDivElement | undefined;
let api: PuckApi;
let value: EmailDocument;

function CaptureApi() {
  const state = usePuck((current) => current);
  useEffect(() => {
    api = state;
  }, [state]);
  return null;
}

function Host() {
  const [document, setDocument] = useState(
    () =>
      fromMjml(`<mjml><mj-body><mj-section><mj-column>
        <mj-text>First block</mj-text><mj-text>Second block</mj-text>
      </mj-column></mj-section></mj-body></mjml>`).document,
  );
  value = document;
  return <EmailEditor value={document} onChange={setDocument} headerActions={<CaptureApi />} />;
}

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("preserves the original document when the first nested drag is echoed before history commits", async () => {
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });
  // Puck only initializes viewport/history state when the iframe has layout.
  // Happy DOM otherwise reports zero width and skips that browser-only path.
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 0, 800, 600),
  );
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(<Host />));
  const initial = api!.appState.data;
  const first = api!.getSelectorForId("text-1")!;
  const second = api!.getSelectorForId("text-2")!;
  expect(first.zone).toBe(second.zone);
  await act(async () => {
    // Puck's native drag end moves first, then records the final UI snapshot.
    api!.dispatch({
      type: "move",
      sourceIndex: first.index,
      sourceZone: first.zone!,
      destinationIndex: second.index,
      destinationZone: second.zone!,
      recordHistory: false,
    });
    api!.dispatch({
      type: "setUi",
      ui: { itemSelector: second, isDragging: false },
      recordHistory: true,
    });
  });
  expect(api!.getSelectorForId("text-1")!.index).toBe(1);
  const moved = value;
  expect(moved).not.toEqual(initial);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 350));
  });
  expect(api!.history.hasPast).toBe(true);
  await act(async () => api!.history.back());
  expect(api!.getSelectorForId("text-1")!.index).toBe(0);
  expect(value).toEqual(initial);
  await act(async () => api!.history.forward());
  expect(api!.getSelectorForId("text-1")!.index).toBe(1);
  expect(value).toEqual(moved);
});
