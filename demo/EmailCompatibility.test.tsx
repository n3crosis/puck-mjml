// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EmailCompatibility } from "./EmailCompatibility";
import { createEmptyDocument } from "../src/document";
import type { CompiledEmail, EmailDocument } from "../src/types";

const { compile } = vi.hoisted(() => ({ compile: vi.fn() }));
vi.mock("../src/export", () => ({ compileEmail: compile }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let container: HTMLDivElement;
let root: Root;
const result = (html: string): CompiledEmail => ({ html, mjml: "<mjml/>", errors: [] });
const pending = () => {
  let resolve!: (value: CompiledEmail) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<CompiledEmail>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const render = async (document: EmailDocument, active = true) =>
  act(async () =>
    root.render(<EmailCompatibility document={document} active={active} allowLocalImages />),
  );
const button = (text: string) =>
  [...container.querySelectorAll<HTMLButtonElement>("button")].find(
    (item) => item.textContent === text,
  )!;
beforeEach(() => {
  compile.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
it("shows real support notes and test dates, never an inbox-rendering guarantee", async () => {
  compile.mockResolvedValue(result('<p style="border-radius:10px">Example</p>'));
  await render(createEmptyDocument());
  expect(compile).toHaveBeenCalledWith(expect.anything(), { allowLocalImages: true });
  expect(container.textContent).toContain("not a rendering test");
  expect(container.textContent).toContain("Not supported");
  expect(container.textContent).toContain("2019");
  expect(container.textContent).toContain("VML");
  expect(
    container.querySelector('a[href="https://www.caniemail.com/features/css-border-radius/"]'),
  ).toBeTruthy();
});
it("filters to a client and separates detected features from the browse catalog", async () => {
  compile.mockResolvedValue(result('<p style="border-radius:10px">Example</p>'));
  await render(createEmptyDocument());
  await act(async () => {
    const select = container.querySelector("select")!;
    select.value = "apple-mail/macos";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(container.textContent).toContain("No matching features.");
  await act(async () =>
    container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click(),
  );
  expect(container.querySelector(".compatibility-feature")?.textContent).toContain("Supported");
  await act(async () => button("Browse 56 checks").click());
  expect(container.querySelectorAll(".compatibility-feature")).toHaveLength(56);
  expect(container.textContent).toContain("Catalog entries are not necessarily present");
});
it("discards old compilation when document replacement wins the race", async () => {
  const old = pending(),
    next = pending();
  compile.mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
  await render(createEmptyDocument());
  await render(createEmptyDocument());
  await act(async () => next.resolve(result('<div style="display:grid"></div>')));
  expect(container.querySelector(".compatibility-feature")?.textContent).toContain("display:grid");
  await act(async () => old.resolve(result('<p style="border-radius:9px"></p>')));
  expect(container.querySelector(".compatibility-feature")?.textContent).toContain("display:grid");
  expect(container.querySelector(".compatibility-feature")?.textContent).not.toContain(
    "border-radius",
  );
});
it("immediately hides results for the previous email while its replacement compiles", async () => {
  compile.mockResolvedValueOnce(result('<p style="border-radius:9px"></p>'));
  await render(createEmptyDocument());
  compile.mockReturnValue(pending().promise);
  await render(createEmptyDocument());
  expect(container.querySelectorAll(".compatibility-feature")).toHaveLength(0);
  expect(container.textContent).toContain("Compiling and inspecting");
});
it("reports failures and retries without changing the document", async () => {
  compile
    .mockRejectedValueOnce(new Error("Invalid MJML"))
    .mockResolvedValueOnce(result('<div style="display:flex"></div>'));
  const document = createEmptyDocument();
  await render(document);
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("Invalid MJML");
  await act(async () => button("Retry analysis").click());
  expect(container.querySelector('[role="alert"]')).toBeNull();
  expect(container.textContent).toContain("display:flex");
  expect(compile.mock.calls[1]?.[0]).toBe(document);
});
it("does not compile until the tab is active and cancels hidden-tab results", async () => {
  const document = createEmptyDocument(),
    task = pending();
  compile.mockReturnValue(task.promise);
  await render(document, false);
  expect(compile).not.toHaveBeenCalled();
  await render(document, true);
  expect(compile).toHaveBeenCalledTimes(1);
  await render(document, false);
  await act(async () => task.resolve(result('<div style="display:grid"></div>')));
  expect(container.querySelectorAll(".compatibility-feature")).toHaveLength(0);
});

it("renders complete client caveats as stacked records without a wide table", async () => {
  compile.mockResolvedValue(result('<p style="border-radius:10px">Example</p>'));
  await render(createEmptyDocument());
  expect(container.querySelector("table")).toBeNull();
  const record = container.querySelector(".compatibility-client-result")!;
  expect([...record.querySelectorAll("dt")].map((item) => item.textContent)).toEqual([
    "Client",
    "Recorded version / date",
    "Support",
    "Caveats",
  ]);
  expect(record.textContent).toContain("2019");
  expect(record.textContent).toContain("Round corners can be used in VML");
});

it("debounces live sidebar edits and cancels a pending check when the sidebar closes", async () => {
  vi.useFakeTimers();
  try {
    compile.mockResolvedValue(result('<div style="display:flex"></div>'));
    const first = createEmptyDocument(),
      second = createEmptyDocument();
    await act(async () => root.render(<EmailCompatibility document={first} debounceMs={200} />));
    await act(async () => vi.advanceTimersByTimeAsync(100));
    await act(async () => root.render(<EmailCompatibility document={second} debounceMs={200} />));
    await act(async () => vi.advanceTimersByTimeAsync(199));
    expect(compile).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(compile).toHaveBeenCalledTimes(1);
    expect(compile.mock.calls[0]?.[0]).toBe(second);
    const third = createEmptyDocument();
    await act(async () => root.render(<EmailCompatibility document={third} debounceMs={200} />));
    expect(container.querySelectorAll(".compatibility-feature")).toHaveLength(0);
    await act(async () =>
      root.render(<EmailCompatibility document={third} debounceMs={200} active={false} />),
    );
    await act(async () => vi.advanceTimersByTimeAsync(250));
    expect(compile).toHaveBeenCalledTimes(1);
  } finally {
    vi.useRealTimers();
  }
});
