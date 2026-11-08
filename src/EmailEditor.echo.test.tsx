// @vitest-environment happy-dom
import { act, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createUsePuck, type PuckApi } from "@puckeditor/core";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EmailEditor } from "./EmailEditor";
import type { EmailBlock, EmailDocument } from "./types";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const usePuck = createUsePuck();
let root: Root;
let container: HTMLDivElement;
let api: PuckApi;
let value: EmailDocument;
let emitted: EmailDocument;
let replaceHost: Dispatch<SetStateAction<EmailDocument>>;
const initialDocument = (): EmailDocument => ({
  root: {
    props: {
      sections: [
        {
          type: "Section1",
          props: {
            id: "section",
            column: [{ type: "Text", props: { id: "text", content: "<p>Original</p>" } }],
          },
        },
      ],
    },
  },
  content: [],
});
const textBlock = (document: EmailDocument) =>
  (document.root.props!.sections![0].props.column as EmailBlock[])[0];

function CaptureApi() {
  const state = usePuck((current) => current);
  useEffect(() => {
    api = state;
  }, [state]);
  return null;
}
function Host({ cloneEcho }: { cloneEcho: boolean }) {
  const [document, setDocument] = useState(initialDocument);
  value = document;
  replaceHost = setDocument;
  return (
    <EmailEditor
      value={document}
      onChange={(next) => {
        emitted = next;
        setDocument(cloneEcho ? structuredClone(next) : next);
      }}
      headerActions={<CaptureApi />}
    />
  );
}
async function mount(cloneEcho = false) {
  await act(async () => root.render(<Host cloneEcho={cloneEcho} />));
}
async function edit(content: string) {
  const selector = api.getSelectorForId("text")!;
  const current = api.getItemById("text")!;
  await act(async () =>
    api.dispatch({
      type: "replace",
      destinationIndex: selector.index,
      destinationZone: selector.zone,
      data: { ...current, props: { ...current.props, content } },
      recordHistory: true,
    }),
  );
  // Puck commits typing/replace actions into history after its normal debounce.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 350));
  });
}

beforeEach(() => {
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });
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

it.each([false, true])(
  "preserves editing and undo/redo with cloneEcho=%s, without serializing identical references",
  async (cloneEcho) => {
    await mount(cloneEcho);
    const puck = container.querySelector(".Puck");
    const original = structuredClone(api.appState.data);
    const stringify = vi.spyOn(JSON, "stringify");
    await edit("<p>Edited</p>");
    expect(textBlock(value).props.content).toBe("<p>Edited</p>");
    expect(container.querySelector(".Puck")).toBe(puck);
    const fullDocumentCalls = stringify.mock.calls.filter(
      ([input]) => input === value || input === emitted,
    );
    expect(fullDocumentCalls).toHaveLength(cloneEcho ? 2 : 0);
    stringify.mockRestore();
    const changed = structuredClone(value);
    expect(api.history.hasPast).toBe(true);
    await act(async () => api.history.back());
    expect(value).toEqual(original);
    await act(async () => api.history.forward());
    expect(value).toEqual(changed);
    expect(container.querySelector(".Puck")).toBe(puck);
  },
);

it("retains the editor and history for equivalent host clones, including after sanitization", async () => {
  await mount();
  await edit("<p>Edited</p>");
  const puck = container.querySelector(".Puck");
  const history = api.history.index;
  const clone = structuredClone(value);
  await act(async () => replaceHost(clone));
  expect(container.querySelector(".Puck")).toBe(puck);
  expect(api.history.index).toBe(history);
  // JSON object key order is not document content. Hosts may canonicalize it
  // when persisting or echoing a draft without replacing the user's session.
  const reordered = JSON.parse(
    JSON.stringify(clone, (_key, entry: unknown) =>
      entry && typeof entry === "object" && !Array.isArray(entry)
        ? Object.fromEntries(Object.entries(entry).reverse())
        : entry,
    ),
  ) as EmailDocument;
  await act(async () => replaceHost(reordered));
  expect(container.querySelector(".Puck")).toBe(puck);
  expect(api.history.index).toBe(history);
  const equivalent = structuredClone(clone);
  textBlock(equivalent).props.content = '<p onclick="unsafe()">Edited<script>unsafe()</script></p>';
  await act(async () => replaceHost(equivalent));
  expect(api.getItemById("text")!.props.content).toBe("<p>Edited</p>");
  expect(container.querySelector(".Puck")).toBe(puck);
  expect(api.history.index).toBe(history);
  expect(textBlock(equivalent).props.content).toContain("onclick");
});

it("sanitizes materially changed host replacements and resets only the replaced editor", async () => {
  await mount();
  await edit("<p>Edited</p>");
  const puck = container.querySelector(".Puck");
  const replacement = structuredClone(value);
  replacement.root.props!.previewText = "Replacement preview";
  replacement.root.props!.headStyles = [
    { css: ".example { color: red; }", inline: "head" },
    { css: ".example { color: blue; }", inline: "head" },
  ];
  textBlock(replacement).props.content =
    '<p onclick="unsafe()">Replacement<script>unsafe()</script></p>';
  await act(async () => replaceHost(replacement));
  expect(container.querySelector(".Puck")).not.toBe(puck);
  expect(api.getItemById("text")!.props.content).toBe("<p>Replacement</p>");
  expect(api.appState.data.root.props?.previewText).toBe("Replacement preview");
  expect(api.history.hasPast).toBe(false);
  expect(textBlock(replacement).props.content).toContain("onclick");

  // Unlike object keys, array order is meaningful (for example the CSS cascade).
  const beforeReorder = container.querySelector(".Puck");
  const reordered = structuredClone(replacement);
  reordered.root.props!.headStyles!.reverse();
  await act(async () => replaceHost(reordered));
  expect(container.querySelector(".Puck")).not.toBe(beforeReorder);
  expect(api.appState.data.root.props?.headStyles).toEqual(reordered.root.props!.headStyles);
});
