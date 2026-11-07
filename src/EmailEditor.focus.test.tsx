// @vitest-environment happy-dom
import { act, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createUsePuck, type PuckApi } from "@puckeditor/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Editor } from "@tiptap/core";
import { fromMjml } from "./import";
import { compileEmail, toMjml } from "./export";
import { EmailEditor } from "./EmailEditor";
import type { EmailDocument } from "./types";
import { pngImageBytes } from "../tests/fixtures/images";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const usePuck = createUsePuck();
beforeEach(() => {
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {} });
});
let root: Root | undefined;
let container: HTMLDivElement | undefined;
let api: PuckApi | undefined;
let value: EmailDocument | undefined;
function CaptureApi() {
  const current = usePuck((state) => state);
  useEffect(() => {
    api = current;
  }, [current]);
  return null;
}
afterEach(async () => {
  try {
    await act(async () => root?.unmount());
  } finally {
    container?.remove();
    root = undefined;
    container = undefined;
    api = undefined;
    value = undefined;
    vi.unstubAllGlobals();
  }
}, 15_000);
function Host({
  initial,
  onPublish,
  onUploadImage,
}: {
  initial?: EmailDocument;
  onPublish?: (value: EmailDocument) => void;
  onUploadImage?: (file: File) => Promise<string>;
}) {
  const [document, setDocument] = useState<EmailDocument>(
    initial ?? {
      root: {
        props: {
          previewText: "Hello world",
          lang: "en",
          backgroundColor: "#123456",
          headStyles: [{ css: ".card{color:red}", inline: "head" }],
          sections: [
            {
              type: "Section1",
              props: {
                id: "section",
                column: [
                  {
                    type: "Table",
                    props: {
                      id: "table",
                      headerRows: [],
                      bodyRows: [{ cells: [{ content: "<p>Hello world</p>" }] }],
                      footerRows: [],
                    },
                  },
                  {
                    type: "Accordion",
                    props: {
                      id: "accordion",
                      items: [{ title: "Question", content: "<p>Hello world</p>" }],
                    },
                  },
                  {
                    type: "Button",
                    props: { id: "button", label: "Hello world", href: "https://example.com" },
                  },
                  {
                    type: "Text",
                    props: {
                      id: "text",
                      content: "<p>Hello world</p>",
                      fontFamily: "Arial",
                      padding: "10px",
                      mjmlAttributes: [{ name: "font-family", value: "Arial" }],
                    },
                  },
                ],
              },
            },
          ],
          bodyAttributes: [{ name: "width", value: "600px" }],
        },
      },
      content: [],
    },
  );
  value = document;
  return (
    <EmailEditor
      value={document}
      onChange={setDocument}
      onPublish={onPublish}
      onUploadImage={onUploadImage}
      allowRawHtml
      headerActions={<CaptureApi />}
    />
  );
}
async function mount(
  initial?: EmailDocument,
  onPublish?: (value: EmailDocument) => void,
  onUploadImage?: (file: File) => Promise<string>,
) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<Host initial={initial} onPublish={onPublish} onUploadImage={onUploadImage} />);
  });
}
const field = (name: string) =>
  [
    ...container!.querySelectorAll<HTMLInputElement>(
      `[data-property-name="${name}"] input:not([type="color"]):not([type="checkbox"])`,
    ),
  ].at(-1)!;
async function insert(element: HTMLInputElement, text: string) {
  const before = element.value;
  const position = element.selectionStart ?? 0;
  const next = before.slice(0, position) + text + before.slice(element.selectionEnd ?? position);
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(element, next);
    element.setSelectionRange(position + text.length, position + text.length);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
  return position + text.length;
}

// The delayed-echo case intentionally waits through nine 375ms debounce windows.
// Leave bounded headroom for the full editor/iframe under parallel CI load;
// the default 5s timeout can interrupt React act and contaminate following cases.
describe("controlled EmailEditor typing", { timeout: 20_000 }, () => {
  it("switches tablet sidebars without remounting the editor or recording history", async () => {
    const originalMatchMedia = window.matchMedia.bind(window);
    const matchMedia = vi.spyOn(window, "matchMedia").mockImplementation((query) => {
      const result = originalMatchMedia(query);
      if (query === "(min-width: 638px) and (max-width: 1000px)") {
        Object.defineProperty(result, "matches", { value: true });
      }
      return result;
    });
    try {
      await mount();
      const initialPuck = container!.querySelector(".Puck");
      const initialHistory = api!.history.index;
      const initialDocument = value;
      expect(api!.appState.ui.leftSideBarVisible).toBe(false);
      expect(api!.appState.ui.rightSideBarVisible).toBe(true);
      await act(async () => {
        api!.dispatch({ type: "setUi", ui: { leftSideBarVisible: true }, recordHistory: false });
      });
      expect(api!.appState.ui.leftSideBarVisible).toBe(true);
      expect(api!.appState.ui.rightSideBarVisible).toBe(false);
      await act(async () => {
        api!.dispatch({ type: "setUi", ui: { rightSideBarVisible: true }, recordHistory: false });
      });
      expect(api!.appState.ui.leftSideBarVisible).toBe(false);
      expect(api!.appState.ui.rightSideBarVisible).toBe(true);
      expect(container!.querySelector(".Puck")).toBe(initialPuck);
      expect(api!.history.index).toBe(initialHistory);
      expect(value).toBe(initialDocument);
    } finally {
      matchMedia.mockRestore();
    }
  });

  it.each(["text", "table", "accordion"])(
    "keeps the %s inline editor and selection through typing echoes",
    async (id) => {
      await mount();
      await act(async () =>
        api!.dispatch({ type: "setUi", ui: { itemSelector: api!.getSelectorForId(id) } }),
      );
      const canvas = () => container!.querySelector("iframe")!.contentDocument!;
      let node: (HTMLElement & { editor?: Editor }) | null = null;
      for (let retry = 0; retry < 20; retry++) {
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 50));
        });
        node = canvas().querySelector(`[data-puck-component="${id}"] [contenteditable="true"]`);
        if (node) break;
      }
      expect(
        node,
        canvas().querySelector(`[data-puck-component="${id}"]`)?.outerHTML,
      ).not.toBeNull();
      const editor = node!.editor!;
      const initialPuck = container!.querySelector(".Puck");
      const initialCanvas = canvas();
      const initialBlock = canvas().querySelector(`[data-puck-component="${id}"]`);
      expect(editor).toBeDefined();
      await act(async () => {
        node!.focus();
        editor.commands.setTextSelection(6);
      });
      for (const part of ["a", "b", "c"]) {
        const position = editor.state.selection.from;
        await act(async () => {
          editor.commands.insertContent(part);
          await new Promise((resolve) => setTimeout(resolve, 250));
        });
        expect(container!.querySelector(".Puck"), "Puck root identity").toBe(initialPuck);
        expect(canvas(), "Canvas document identity").toBe(initialCanvas);
        expect(canvas().querySelector(`[data-puck-component="${id}"]`), "Block identity").toBe(
          initialBlock,
        );
        expect(
          canvas().querySelector(`[data-puck-component="${id}"] [contenteditable="true"]`),
        ).toBe(node);
        expect(canvas().activeElement).toBe(node);
        expect(editor.state.selection.from).toBe(position + part.length);
        const props = api!.getItemById(id)!.props;
        const saved =
          id === "table"
            ? props.bodyRows[0].cells[0].content
            : id === "accordion"
              ? props.items[0].content
              : props.content;
        expect(saved).toBe(editor.getHTML());
      }
    },
  );

  it("retains the plain inline button label and DOM selection", async () => {
    await mount();
    await act(async () =>
      api!.dispatch({ type: "setUi", ui: { itemSelector: api!.getSelectorForId("button") } }),
    );
    const canvas = container!.querySelector("iframe")!.contentDocument!;
    const label = canvas.querySelector<HTMLElement>(
      '[data-puck-component="button"] [contenteditable]',
    )!;
    expect(label).not.toBeNull();
    await act(async () => {
      label.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      label.focus();
      canvas.getSelection()!.collapse(label.firstChild, 5);
    });
    for (const part of ["a", "b", "c"]) {
      const selection = canvas.getSelection()!;
      const caret = selection.focusOffset + part.length;
      await act(async () => {
        const text = label.firstChild as Text;
        text.insertData(selection.focusOffset, part);
        selection.collapse(text, caret);
        label.dispatchEvent(new Event("input", { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 250));
      });
      expect(canvas.querySelector('[data-puck-component="button"] [contenteditable]')).toBe(label);
      expect(canvas.activeElement).toBe(label);
      expect(canvas.getSelection()!.focusOffset).toBe(caret);
      expect(api!.getItemById("button")!.props.label).toBe(label.textContent);
    }
  });

  it("retains focus across delayed echoes in component and native property inputs", async () => {
    await mount();
    await act(async () =>
      api!.dispatch({ type: "setUi", ui: { itemSelector: api!.getSelectorForId("text") } }),
    );
    for (const name of ["fontFamily", "padding", "mjmlAttributes"]) {
      const input = field(name);
      expect(input).not.toBeNull();
      await act(async () => {
        input.focus();
        input.setSelectionRange(1, 1);
      });
      for (const text of ["a", "b", "c"]) {
        const caret = await insert(input, text);
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 375));
        });
        expect(field(name)).toBe(input);
        expect(document.activeElement).toBe(input);
        expect(input.selectionStart).toBe(caret);
      }
    }
  });

  it("retains the input node, focus, and caret while the host echoes each edit", async () => {
    await mount();
    expect(api).toBeDefined();

    const input = field("previewText");
    expect(input).not.toBeNull();
    await act(async () => {
      input.focus();
      input.setSelectionRange(5, 5);
    });
    for (const text of [" a", "b", "c"]) {
      const caret = await insert(input, text);
      expect(field("previewText")).toBe(input);
      expect(document.activeElement).toBe(input);
      expect(input.selectionStart).toBe(caret);
      expect(input.selectionEnd).toBe(caret);
      expect(value!.root.props!.previewText).toBe(input.value);
    }
  });
  it("makes the workspace inert during preview and restores keyboard focus on Escape", async () => {
    await mount();
    const opener = container!.querySelector<HTMLButtonElement>('[aria-label="Preview email"]')!;
    opener.focus();
    await act(async () => opener.click());
    const dialog = container!.querySelector<HTMLDialogElement>("dialog.pm-preview-backdrop")!;
    expect(dialog).not.toBeNull();
    expect(dialog.open).toBe(true);
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(
      container!.querySelector('[aria-label="Preview email"]')!.closest("[inert]"),
    ).not.toBeNull();
    await act(async () =>
      document.activeElement!.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      ),
    );
    expect(container!.querySelector("dialog.pm-preview-backdrop")).toBeNull();
    const restored = container!.querySelector('[aria-label="Preview email"]')!;
    expect(restored.closest("[inert]")).toBeNull();
    expect(document.activeElement).toBe(restored);
  });
  it("exports current edits without remounting Puck or changing document/history", async () => {
    const publish = vi.fn();
    await mount(undefined, publish);
    const initialHistory = api!.history.index;
    await insert(field("previewText"), "Edited ");
    // Establish the baseline after Puck commits this debounced field edit.
    // Otherwise a slower modal/compile can legitimately advance history while
    // it is open, even though the dialog itself never records an edit.
    for (let retry = 0; retry < 80 && api!.history.index === initialHistory; retry++) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 25));
      });
    }
    expect(api!.history.index).toBe(initialHistory + 1);
    const beforeDocument = value;
    const beforeHistory = api!.history.index;
    const beforePuck = container!.querySelector(".Puck");
    const opener = container!.querySelector<HTMLButtonElement>('[aria-label="Export email"]')!;
    expect(opener.previousElementSibling?.getAttribute("aria-label")).toBe("Preview email");
    await act(async () => opener.click());
    const dialog = container!.querySelector<HTMLDialogElement>(
      'dialog[aria-label="Export email"]',
    )!;
    expect(dialog.open).toBe(true);
    expect(opener.closest("[inert]")).not.toBeNull();
    const mjml = [...dialog.querySelectorAll("button")].find(
      (node) => node.textContent === "MJML",
    )!;
    await act(async () => mjml.click());
    expect(dialog.querySelector("textarea")!.value).toBe(
      toMjml(beforeDocument!, { allowRawHtml: true }),
    );
    await act(async () =>
      dialog.querySelector<HTMLButtonElement>('[aria-label="Close export"]')!.click(),
    );
    expect(container!.querySelector('dialog[aria-label="Export email"]')).toBeNull();
    expect(document.activeElement).toBe(opener);
    expect(opener.closest("[inert]")).toBeNull();
    expect(container!.querySelector(".Puck")).toBe(beforePuck);
    expect(api!.history.index).toBe(beforeHistory);
    expect(value).toBe(beforeDocument);
    expect(publish).not.toHaveBeenCalled();
    const publishButton = [
      ...container!.querySelectorAll<HTMLElement>('span[class*="_Button_"]'),
    ].find((node) => node.textContent === "Publish")!;
    expect(publishButton).toBeDefined();
    await act(async () => publishButton.click());
    expect(publish).toHaveBeenCalledExactlyOnceWith(beforeDocument);
  });
  it.each(["Export", "Preview"] as const)(
    "refreshes an open %s when a pending image upload completes",
    async (mode) => {
      const previousSource = "https://example.com/before-upload.png";
      const uploadedSource = "https://example.com/finished-upload.png";
      let finish!: (source: string) => void;
      const upload = vi.fn(
        () =>
          new Promise<string>((resolve) => {
            finish = resolve;
          }),
      );
      const publish = vi.fn();
      await mount(
        {
          root: {
            props: {
              sections: [
                {
                  type: "Section1",
                  props: {
                    id: "upload-section",
                    column: [
                      {
                        type: "Image",
                        props: {
                          id: "async-image",
                          src: previousSource,
                          alt: "Pending upload",
                          width: 160,
                          padding: "10px",
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
          content: [],
        },
        publish,
        upload,
      );
      await act(async () =>
        api!.dispatch({
          type: "setUi",
          ui: { itemSelector: api!.getSelectorForId("async-image") },
        }),
      );
      const input = container!.querySelector<HTMLInputElement>('input[aria-label="Upload image"]')!;
      expect(input).not.toBeNull();
      Object.defineProperty(input, "files", {
        configurable: true,
        value: [new File([pngImageBytes()], "image.png", { type: "image/png" })],
      });
      await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
      expect(upload).toHaveBeenCalledOnce();
      expect(input.disabled).toBe(true);
      const beforePuck = container!.querySelector(".Puck");
      const beforeHistory = api!.history.index;
      const opener = container!.querySelector<HTMLButtonElement>(`[aria-label="${mode} email"]`)!;
      await act(async () => opener.click());
      const dialog = container!.querySelector<HTMLDialogElement>(
        `dialog[aria-label="${mode === "Export" ? "Export email" : "Email preview"}"]`,
      )!;
      const button = (text: string) =>
        [...dialog.querySelectorAll("button")].find((node) => node.textContent?.trim() === text)!;
      const displayedHtml = () =>
        mode === "Export"
          ? (dialog.querySelector("textarea")?.value ?? "")
          : (dialog.querySelector("iframe")?.getAttribute("srcdoc") ?? "");
      const settleUntil = async (condition: () => boolean) => {
        for (let retry = 0; retry < 80 && !condition(); retry++) {
          await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 25));
          });
        }
        expect(condition()).toBe(true);
      };
      await settleUntil(() => displayedHtml().includes(previousSource));
      expect(opener.closest("[inert]")).not.toBeNull();
      if (mode === "Export") {
        await act(async () => button("MJML").click());
        expect(dialog.querySelector("textarea")!.value).toContain(previousSource);
      }
      await act(async () => finish(uploadedSource));
      // Puck's actual field callback changes the document while the editor is
      // inert, and the controlled host echoes that same document back.
      await settleUntil(() => api!.getItemById("async-image")?.props.src === uploadedSource);
      const latest = await compileEmail(value!, { allowRawHtml: true });
      expect(latest.mjml).toContain(uploadedSource);
      expect(latest.mjml).not.toContain(previousSource);
      if (mode === "Export") {
        expect(dialog.querySelector("textarea")!.value).toBe(latest.mjml);
        const blobs: Blob[] = [];
        const filenames: string[] = [];
        const createUrl = vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
          blobs.push(blob as Blob);
          return `blob:pending-upload-${blobs.length}`;
        });
        const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
          this: HTMLAnchorElement,
        ) {
          filenames.push(this.download);
        });
        try {
          await act(async () => button("Download MJML").click());
          await act(async () => button("HTML").click());
          await settleUntil(() => displayedHtml() === latest.html);
          expect(button("Download HTML").disabled).toBe(false);
          await act(async () => button("Download HTML").click());
          expect(filenames).toEqual(["email.mjml", "email.html"]);
          expect(await blobs[0].text()).toBe(latest.mjml);
          expect(await blobs[1].text()).toBe(latest.html);
        } finally {
          createUrl.mockRestore();
          click.mockRestore();
        }
      } else {
        await settleUntil(() => displayedHtml() === latest.html);
        expect(dialog.querySelector("iframe")!.getAttribute("sandbox")).toBe("");
      }
      expect(container!.querySelector(".Puck")).toBe(beforePuck);
      // Field edits join Puck's debounced history, rather than adding a
      // separate dialog entry or clearing earlier edits.
      await settleUntil(() => api!.history.index === beforeHistory + 1);
      expect(publish).not.toHaveBeenCalled();
      await act(async () => button("Close").click());
      expect(document.activeElement).toBe(container!.querySelector(`[aria-label="${mode} email"]`));
      expect(container!.querySelector(".Puck")).toBe(beforePuck);
      expect(api!.history.index).toBe(beforeHistory + 1);
    },
  );
  it.each(["cancel", "backdrop", "button"] as const)(
    "closes the native preview by %s without weakening the email sandbox",
    async (method) => {
      await mount();
      const opener = container!.querySelector<HTMLButtonElement>('[aria-label="Preview email"]')!;
      opener.focus();
      await act(async () => opener.click());
      const dialog = container!.querySelector<HTMLDialogElement>("dialog.pm-preview-backdrop")!;
      expect(dialog.open).toBe(true);
      expect(dialog.querySelector('iframe[title="Rendered email"]')?.getAttribute("sandbox")).toBe(
        "",
      );
      await act(async () => {
        if (method === "cancel") dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
        else if (method === "backdrop")
          dialog.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        else dialog.querySelector<HTMLButtonElement>('[aria-label="Close preview"]')!.click();
      });
      expect(container!.querySelector("dialog.pm-preview-backdrop")).toBeNull();
      expect(document.activeElement).toBe(container!.querySelector('[aria-label="Preview email"]'));
      expect(
        container!.querySelector('[aria-label="Preview email"]')!.closest("[inert]"),
      ).toBeNull();
    },
  );
  it("cancels only backdrop mousedown so native focus cannot override the restored opener", async () => {
    await mount();
    const opener = container!.querySelector<HTMLButtonElement>('[aria-label="Preview email"]')!;
    opener.focus();
    await act(async () => opener.click());
    const dialog = container!.querySelector<HTMLDialogElement>("dialog.pm-preview-backdrop")!;
    for (const target of [
      dialog.querySelector("strong")!,
      dialog.querySelector<HTMLButtonElement>('[aria-label="Close preview"]')!,
    ]) {
      const down = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
      await act(async () => target.dispatchEvent(down));
      // Controls and text selection keep their pointer defaults.
      expect(down.defaultPrevented).toBe(false);
      expect(dialog.open).toBe(true);
      expect(dialog.isConnected).toBe(true);
    }
    const down = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    await act(async () => dialog.dispatchEvent(down));
    // Happy DOM does not implement the browser's post-dispatch focus action.
    // Cancel it before removing the modal; Chromium exercises the full action.
    expect(down.defaultPrevented).toBe(true);
    expect(dialog.isConnected).toBe(false);
    expect(document.activeElement).toBe(opener);
    expect(opener.closest("[inert]")).toBeNull();
  });
  it("edits imported root width and font without leaving stale native omissions", async () => {
    const imported = fromMjml(
      '<mjml><mj-body><mj-section><mj-column><mj-text css-class="root-font">Root font</mj-text></mj-column></mj-section></mj-body></mjml>',
    );
    await mount(imported.document);
    for (const [name, next] of [
      ["width", "420"],
      ["fontFamily", "Georgia"],
    ]) {
      const input = field(name);
      input.focus();
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
          input,
          next,
        );
        input.dispatchEvent(new Event("input", { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 400));
      });
      expect(field(name)).toBe(input);
      expect(document.activeElement).toBe(input);
    }
    const canvas = container!.querySelector("iframe")!.contentDocument!;
    expect(canvas.querySelector<HTMLElement>(".pm-email")!.style.maxWidth).toBe("420px");
    expect(canvas.querySelector<HTMLElement>(".root-font")!.style.fontFamily).toBe("Georgia");
    expect(toMjml(value!)).toContain('width="420px"');
    expect(toMjml(value!)).toContain('font-family="Georgia"');
  });

  it("edits imported inherited styles in the canvas, export and undo without remounting", async () => {
    const imported = fromMjml(
      '<mjml><mj-head><mj-attributes><mj-text font-size="30px" color="#ff0000" /></mj-attributes></mj-head><mj-body><mj-section><mj-column><mj-text css-class="imported-text">Imported text</mj-text></mj-column></mj-section></mj-body></mjml>',
    );
    await mount(imported.document);
    const findText = (node: unknown): string | undefined => {
      if (!node || typeof node !== "object") return;
      const record = node as { type?: string; props?: { id?: string } };
      if (record.type === "Text") return record.props!.id;
      for (const child of Object.values(node)) {
        const id = findText(child);
        if (id) return id;
      }
    };
    const id = findText(imported.document)!;
    await act(async () =>
      api!.dispatch({ type: "setUi", ui: { itemSelector: api!.getSelectorForId(id) } }),
    );
    const canvas = () => container!.querySelector("iframe")!.contentDocument!;
    const text = () => canvas().querySelector<HTMLElement>(".imported-text")!;
    expect(text().style.fontSize).toBe("30px");
    const change = async (name: string, next: string) => {
      const input = field(name);
      input.focus();
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
          input,
          next,
        );
        input.dispatchEvent(new Event("input", { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 400));
      });
      expect(field(name)).toBe(input);
      expect(document.activeElement).toBe(input);
    };
    await change("fontSize", "42");
    expect(text().style.fontSize).toBe("42px");
    expect(toMjml(value!)).toContain('font-size="42px"');
    await change("color", "#123456");
    expect(text().style.fontSize).toBe("42px");
    expect(toMjml(value!)).toContain('color="#123456"');
    await act(async () => api!.history.back());
    expect(text().style.fontSize).toBe("42px");
    await act(async () => api!.history.back());
    expect(text().style.fontSize).toBe("30px");
    await act(async () => api!.history.forward());
    expect(text().style.fontSize).toBe("42px");
    const current = api!.getItemById(id)!;
    const selector = api!.getSelectorForId(id)!;
    await act(async () =>
      api!.dispatch({
        type: "replace",
        destinationIndex: selector.index,
        destinationZone: selector.zone,
        data: {
          ...current,
          props: {
            ...current.props,
            mjmlAttributes: [
              ...(current.props.mjmlAttributes ?? []).filter(
                (entry: { name: string }) => entry.name !== "font-size",
              ),
              { name: "font-size", value: "55px" },
            ],
          },
        },
        recordHistory: true,
      }),
    );
    await change("fontSize", "20");
    expect(text().style.fontSize).toBe("55px");
    expect(toMjml(value!)).toContain('font-size="55px"');
  });
});
