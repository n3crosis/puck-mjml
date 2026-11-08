// @vitest-environment happy-dom
import { act, useLayoutEffect, useState } from "react";
import { createUsePuck, type PuckApi } from "@puckeditor/core";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EmailEditor } from "./EmailEditor";
import { compileEmail } from "./export";
import type { CompiledEmail, EmailDocument } from "./types";

vi.mock("./export", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./export")>()),
  compileEmail: vi.fn(),
}));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const email: EmailDocument = { root: { props: { sections: [] } }, content: [] };
let container: HTMLDivElement;
let root: Root;
let committedSource: string | null | undefined;
let api: PuckApi;
const usePuck = createUsePuck();
function CaptureApi() {
  const state = usePuck((current) => current);
  useLayoutEffect(() => {
    api = state;
  }, [state]);
  return null;
}
function Host({
  allowRawHtml,
  allowLocalImages = false,
  step,
}: {
  allowRawHtml: boolean;
  allowLocalImages?: boolean;
  step: number;
}) {
  const [value, setValue] = useState(email);
  // Check the committed DOM before passive compilation effects can clear it.
  useLayoutEffect(() => {
    committedSource = container
      .querySelector("iframe[title='Rendered email']")
      ?.getAttribute("srcdoc");
  }, [allowRawHtml, allowLocalImages, step, value]);
  return (
    <EmailEditor
      value={value}
      onChange={setValue}
      allowRawHtml={allowRawHtml}
      allowLocalImages={allowLocalImages}
      headerActions={<CaptureApi />}
    />
  );
}
function pending() {
  let resolve!: (result: CompiledEmail) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<CompiledEmail>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
const result = (html: string): CompiledEmail => ({ mjml: "", html, errors: [] });
const frame = () => container.querySelector<HTMLIFrameElement>('iframe[title="Rendered email"]');
const click = (label: string) =>
  container.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!.click();
beforeEach(() => {
  vi.mocked(compileEmail).mockReset();
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it.each(["allowRawHtml", "allowLocalImages", "live document"] as const)(
  "invalidates preview HTML before committing changes to %s and ignores older completions",
  async (change) => {
    const first = pending();
    const second = pending();
    const latest = pending();
    vi.mocked(compileEmail)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
      .mockReturnValueOnce(latest.promise);
    const update = async (step: number) => {
      await act(async () => {
        if (change === "live document") {
          // Pending asynchronous edits (such as uploads) can finish while the
          // workspace is inert. Exercise the real Puck-to-host echo path.
          api.dispatch({
            type: "setData",
            data: (previous) => ({
              ...previous,
              root: {
                ...previous.root,
                props: { ...previous.root.props, subject: `Draft ${step}` },
              },
            }),
          });
        } else {
          root.render(
            <Host
              allowRawHtml={change !== "allowRawHtml" || step === 2}
              allowLocalImages={change !== "allowLocalImages" || step === 2}
              step={step}
            />,
          );
        }
      });
    };
    await act(async () => root.render(<Host allowRawHtml allowLocalImages step={0} />));
    await act(async () => click("Preview email"));
    await act(async () => first.resolve(result("Previous HTML")));
    expect(frame()?.srcdoc).toBe("Previous HTML");
    await update(1);
    expect(committedSource).toBeUndefined();
    expect(frame()).toBeNull();
    expect(compileEmail).toHaveBeenLastCalledWith(
      change === "live document" ? api.appState.data : email,
      {
        allowRawHtml: change !== "allowRawHtml",
        allowLocalImages: change !== "allowLocalImages",
      },
    );
    await update(2);
    expect(committedSource).toBeUndefined();
    await act(async () => latest.resolve(result("Latest HTML")));
    await act(async () => second.resolve(result("Outdated HTML")));
    expect(frame()?.srcdoc).toBe("Latest HTML");
    expect(frame()?.getAttribute("sandbox")).toBe("");
  },
);

it("does not reuse a closed preview's result or late failure when reopened", async () => {
  const first = pending();
  const dismissed = pending();
  const reopened = pending();
  vi.mocked(compileEmail)
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(dismissed.promise)
    .mockReturnValueOnce(reopened.promise);
  await act(async () => root.render(<Host allowRawHtml={false} step={0} />));
  await act(async () => click("Preview email"));
  await act(async () => first.resolve(result("Previous preview")));
  await act(async () => click("Close preview"));
  await act(async () => {
    click("Preview email");
    root.render(<Host allowRawHtml={false} step={1} />);
  });
  expect(committedSource).toBeUndefined();
  await act(async () => click("Close preview"));
  await act(async () => click("Preview email"));
  await act(async () => dismissed.reject(new Error("Dismissed failure")));
  expect(container.querySelector('[role="alert"]')).toBeNull();
  expect(frame()).toBeNull();
  await act(async () => reopened.resolve(result("Reopened preview")));
  expect(frame()?.srcdoc).toBe("Reopened preview");
});
