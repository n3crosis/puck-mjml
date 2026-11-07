// @vitest-environment happy-dom
import { act, type ReactNode, type SyntheticEvent } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Editor } from "@tiptap/core";
import { Document } from "@tiptap/extension-document";
import { Paragraph } from "@tiptap/extension-paragraph";
import { Text } from "@tiptap/extension-text";
import { Link } from "@tiptap/extension-link";
import { renderEmailInlineMenu, renderEmailRichTextMenu } from "./RichTextToolbar";

vi.mock("@puckeditor/core", () => {
  const Group = ({ children }: { children: ReactNode }) => <div>{children}</div>;
  const Stub = ({ name }: { name: string }) => <span data-control={name} />;
  return {
    RichTextMenu: Object.assign(Group, {
      Group,
      HeadingSelect: () => <Stub name="heading-select" />,
      ListSelect: () => <Stub name="list-select" />,
      AlignSelect: () => <Stub name="align-select" />,
      Bold: () => <Stub name="bold" />,
      Italic: () => <Stub name="italic" />,
      Underline: () => <Stub name="underline" />,
      Strikethrough: () => <Stub name="strikethrough" />,
      Blockquote: () => <Stub name="blockquote" />,
      InlineCode: () => <Stub name="inline-code" />,
      CodeBlock: () => <Stub name="code-block" />,
      HorizontalRule: () => <Stub name="horizontal-rule" />,
      Control: ({
        title,
        active,
        disabled,
        onClick,
      }: {
        title: string;
        active?: boolean;
        disabled?: boolean;
        onClick: (event: SyntheticEvent) => void;
      }) => (
        <button
          type="button"
          aria-label={title}
          aria-pressed={active}
          disabled={disabled}
          onClick={onClick}
        >
          {title}
        </button>
      ),
    }),
  };
});

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups
    .splice(0)
    .reverse()
    .forEach((cleanup) => cleanup());
});

function renderMenu(menu: typeof renderEmailRichTextMenu, editor: Editor) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  cleanups.push(() => {
    act(() => root.unmount());
    container.remove();
  });
  act(() => {
    root.render(menu({ editor, readOnly: false, editorState: null, children: null }));
  });
  return container;
}

describe("rich text link control", () => {
  it("updates when the caret enters and leaves a link without other formatting changes", async () => {
    const editor = new Editor({
      extensions: [Document, Paragraph, Text, Link],
      content: '<p>Plain <a href="https://example.com/">linked</a> text</p>',
    });
    cleanups.push(() => editor.destroy());
    const container = renderMenu(renderEmailRichTextMenu, editor);
    expect(
      container.querySelector('button[aria-label="Add link"]')?.getAttribute("aria-pressed"),
    ).toBe("false");

    await act(async () => {
      editor.commands.setTextSelection(9);
    });
    expect(
      container.querySelector('button[aria-label="Edit link"]')?.getAttribute("aria-pressed"),
    ).toBe("true");

    await act(async () => {
      editor.commands.setTextSelection(2);
    });
    expect(
      container.querySelector('button[aria-label="Add link"]')?.getAttribute("aria-pressed"),
    ).toBe("false");

    await act(async () => {
      editor.commands.setTextSelection(9);
      editor.commands.unsetLink();
    });
    expect(
      container.querySelector('button[aria-label="Add link"]')?.getAttribute("aria-pressed"),
    ).toBe("false");
  });
});

describe("inline rich text menu", () => {
  it("keeps the selected text while editing, applying, and removing an inline link", async () => {
    const editor = new Editor({
      extensions: [Document, Paragraph, Text, Link],
      content: "<p>Cell copy</p>",
    });
    cleanups.push(() => editor.destroy());
    editor.commands.setTextSelection({ from: 1, to: 5 });
    const inline = renderMenu(renderEmailInlineMenu, editor);
    await act(async () =>
      inline.querySelector<HTMLButtonElement>('button[aria-label="Add link"]')!.click(),
    );
    const input = inline.querySelector<HTMLInputElement>(".pm-richtext-link input")!;
    expect(document.activeElement).toBe(input);
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
        input,
        "https://example.com/cell",
      );
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () =>
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })),
    );
    expect(inline.querySelector(".pm-richtext-link")).toBeNull();
    expect(editor.getHTML()).toContain('href="https://example.com/cell"');
    expect(editor.getHTML()).toContain(">Cell</a> copy");
    await act(async () =>
      inline.querySelector<HTMLButtonElement>('button[aria-label="Edit link"]')!.click(),
    );
    const remove = [...inline.querySelectorAll<HTMLButtonElement>(".pm-richtext-link button")].find(
      (button) => button.textContent === "Remove link",
    )!;
    await act(async () => remove.click());
    expect(editor.getHTML()).toBe("<p>Cell copy</p>");
    expect(inline.querySelector(".pm-richtext-link")).toBeNull();
  });

  it("stays compact so the focused block's selection frame cannot exceed its parent", () => {
    const editor = new Editor({
      extensions: [Document, Paragraph, Text, Link],
      content: "<p>Cell copy</p>",
    });
    cleanups.push(() => editor.destroy());
    const inline = renderMenu(renderEmailInlineMenu, editor);
    for (const control of ["bold", "italic", "underline", "strikethrough"])
      expect(inline.querySelector(`[data-control="${control}"]`), control).not.toBeNull();
    expect(inline.querySelector('button[aria-label="Add link"]')).not.toBeNull();
    // These controls widen the toolbar past a narrow column; the sidebar keeps them.
    for (const control of [
      "heading-select",
      "list-select",
      "align-select",
      "blockquote",
      "inline-code",
      "code-block",
      "horizontal-rule",
    ])
      expect(inline.querySelector(`[data-control="${control}"]`), control).toBeNull();

    const full = renderMenu(renderEmailRichTextMenu, editor);
    expect(full.querySelector('[data-control="heading-select"]')).not.toBeNull();
    expect(full.querySelector('[data-control="code-block"]')).not.toBeNull();
  });
});
