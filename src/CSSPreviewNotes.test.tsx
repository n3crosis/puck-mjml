// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CSSPreviewNotes } from "./CSSPreviewNotes";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
const element = (source: string) => (
  <CSSPreviewNotes source={source} descriptionId="preview-notes" ariaLabel="Custom CSS" />
);
const render = (source: string) => act(() => root.render(element(source)));
const status = () => container.querySelector('[role="status"]')!.textContent;
const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));

describe("Custom CSS native preview notes", () => {
  it.each([
    [".card{color:", "Could not be parsed"],
    ["@scope (.card){p{color:red}}", "unsupported @scope"],
    ['@keyframes "pulse"{to{opacity:1}}', "keyframes"],
    [String.raw`@font-face{font-family:S\65 cond;src:url(face.woff2)}`, "@font-face"],
    [".card{& + .outside{color:red}}", "nesting subset"],
    ["@layer theme{.card{color:red}}", "layer semantics"],
  ])("describes native preview limits without declaring browser CSS invalid: %s", (css, text) => {
    const warn = vi.spyOn(console, "warn");
    const fetch = vi.spyOn(globalThis, "fetch");
    render(css);
    expect(container.querySelector("summary")!.textContent).toBe("1 preview note");
    expect(container.querySelector("li")!.textContent).toContain(text);
    expect(container.querySelector("li")!.textContent).not.toContain("Custom CSS 1");
    const description = document.getElementById("preview-notes")!;
    expect(description.textContent).toBe(
      "Native editor preview may differ. Source CSS and export are unchanged.",
    );
    expect(description.textContent).not.toContain(text);
    expect(container.textContent).toContain("not a full CSS validation");
    expect(container.querySelector("[aria-invalid]")).toBeNull();
    expect(container.querySelector("details")!.open).toBe(false);
    expect(warn).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("deduplicates repeated notes and keeps supported CSS quiet without promising parity", () => {
    render("@scope (.a){p{color:red}} @scope (.b){p{color:blue}} @page{margin:0}");
    expect(container.querySelector("summary")!.textContent).toBe("2 preview notes");
    expect(container.querySelectorAll("li")).toHaveLength(2);
    render(
      '@media all{@supports(display:block){.card{color:red;&:hover{color:blue}}}} @keyframes pulse{to{opacity:1}} @font-face{font-family:"Example";src:url(face.woff2)}',
    );
    expect(container.querySelector(".pm-css-preview-notes")).toBeNull();
    expect(container.querySelector("details")).toBeNull();
    expect(document.getElementById("preview-notes")!.hidden).toBe(true);
    expect(status()).toBe("");
  });

  it("debounces announcements until typing pauses and does not reread changing parser positions", () => {
    vi.useFakeTimers();
    render(".card{");
    expect(status()).toBe("");
    advance(600);
    render("\n.card{");
    advance(600);
    expect(status()).toBe("");
    advance(100);
    expect(status()).toBe(
      "Custom CSS: 1 native preview note. Source CSS and export are unchanged.",
    );
    const announcement = status();
    const mutated = vi.fn();
    const observer = new MutationObserver(mutated);
    observer.observe(container.querySelector('[role="status"]')!, {
      childList: true,
      characterData: true,
      subtree: true,
    });
    render("\n\n.card{");
    advance(700);
    expect(status()).toBe(announcement);
    expect(observer.takeRecords()).toHaveLength(0);
    expect(mutated).not.toHaveBeenCalled();
    observer.disconnect();
    render("@scope (.a){p{color:red}} @page{margin:0}");
    advance(700);
    expect(status()).toContain("2 native preview notes");
    render(".card{color:red}");
    expect(container.querySelector("details")).toBeNull();
    advance(700);
    expect(status()).toBe("Custom CSS: Native preview notes cleared.");
    render(".card{color:blue}");
    advance(700);
    expect(status()).toBe("Custom CSS: Native preview notes cleared.");
  });

  it("cancels transient warnings and pending announcements on unmount", () => {
    vi.useFakeTimers();
    render(".card{");
    advance(600);
    render(".card{color:red}");
    advance(700);
    expect(status()).toBe("");
    render(".card{");
    act(() => root.render(null));
    expect(vi.getTimerCount()).toBe(0);
  });

  it("renders source snippets as text, including in SSR", () => {
    const css = '.card{& + [data-label="<img src=x onerror=alert(1)>"]{color:red}}';
    render(css);
    expect(container.querySelector("li")!.textContent).toContain("<img src=x");
    expect(container.querySelector("img")).toBeNull();
    const html = renderToStaticMarkup(element(css));
    expect(html).toContain("&lt;img");
    expect(html).not.toContain("<img");
  });
});
