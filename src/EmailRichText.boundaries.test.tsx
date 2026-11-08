// @vitest-environment happy-dom
import { Editor } from "@tiptap/core";
import { Document } from "@tiptap/extension-document";
import { Paragraph } from "@tiptap/extension-paragraph";
import { Text } from "@tiptap/extension-text";
import { afterEach, expect, it } from "vitest";
import { EmailBold, EmailLink } from "./EmailRichText";
import { sanitizeEmailRichText } from "./richtext";

const editors: Editor[] = [];
afterEach(() => editors.splice(0).forEach((editor) => editor.destroy()));
const href = "https://example.com/shared";
const source = `<p><a href="${href}">First</a><a href="${href}">Second <strong>bold</strong> tail</a><a href="${href}">Third</a><a href="${href}">Fourth</a></p>`;
function create(content = source) {
  const editor = new Editor({
    extensions: [Document, Paragraph, Text, EmailBold, EmailLink],
    content,
  });
  editors.push(editor);
  return editor;
}
const anchors = (editor: Editor) =>
  [...editor.view.dom.querySelectorAll("a")].map((node) => ({
    text: node.textContent,
    href: node.getAttribute("href"),
  }));
const expected = ["First", "Second bold tail", "Third", "Fourth"].map((text) => ({ text, href }));

it("preserves adjacent same-destination boxes and nested marks without changing text", () => {
  const editor = create();
  expect(anchors(editor)).toEqual(expected);
  expect(editor.getText()).toBe("FirstSecond bold tailThirdFourth");
  expect(editor.view.dom.querySelectorAll("a strong")).toHaveLength(1);
  expect(editor.view.dom.querySelector("a strong")!.parentElement!.textContent).toBe(
    "Second bold tail",
  );
  const saved = sanitizeEmailRichText(editor.getHTML());
  expect(saved).not.toContain("anchorBoundary");
  expect(anchors(create(saved))).toEqual(expected);
  editor.commands.setContent(saved);
  expect(anchors(editor)).toEqual(expected);
});

it("edits and removes only the selected anchor even when neighboring hrefs match", () => {
  const editor = create();
  editor.commands.setTextSelection(15); // Inside the second anchor's nested bold mark.
  editor.chain().extendMarkRange("link").setLink({ href: "https://example.com/changed" }).run();
  expect(anchors(editor)).toEqual(
    expected.map((anchor, index) =>
      index === 1 ? { ...anchor, href: "https://example.com/changed" } : anchor,
    ),
  );
  editor.chain().extendMarkRange("link").setLink({ href }).run();
  expect(anchors(editor)).toEqual(expected);
  editor.chain().extendMarkRange("link").unsetLink().run();
  expect(anchors(editor)).toEqual(expected.filter((_, index) => index !== 1));
  expect(editor.getText()).toBe("FirstSecond bold tailThirdFourth");
});

it("keeps newly pasted anchors distinct from existing equal-href neighbors after reparse", () => {
  const editor = create();
  editor.commands.setContent(editor.getHTML());
  editor.commands.setTextSelection(editor.state.doc.content.size - 1);
  expect(editor.view.pasteHTML(`<a href="${href}">Pasted</a><a href="${href}">Next</a>`)).toBe(
    true,
  );
  expect(anchors(editor)).toEqual([...expected, { text: "Pasted", href }, { text: "Next", href }]);
  expect(anchors(create(editor.getHTML()))).toEqual(anchors(editor));
});

it("continues rejecting unsafe links and distinguishes adjacent destination-less labels", () => {
  const editor = create(
    `<p><a>Label</a><a>Another</a><a href="javascript:alert(1)">Unsafe</a><a href="${href}">Safe</a></p>`,
  );
  expect(anchors(editor)).toEqual([
    { text: "Label", href: null },
    { text: "Another", href: null },
    { text: "Safe", href },
  ]);
  expect(editor.getHTML()).not.toContain("javascript:");
  expect(editor.commands.setLink({ href: "javascript:alert(1)" })).toBe(false);
});
