// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { EmailEditor } from "./EmailEditor";
import { toMjml } from "./export";
import { fromMjml } from "./import";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
let container: HTMLDivElement | undefined;
afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  vi.unstubAllGlobals();
});

it.each(["activation", "newsletter"])(
  "uses the registered Instrument Serif alias inside the actual Arcane %s editor",
  async (name) => {
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            "@font-face{font-family:'Instrument Serif';font-weight:400;src:url(https://fonts.example.test/instrument.woff2)}@font-face{font-family:Inter;font-weight:400;src:url(https://fonts.example.test/inter.woff2)}",
            { status: 200, headers: { "content-type": "text/css" } },
          ),
      ),
    );
    const source = readFileSync(`templates/04-Arcane/${name}.mjml`, "utf8");
    const { document: value, warnings } = fromMjml(source);
    expect(warnings).toEqual([]);
    const serialized = JSON.stringify(value);
    const exported = toMjml(value);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root!.render(<EmailEditor value={value} onChange={() => undefined} />));
    const canvas = container.querySelector("iframe")!.contentDocument!;
    const scope = canvas
      .querySelector("style[data-pm-canvas-fonts]")!
      .getAttribute("data-pm-canvas-fonts")!;
    const styles = canvas.querySelector("style[data-pm-canvas-fonts]")!.textContent!;
    const alias = styles.match(/font-family:\s*["']?(InstrumentSerif-pm-canvas-[^"';\s}]+)/)![1];
    const typography = [...canvas.querySelectorAll<HTMLElement>("[style]")].filter((element) =>
      /Instrument(?: Serif|Serif-pm-canvas)/.test(element.style.fontFamily),
    );
    expect(typography.length).toBeGreaterThan(0);
    for (const element of typography) {
      expect(element.style.fontFamily.split(",")[0].replace(/["']/g, "")).toBe(alias);
      expect(element.style.fontFamily).toContain("serif");
    }
    expect(alias).toContain("pm-canvas-");
    expect(alias).toBe(`InstrumentSerif-${scope}`);
    expect(JSON.stringify(value)).toBe(serialized);
    expect(toMjml(value)).toBe(exported);
    expect(exported).toContain('font-family="Instrument Serif, Georgia, Times New Roman, serif"');
    expect(exported).not.toContain("pm-canvas-");
  },
);
