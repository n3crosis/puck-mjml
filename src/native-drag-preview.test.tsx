// @vitest-environment happy-dom
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { Puck, Render, createUsePuck, type Data, type PuckApi } from "@puckeditor/core";
import { afterEach, describe, expect, it } from "vitest";
import { createEmailConfig } from "./config";
import { fromMjml } from "./import";
import { createNativeDragPreview, NativeDragPreviewProvider } from "./native-drag-preview";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
function row(width: number, childWidths: number[]) {
  const element = document.createElement("div");
  element.getBoundingClientRect = () => ({ width }) as DOMRect;
  for (const childWidth of childWidths) {
    const child = document.createElement("div");
    child.className = "pm-native-inline-column";
    child.getBoundingClientRect = () => ({ width: childWidth }) as DOMRect;
    element.append(child);
  }
  return element;
}
const state = (isDragging: boolean) => ({ ui: { isDragging } });

describe("native drag preview instance bridge", () => {
  it("activates source and every destination synchronously without touching another editor", () => {
    const first = createNativeDragPreview(),
      second = createNativeDragPreview();
    const source = row(600, [240, 360]),
      destination = row(600, [300, 300]),
      other = row(600, [300, 300]);
    const originalBounds = destination.getBoundingClientRect;
    destination.getBoundingClientRect = () => {
      expect(source.hasAttribute("data-pm-native-dragging")).toBe(false);
      return originalBounds();
    };
    first.register(source, "section");
    first.register(destination, "section");
    second.register(other, "section");
    first.onAction({ type: "setUi" }, state(true));
    for (const target of [source, destination]) {
      expect(target.getAttribute("data-pm-native-dragging")).toBe("true");
      expect(target.getAttribute("data-pm-native-drag-axis")).toBe("x");
    }
    expect(other.hasAttribute("data-pm-native-dragging")).toBe(false);
    first.onAction({ type: "setUi" }, state(false));
    expect(source.hasAttribute("data-pm-native-dragging")).toBe(false);
    expect(destination.hasAttribute("data-pm-native-drag-axis")).toBe(false);
  });
  it("classifies actual mobile widths, retains horizontal groups, and cleans up new/replaced rows", () => {
    const bridge = createNativeDragPreview();
    const stacked = row(390, [390, 390]),
      authored = row(390, [80, 310]),
      group = row(390, [390, 390]),
      empty = row(390, []);
    empty.style.setProperty("--pm-native-empty-drag-axis", "y");
    document.body.append(empty);
    bridge.register(stacked, "section");
    bridge.register(authored, "section");
    bridge.register(group, "group");
    const removeEmpty = bridge.register(empty, "section");
    bridge.onAction({}, state(true));
    expect(stacked.getAttribute("data-pm-native-drag-axis")).toBe("y");
    expect(authored.getAttribute("data-pm-native-drag-axis")).toBe("x");
    expect(group.getAttribute("data-pm-native-drag-axis")).toBe("x");
    expect(empty.getAttribute("data-pm-native-drag-axis")).toBe("y");
    removeEmpty();
    empty.remove();
    const replacement = row(600, [300, 300]),
      remove = bridge.register(replacement, "section");
    expect(replacement.getAttribute("data-pm-native-dragging")).toBe("true");
    remove();
    expect(replacement.hasAttribute("data-pm-native-dragging")).toBe(false);
    bridge.reset();
    for (const target of [stacked, authored, group])
      expect(target.hasAttribute("data-pm-native-dragging")).toBe(false);
    bridge.onAction({}, state(true));
    expect(replacement.hasAttribute("data-pm-native-dragging")).toBe(false);
  });
});

const source =
  '<mjml><mj-head><mj-attributes><mj-all font-family="Arial"/></mj-attributes></mj-head><mj-body><mj-section direction="rtl" padding="0"><mj-column css-class="first" width="50%" vertical-align="middle"><mj-text>First</mj-text></mj-column><mj-group css-class="group" width="50%" direction="ltr"><mj-column><mj-text>Second</mj-text></mj-column></mj-group></mj-section></mj-body></mjml>';
const usePuck = createUsePuck();
const apis = new Map<string, PuckApi>();
function Capture({ name }: { name: string }) {
  const api = usePuck((state) => state);
  useEffect(() => {
    apis.set(name, api);
  }, [api, name]);
  return null;
}
let root: Root | undefined, container: HTMLDivElement | undefined;
afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  apis.clear();
});

describe("native drag preview custom-host compatibility", () => {
  it("keeps direct Puck editors flex by default and opts bridged editors into inline layout", async () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    const bridge = createNativeDragPreview(),
      config = createEmailConfig(),
      data = fromMjml(source).document as Data;
    const view = (name: string) => (
      <section data-host={name}>
        <Puck
          config={config}
          data={data}
          iframe={{ enabled: false }}
          onAction={name === "bridged" ? bridge.onAction : undefined}
        >
          <Capture name={name} />
          <Puck.Preview />
        </Puck>
      </section>
    );
    await act(async () =>
      root!.render(
        <>
          {view("legacy")}
          <NativeDragPreviewProvider bridge={bridge}>
            {view("bridged")}
            <section data-host="readonly">
              <Render config={config} data={data} />
            </section>
          </NativeDragPreviewProvider>
        </>,
      ),
    );
    const legacy = container.querySelector<HTMLElement>(
      '[data-host="legacy"] .pm-native-inline-section > div',
    )!;
    const bridged = container.querySelector<HTMLElement>(
      '[data-host="bridged"] .pm-native-inline-section > div',
    )!;
    const readonly = container.querySelector<HTMLElement>(
      '[data-host="readonly"] .pm-native-inline-section > div',
    )!;
    expect(readonly.style.display).toBe("block");
    expect(legacy.style.display).toBe("flex");
    expect(bridged.style.display).toBe("block");
    expect(legacy.querySelector<HTMLElement>(".first")!.style.alignSelf).toBe("center");
    expect(bridged.querySelector<HTMLElement>(".first")!.style.alignSelf).toBe("");
    expect(bridged.getAttribute("dir")).toBe("rtl");
    expect(bridged.querySelector(".group")!.getAttribute("dir")).toBeNull();
    expect(bridged.querySelector(".group > div")!.getAttribute("dir")).toBe("ltr");
    await act(async () => {
      apis
        .get("bridged")!
        .dispatch({ type: "setUi", ui: { isDragging: true }, recordHistory: false });
      // onAction updates geometry before dispatch returns, without waiting for
      // a React commit, a global iframe query, or Puck's line marker.
      expect(bridged.getAttribute("data-pm-native-dragging")).toBe("true");
      expect(legacy.hasAttribute("data-pm-native-dragging")).toBe(false);
      expect(readonly.hasAttribute("data-pm-native-dragging")).toBe(false);
      expect(readonly.style.display).toBe("block");
    });
    await act(async () =>
      apis
        .get("bridged")!
        .dispatch({ type: "setUi", ui: { isDragging: false }, recordHistory: false }),
    );
    expect(bridged.hasAttribute("data-pm-native-dragging")).toBe(false);
    expect(apis.get("bridged")!.history.hasPast).toBe(false);
    await act(async () => root!.unmount());
    root = undefined;
    bridge.onAction({}, state(true));
    expect(bridged.hasAttribute("data-pm-native-dragging")).toBe(false);
  });
  it("renders inline rows without any provider or onAction requirement in read-only SSR", () => {
    const html = renderToStaticMarkup(
      <Render config={createEmailConfig()} data={fromMjml(source).document as Data} />,
    );
    expect(html).toContain("display:block");
    expect(html).toContain("vertical-align:middle");
    expect(html).not.toContain("data-pm-native-dragging");
    expect(html).not.toContain("align-self:center");
  });
});
