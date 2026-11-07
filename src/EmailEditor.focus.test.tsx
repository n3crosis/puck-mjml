// @vitest-environment happy-dom
import { act, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createUsePuck, type PuckApi } from "@puckeditor/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Editor } from "@tiptap/core";
import { fromMjml } from "./import";
import { toMjml } from "./export";
import { EmailEditor } from "./EmailEditor";
import type { EmailDocument } from "./types";

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
function Host({ initial }: { initial?: EmailDocument }) {
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
      allowRawHtml
      headerActions={<CaptureApi />}
    />
  );
}
async function mount(initial?: EmailDocument) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<Host initial={initial} />);
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
    const dialog = container!.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(dialog).not.toBeNull();
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(
      container!.querySelector('[aria-label="Preview email"]')!.closest("[inert]"),
    ).not.toBeNull();
    await act(async () =>
      document.activeElement!.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      ),
    );
    expect(container!.querySelector('[role="dialog"]')).toBeNull();
    const restored = container!.querySelector('[aria-label="Preview email"]')!;
    expect(restored.closest("[inert]")).toBeNull();
    expect(document.activeElement).toBe(restored);
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
