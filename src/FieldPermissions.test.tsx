// @vitest-environment happy-dom
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Puck, createUsePuck, type Data, type PuckApi, type Config } from "@puckeditor/core";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Editor } from "@tiptap/core";
import { createEmailConfig, emailFieldTypes } from "./index";
import { PropertyInspector } from "./PropertyInspector";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const usePuck = createUsePuck();
let root: Root;
let container: HTMLDivElement;
let api: PuckApi;
function Capture() {
  const value = usePuck((s) => s);
  useEffect(() => {
    api = value;
  }, [value]);
  return null;
}
beforeEach(() => {
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });
});
afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  vi.unstubAllGlobals();
});
async function mount(
  type: string,
  props: Record<string, unknown>,
  readOnly: Record<string, boolean>,
  configure: (config: Config) => void = () => {},
  settings: Record<string, unknown> = {},
  rootLocks: Record<string, boolean> = {},
) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  const config = createEmailConfig(undefined, true);
  configure(config);
  await act(async () =>
    root.render(
      <Puck
        config={config}
        data={
          {
            root: {
              readOnly: rootLocks,
              props: {
                ...settings,
                sections: [
                  {
                    type: "Section1",
                    props: {
                      id: "section",
                      column: [{ type, props: { id: "test", ...props }, readOnly }],
                    },
                  },
                ],
              },
            },
            content: [],
          } as Data
        }
        iframe={{ enabled: false }}
        overrides={{
          fields: PropertyInspector,
          fieldTypes: emailFieldTypes,
        }}
      >
        <Capture />
        <Puck.Fields />
        <Puck.Preview />
      </Puck>,
    ),
  );
  await act(async () =>
    api.dispatch({ type: "setUi", ui: { itemSelector: api.getSelectorForId("test") } }),
  );
  await act(async () => new Promise((resolve) => setTimeout(resolve, 150)));
}
it("does not expose inline editable table cells beneath a locked row group", async () => {
  await mount(
    "Table",
    { headerRows: [], bodyRows: [{ cells: [{ content: "<p>Locked</p>" }] }], footerRows: [] },
    { bodyRows: true },
  );
  const inline = container.querySelector<HTMLElement & { editor: Editor }>(
    '[data-puck-component="test"] [contenteditable="true"]',
  );
  if (inline) {
    await act(async () => {
      inline.focus();
      inline.editor.commands.setContent("<p>Changed locked text</p>");
    });
    await act(async () => new Promise((resolve) => setTimeout(resolve, 300)));
  }
  expect(api.getItemById("test")!.props.bodyRows[0].cells[0].content).toBe("<p>Locked</p>");
  expect(inline).toBeNull();
});
it("does not expose editable accordion answers beneath a locked items array", async () => {
  await mount(
    "Accordion",
    { items: [{ title: "Question", content: "<p>Locked answer</p>" }] },
    { items: true },
  );
  const inline = container.querySelector<HTMLElement & { editor: Editor }>(
    '[data-puck-component="test"] [contenteditable="true"]',
  );
  if (inline) {
    await act(async () => {
      inline.focus();
      inline.editor.commands.setContent("<p>Changed locked text</p>");
    });
    await act(async () => new Promise((resolve) => setTimeout(resolve, 300)));
  }
  expect(api.getItemById("test")!.props.items[0].content).toBe("<p>Locked answer</p>");
  expect(inline).toBeNull();
});
it("does not expose editable nested fields beneath a locked social links array", async () => {
  await mount(
    "Social",
    { links: [{ network: "twitter", href: "https://example.com/locked" }] },
    { links: true },
  );
  await act(async () =>
    container.querySelector<HTMLElement>('[class*="_ArrayFieldItem-summary_"]')!.click(),
  );
  const inputs = [
    ...container.querySelectorAll<HTMLInputElement>('[class*="_ArrayFieldItem-body_"] input'),
  ];
  const href = inputs.find((input) => input.value === "https://example.com/locked")!;
  expect(href).toBeDefined();
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
      href,
      "https://example.com/changed",
    );
    href.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 300));
  });
  expect(api.getItemById("test")!.props.links[0].href).toBe("https://example.com/locked");
  expect(href.readOnly || href.disabled).toBe(true);
});

it("locks only the protected table cell and preserves sibling editing and undo", async () => {
  await mount(
    "Table",
    {
      headerRows: [],
      bodyRows: [{ cells: [{ content: "<p>Locked</p>" }, { content: "<p>Editable</p>" }] }],
      footerRows: [],
    },
    { "bodyRows[0].cells[0].content": true },
  );
  const inline = container.querySelectorAll<HTMLElement & { editor: Editor }>(
    '[data-puck-component="test"] [contenteditable="true"]',
  );
  expect(inline).toHaveLength(1);
  const before = api.getItemById("test")!;
  await act(async () => {
    inline[0].focus();
    inline[0].editor.commands.setContent("<p>Updated sibling</p>");
  });
  await act(async () => new Promise((resolve) => setTimeout(resolve, 300)));
  expect(
    api
      .getItemById("test")!
      .props.bodyRows[0].cells.map((cell: { content: string }) => cell.content),
  ).toEqual(["<p>Locked</p>", "<p>Updated sibling</p>"]);
  expect(api.getItemById("test")!.readOnly).toEqual(before.readOnly);
  await act(async () => api.history.back());
  expect(api.getItemById("test")!.props.bodyRows).toEqual(before.props.bodyRows);
  await act(async () => api.history.forward());
  expect(api.getItemById("test")!.props.bodyRows[0].cells[1].content).toBe(
    "<p>Updated sibling</p>",
  );
});

it("honors component edit denial for inline text and sidebar fields", async () => {
  await mount("Text", { content: "<p>Locked text</p>", fontFamily: "Arial" }, {}, (config) => {
    config.components.Text.permissions = { edit: false };
  });
  expect(
    container.querySelector('[data-puck-component="test"] [contenteditable="true"]'),
  ).toBeNull();
  const font = container.querySelector<HTMLInputElement>(
    '[data-property-name="fontFamily"] input',
  )!;
  expect(font.readOnly || font.disabled).toBe(true);
});

it("allows a specific sidebar exception without permitting changes to another locked link", async () => {
  await mount(
    "Social",
    {
      links: [
        { network: "twitter", href: "https://example.com/locked" },
        { network: "github", href: "https://example.com/editable" },
      ],
    },
    {
      "links[*].href": true,
      "links[1].href": false,
    },
  );
  await act(async () =>
    container.querySelectorAll<HTMLElement>('[class*="_ArrayFieldItem-summary_"]')[1].click(),
  );
  const href = [
    ...container.querySelectorAll<HTMLInputElement>('[class*="_ArrayFieldItem-body_"] input'),
  ].find((input) => input.value === "https://example.com/editable")!;
  expect(href.readOnly || href.disabled).toBe(false);
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
      href,
      "https://example.com/updated",
    );
    href.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 300));
  });
  expect(api.getItemById("test")!.props.links.map((entry: { href: string }) => entry.href)).toEqual(
    ["https://example.com/locked", "https://example.com/updated"],
  );
  expect(container.querySelector('[class*="_ArrayField-addButton_"]')).toBeNull();
});

it("propagates root array locks into custom CSS code fields", async () => {
  await mount(
    "Text",
    { content: "<p>Text</p>" },
    {},
    () => {},
    {
      headStyles: [{ css: ".locked { color: red; }", inline: "head" }],
    },
    { headStyles: true },
  );
  await act(async () => api.dispatch({ type: "setUi", ui: { itemSelector: null } }));
  const css = container.querySelector<HTMLElement>('[data-property-name="headStyles"]')!;
  await act(async () =>
    css.querySelector<HTMLElement>('[class*="_ArrayFieldItem-summary_"]')!.click(),
  );
  const code = css.querySelector<HTMLElement>('[role="textbox"]')!;
  expect(code).not.toBeNull();
  expect(code.getAttribute("contenteditable")).toBe("false");
  expect(code.getAttribute("aria-readonly")).toBe("true");
  expect(api.appState.data.root.readOnly).toEqual({ headStyles: true });
});

it("protects nested ordered accordion HTML fields without persisting derived locks", async () => {
  await mount(
    "Accordion",
    {
      items: [
        {
          title: "Question",
          content: "<p>Answer</p>",
          children: [{ kind: "raw", html: "<p>Locked raw</p>" }],
        },
      ],
    },
    { "items[0].children": true },
  );
  await act(async () =>
    container.querySelector<HTMLElement>('[class*="_ArrayFieldItem-summary_"]')!.click(),
  );
  const summaries = container.querySelectorAll<HTMLElement>('[class*="_ArrayFieldItem-summary_"]');
  expect(
    summaries.length,
    container.textContent + JSON.stringify(api.getItemById("test")!.props.items),
  ).toBeGreaterThan(1);
  await act(async () => summaries[1].click());
  const source = [
    ...container.querySelectorAll<HTMLTextAreaElement>('textarea[aria-label="Raw HTML source"]'),
  ].find((field) => field.value === "<p>Locked raw</p>")!;
  expect(source).not.toBeNull();
  expect(source.disabled).toBe(false);
  expect(source.readOnly).toBe(true);
  expect(api.getItemById("test")!.readOnly).toEqual({ "items[0].children": true });
});

it("edits ordered child source using its document path and retains native attribute context and undo", async () => {
  await mount(
    "Accordion",
    {
      items: [
        {
          title: "Question",
          content: "<p>Answer</p>",
          children: [
            {
              kind: "raw",
              html: "<p>Original raw</p>",
              mjmlAttributes: [{ name: "position", value: "file-start" }],
            },
          ],
        },
      ],
    },
    {},
  );
  await act(async () =>
    container.querySelector<HTMLElement>('[class*="_ArrayFieldItem-summary_"]')!.click(),
  );
  await act(async () =>
    container.querySelectorAll<HTMLElement>('[class*="_ArrayFieldItem-summary_"]')[1].click(),
  );
  const source = [
    ...container.querySelectorAll<HTMLTextAreaElement>('textarea[aria-label="Raw HTML source"]'),
  ].find((field) => field.value === "<p>Original raw</p>")!;
  expect(source.disabled).toBe(false);
  expect(source.readOnly).toBe(false);
  expect(container.querySelector('.pm-attribute-name option[value="position"]')).not.toBeNull();
  const before = api.getItemById("test")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(
      source,
      "<p>Edited raw</p>",
    );
    source.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 300));
  });
  expect(api.getItemById("test")!.props.items[0].children[0].html).toBe("<p>Edited raw</p>");
  expect(api.getItemById("test")!.props.items[0].children[0].mjmlAttributes).toEqual([
    { name: "position", value: "file-start" },
  ]);
  await act(async () => api.history.back());
  expect(api.getItemById("test")!.props.items).toEqual(before.props.items);
});

it("keeps default inline content visible when edit permission is denied", async () => {
  await mount("Text", {}, {}, (config) => {
    config.components.Text.permissions = { edit: false };
  });
  const block = container.querySelector('[data-puck-component="test"]')!;
  expect(block.textContent).toContain("Your text here");
  expect(block.querySelector('[contenteditable="true"]')).toBeNull();
});

it("allows edits to an unlocked ordered child while locking its sibling and array structure", async () => {
  const children = [
    { kind: "raw", html: "<p>Locked child</p>" },
    { kind: "raw", html: "<p>Editable child</p>" },
  ];
  const readOnly = { "items[0].children[0].html": true };
  await mount(
    "Accordion",
    { items: [{ title: "Question", content: "<p>Answer</p>", children }] },
    readOnly,
  );
  await act(async () =>
    container.querySelector<HTMLElement>('[class*="_ArrayFieldItem-summary_"]')!.click(),
  );
  const toggle = [...container.querySelectorAll<HTMLLabelElement>("label")]
    .find((label) => label.textContent?.includes("Use ordered native children"))!
    .querySelector<HTMLInputElement>("input")!;
  const ordered = toggle.closest<HTMLElement>(".pm-field")!;
  expect(toggle.disabled).toBe(true);
  expect(ordered.querySelector('[class*="_ArrayField-addButton_"]')).toBeNull();
  expect(ordered.querySelector('[class*="_ArrayFieldItem-actions_"]')).toBeNull();
  const summaries = ordered.querySelectorAll<HTMLElement>('[class*="_ArrayFieldItem-summary_"]');
  expect(summaries).toHaveLength(2);
  const source = () =>
    ordered.querySelector<HTMLTextAreaElement>('textarea[aria-label="Raw HTML source"]')!;
  const input = async (value: string) => {
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(
        source(),
        value,
      );
      source().dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
  };
  await act(async () => summaries[0].click());
  expect(source().disabled).toBe(false);
  expect(source().readOnly).toBe(true);
  await input("<p>Rejected change</p>");
  expect(api.getItemById("test")!.props.items[0].children).toEqual(children);
  await act(async () => summaries[1].click());
  expect(source().disabled).toBe(false);
  expect(source().readOnly).toBe(false);
  await input("<p>Updated child</p>");
  expect(api.getItemById("test")!.props.items[0].children).toEqual([
    children[0],
    { ...children[1], html: "<p>Updated child</p>" },
  ]);
  expect(api.getItemById("test")!.readOnly).toEqual(readOnly);
  await act(async () => api.history.back());
  expect(api.getItemById("test")!.props.items[0].children).toEqual(children);
  await act(async () => api.history.forward());
  expect(api.getItemById("test")!.props.items[0].children[1].html).toBe("<p>Updated child</p>");
  expect(toggle.disabled).toBe(true);
});
