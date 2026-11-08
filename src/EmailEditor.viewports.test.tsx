// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { MonitorIcon } from "@phosphor-icons/react/dist/csr/Monitor";
import { expect, it, vi } from "vitest";
import { EmailEditor } from "./EmailEditor";
import { createEmptyDocument } from "./document";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it("shows a monitor for Desktop and retains named, working viewport controls", async () => {
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 0, 800, 600),
  );
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(<EmailEditor value={createEmptyDocument()} onChange={() => undefined} />),
    );
    const desktop = container.querySelector<HTMLButtonElement>(
      'button[title="Switch to Desktop viewport"]',
    )!;
    const mobile = container.querySelector<HTMLButtonElement>(
      'button[title="Switch to Mobile viewport"]',
    )!;
    expect(desktop).not.toBeNull();
    expect(mobile).not.toBeNull();
    expect(desktop.querySelector("svg")!.outerHTML).toBe(
      renderToStaticMarkup(<MonitorIcon size={16} aria-hidden="true" />),
    );
    expect(mobile.querySelector("svg.lucide-smartphone")).not.toBeNull();
    await act(async () => mobile.click());
    expect(mobile.disabled).toBe(true);
    expect(desktop.disabled).toBe(false);
    await act(async () => desktop.click());
    expect(desktop.disabled).toBe(true);
    expect(mobile.disabled).toBe(false);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});
