// @vitest-environment happy-dom
import { act, type ReactNode } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { EmailDocument } from "../src/types";
import { toMjml } from "../src/export";
import { App } from "./main";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const current = vi.hoisted(() => ({ document: undefined as EmailDocument | undefined }));
// Keep the real import dialog and review/serialization path, with a lightweight
// controlled editor host so async workflow tests do not depend on canvas layout.
vi.mock("../src", async () => {
  const { createEmptyDocument } = await import("../src/document");
  return {
    createExampleDocument: createEmptyDocument,
    emailTemplates: [{ id: "blank", group: "", label: "Blank", create: createEmptyDocument }],
    EmailEditor: ({
      value,
      onChange,
      headerActions,
    }: {
      value: EmailDocument;
      onChange: (value: EmailDocument) => void;
      headerActions: ReactNode;
    }) => {
      current.document = value;
      return (
        <>
          {headerActions}
          <input
            aria-label="Test preview"
            value={value.root.props?.previewText ?? ""}
            onChange={(event) =>
              onChange({
                ...value,
                root: {
                  ...value.root,
                  props: { ...value.root.props, previewText: event.target.value },
                },
              })
            }
          />
        </>
      );
    },
  };
});
vi.mock("./DemoWorkspace", () => ({
  DemoWorkspace: ({ children }: { children: ReactNode }) => children,
  demoWorkspacePlugins: [],
}));
// main.tsx still mounts normally in the demo. Only its entry-point mount is
// suppressed here; each test uses a real, independently cleaned-up React root.
vi.mock("react-dom/client", () => ({ createRoot: () => ({ render: () => {} }) }));
const { createRoot } = await vi.importActual<typeof import("react-dom/client")>("react-dom/client");
let container: HTMLDivElement;
let root: Root;
const confirm = vi.fn<() => boolean>();
const source = (text: string, notes = false) =>
  `<mjml><mj-head><mj-preview>${text}</mj-preview>${notes ? "<mj-import-note />" : ""}</mj-head><mj-body><mj-section><mj-column><mj-text>${text}</mj-text></mj-column></mj-section></mj-body></mjml>`;
const button = (name: string) =>
  [...container.querySelectorAll("button")].find((entry) => entry.textContent === name)!;
const click = (name: string) => act(async () => button(name).click());
const serialized = () => toMjml(current.document!);
const status = () => container.querySelector('.demo-status[role="status"]')?.textContent;
async function fill(selector: string, text: string) {
  await act(async () => {
    const input = container.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!;
    const prototype =
      input.tagName === "INPUT" ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function chooseFile(file: File) {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
}
async function beginRead() {
  let resolve!: (source: string) => void;
  let reject!: (reason: Error) => void;
  const reading = new Promise<string>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  const file = new File([], "deferred.mjml");
  Object.defineProperty(file, "text", { value: () => reading });
  await click("Import");
  await chooseFile(file);
  return { resolve, reject };
}

beforeEach(async () => {
  confirm.mockReset().mockReturnValue(true);
  vi.stubGlobal("confirm", confirm);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<App />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it("opens the dialog from Import and announces a successful paste", async () => {
  expect(container.querySelector("dialog")).toBeNull();
  expect(container.querySelector(".demo-notice")).toBeNull();
  await click("Import");
  await fill("textarea", source("Pasted email"));
  await click("Import text");
  expect(serialized()).toContain("Pasted email");
  expect(status()).toBe("Imported MJML text.");
  expect(container.querySelector("dialog")).toBeNull();
  expect(document.activeElement).toBe(button("Import"));
});

it.each(["not MJML", "<mjml><mj-body>", "<mjml><mj-body/>", "<mjml><mj-body></mjml>"])(
  "malformed source preserves the draft and its import notes without prompting to discard: %s",
  async (invalid) => {
    await click("Import");
    await fill("textarea", source("Original import", true));
    await click("Import text");
    await fill('[aria-label="Test preview"]', "Unsaved preview");
    const before = serialized();
    const documentBefore = current.document;
    await click("Import");
    await fill("textarea", invalid);
    await click("Import text");
    expect(serialized()).toBe(before);
    expect(current.document).toBe(documentBefore);
    expect(confirm).not.toHaveBeenCalled();
    expect(container.querySelector('dialog [role="alert"]')?.textContent).toContain(
      "previous email is unchanged",
    );
    expect(container.querySelector("details.demo-status")?.textContent).toContain(
      "Ignored unsupported head element",
    );
  },
);

it.each([false, true])(
  "checks the latest unsaved state after a file read (confirmation %s)",
  async (replace) => {
    confirm.mockReturnValue(replace);
    const read = await beginRead();
    await fill('[aria-label="Test preview"]', "Changed while reading");
    const before = serialized();
    await act(async () => read.resolve(source("Replacement")));
    expect(confirm).toHaveBeenCalledExactlyOnceWith(
      "Discard your unsaved edits and replace this email?",
    );
    if (replace) {
      expect(serialized()).toContain("Replacement");
      expect(serialized()).not.toContain("Changed while reading");
      expect(container.querySelector("dialog")).toBeNull();
    } else {
      expect(serialized()).toBe(before);
      expect(container.querySelector('dialog [role="status"]')?.textContent).toContain(
        "current email is unchanged",
      );
    }
    const beforeUnload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(beforeUnload);
    expect(beforeUnload.defaultPrevented).toBe(!replace);
  },
);

it.each(["success", "failure"])(
  "ignores a dismissed read's late %s after reopening",
  async (outcome) => {
    const before = serialized();
    const read = await beginRead();
    await click("Cancel");
    await click("Import");
    await fill("textarea", "Unfinished new paste");
    await act(async () => {
      if (outcome === "success") read.resolve(source("Cancelled email", true));
      else read.reject(new Error("Late read failure"));
    });
    expect(serialized()).toBe(before);
    expect(status()).toBeUndefined();
    expect(container.querySelector("dialog")?.open).toBe(true);
    expect(container.querySelector("textarea")?.value).toBe("Unfinished new paste");
    expect(container.querySelector('[role="alert"]')).toBeNull();
  },
);

it.each(["success", "failure"])(
  "ignores a superseded read's late %s and preserves the newer notes",
  async (outcome) => {
    const read = await beginRead();
    await fill("textarea", source("Newer email", true));
    await click("Import text");
    const before = serialized();
    const beforeStatus = status();
    await act(async () => {
      if (outcome === "success") read.resolve(source("Older email"));
      else read.reject(new Error("Older failure"));
    });
    expect(serialized()).toBe(before);
    expect(status()).toBe(beforeStatus);
    expect(status()).toContain("with 1 note");
    expect(container.querySelector("details.demo-status")?.textContent).toContain(
      "Ignored unsupported head element",
    );
  },
);
