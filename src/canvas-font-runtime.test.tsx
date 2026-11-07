// @vitest-environment happy-dom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EmailCanvas } from "./EmailCanvas";
import { getCanvasElement, useNativeCanvasScope } from "./native-canvas-context";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
const render = async (node: ReactNode) => act(async () => root.render(node));
const cssResponse = (css: string) => ({ ok: true, status: 200, text: async () => css });
const face = (name: string, src: string, weight = "400") =>
  `@font-face { font-family: '${name}'; font-weight: ${weight}; src: url(${src}); }`;
function Copy({ family }: { family: string }) {
  const scope = useNativeCanvasScope();
  const node = getCanvasElement(
    "mj-text",
    { mjmlAttributes: [{ name: "font-family", value: family }] },
    scope,
  )!;
  return <p style={{ fontFamily: node.attributes["font-family"] }}>Native typography</p>;
}
const canvas = () => container.querySelector<HTMLElement>(".pm-canvas")!;
const imported = () => container.querySelector<HTMLStyleElement>("[data-pm-canvas-fonts]")!;
const scopeOf = (node: Element) =>
  [...node.classList].find((value) => value.startsWith("pm-canvas-"))!;

describe("canvas font lifecycle", () => {
  it("keeps delayed variable imports before later static faces, without accepting the static registration as ready", async () => {
    let finish!: (value: ReturnType<typeof cssResponse>) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      ),
    );
    await render(
      <EmailCanvas
        fontImports={[{ name: "Inter", href: "https://fonts.example/lifecycle-delayed.css" }]}
        headStyles={[{ css: face("Inter", "static.woff2", "600"), inline: "head" }]}
      >
        <Copy family="Inter, Arial" />
      </EmailCanvas>,
    );
    const scope = scopeOf(canvas());
    expect(container.querySelector("[data-pm-canvas-css]")!.textContent).toContain(
      `Inter-${scope}`,
    );
    expect(canvas().dataset.pmCanvasFontStatus).toBe("loading");
    expect(imported().textContent).toBe("");
    await act(async () => finish(cssResponse(face("Inter", "variable.woff2", "100 900"))));
    expect(canvas().dataset.pmCanvasFontStatus).toBe("ready");
    const styles = [...canvas().querySelectorAll("style")];
    expect(styles.indexOf(imported())).toBeLessThan(
      styles.indexOf(container.querySelector("[data-pm-canvas-css]")!),
    );
    expect(imported().textContent).toContain("font-weight: 100 900");
    expect(container.querySelector("p")!.style.fontFamily).toContain(`Inter-${scope}`);
  });

  it("shares head-only aliases with native content and keeps two editors isolated", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await render(
      <>
        <EmailCanvas headStyles={[{ css: face("Head Only", "first.woff2"), inline: "head" }]}>
          <Copy family="'Head Only', serif" />
        </EmailCanvas>
        <EmailCanvas headStyles={[{ css: face("Head Only", "second.woff2"), inline: "head" }]}>
          <Copy family='"head only", serif' />
        </EmailCanvas>
      </>,
    );
    const canvases = [...container.querySelectorAll<HTMLElement>(".pm-canvas")];
    for (const element of canvases) {
      const alias = `HeadOnly-${scopeOf(element)}`;
      expect(element.querySelector("p")!.style.fontFamily).toContain(alias);
      expect(element.querySelector("[data-pm-canvas-css]")!.textContent).toContain(alias);
      expect(element.dataset.pmCanvasFontStatus).toBe("idle");
    }
    expect(scopeOf(canvases[0])).not.toBe(scopeOf(canvases[1]));
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("isolates imported CSS for same-name faces in concurrent editors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => cssResponse(face("Same", `${url}.woff2`))),
    );
    await render(
      <>
        {["first", "second"].map((name) => (
          <EmailCanvas
            key={name}
            fontImports={[{ name: "Same", href: `https://fonts.example/concurrent-${name}.css` }]}
          >
            <Copy family="Same" />
          </EmailCanvas>
        ))}
      </>,
    );
    const canvases = [...container.querySelectorAll<HTMLElement>(".pm-canvas")];
    expect(canvases).toHaveLength(2);
    canvases.forEach((element, index) => {
      const css = element.querySelector("[data-pm-canvas-fonts]")!.textContent;
      expect(css).toContain(`Same-${scopeOf(element)}`);
      expect(css).not.toContain(`Same-${scopeOf(canvases[1 - index])}`);
      expect(css).toContain(index === 0 ? "concurrent-first" : "concurrent-second");
    });
  });

  it("discovers only used implicit defaults and reacts to newly introduced and removed native families", async () => {
    const fetcher = vi.fn(async () => cssResponse(face("Roboto", "roboto.woff2")));
    vi.stubGlobal("fetch", fetcher);
    await render(
      <EmailCanvas>
        <Copy family="Arial" />
      </EmailCanvas>,
    );
    expect(fetcher).not.toHaveBeenCalled();
    expect(canvas().dataset.pmCanvasFontStatus).toBe("idle");
    await render(
      <EmailCanvas>
        <Copy family="Arial, 'rObOtO', serif" />
      </EmailCanvas>,
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(
      "https://fonts.googleapis.com/css?family=Roboto:300,400,500,700",
    );
    expect(imported().textContent).toContain(`Roboto-${scopeOf(canvas())}`);
    expect(canvas().dataset.pmCanvasFontStatus).toBe("ready");
    await render(
      <EmailCanvas>
        <Copy family="Arial" />
      </EmailCanvas>,
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    expect(container.querySelector("[data-pm-canvas-fonts]")).toBeNull();
    expect(canvas().dataset.pmCanvasFontStatus).toBe("idle");
  });

  it("honors explicit default-family overrides and custom static faces", async () => {
    const fetcher = vi.fn(async () => cssResponse(face("ubuntu", "custom.woff2", "100 900")));
    vi.stubGlobal("fetch", fetcher);
    await render(
      <EmailCanvas
        fontImports={[{ name: "ubuntu", href: "https://fonts.example/override.css" }]}
        headStyles={[{ css: face("Ubuntu", "static.woff2", "400"), inline: "head" }]}
      >
        <Copy family="Ubuntu, Arial" />
      </EmailCanvas>,
    );
    expect(fetcher).toHaveBeenCalledExactlyOnceWith("https://fonts.example/override.css");
    expect(container.querySelector("p")!.style.fontFamily).toContain(`ubuntu-${scopeOf(canvas())}`);
    expect(imported().textContent).toContain(`ubuntu-${scopeOf(canvas())}`);
    expect(container.querySelector("[data-pm-canvas-css]")!.textContent).toContain(
      `ubuntu-${scopeOf(canvas())}`,
    );
  });

  it("requests a used default even with a head-only static face, while keeping the static face later", async () => {
    const fetcher = vi.fn(async () =>
      cssResponse(face("Lato", "default-variable.woff2", "100 900")),
    );
    vi.stubGlobal("fetch", fetcher);
    await render(
      <EmailCanvas
        headStyles={[{ css: face("Lato", "authored-static.woff2", "400"), inline: "head" }]}
      >
        <Copy family="Lato, serif" />
      </EmailCanvas>,
    );
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(
      "https://fonts.googleapis.com/css?family=Lato:300,400,500,700",
    );
    expect(imported().textContent).toContain(`Lato-${scopeOf(canvas())}`);
    expect(container.querySelector("[data-pm-canvas-css]")!.textContent).toContain(
      `Lato-${scopeOf(canvas())}`,
    );
    expect([...canvas().querySelectorAll("style")][0]).toBe(imported());
    expect(canvas().dataset.pmCanvasFontStatus).toBe("ready");
  });

  it("does not discover a nested editor's inline default-font families", async () => {
    const fetcher = vi.fn(async () => cssResponse(face("Open Sans", "nested.woff2")));
    vi.stubGlobal("fetch", fetcher);
    await render(
      <EmailCanvas>
        <Copy family="Arial" />
        <EmailCanvas>
          <Copy family="Open Sans" />
        </EmailCanvas>
      </EmailCanvas>,
    );
    const canvases = [...container.querySelectorAll<HTMLElement>(".pm-canvas")];
    expect(canvases[0].dataset.pmCanvasFontStatus).toBe("idle");
    expect(canvases[0].querySelector(":scope > [data-pm-canvas-fonts]")).toBeNull();
    expect(canvases[1].dataset.pmCanvasFontStatus).toBe("ready");
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(
      "https://fonts.googleapis.com/css?family=Open+Sans:300,400,500,700",
    );
  });

  it("never imports a built-in Open Sans face for the distinct custom OpenSans family", async () => {
    const fetcher = vi.fn(async () => cssResponse(face("OpenSans", "custom-distinct.woff2")));
    vi.stubGlobal("fetch", fetcher);
    await render(
      <EmailCanvas
        fontImports={[{ name: "OpenSans", href: "https://fonts.example/distinct-open-sans.css" }]}
      >
        <Copy family="OpenSans, Arial" />
      </EmailCanvas>,
    );
    expect(fetcher).toHaveBeenCalledExactlyOnceWith("https://fonts.example/distinct-open-sans.css");
    expect(imported().textContent).toContain("custom-distinct.woff2");
    expect(imported().textContent).not.toContain("nested.woff2");
    expect(imported().textContent!.match(/@font-face/g)).toHaveLength(1);
    expect(container.querySelector("p")!.style.fontFamily).toContain(
      `OpenSans-${scopeOf(canvas())}`,
    );
  });

  it("does not expose stale CSS or apply a late response after document imports change", async () => {
    const finishes = new Map<string, (value: ReturnType<typeof cssResponse>) => void>();
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => new Promise((resolve) => finishes.set(url, resolve))),
    );
    const editor = (name: string) => (
      <EmailCanvas fontImports={[{ name, href: `https://fonts.example/stale-${name}.css` }]}>
        <Copy family={name} />
      </EmailCanvas>
    );
    await render(editor("Old"));
    await render(editor("New"));
    expect(imported().textContent).toBe("");
    expect(canvas().dataset.pmCanvasFontStatus).toBe("loading");
    await act(async () =>
      finishes.get("https://fonts.example/stale-New.css")!(cssResponse(face("New", "new.woff2"))),
    );
    expect(imported().textContent).toContain("new.woff2");
    await act(async () =>
      finishes.get("https://fonts.example/stale-Old.css")!(cssResponse(face("Old", "old.woff2"))),
    );
    expect(imported().textContent).toContain("new.woff2");
    expect(imported().textContent).not.toContain("old.woff2");
  });

  it("settles a failed stylesheet as error even when a matching static head face exists", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 503, text: async () => "" })),
    );
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await render(
      <EmailCanvas
        fontImports={[{ name: "Missing", href: "https://fonts.example/failed.css" }]}
        headStyles={[{ css: face("Missing", "static.woff2"), inline: "head" }]}
      >
        <Copy family="Missing" />
      </EmailCanvas>,
    );
    expect(canvas().dataset.pmCanvasFontStatus).toBe("error");
    expect(canvas().dataset.pmCanvasFontErrors).toContain("HTTP 503");
    expect(imported().textContent).toBe("");
    vi.restoreAllMocks();
  });
});
