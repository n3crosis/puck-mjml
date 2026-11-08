// @vitest-environment happy-dom
import postcss from "postcss";
import { act, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createUsePuck, type PuckApi } from "@puckeditor/core";
import type { Editor } from "@tiptap/core";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EmailEditor } from "./EmailEditor";
import { fromMjml } from "./import";
import { compileEmail, toMjml } from "./export";
import type { EmailBlock, EmailDocument } from "./types";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const usePuck = createUsePuck();
let root: Root;
let container: HTMLDivElement;
let api: PuckApi;
let value: EmailDocument;
let replaceHost: Dispatch<SetStateAction<EmailDocument>>;

function CaptureApi() {
  const state = usePuck((current) => current);
  useEffect(() => {
    api = state;
  }, [state]);
  return null;
}

function Host({ initial, cloneEcho }: { initial: EmailDocument; cloneEcho: boolean }) {
  const [document, setDocument] = useState(initial);
  value = document;
  replaceHost = setDocument;
  return (
    <EmailEditor
      value={document}
      onChange={(next) =>
        setDocument(cloneEcho ? (JSON.parse(JSON.stringify(next)) as EmailDocument) : next)
      }
      headerActions={<CaptureApi />}
    />
  );
}

beforeEach(() => {
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });
  // Unexpected font requests remain observable; source fallback stacks need none.
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () => new Response('@font-face { font-family: "Open Sans"; src: local("Arial"); }'),
    ),
  );
  // Exercise Puck's browser viewport initialization and the baseline it records.
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
});

async function mount(initial: EmailDocument, cloneEcho = false) {
  await act(async () => root.render(<Host initial={initial} cloneEcho={cloneEcho} />));
}
const canvas = () => container.querySelector("iframe")!.contentDocument!;
async function commitHistory() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 350));
  });
}
async function typeInline(id: string) {
  await act(async () =>
    api.dispatch({
      type: "setUi",
      ui: { itemSelector: api.getSelectorForId(id) },
      recordHistory: false,
    }),
  );
  let node: (HTMLElement & { editor?: Editor }) | null = null;
  for (let retry = 0; retry < 20; retry++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    node = canvas().querySelector(`[data-puck-component="${id}"] [contenteditable="true"]`);
    if (node?.editor) break;
  }
  expect(node?.editor).toBeDefined();
  await act(async () => {
    node!.focus();
    node!.editor!.commands.setTextSelection(node!.editor!.state.doc.content.size - 1);
    node!.editor!.commands.insertContent(" Edited.");
  });
  await commitHistory();
  expect(api.getItemById(id)!.props.content).toContain(" Edited.");
  expect(api.history.hasPast).toBe(true);
}
function findBlock(node: unknown, id: string): EmailBlock | undefined {
  if (!node || typeof node !== "object") return;
  const block = node as EmailBlock;
  if (block.type && block.props?.id === id) return block;
  for (const child of Object.values(node)) {
    const found = findBlock(child, id);
    if (found) return found;
  }
}
async function expectDocument(expected: EmailDocument) {
  expect(toMjml(value)).toBe(toMjml(expected));
  expect(toMjml(api.appState.data as EmailDocument)).toBe(toMjml(expected));
  expect((await compileEmail(value)).html).toBe((await compileEmail(expected)).html);
}
function replaceRoot(props: Partial<NonNullable<EmailDocument["root"]["props"]>>) {
  return act(async () =>
    api.dispatch({
      type: "replaceRoot",
      root: {
        ...api.appState.data.root,
        props: { ...api.appState.data.root.props, ...props },
      } as typeof api.appState.data.root,
      recordHistory: true,
    }),
  );
}

it.each([false, true])(
  "preserves authored source and font through inline text, undo/redo and cloneEcho=%s",
  async (cloneEcho) => {
    const source = `<mjml><mj-head><mj-attributes><mj-all font-family="inherit" /></mj-attributes>
      <mj-style>body { font-family:"Open Sans", "Helvetica Neue", Arial, sans-serif; }
        .scoped-button a { font-family:"Open Sans", "Helvetica Neue", Arial; }
      </mj-style></mj-head><mj-body><mj-section><mj-column>
      <mj-text>First paragraph</mj-text><mj-text>Review the changes here:</mj-text>
      <mj-button css-class="scoped-button">Continue</mj-button></mj-column></mj-section></mj-body></mjml>`;
    const initial = fromMjml(source).document;
    const initialSource = toMjml(initial);
    await mount(initial, cloneEcho);
    const puck = container.querySelector(".Puck");
    // The stored baseline must match the initial export before any onChange.
    expect(toMjml(api.appState.data as EmailDocument)).toBe(initialSource);
    const originalFont = canvas().querySelector<HTMLElement>(".pm-text")!.style.fontFamily;
    expect(originalFont).toBe("inherit");
    const originalCss = canvas().querySelector("[data-pm-canvas-css]")!.textContent!;
    const familyRules: { selector: string; stack: string[] }[] = [];
    postcss.parse(originalCss).walkRules((rule) => {
      rule.walkDecls("font-family", (declaration) => {
        familyRules.push({
          selector: rule.selector,
          stack: postcss.list
            .comma(declaration.value)
            .map((family) => family.replace(/^(['"])(.*)\1$/, "$2")),
        });
      });
    });
    expect(familyRules.map(({ stack }) => stack)).toContainEqual([
      "Open Sans",
      "Helvetica Neue",
      "Arial",
      "sans-serif",
    ]);
    expect(
      familyRules
        .filter(({ selector }) => selector.includes(".scoped-button a"))
        .map(({ stack }) => stack),
    ).toEqual([["Open Sans", "Helvetica Neue", "Arial"]]);
    const expectSourceFonts = () => {
      expect(canvas().querySelector<HTMLElement>(".pm-text")!.style.fontFamily).toBe(originalFont);
      expect(canvas().querySelector("[data-pm-canvas-css]")!.textContent).toBe(originalCss);
      expect(canvas().querySelector("[data-pm-canvas-fonts]")).toBeNull();
      expect(api.appState.data.root.props!.fontImports).toEqual([]);
      expect(fetch).not.toHaveBeenCalled();
    };
    expectSourceFonts();
    await typeInline("text-2");
    expect(api.getItemById("text-2")!.props.content).toContain("here: Edited.");
    const edited = structuredClone(initial);
    findBlock(edited, "text-2")!.props.content = api.getItemById("text-2")!.props.content;
    await expectDocument(edited);
    expectSourceFonts();
    await act(async () => api.history.back());
    await expectDocument(initial);
    expectSourceFonts();
    await act(async () => api.history.forward());
    await expectDocument(edited);
    expectSourceFonts();
    expect(container.querySelector(".Puck")).toBe(puck);
    expect(toMjml(initial)).toBe(initialSource);
  },
  15_000,
);

it.each([false, true])(
  "preserves omitted root attributes but honors explicit default-valued edits with cloneEcho=%s",
  async (cloneEcho) => {
    const initial = fromMjml(`<mjml><mj-head><mj-attributes>
      <mj-all font-family="Georgia,serif" />
      <mj-body width="710px" background-color="#123456" />
      </mj-attributes></mj-head><mj-body><mj-section><mj-column>
      <mj-text>Inherited styling</mj-text></mj-column></mj-section></mj-body></mjml>`).document;
    await mount(initial, cloneEcho);
    await expectDocument(initial);
    const style = () => canvas().querySelector<HTMLElement>(".pm-email")!.style;
    const background = () =>
      canvas().querySelector<HTMLElement>(".pm-canvas")!.style.backgroundColor;
    expect(style().maxWidth).toBe("710px");
    expect(background()).toBe("#123456");
    const puck = container.querySelector(".Puck");
    await typeInline("text-1");
    await act(async () => api.history.back());
    await expectDocument(initial);
    expect(style().maxWidth).toBe("710px");
    expect(background()).toBe("#123456");

    // These equal the editor's defaults, but are real user choices, not hydration.
    const explicit = { fontFamily: "Arial, sans-serif", width: 600, backgroundColor: "#f5f5f5" };
    await replaceRoot(explicit);
    await commitHistory();
    const changed = structuredClone(initial);
    Object.assign(changed.root.props!, explicit);
    await expectDocument(changed);
    expect(style().maxWidth).toBe("600px");
    expect(background()).toBe("#f5f5f5");
    expect(canvas().querySelector<HTMLElement>(".pm-text")!.style.fontFamily).toBe(
      "Arial, sans-serif",
    );
    await act(async () => api.history.back());
    await expectDocument(initial);
    await act(async () => api.history.forward());
    await expectDocument(changed);
    expect(container.querySelector(".Puck")).toBe(puck);
  },
  15_000,
);

it("preserves omitted native root defaults after a controlled host replacement", async () => {
  await mount({ root: { props: { sections: [] } }, content: [] });
  expect(api.appState.data.root.props!.fontFamily).toBe("Arial, sans-serif");
  const puck = container.querySelector(".Puck");
  const replacement = fromMjml(
    "<mjml><mj-body><mj-section><mj-column><mj-text>Replacement</mj-text></mj-column></mj-section></mj-body></mjml>",
  ).document;
  await act(async () => replaceHost(replacement));
  expect(container.querySelector(".Puck")).not.toBe(puck);
  await expectDocument(replacement);
  await typeInline("text-1");
  await act(async () => api.history.back());
  await expectDocument(replacement);
  const importedPuck = container.querySelector(".Puck");
  await act(async () => replaceHost({ root: { props: { sections: [] } }, content: [] }));
  expect(container.querySelector(".Puck")).not.toBe(importedPuck);
  expect(api.appState.data.root.props!.fontFamily).toBe("Arial, sans-serif");
}, 15_000);
