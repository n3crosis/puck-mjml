// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Puck, createUsePuck, type Config, type Data, type PuckApi } from "@puckeditor/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EmailOutline } from "./EmailOutline";
import { createEmailConfig } from "./config";
import { createEmptyDocument } from "./document";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const usePuck = createUsePuck();
const require = createRequire(import.meta.url);
let root: Root | undefined;
let container: HTMLDivElement | undefined;
let style: HTMLStyleElement | undefined;
let api: PuckApi | undefined;
function CaptureApi() {
  const current = usePuck((state) => state);
  useEffect(() => {
    api = current;
  }, [current]);
  return null;
}
afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  style?.remove();
  root = undefined;
  container = undefined;
  style = undefined;
  api = undefined;
  vi.unstubAllGlobals();
});
async function mount(config: Config, data: Data) {
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });
  container = document.createElement("div");
  document.body.append(container);
  style = document.createElement("style");
  style.textContent =
    readFileSync(require.resolve("@puckeditor/core/puck.css"), "utf8").replace(
      /^@import[^;]+;/gm,
      "",
    ) + readFileSync("src/email-outline.css", "utf8");
  document.head.append(style);
  root = createRoot(container);
  await act(async () =>
    root!.render(
      <Puck config={config} data={data} overrides={{ outline: EmailOutline }}>
        <CaptureApi />
        <Puck.Outline />
      </Puck>,
    ),
  );
}
const query = <T extends HTMLElement>(selector: string) => container!.querySelector<T>(selector)!;
const tree = () => query('[class*="_LayerTreeRoot_"]');
const layer = (id: string) => query(`[data-puck-layer-tree-id="${id}"]`);

describe("email outline", () => {
  it("hides only the unused empty default root and preserves native nested selection and collapse", async () => {
    const document = createEmptyDocument();
    document.root.props!.sections = [
      {
        type: "Section3",
        props: {
          id: "section",
          left: [{ type: "Text", props: { id: "copy", content: "Hello" } }],
          middle: [],
          right: [],
        },
      },
    ];
    await mount(createEmailConfig(), document as Data);
    const [sectionsTitle, sectionsList] = [...tree().children];
    expect(tree().children).toHaveLength(2);
    expect(tree().textContent).not.toContain("default-zone");
    expect(sectionsTitle.textContent).toBe("Sections");
    expect(getComputedStyle(sectionsList).display).not.toBe("none");
    expect(layer("section").className).toContain("--isSortable_");
    expect(container!.querySelector('[data-puck-layer-tree-id="copy"]')).toBeNull();
    await act(async () =>
      layer("section").querySelector<HTMLButtonElement>('[title="Expand"]')!.click(),
    );
    expect(api!.appState.ui.itemExpanded?.section).toBe(true);
    const names = [...layer("section").querySelectorAll('[class*="_LayerTree-zoneTitle_"]')].map(
      (element) => element.textContent,
    );
    expect(names).toEqual(["Left column", "Middle column", "Right column"]);
    const emptyColumns = [...layer("section").querySelectorAll('[class*="_LayerTree-helper_"]')];
    expect(emptyColumns).toHaveLength(2);
    expect(emptyColumns.every((element) => getComputedStyle(element).display !== "none")).toBe(
      true,
    );
    await act(async () =>
      layer("copy").querySelector<HTMLButtonElement>('[class*="_Layer-clickable_"]')!.click(),
    );
    expect(api!.selectedItem?.props.id).toBe("copy");
    await act(async () => query<HTMLButtonElement>('[title="Collapse all"]').click());
    expect(api!.appState.ui.itemExpanded).toEqual({});
    expect(container!.querySelector('[data-puck-layer-tree-id="copy"]')).toBeNull();
  });

  it("reveals actual default content immediately after insertion and hides it again when empty", async () => {
    await mount(createEmailConfig(), createEmptyDocument() as Data);
    await act(async () =>
      api!.dispatch({
        type: "insert",
        componentType: "Text",
        id: "legacy-copy",
        destinationIndex: 0,
        destinationZone: "root:default-zone",
      }),
    );
    expect(tree().firstElementChild?.textContent).toBe("Content");
    expect(getComputedStyle(tree().firstElementChild!).display).not.toBe("none");
    expect(layer("legacy-copy")).not.toBeNull();
    await act(async () =>
      layer("legacy-copy")
        .querySelector<HTMLButtonElement>('[class*="_Layer-clickable_"]')!
        .click(),
    );
    expect(api!.selectedItem?.props.id).toBe("legacy-copy");
    await act(async () =>
      layer("legacy-copy").querySelector<HTMLButtonElement>('[title="Delete"]')!.click(),
    );
    expect(api!.appState.data.content).toEqual([]);
    expect(tree().children).toHaveLength(2);
    const [sectionsTitle, sectionsList] = [...tree().children];
    expect(sectionsTitle.textContent).toBe("Sections");
    expect(getComputedStyle(sectionsTitle).display).not.toBe("none");
    expect(sectionsList.textContent).toBe("No items");
    expect(getComputedStyle(sectionsList).display).not.toBe("none");
  });

  it("keeps the empty default drop target for host configurations without an email sections slot", async () => {
    await mount({ components: {} }, { root: { props: {} }, content: [] });
    expect(tree().textContent).toBe("No items");
    expect(getComputedStyle(tree().firstElementChild!).display).not.toBe("none");
  });
});
