// @vitest-environment happy-dom
import { act, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { createEmptyDocument } from "../src/document";
import { DemoWorkspace } from "./DemoWorkspace";

vi.mock("./EmailCompatibility", () => ({
  EmailCompatibility: ({ active }: { active: boolean }) => <p>Checks {String(active)}</p>,
}));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
it("keeps editor state mounted while navigating tabs by mouse and keyboard", async () => {
  const mount = vi.fn();
  function Editor() {
    const [count, setCount] = useState(0);
    useEffect(() => {
      mount();
    }, []);
    return (
      <button type="button" onClick={() => setCount(count + 1)}>
        Edits {count}
      </button>
    );
  }
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(
        <DemoWorkspace document={createEmptyDocument()}>
          <Editor />
        </DemoWorkspace>,
      ),
    );
    const tabs = container.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    const edit = container.querySelector<HTMLButtonElement>('[role="tabpanel"] button')!;
    await act(async () => edit.click());
    await act(async () => tabs[1]!.click());
    expect(container.querySelector('[role="tabpanel"]')?.hasAttribute("hidden")).toBe(true);
    expect(container.querySelector('[role="tabpanel"] button')).toBe(edit);
    expect(tabs[1]?.getAttribute("aria-selected")).toBe("true");
    await act(async () =>
      tabs[1]!.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true })),
    );
    expect(document.activeElement).toBe(tabs[0]);
    expect(edit.textContent).toBe("Edits 1");
    expect(mount).toHaveBeenCalledTimes(1);
    await act(async () =>
      tabs[0]!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })),
    );
    expect(document.activeElement).toBe(tabs[1]);
    expect(tabs[0]?.tabIndex).toBe(-1);
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
