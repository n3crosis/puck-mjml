// @vitest-environment happy-dom
import { Editor } from "@tiptap/core";
import { Document } from "@tiptap/extension-document";
import { Paragraph } from "@tiptap/extension-paragraph";
import { Text } from "@tiptap/extension-text";
import { afterEach, describe, expect, it } from "vitest";
import { EmailBold } from "./EmailRichText";
import { sanitizeEmailRichText, sanitizeEmailTableContent } from "./richtext";
import { fromMjml } from "./import";
import { compileEmail, toMjml } from "./export";

const editors: Editor[] = [];
afterEach(() => editors.splice(0).forEach((editor) => editor.destroy()));
function create(content: string) {
  const editor = new Editor({ extensions: [Document, Paragraph, Text, EmailBold], content });
  editors.push(editor);
  return editor;
}

describe("explicit rich text bold", () => {
  it("makes newly applied bold independent of inherited light weights and toggles it off", () => {
    const editor = create("<p>Choose this word.</p>");
    editor.commands.setTextSelection({ from: 8, to: 12 });
    editor.commands.toggleBold();
    expect(editor.getHTML()).toBe(
      '<p>Choose <strong style="font-weight: bold;">this</strong> word.</p>',
    );
    expect(editor.state.selection.to - editor.state.selection.from).toBe(4);
    expect(editor.isActive("bold")).toBe(true);
    const saved = sanitizeEmailRichText(editor.getHTML());
    expect(saved).toContain('<strong style="font-weight:bold">this</strong>');
    const reopened = create(saved);
    reopened.commands.setTextSelection({ from: 8, to: 12 });
    expect(reopened.isActive("bold")).toBe(true);
    reopened.commands.toggleBold();
    expect(reopened.getHTML()).toBe("<p>Choose this word.</p>");
    reopened.commands.toggleBold();
    expect(reopened.getHTML()).toContain('style="font-weight: bold;"');
  });

  it("keeps imported relative strong marks unstyled, including after unrelated edits", () => {
    const editor = create("<p><strong>Source bold</strong> remains.</p>");
    expect(editor.getHTML()).toBe("<p><strong>Source bold</strong> remains.</p>");
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    editor.commands.insertContent(" More.");
    expect(editor.getHTML()).toBe("<p><strong>Source bold</strong> remains. More.</p>");
    editor.commands.setTextSelection({ from: 1, to: 12 });
    editor.commands.toggleBold();
    expect(editor.getHTML()).toBe("<p>Source bold remains. More.</p>");
  });

  it("uses explicit bold for keyboard and programmatic commands", () => {
    const editor = create("<p>word</p>");
    editor.commands.setTextSelection({ from: 1, to: 5 });
    editor.commands.keyboardShortcut("Mod-b");
    expect(editor.getHTML()).toContain('<strong style="font-weight: bold;">word</strong>');
    editor.commands.keyboardShortcut("Mod-b");
    expect(editor.getHTML()).toBe("<p>word</p>");
    editor.commands.setBold();
    expect(editor.getHTML()).toContain('style="font-weight: bold;"');
  });

  it("retains only the narrow bold-weight style through both sanitizers", () => {
    const unsafe =
      '<strong style="font-weight:bold;color:red;background:url(javascript:bad())" onclick="bad()">Bold</strong><b style="font-weight:700;position:fixed">Heavy</b><strong style="font-weight:normal">Relative</strong>';
    const expected =
      '<strong style="font-weight:bold">Bold</strong><b style="font-weight:700">Heavy</b><strong>Relative</strong>';
    expect(sanitizeEmailRichText(unsafe)).toBe(expected);
    expect(sanitizeEmailTableContent(`<tr><td>${unsafe}</td></tr>`)).toBe(
      `<tr><td>${expected}</td></tr>`,
    );
  });

  it("round-trips explicit bold through MJML import, serialization and compiled HTML", async () => {
    const source =
      '<mjml><mj-body><mj-section><mj-column><mj-text font-weight="300">Light <strong style="font-weight:bold">bold</strong> and <strong>relative</strong>.</mj-text></mj-column></mj-section></mj-body></mjml>';
    const imported = fromMjml(source).document;
    const serialized = toMjml(imported);
    expect(serialized).toContain(
      'Light <strong style="font-weight:bold">bold</strong> and <strong>relative</strong>.',
    );
    expect((await compileEmail(imported)).html).toContain(
      '<strong style="font-weight:bold">bold</strong>',
    );
    expect(
      toMjml(fromMjml(serialized).document).match(/<mj-text\b[^>]*>[\s\S]*?<\/mj-text>/)?.[0],
    ).toBe(serialized.match(/<mj-text\b[^>]*>[\s\S]*?<\/mj-text>/)?.[0]);
  });
});
