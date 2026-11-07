// @vitest-environment happy-dom
import { act, useState } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { EmailCanvas } from "./EmailCanvas";
import { inspectCanvasFontInputs } from "./canvas-font-inputs";
import { getCanvasElement, useNativeCanvasScope } from "./native-canvas-context";
import { waitForImportedFontCss } from "../tests/browser/font-evidence";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
let host: HTMLDivElement | undefined;
const fontDescriptor = Object.getOwnPropertyDescriptor(document, "fonts");
afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
  if (fontDescriptor) Object.defineProperty(document, "fonts", fontDescriptor);
  else Reflect.deleteProperty(document, "fonts");
  vi.unstubAllGlobals();
});

it("uses one self-contained fingerprint for current inline families, excluding nested editors and host styles", () => {
  host = document.createElement("div");
  host.innerHTML =
    '<p style="font-family:Host">Host</p><div class="pm-canvas pm-canvas-first"><p style="font-family:Arial">First</p><p style="font-family:Arial">Repeated</p><div class="pm-canvas pm-canvas-second"><p style="font-family:Roboto">Nested</p></div></div>';
  document.body.append(host);
  const first = host.querySelector<HTMLElement>(".pm-canvas-first")!;
  const snapshot = inspectCanvasFontInputs(first)[0];
  expect(snapshot.families).toEqual(["Arial"]);
  expect(snapshot.inputsCurrent).toBe(false);
  first.dataset.pmCanvasFontInputs = snapshot.fingerprint;
  expect(inspectCanvasFontInputs(first)[0].inputsCurrent).toBe(true);
  first.querySelector<HTMLElement>("p")!.textContent = "Changed text only";
  first.style.padding = "12px";
  first.append(document.createElement("span"));
  expect(inspectCanvasFontInputs(first)[0].inputsCurrent).toBe(true);
  first.querySelector<HTMLElement>(".pm-canvas-second p")!.style.fontFamily = "Ubuntu";
  expect(inspectCanvasFontInputs(first)[0].inputsCurrent).toBe(true);
  first.querySelector<HTMLElement>("p")!.style.fontFamily = "Lato";
  expect(inspectCanvasFontInputs(first)[0].inputsCurrent).toBe(false);
  first.replaceChildren();
  expect(inspectCanvasFontInputs(first)[0]).toMatchObject({
    families: [],
    fingerprint: "[]",
    inputsCurrent: false,
  });
  first.dataset.pmCanvasFontInputs = "[]";
  expect(inspectCanvasFontInputs(first)[0].inputsCurrent).toBe(true);
  // Playwright serializes this same function without module imports/closures.
  const serialized = new Function(
    `return (${inspectCanvasFontInputs.toString()});`,
  )() as typeof inspectCanvasFontInputs;
  expect(serialized(host)).toEqual(inspectCanvasFontInputs(host));
});

it("rejects the old ready snapshot immediately after a child-only font update and removal", async () => {
  let changeFamily!: (name: string) => void;
  let finishRoboto!: () => void;
  const response = (family: string) => ({
    ok: true,
    status: 200,
    text: async () => `@font-face{font-family:${family};src:local("probe");}`,
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      url.includes("Roboto")
        ? new Promise<ReturnType<typeof response>>((resolve) => {
            finishRoboto = () => resolve(response("Roboto"));
          })
        : response("Ubuntu"),
    ),
  );
  function Copy() {
    const [family, setFamily] = useState("Ubuntu");
    changeFamily = setFamily;
    const scope = useNativeCanvasScope();
    const node = getCanvasElement(
      "mj-text",
      { mjmlAttributes: [{ name: "font-family", value: family }] },
      scope,
    )!;
    return <p style={{ fontFamily: node.attributes["font-family"] }}>Typography</p>;
  }
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root!.render(
      <EmailCanvas>
        <Copy />
      </EmailCanvas>,
    ),
  );
  const canvas = host.querySelector<HTMLElement>(".pm-canvas")!;
  const registered = JSON.parse(canvas.dataset.pmCanvasFontFamilies!) as string[];
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: registered.map((family) => ({ family })),
  });
  expect(inspectCanvasFontInputs(canvas, true)[0]).toMatchObject({
    status: "ready",
    inputsCurrent: true,
    missingAliases: [],
  });
  await act(async () => {
    flushSync(() => changeFamily("Roboto"));
    const snapshot = inspectCanvasFontInputs(canvas, true);
    expect(snapshot[0]).toMatchObject({
      status: "ready",
      inputsCurrent: false,
      missingAliases: [],
    });
    expect(snapshot[0].families.some((family) => family.startsWith("Roboto-"))).toBe(true);
    await expect(waitForImportedFontCss([], async () => snapshot, 0)).rejects.toThrow(
      "current inline font families have not been observed",
    );
  });
  await vi.waitFor(async () => {
    await act(async () => {});
    expect(canvas.dataset.pmCanvasFontStatus).toBe("loading");
  });
  await act(async () => finishRoboto());
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: (JSON.parse(canvas.dataset.pmCanvasFontFamilies!) as string[]).map((family) => ({
      family,
    })),
  });
  await expect(
    waitForImportedFontCss([], async () => inspectCanvasFontInputs(canvas, true), 0),
  ).resolves.toBeUndefined();
  await act(async () => {
    flushSync(() => changeFamily("Arial"));
    const snapshot = inspectCanvasFontInputs(canvas, true);
    expect(snapshot[0].inputsCurrent).toBe(false);
    await expect(waitForImportedFontCss([], async () => snapshot, 0)).rejects.toThrow(
      "not been observed",
    );
  });
  await vi.waitFor(async () => {
    await act(async () => {});
    expect(inspectCanvasFontInputs(canvas, true)[0]).toMatchObject({
      status: "idle",
      inputsCurrent: true,
      missingAliases: [],
    });
  });
});

it("refreshes observation metadata after head-only family changes without reusing an old fingerprint", async () => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  const editor = (family: string) => (
    <EmailCanvas
      fontFamily={family}
      headStyles={[
        { css: `@font-face{font-family:'${family}';src:local('probe')}`, inline: "head" },
      ]}
    >
      <p>Head family</p>
    </EmailCanvas>
  );
  await act(async () => root!.render(editor("First Head")));
  const canvas = host.querySelector<HTMLElement>(".pm-canvas")!;
  const previous = inspectCanvasFontInputs(canvas)[0];
  expect(previous.inputsCurrent).toBe(true);
  await act(async () => root!.render(editor("Second Head")));
  const next = inspectCanvasFontInputs(canvas)[0];
  expect(next.inputsCurrent).toBe(true);
  expect(next.fingerprint).not.toBe(previous.fingerprint);
  expect(next.families[0]).toContain("SecondHead-");
});

it("does not retain a previous import error after child-only removal of that implicit family", async () => {
  let changeFamily!: (name: string) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: false, status: 503, text: async () => "" })),
  );
  const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
  function Copy() {
    const [family, setFamily] = useState("Droid Sans");
    changeFamily = setFamily;
    const scope = useNativeCanvasScope();
    const node = getCanvasElement(
      "mj-text",
      { mjmlAttributes: [{ name: "font-family", value: family }] },
      scope,
    )!;
    return <p style={{ fontFamily: node.attributes["font-family"] }}>Typography</p>;
  }
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  try {
    await act(async () =>
      root!.render(
        <EmailCanvas>
          <Copy />
        </EmailCanvas>,
      ),
    );
    const canvas = host.querySelector<HTMLElement>(".pm-canvas")!;
    expect(inspectCanvasFontInputs(canvas, true)[0]).toMatchObject({
      status: "error",
      inputsCurrent: true,
    });
    await act(async () => {
      flushSync(() => changeFamily("Arial"));
      const snapshot = inspectCanvasFontInputs(canvas, true);
      expect(snapshot[0]).toMatchObject({ status: "error", inputsCurrent: false });
      await expect(waitForImportedFontCss([], async () => snapshot, 0)).rejects.toThrow(
        "current inline font families have not been observed",
      );
    });
    await vi.waitFor(async () => {
      await act(async () => {});
      expect(inspectCanvasFontInputs(canvas, true)[0]).toMatchObject({
        status: "idle",
        inputsCurrent: true,
        missingAliases: [],
      });
    });
    await expect(
      waitForImportedFontCss([], async () => inspectCanvasFontInputs(canvas, true), 0),
    ).resolves.toBeUndefined();
  } finally {
    warning.mockRestore();
  }
});

it("allows registered but unused imported faces without waiting for a binary load", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => '@font-face{font-family:Unused;src:local("probe")}',
    })),
  );
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root!.render(
      <EmailCanvas
        fontImports={[{ name: "Unused", href: "https://fonts.example/unused-readiness.css" }]}
      >
        <p>Arial text</p>
      </EmailCanvas>,
    ),
  );
  const canvas = host.querySelector<HTMLElement>(".pm-canvas")!;
  const aliases = JSON.parse(canvas.dataset.pmCanvasFontFamilies!) as string[];
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: aliases.map((family) => ({ family, status: "unloaded" })),
  });
  const snapshot = inspectCanvasFontInputs(canvas, true);
  expect(snapshot[0]).toMatchObject({ status: "ready", inputsCurrent: true, missingAliases: [] });
  expect(snapshot[0].families.every((family) => !family.includes("Unused"))).toBe(true);
  await expect(waitForImportedFontCss([], async () => snapshot, 0)).resolves.toBeUndefined();
});
