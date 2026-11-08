// @vitest-environment happy-dom
// @vitest-environment-options {"settings":{"disableCSSFileLoading":true,"enableImageFileLoading":false}}
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createUsePuck } from "@puckeditor/core";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EmailEditor } from "./EmailEditor";
import { createEmptyDocument } from "./document";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const usePuck = createUsePuck();
let rawVisible: boolean | undefined;
function CapturePolicy() {
  const visible = usePuck((state) => state.appState.ui.componentList.Advanced?.visible);
  useEffect(() => {
    rawVisible = visible;
  }, [visible]);
  return null;
}
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {} });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 0, 800, 600),
  );
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("updates host actions, publish callbacks and trust policy without remounting the header", async () => {
  const document = createEmptyDocument();
  const firstAction = vi.fn();
  const secondAction = vi.fn();
  const firstPublish = vi.fn();
  const secondPublish = vi.fn();
  const publishButton = () =>
    [...container.querySelectorAll<HTMLElement>('span[class*="_Button_"]')].find(
      (button) => button.textContent?.trim() === "Publish",
    );
  const render = async (
    label: string,
    action: () => void,
    publish?: () => void,
    allowRawHtml = false,
  ) => {
    await act(async () =>
      root.render(
        <EmailEditor
          value={document}
          onChange={() => {}}
          onPublish={publish}
          allowRawHtml={allowRawHtml}
          headerActions={
            <>
              <CapturePolicy />
              <button data-host-action type="button" onClick={action}>
                {label}
              </button>
            </>
          }
        />,
      ),
    );
    await act(async () => vi.runOnlyPendingTimersAsync());
  };
  await render("First action", firstAction);
  const puck = container.querySelector(".Puck");
  const action = container.querySelector<HTMLButtonElement>("[data-host-action]")!;
  const preview = container.querySelector('[aria-label="Preview email"]');
  const exportButton = container.querySelector('[aria-label="Export email"]');
  action.focus();
  expect(rawVisible).toBe(false);
  expect(publishButton()).toBeUndefined();

  await render("Second action", secondAction, firstPublish, true);
  expect(container.querySelector("[data-host-action]") === action).toBe(true);
  expect(container.ownerDocument.activeElement === action).toBe(true);
  expect(action.textContent).toBe("Second action");
  expect(container.querySelector('[aria-label="Preview email"]') === preview).toBe(true);
  expect(container.querySelector('[aria-label="Export email"]') === exportButton).toBe(true);
  expect(container.querySelector(".Puck") === puck).toBe(true);
  expect(rawVisible).toBe(true);
  await act(async () => action.click());
  expect(secondAction).toHaveBeenCalledOnce();
  expect(firstAction).not.toHaveBeenCalled();
  const publish = publishButton()!;
  expect(publish).toBeDefined();

  await render("Latest action", secondAction, secondPublish, false);
  expect(publishButton() === publish).toBe(true);
  expect(rawVisible).toBe(false);
  await act(async () => publish.click());
  expect(firstPublish).not.toHaveBeenCalled();
  expect(secondPublish).toHaveBeenCalledOnce();
  await render("No publish", secondAction);
  expect(publishButton()).toBeUndefined();
  expect(container.querySelector("[data-host-action]") === action).toBe(true);
});
