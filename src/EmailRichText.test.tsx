// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { act, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createUsePuck, type PuckApi } from "@puckeditor/core";
import { Editor } from "@tiptap/core";
import { Document } from "@tiptap/extension-document";
import { Paragraph } from "@tiptap/extension-paragraph";
import { Text } from "@tiptap/extension-text";
import { afterEach, expect, it, vi } from "vitest";
import { load } from "cheerio";
import { EmailLink } from "./EmailRichText";
import { EmailEditor } from "./EmailEditor";
import { fromMjml } from "./import";
import { toMjml } from "./export";
import { sanitizeEmailRichText } from "./richtext";
import type { EmailDocument } from "./types";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const editors: Editor[] = [];
const roots: { root: Root; container: HTMLElement }[] = [];
afterEach(async () => {
  for (const { root, container } of roots.splice(0)) {
    await act(async () => root.unmount());
    container.remove();
  }
  editors.splice(0).forEach((editor) => editor.destroy());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function editorFor(content: string) {
  const editor = new Editor({ extensions: [Document, Paragraph, Text, EmailLink], content });
  editors.push(editor);
  return editor;
}
function anchorLabels(html: string) {
  const element = document.createElement("div");
  element.innerHTML = html;
  return [...element.querySelectorAll("a:not([href])")].map((node) => node.textContent);
}

it("preserves adjacent non-navigating labels without serializing editor-only provenance", () => {
  const editor = editorFor("<p><a>First</a><a>Second</a> plain</p>");
  expect(editor.getHTML()).toBe("<p><a>First</a><a>Second</a> plain</p>");
  for (const label of editor.view.dom.querySelectorAll("a")) {
    expect(label.getAttributeNames()).toEqual([]);
  }
  const open = vi.spyOn(window, "open");
  const label = editor.view.dom.querySelector("a")!;
  const click = new MouseEvent("click", { button: 0 });
  Object.defineProperty(click, "target", { value: label });
  editor.view.someProp("handleClick", (handler) => handler(editor.view, 2, click));
  expect(open).not.toHaveBeenCalled();
  editor.commands.setTextSelection(3);
  editor.chain().extendMarkRange("link").setLink({ href: "https://example.com/" }).run();
  expect(anchorLabels(editor.getHTML())).toEqual(["Second"]);
  expect(editor.view.dom.querySelectorAll("a a")).toHaveLength(0);
  expect(editor.view.dom.querySelector("a")!.textContent).toBe("First");
  editor.chain().extendMarkRange("link").unsetLink().run();
  expect(anchorLabels(editor.getHTML())).toEqual(["Second"]);
  expect(editor.getHTML()).not.toContain("anchorBoundary");
});

it("keeps autolink, URL paste and HTML paste independent in simultaneous editors", () => {
  const first = editorFor("<p>Start</p>");
  const second = editorFor("<p><a>Placeholder</a> plain</p>");
  first.commands.setTextSelection(6);
  first.view.dispatch(first.state.tr.insertText(" https://example.org "));
  expect(first.view.dom.querySelector("a")?.getAttribute("href")).toBe("https://example.org");
  expect(anchorLabels(second.getHTML())).toEqual(["Placeholder"]);
  second.commands.setTextSelection({ from: 1, to: 12 });
  expect(second.view.pasteText("https://example.net")).toBe(true);
  expect(second.view.dom.querySelector("a")?.getAttribute("href")).toBe("https://example.net");
  expect(second.view.dom.querySelector("a")?.textContent).toBe("Placeholder");
  second.commands.setTextSelection(second.state.doc.content.size - 1);
  second.view.pasteHTML("<a> New label</a><a>Adjacent label</a>");
  expect(anchorLabels(second.getHTML())).toEqual(["New label", "Adjacent label"]);
  for (const editor of [first, second]) {
    expect(editor.extensionManager.extensions.filter(({ name }) => name === "link")).toHaveLength(
      1,
    );
    const keys = editor.state.plugins.map((plugin) => (plugin as unknown as { key: string }).key);
    expect(new Set(keys).size).toBe(keys.length);
  }
});

it.each(["javascript:alert(1)", "data:text/html,unsafe", "vbscript:unsafe"])(
  "does not allow unsafe destinations through parsing, commands or paste: %s",
  (href) => {
    const editor = editorFor(`<p><a href="${href}" onclick="bad()">Bad</a> <a>Label</a></p>`);
    expect(anchorLabels(editor.getHTML())).toEqual(["Label"]);
    expect(editor.getHTML()).not.toContain(href);
    editor.commands.setTextSelection({ from: 1, to: 4 });
    expect(editor.commands.setLink({ href })).toBe(false);
    editor.view.pasteHTML(`<a href="${href}" onclick="bad()">Pasted</a>`);
    expect(editor.getHTML()).not.toMatch(/javascript:|data:text|vbscript:|onclick=/);
    const sanitized = sanitizeEmailRichText(`<a href="${href}" onclick="bad()">Safe label</a>`);
    expect(sanitized).toBe("<a>Safe label</a>");
    expect(anchorLabels(editorFor(sanitized).getHTML())).toEqual(["Safe label"]);
  },
);

function importedTexts(
  value: unknown,
): { content: string; importedRichText: { source: string } }[] {
  if (!value || typeof value !== "object") return [];
  const entry = value as Record<string, unknown>;
  const result =
    typeof entry.content === "string" && entry.importedRichText
      ? [entry as { content: string; importedRichText: { source: string } }]
      : [];
  return [...result, ...Object.values(entry).flatMap(importedTexts)];
}

it("preserves every href-less anchor across all 62 canonical imports", () => {
  const manifest = JSON.parse(readFileSync("templates/manifest.json", "utf8")) as {
    templates: { file: string }[];
  };
  expect(manifest.templates).toHaveLength(62);
  let total = 0;
  let affected = 0;
  for (const { file } of manifest.templates) {
    const initial = fromMjml(readFileSync(`templates/${file}`, "utf8")).document;
    const before = toMjml(initial);
    let count = 0;
    for (const entry of importedTexts(initial)) {
      const expected = anchorLabels(entry.importedRichText.source);
      if (!expected.length) continue;
      const editor = editorFor(entry.content);
      expect(anchorLabels(editor.getHTML()), file).toEqual(expected);
      count += expected.length;
    }
    expect(toMjml(initial), file).toBe(before);
    total += count;
    if (count) affected++;
  }
  expect({ total, affected }).toEqual({ total: 43, affected: 5 });
});

it("targets only the five original Apple invoice labels, not synthetic value paragraphs", () => {
  const source = readFileSync("templates/Community/receipts/apple-receipt.mjml", "utf8");
  const $ = load(source, { xml: true });
  const labels = ["APPLE ID", "BILLED TO", "INVOICE DATE", "ORDER ID", "DOCUMENT NO."];
  const cells = $("mj-table[css-class=apple-invoice] td").toArray();
  expect(cells).toHaveLength(labels.length);
  expect(source).toContain(".apple-invoice p:first-child");
  const reference = load(
    readFileSync(
      "tests/fixtures/react-email-reference/Community/receipts/apple-receipt.html",
      "utf8",
    ),
  );
  for (const [index, cell] of cells.entries()) {
    expect($(cell).children().first().prop("tagName")).toBe("P");
    expect($(cell).find("p")).toHaveLength(1);
    expect($(cell).children().first().text()).toBe(labels[index]);
    const original = reference("p").filter((_, node) => reference(node).text() === labels[index]);
    expect(original.index()).toBe(0);
    const editor = editorFor($(cell).html()!);
    const host = document.createElement("div");
    host.className = "apple-invoice";
    host.innerHTML = editor.getHTML();
    expect([...host.querySelectorAll("p:first-child")].map((p) => p.textContent)).toEqual([
      labels[index],
    ]);
    expect(host.querySelectorAll("p:not(:first-child)").length).toBeGreaterThan(0);
  }
});

const usePuck = createUsePuck();
function Capture({ capture }: { capture: (value: PuckApi) => void }) {
  const api = usePuck((state) => state);
  useEffect(() => capture(api), [api, capture]);
  return null;
}
const initialSource = `<mjml><mj-body><mj-section><mj-column>
  <mj-text><a>First label</a><a>Second label</a> plain text.</mj-text>
  <mj-table><tr><td><p>LABEL</p><a>Cell value</a></td></tr></mj-table>
  <mj-accordion><mj-accordion-element><mj-accordion-title>Question</mj-accordion-title>
  <mj-accordion-text><a>Answer label</a></mj-accordion-text></mj-accordion-element></mj-accordion>
  </mj-column></mj-section></mj-body></mjml>`;

it.each([false, true])(
  "keeps actual canvas labels and source through edit, undo/redo and cloneEcho=%s",
  async (cloneEcho) => {
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 0, 800, 600),
    );
    const initial = fromMjml(initialSource).document;
    const before = toMjml(initial);
    let api: PuckApi;
    let current = initial;
    const capture = (value: PuckApi) => {
      api = value;
    };
    function Host() {
      const [value, setValue] = useState<EmailDocument>(initial);
      current = value;
      return (
        <EmailEditor
          value={value}
          onChange={(next) => setValue(cloneEcho ? JSON.parse(JSON.stringify(next)) : next)}
          headerActions={<Capture capture={capture} />}
        />
      );
    }
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push({ root, container });
    await act(async () => root.render(<Host />));
    const canvas = () => container.querySelector("iframe")!.contentDocument!;
    expect(anchorLabels(canvas().body.innerHTML)).toEqual([
      "First label",
      "Second label",
      "Cell value",
      "Answer label",
    ]);
    expect(toMjml(current)).toBe(before);
    await act(async () =>
      api.dispatch({
        type: "setUi",
        ui: { itemSelector: api.getSelectorForId("text-1") },
        recordHistory: false,
      }),
    );
    let element: (HTMLElement & { editor: Editor }) | null = null;
    for (let retry = 0; retry < 20 && !element?.editor; retry++) {
      await act(async () => new Promise((resolve) => setTimeout(resolve, 50)));
      element = canvas().querySelector('[data-puck-component="text-1"] [contenteditable="true"]');
    }
    expect(element?.editor).toBeDefined();
    await act(async () => {
      element!.focus();
      element!.editor.commands.setTextSelection(element!.editor.state.doc.content.size - 1);
      element!.editor.commands.insertContent(" Edited.");
    });
    await act(async () => new Promise((resolve) => setTimeout(resolve, 350)));
    const edited = toMjml(current);
    expect(edited).toContain("plain text. Edited.");
    expect(edited).toContain("<a>First label</a><a>Second label</a>");
    expect(edited).not.toContain("anchorBoundary");
    await act(async () => api.history.back());
    expect(toMjml(current)).toBe(before);
    expect(anchorLabels(canvas().body.innerHTML)).toEqual([
      "First label",
      "Second label",
      "Cell value",
      "Answer label",
    ]);
    await act(async () => api.history.forward());
    expect(toMjml(current)).toBe(edited);
    expect(toMjml(initial)).toBe(before);
  },
  15_000,
);
