// @vitest-environment happy-dom
// @vitest-environment-options {"settings":{"disableCSSFileLoading":true,"enableImageFileLoading":false}}
import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { App } from "./main";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
// Suppress only the demo entry-point mount. Exercise the actual App, Puck
// header override, and modal; the small workflow host cannot expose remounts.
vi.mock("react-dom/client", () => ({ createRoot: () => ({ render: () => {} }) }));
const { createRoot } = await vi.importActual<typeof import("react-dom/client")>("react-dom/client");
let container: HTMLDivElement;
let root: Root;
const trigger = () => container.querySelector<HTMLButtonElement>(".demo-import")!;
const modal = () => container.querySelector<HTMLDialogElement>(".demo-import-backdrop");
async function settle() {
  await act(async () => vi.runOnlyPendingTimersAsync());
}
async function dismiss(action: "Cancel" | "Close" | "Escape") {
  await act(async () => {
    if (action === "Escape") {
      modal()!
        .querySelector("textarea")!
        .dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
        );
    } else {
      [...modal()!.querySelectorAll("button")]
        .find((button) => button.textContent === action)!
        .click();
    }
  });
  await settle();
}
beforeEach(async () => {
  vi.useFakeTimers();
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {} });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response('@font-face { font-family: "Inter"; src: local("Arial"); }')),
  );
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 0, 800, 600),
  );
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<App />));
  await settle();
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  document.querySelector("[data-test-focus-destination]")?.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it.each(["Cancel", "Close", "Escape"] as const)(
  "retains the real Puck Import control and restores focus after %s",
  async (action) => {
    for (let round = 0; round < 2; round++) {
      const opener = trigger();
      opener.focus();
      await act(async () => opener.click());
      await settle();
      expect(modal()?.open).toBe(true);
      expect(trigger() === opener).toBe(true);
      await dismiss(action);
      expect(modal()).toBeNull();
      expect(trigger() === opener).toBe(true);
      expect(document.activeElement === trigger()).toBe(true);
    }
  },
);

it("restores focus to the current Import control after successful source replacement", async () => {
  await act(async () => trigger().click());
  await settle();
  const beforeReplacement = { trigger: trigger(), puck: container.querySelector(".Puck") };
  await act(async () => {
    const field = modal()!.querySelector("textarea")!;
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(
      field,
      "<mjml><mj-body><mj-section><mj-column><mj-text>New email</mj-text></mj-column></mj-section></mj-body></mjml>",
    );
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => modal()!.querySelector<HTMLButtonElement>('[type="submit"]')!.click());
  await settle();
  expect(modal()).toBeNull();
  expect(container.querySelector('.demo-status[role="status"]')?.textContent).toBe(
    "Imported MJML text.",
  );
  // The new document must have finished the editorKey reconciliation. This
  // checks the replacement control, not the still-mounted pre-import header.
  expect(container.querySelector(".Puck") === beforeReplacement.puck).toBe(false);
  expect(trigger() === beforeReplacement.trigger).toBe(false);
  expect(beforeReplacement.trigger.isConnected).toBe(false);
  expect(container.querySelector<HTMLSelectElement>('[aria-label="Email template"]')?.value).toBe(
    "imported",
  );
  expect(document.activeElement === trigger()).toBe(true);
});

it.each([false, true])(
  "handles async replacement focus without stealing another control's focus (moved=%s)",
  async (moved) => {
    await act(async () => trigger().click());
    await settle();
    const beforeReplacement = { trigger: trigger(), puck: container.querySelector(".Puck") };
    let finish!: (source: string) => void;
    const file = new File([], "delayed-success.mjml");
    Object.defineProperty(file, "text", {
      value: () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    });
    await act(async () => {
      const input = modal()!.querySelector<HTMLInputElement>('input[type="file"]')!;
      Object.defineProperty(input, "files", { value: [file] });
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await settle();
    expect(modal()?.open).toBe(true);
    const destination = document.createElement("button");
    destination.dataset.testFocusDestination = "true";
    destination.textContent = "Another host control";
    document.body.append(destination);
    // A host may move focus when the dialog returns it. The subsequent Puck
    // replacement must not reclaim focus that another control now owns.
    if (moved)
      beforeReplacement.trigger.addEventListener("focus", () => destination.focus(), {
        once: true,
      });
    await act(async () =>
      finish(
        "<mjml><mj-body><mj-section><mj-column><mj-text>Asynchronous replacement</mj-text></mj-column></mj-section></mj-body></mjml>",
      ),
    );
    await settle();
    expect(modal()).toBeNull();
    expect(container.querySelector('.demo-status[role="status"]')?.textContent).toBe(
      "Imported delayed-success.mjml.",
    );
    expect(container.querySelector(".Puck") === beforeReplacement.puck).toBe(false);
    expect(trigger() === beforeReplacement.trigger).toBe(false);
    expect(beforeReplacement.trigger.isConnected).toBe(false);
    expect(document.activeElement === (moved ? destination : trigger())).toBe(true);
  },
);
