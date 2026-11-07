import { describe, expect, it } from "vitest";
import { bundledTailwindScript, resolveTailwindScript, scopeTailwindCss } from "./canvas-tailwind";

describe("host-approved Tailwind runtime", () => {
  it("requires both the document toggle and host permission", () => {
    expect(resolveTailwindScript(true, undefined)).toBeUndefined();
    expect(resolveTailwindScript(false, true)).toBeUndefined();
    expect(resolveTailwindScript("true", true)).toBe(bundledTailwindScript);
    expect(resolveTailwindScript(true, "https://example.com/runtime.js")).toBe(
      "https://example.com/runtime.js",
    );
  });
  it.each([
    "",
    "javascript:alert(1)",
    "data:text/javascript,alert(1)",
    "//example.com/runtime.js",
    "https://user:secret@example.com/runtime.js",
    "not a URL",
  ])("does not fall back to another executable source for %s", (url) => {
    expect(resolveTailwindScript(true, url)).toBeUndefined();
  });
  it("scopes selectors and namespaces Tailwind properties and animations", () => {
    const css = scopeTailwindCss(
      `
      @property --tw-rotate { syntax: "*"; inherits: false; initial-value: 0deg; }
      @property --host { syntax: "*"; inherits: false; }
      @layer utilities { .rotate-45 { --tw-rotate: 45deg; rotate: var(--tw-rotate); content: "--tw-literal"; background: url(https://example.com/--tw-logo.png); } }
      @keyframes spin { to { transform: rotate(360deg); } }
      .animate-spin { animation: spin 1s linear infinite; }
      :root { --color-red: red; --animate-spin: spin 1s linear infinite; }
    `,
      "pm-canvas-one",
    );
    expect(css).toContain("@property --pm-canvas-one-tw-rotate");
    expect(css).not.toContain("@property --host");
    expect(css).not.toContain("--tw-rotate");
    expect(css).toContain('content: "--tw-literal"');
    expect(css).toContain("url(https://example.com/--tw-logo.png)");
    expect(css).toContain(".pm-canvas-one .rotate-45");
    expect(css).toContain("@keyframes pm-canvas-one-spin");
    expect(css).toContain("animation: pm-canvas-one-spin");
    expect(css).toContain("--animate-spin: pm-canvas-one-spin 1s");
    expect(css).toContain(".pm-canvas-one { --color-red: red;");
  });
});

describe("Tailwind compiler ownership", () => {
  it("mirrors only classes, avoids observer loops, and disconnects only its own frame", async () => {
    const { Window } = await import("happy-dom");
    const { mountTailwindCanvas } = await import("./canvas-tailwind");
    const window = new Window({
      url: "https://host.example",
      settings: {
        disableJavaScriptFileLoading: true,
        enableJavaScriptEvaluation: false,
        // Create the compiler's blank frames, but prohibit external navigation or scripts.
        enableIframePageLoading: true,
        navigation: { disableChildFrameNavigation: true, disableFallbackToSetURL: true },
      },
    });
    const document = window.document;
    const hostStyle = document.createElement("style");
    hostStyle.textContent = "/* --tw-host-owned */ body { color: green; }";
    document.head.append(hostStyle);
    const first = document.createElement("div");
    const second = document.createElement("div");
    first.innerHTML =
      '<img class="font-bold" src="https://document.example/image.png"><a href="https://document.example">Link</a>';
    second.className = "p-4";
    document.body.append(first, second);
    const liveStyle = document.createElement("style");
    first.append(liveStyle);
    const outputs: string[] = [];
    const secondOutputs: string[] = [];
    const disposeFirst = mountTailwindCanvas(
      first as unknown as HTMLElement,
      "pm-canvas-one",
      "https://host.example/runtime.js",
      (css) => {
        outputs.push(css);
        liveStyle.textContent = css;
      },
    );
    const disposeSecond = mountTailwindCanvas(
      second as unknown as HTMLElement,
      "pm-canvas-two",
      "https://host.example/runtime.js",
      (css) => secondOutputs.push(css),
    );
    const frames = [...document.querySelectorAll("iframe")];
    for (const frame of frames) frame.dispatchEvent(new window.Event("load"));
    const firstDocument = frames[0].contentDocument!;
    const secondDocument = frames[1].contentDocument!;
    const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
    await settle();
    expect(firstDocument.body.className).toBe("font-bold");
    expect(firstDocument.body.children.length).toBe(0);
    expect(firstDocument.head.querySelector("script")!.src).toBe("https://host.example/runtime.js");
    expect(firstDocument.documentElement.outerHTML).not.toContain("document.example");
    const generated = firstDocument.createElement("style");
    generated.textContent = ".font-bold { font-weight: 700; }";
    firstDocument.head.append(generated);
    await settle();
    expect(outputs.at(-1)).toContain(".pm-canvas-one .font-bold");
    const settledCount = outputs.length;
    await settle();
    expect(outputs).toHaveLength(settledCount);
    first.querySelector("img")!.className = "font-normal";
    await settle();
    expect(firstDocument.body.className).toBe("font-normal");
    expect(secondDocument.body.className).toBe("p-4");
    disposeFirst();
    const disposedCount = outputs.length;
    expect(outputs.at(-1)).toBe("");
    expect(document.querySelectorAll("iframe")).toHaveLength(1);
    expect(hostStyle.isConnected).toBe(true);
    generated.textContent = ".font-normal { font-weight: 400; }";
    first.className = "p-8";
    await settle();
    expect(outputs).toHaveLength(disposedCount);
    const otherGenerated = secondDocument.createElement("style");
    otherGenerated.textContent = ".p-4 { padding: 1rem; }";
    secondDocument.head.append(otherGenerated);
    await settle();
    expect(secondOutputs.at(-1)).toContain(".pm-canvas-two .p-4");
    disposeSecond();
    expect(document.querySelectorAll("iframe")).toHaveLength(0);
    expect(hostStyle.isConnected).toBe(true);
    await window.happyDOM.close();
  });
});
