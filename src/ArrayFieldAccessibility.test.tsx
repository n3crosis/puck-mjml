// @vitest-environment happy-dom
import { act, StrictMode, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Puck, createUsePuck, type Config, type Data, type PuckApi } from "@puckeditor/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emailFieldTypes } from "./editor-field-types";
import { PropertyFieldLabel } from "./PropertyInspector";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const usePuck = createUsePuck();
let root: Root | undefined;
let container: HTMLDivElement | undefined;
let api: PuckApi | undefined;
function CaptureApi() {
  const current = usePuck((state) => state);
  useEffect(() => {
    api = current;
  }, [current]);
  return null;
}
type RootProps = {
  rules: { name: string; conditions: { query: string }[] }[];
  hidden: { hidden: string }[];
  limited: { name: string }[];
};
const config: Config<Record<string, never>, RootProps> = {
  components: {},
  root: {
    fields: {
      rules: {
        type: "array",
        label: "CSS rules",
        getItemSummary: (item) => item.name,
        defaultItemProps: { name: "New rule", conditions: [] },
        arrayFields: {
          name: { type: "text", label: "Rule name" },
          conditions: {
            type: "array",
            label: "Conditions",
            getItemSummary: (item) => item.query,
            defaultItemProps: { query: "New condition" },
            arrayFields: { query: { type: "text", label: "Query" } },
          },
        },
      },
      hidden: {
        type: "array",
        label: "Hidden fields",
        getItemSummary: () => "No visible fields",
        arrayFields: { hidden: { type: "text", visible: false } },
      },
      limited: {
        type: "array",
        label: "Limited rules",
        max: 1,
        getItemSummary: () => "At maximum",
        arrayFields: { name: { type: "text", label: "Limited name" } },
      },
    },
  },
};
const initial: Data<Record<string, never>, RootProps> = {
  root: {
    props: {
      rules: [
        { name: "First rule", conditions: [{ query: "Mobile" }] },
        { name: "Second rule", conditions: [] },
      ],
      hidden: [{ hidden: "Preserved" }],
      limited: [{ name: "One" }],
    },
  },
  content: [],
};
beforeEach(() => {
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {} });
});
afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  api = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function mount(data = initial, duplicate = false, edit = true) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root!.render(
      <StrictMode>
        <Puck
          config={config}
          data={data}
          permissions={{ edit }}
          iframe={{ enabled: false }}
          overrides={{ fieldTypes: emailFieldTypes, fieldLabel: PropertyFieldLabel }}
        >
          <CaptureApi />
          {duplicate && (
            <div hidden>
              <Puck.Fields />
            </div>
          )}
          <div data-visible-fields>
            <Puck.Fields />
          </div>
        </Puck>
      </StrictMode>,
    ),
  );
}
const field = (label = "CSS rules") =>
  container!.querySelector<HTMLElement>(`[data-visible-fields] [data-pm-array-field="${label}"]`)!;
const summaries = (scope = field()) =>
  [...scope.querySelectorAll<HTMLElement>('[class*="_ArrayFieldItem-summary_"]')].filter(
    (node) => node.closest("[data-pm-array-field]") === scope,
  );
const add = (scope = field()) =>
  [...scope.querySelectorAll<HTMLButtonElement>("[data-pm-array-add]")].find(
    (node) => node.closest("[data-pm-array-field]") === scope,
  ) ?? null;
async function key(target: HTMLElement, key: string, options: KeyboardEventInit = {}) {
  const down = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...options });
  const up = new KeyboardEvent("keyup", { key, bubbles: true, cancelable: true, ...options });
  await act(async () => {
    target.dispatchEvent(down);
    target.dispatchEvent(up);
  });
  return { down, up };
}

describe("native Puck array accessibility", () => {
  it("names Add and toggles by Enter, Space, and click without data or history edits", async () => {
    await mount();
    const summary = summaries()[0];
    const before = JSON.stringify(api!.appState.data);
    const history = api!.history.index;
    expect(add()!.getAttribute("aria-label")).toBe("Add item to CSS rules");
    expect(summary.getAttribute("aria-expanded")).toBe("false");
    const body = document.getElementById(summary.getAttribute("aria-controls")!);
    expect(body).toBe(summary.nextElementSibling);
    summary.focus();
    for (const activation of ["Enter", " ", "click", "Enter", " ", "click"]) {
      const wasOpen = summary.getAttribute("aria-expanded") === "true";
      if (activation === "click") await act(async () => summary.click());
      else {
        const result = await key(summary, activation);
        expect(result.down.defaultPrevented).toBe(true);
      }
      expect(summary.getAttribute("aria-expanded")).toBe(String(!wasOpen));
      expect(Boolean(body!.firstElementChild)).toBe(!wasOpen);
      expect(document.activeElement).toBe(summary);
      expect(JSON.stringify(api!.appState.data)).toBe(before);
      expect(api!.history.index).toBe(history);
    }
    await act(async () => add()!.click());
    expect(api!.appState.data.root.props!.rules as unknown[]).toHaveLength(3);
    expect(summaries().at(-1)!.getAttribute("aria-expanded")).toBe("false");
  });

  it("keeps nested arrays and duplicate field instances independently labelled and linked", async () => {
    await mount(initial, true);
    await key(summaries()[0], "Enter");
    const scopes = [
      ...container!.querySelectorAll<HTMLElement>('[data-pm-array-field="CSS rules"]'),
    ];
    expect(scopes).toHaveLength(2);
    const ids: string[] = [];
    for (const scope of scopes) {
      expect(add(scope)!.getAttribute("aria-label")).toBe("Add item to CSS rules");
      const nested = scope.querySelector<HTMLElement>('[data-pm-array-field="Conditions"]')!;
      expect(nested).not.toBeNull();
      expect(add(nested)!.getAttribute("aria-label")).toBe("Add item to Conditions");
      for (const summary of [...summaries(scope), ...summaries(nested)]) {
        const id = summary.getAttribute("aria-controls")!;
        ids.push(id);
        expect(document.getElementById(id)).toBe(summary.nextElementSibling);
      }
    }
    expect(new Set(ids).size).toBe(ids.length);
    const outer = summaries()[0];
    const nested = field("Conditions");
    const nestedSummary = summaries(nested)[0];
    await key(nestedSummary, "Enter");
    expect(nestedSummary.getAttribute("aria-expanded")).toBe("true");
    expect(outer.getAttribute("aria-expanded")).toBe("true");
    await act(async () => add(nested)!.click());
    expect(summaries(nested)).toHaveLength(2);
    expect(summaries()).toHaveLength(2);
    expect(add(nested)!.getAttribute("aria-label")).toBe("Add item to Conditions");
  });

  it.each(["field", "editor"] as const)(
    "allows inspecting a %s-locked array without enabling mutations",
    async (lock) => {
      await mount(
        lock === "field"
          ? { ...initial, root: { ...initial.root, readOnly: { rules: true } } }
          : initial,
        false,
        lock !== "editor",
      );
      const summary = summaries()[0];
      expect(summary.tabIndex).toBe(0);
      expect(summary.hasAttribute("aria-disabled")).toBe(false);
      expect(add()).toBeNull();
      const before = JSON.stringify(api!.appState.data);
      await key(summary, "Enter");
      expect(summary.getAttribute("aria-expanded")).toBe("true");
      const input = field().querySelector<HTMLInputElement>('input[type="text"]')!;
      expect(input.readOnly).toBe(true);
      expect(field().querySelector('button[aria-label="Delete"]')).toBeNull();
      await key(summary, " ");
      expect(summary.getAttribute("aria-expanded")).toBe("false");
      expect(JSON.stringify(api!.appState.data)).toBe(before);
    },
  );

  it("does not create disclosures for entries with no visible fields or bypass maximum counts", async () => {
    await mount();
    const summary = summaries(field("Hidden fields"))[0];
    expect(summary.hasAttribute("aria-expanded")).toBe(false);
    expect(summary.hasAttribute("aria-controls")).toBe(false);
    const before = JSON.stringify(api!.appState.data);
    expect((await key(summary, "Enter")).down.defaultPrevented).toBe(false);
    expect(add(field("Limited rules"))).toBeNull();
    expect(
      field("Limited rules").querySelector<HTMLButtonElement>('[aria-label="Duplicate"]')!.disabled,
    ).toBe(true);
    expect(JSON.stringify(api!.appState.data)).toBe(before);
  });

  it("leaves descendant, modified, composing, repeated, handled, and active-drag keys alone", async () => {
    await mount();
    const summary = summaries()[0];
    for (const modifiers of [
      { ctrlKey: true },
      { shiftKey: true },
      { altKey: true },
      { metaKey: true },
      { isComposing: true },
    ]) {
      expect((await key(summary, "Enter", modifiers)).down.defaultPrevented).toBe(false);
      expect(summary.getAttribute("aria-expanded")).toBe("false");
    }
    await key(summary, "Enter", { repeat: true });
    expect(summary.getAttribute("aria-expanded")).toBe("false");
    const stop = (event: Event) => event.preventDefault();
    summary.addEventListener("keydown", stop);
    await key(summary, "Enter");
    summary.removeEventListener("keydown", stop);
    expect(summary.getAttribute("aria-expanded")).toBe("false");
    summary.setAttribute("aria-grabbed", "true");
    expect((await key(summary, "Enter")).down.defaultPrevented).toBe(false);
    summary.setAttribute("aria-grabbed", "false");
    await key(summary, "Enter");
    const input = field().querySelector<HTMLInputElement>('input[type="text"]')!;
    expect((await key(input, "Enter")).down.defaultPrevented).toBe(false);
    const duplicate = summary.querySelector<HTMLButtonElement>('[aria-label="Duplicate"]')!;
    expect((await key(duplicate, " ")).down.defaultPrevented).toBe(false);
    expect(summary.getAttribute("aria-expanded")).toBe("true");
    expect(api!.appState.data.root.props!.rules as unknown[]).toHaveLength(2);
  });

  it("cancels interrupted Space activation and disconnects mutation observers on unmount", async () => {
    const observe = vi.spyOn(MutationObserver.prototype, "observe");
    const disconnect = vi.spyOn(MutationObserver.prototype, "disconnect");
    await mount();
    const summary = summaries()[0];
    summary.focus();
    await act(async () =>
      summary.dispatchEvent(
        new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true }),
      ),
    );
    add()!.focus();
    await act(async () =>
      summary.dispatchEvent(
        new KeyboardEvent("keyup", { key: " ", bubbles: true, cancelable: true }),
      ),
    );
    expect(summary.getAttribute("aria-expanded")).toBe("false");
    summary.focus();
    await act(async () =>
      summary.dispatchEvent(
        new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true }),
      ),
    );
    await key(summary, "Escape");
    await act(async () =>
      summary.dispatchEvent(
        new KeyboardEvent("keyup", { key: " ", bubbles: true, cancelable: true }),
      ),
    );
    expect(summary.getAttribute("aria-expanded")).toBe("false");
    const adapters = observe.mock.calls.flatMap(([target], index) =>
      target instanceof HTMLElement && target.hasAttribute("data-pm-array-field")
        ? [observe.mock.contexts[index]]
        : [],
    );
    expect(adapters.length).toBeGreaterThanOrEqual(3);
    await act(async () => root!.unmount());
    root = undefined;
    for (const observer of adapters) expect(disconnect.mock.contexts).toContain(observer);
    expect(container!.querySelector("[data-pm-array-field]")).toBeNull();
  });
});
