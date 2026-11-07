// @vitest-environment happy-dom
// @vitest-environment-options {"settings":{"disableCSSFileLoading":true,"enableImageFileLoading":false}}
import { act, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createUsePuck, type PuckApi } from "@puckeditor/core";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EmailEditor } from "../src/EmailEditor";
import { createEmptyDocument, createExampleDocument } from "../src/document";
import { toMjml } from "../src/export";
import type { EmailDocument } from "../src/types";
import { documentSnapshot, hasUnsavedChanges, reviewImport } from "./import-review";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const usePuck = createUsePuck();
let root: Root | undefined;
let container: HTMLDivElement | undefined;
let api: PuckApi | undefined;
let current: EmailDocument;

function CaptureApi() {
  const value = usePuck((state) => state);
  useEffect(() => {
    api = value;
  }, [value]);
  return null;
}

function Host({ initial }: { initial: EmailDocument }) {
  const [value, setValue] = useState(initial);
  current = value;
  return <EmailEditor value={value} onChange={setValue} headerActions={<CaptureApi />} />;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {} });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response('@font-face { font-family: "Inter"; src: local("Arial"); }')),
  );
});

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  api = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it.each([
  ["blank", createEmptyDocument],
  ["example template", createExampleDocument],
  [
    "imported",
    () =>
      reviewImport(
        "<mjml><mj-head><mj-preview>Original preview</mj-preview></mj-head><mj-body><mj-section><mj-column><mj-text>Hello</mj-text></mj-column></mj-section></mj-body></mjml>",
      ).document,
  ],
] as const)(
  "recognizes the clean document after editing and undoing a %s email",
  async (_name, create) => {
    const initial = create();
    const baseline = documentSnapshot(initial);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root!.render(<Host initial={initial} />));
    await act(async () => vi.runOnlyPendingTimersAsync());
    const preview = () =>
      container!.querySelector<HTMLInputElement>('[data-property-name="previewText"] input')!;
    const initialPreview = initial.root.props!.previewText ?? "";
    expect(preview().value).toBe(initialPreview);
    expect(hasUnsavedChanges(current, baseline)).toBe(false);
    const editorBaseline = structuredClone(api!.appState.data) as EmailDocument;
    expect(documentSnapshot(editorBaseline)).toBe(baseline);

    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
        preview(),
        "An unsaved draft",
      );
      preview().dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(hasUnsavedChanges(current, baseline)).toBe(true);
    await act(async () => vi.runOnlyPendingTimersAsync());
    expect(api!.history.hasPast).toBe(true);
    await act(async () => api!.history.back());
    expect(preview().value).toBe(initialPreview);
    expect(current).toEqual(editorBaseline);
    expect(toMjml(current)).toBe(toMjml(editorBaseline));
    expect(hasUnsavedChanges(current, baseline)).toBe(false);
    await act(async () => api!.history.forward());
    expect(preview().value).toBe("An unsaved draft");
    expect(hasUnsavedChanges(current, baseline)).toBe(true);
  },
  10_000,
);
