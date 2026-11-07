import { expect, test, type Locator } from "@playwright/test";
import { list, parse } from "postcss";
import { familyKey } from "../../src/canvas-css";
import { inspectCanvasFontInputs } from "../../src/canvas-font-inputs";
import { mjmlDefaultFonts } from "../../src/canvas-font-resolver";
import { inspectArtwork } from "./artwork-evidence";
import {
  expectedCanvasFonts,
  missingFontRegistrations,
  waitForCanvasFontCss,
  type CanvasFontCssEvidence,
} from "./font-evidence";
import { sourceTemplateRepresentations } from "./source-template-representations";
import { canvasOverflowFailures, measureCanvasGeometry } from "./template-overflow";

// These two named entries in the source's system stack are MJML defaults.
// Native canvases isolate their registrations; the other stack entries must
// remain unchanged and in the same order.
const implicitFonts = mjmlDefaultFonts
  .filter(({ name }) => name === "Roboto" || name === "Ubuntu")
  .map(({ name, href }) => ({ family: name, stylesheetUrl: href }));
const familyStack = (value: string) =>
  list.comma(value).map((family) => family.replace(/^(['"])(.*)\1$/, "$2"));

/** Measure actual line boxes and paint, not a combined end-to-end offset that
 * could hide equal and opposite spacing errors. Canvas coordinates exclude only
 * the editor origin. The email's authored 8px body inset remains measurable. */
async function measure(root: Locator, kind: "source" | "compiled" | "canvas") {
  return root.evaluate(async (root, kind) => {
    const view = root.ownerDocument.defaultView!;
    const canvas = kind === "canvas" ? root.closest(".pm-canvas") : null;
    const origin = canvas?.getBoundingClientRect() ?? { x: 0, y: 0 };
    const box = (element: Element, content = false) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const px = (property: string) => parseFloat(style.getPropertyValue(property)) || 0;
      const left = content ? px("padding-left") + px("border-left-width") : 0;
      const top = content ? px("padding-top") + px("border-top-width") : 0;
      const right = content ? px("padding-right") + px("border-right-width") : 0;
      const bottom = content ? px("padding-bottom") + px("border-bottom-width") : 0;
      return {
        x: rect.x + left - origin.x,
        y: rect.y + top - origin.y,
        width: rect.width - left - right,
        height: rect.height - top - bottom,
        right: rect.right - right - origin.x,
        bottom: rect.bottom - bottom - origin.y,
      };
    };
    const normalize = (element: Element) => (element.textContent ?? "").replace(/\s+/g, " ").trim();
    const text = (prefix: string) => {
      const candidates = Array.from(root.querySelectorAll("p,h1,h2,div"));
      const matches = candidates.filter(
        (element) =>
          normalize(element).startsWith(prefix) &&
          element.getBoundingClientRect().height > 0 &&
          !Array.from(element.querySelectorAll("p,h1,h2,div")).some((child) =>
            normalize(child).startsWith(prefix),
          ),
      );
      if (matches.length !== 1)
        throw new Error(`Expected one ${prefix} block, found ${matches.length}`);
      const element = matches[0];
      const style = getComputedStyle(element);
      // Block widths alone cannot prove the selected font's glyph metrics.
      // Measure the actual text with its live computed stack after fonts settle.
      const context = root.ownerDocument.createElement("canvas").getContext("2d")!;
      context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      return {
        ...box(element, true),
        glyphAdvance: context.measureText(normalize(element)).width,
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        lineHeight: style.lineHeight,
        color: style.color,
        text: normalize(element),
      };
    };
    const required = (selector: string) => {
      const elements = root.querySelectorAll(selector);
      if (elements.length !== 1)
        throw new Error(`Expected one ${selector}, found ${elements.length}`);
      return elements[0];
    };
    const images = Array.from(root.querySelectorAll<HTMLImageElement>("img"))
      .filter((image) => image.src.includes("raycast-logo.png"))
      .map((image) => ({
        ...box(image),
        src: image.src,
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
        filter: getComputedStyle(image).filter,
      }));
    if (images.length !== 2) throw new Error(`Expected two Raycast logos, found ${images.length}`);
    const [logo, muted] = images;
    const title = text("🪄 Your magic link");
    const cta = text("👉 Click here to sign in");
    const caution = text("If you didn't request this");
    const best = text("Best,");
    const company = text("Raycast Technologies Inc.");
    const address = text("2093 Philadelphia Pike");
    const anchor = required("a[href]");
    const anchorStyle = getComputedStyle(anchor);
    const line = required(kind === "source" ? "hr" : 'hr, p[style*="border-top"]');
    const lineStyle = getComputedStyle(line);
    const divider = {
      ...box(line),
      borderTopWidth: lineStyle.borderTopWidth,
      borderTopColor: lineStyle.borderTopColor,
    };
    // Keep both compiler layers visible in the evidence. A geometry correction
    // must not compensate their alpha compositing by recoloring the source.
    const backgrounds = Array.from(root.querySelectorAll("*"))
      .filter((element) => getComputedStyle(element).backgroundImage.includes("raycast-bg.png"))
      .map((element) => {
        const style = getComputedStyle(element);
        return {
          ...box(element),
          tag: element.tagName,
          image: style.backgroundImage,
          position: style.backgroundPosition,
          repeat: style.backgroundRepeat,
          size: style.backgroundSize,
        };
      });
    if (!backgrounds.length) throw new Error("Missing Raycast background paint");
    const background = backgrounds[0];
    const backgroundLoads = await Promise.all(
      [...new Set(backgrounds.map(({ image }) => image))].map(async (value) => {
        const url = value.match(/url\(["']?(.*?)["']?\)/)?.[1];
        if (!url) return { url, error: "Missing background URL" };
        const image = new Image();
        image.src = url;
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([
            image.decode(),
            new Promise<never>((_resolve, reject) => {
              timer = setTimeout(() => reject(new Error("Background decode timed out")), 10_000);
            }),
          ]);
          return { url, width: image.naturalWidth, height: image.naturalHeight, error: null };
        } catch (error) {
          return { url, error: String(error) };
        } finally {
          clearTimeout(timer);
        }
      }),
    );
    return {
      kind,
      fontFaces: Array.from(root.ownerDocument.fonts, ({ family, weight, style, status }) => ({
        family,
        weight,
        style,
        status,
      })),
      viewport: view.innerWidth,
      overflow: root.ownerDocument.documentElement.scrollWidth - view.innerWidth,
      background,
      backgrounds,
      backgroundLoads,
      logo,
      title,
      cta,
      caution,
      best,
      divider,
      muted,
      company,
      address,
      link: {
        color: anchorStyle.color,
        decoration: anchorStyle.textDecorationLine,
        href: (anchor as HTMLAnchorElement).href,
      },
      gaps: {
        containerLogo: logo.y - background.y,
        logoTitle: title.y - logo.bottom,
        titleCta: cta.y - title.bottom,
        ctaCaution: caution.y - cta.bottom,
        cautionBest: best.y - caution.bottom,
        bestDivider: divider.y - best.bottom,
        dividerLogo: muted.y - divider.bottom,
        logoCompany: company.y - muted.bottom,
        companyAddress: address.y - company.bottom,
        addressContainer: background.bottom - address.bottom,
      },
    };
  }, kind);
}

type Measurement = Awaited<ReturnType<typeof measure>>;

test("Raycast retains source rhythm and decorations in compiled and native email at 390/800px", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  const results: {
    width: number;
    setupError?: string;
    captures: {
      kind: string;
      value?: Measurement;
      fontCss?: CanvasFontCssEvidence;
      error?: string;
    }[];
    overflowFailures?: string[];
  }[] = [];
  // Collect both widths, every representation, geometry, HTML and screenshots
  // before asserting. A first regression must not conceal the other evidence.
  for (const width of [390, 800]) {
    const result: (typeof results)[number] = { width, captures: [] };
    results.push(result);
    let representations: Awaited<ReturnType<typeof sourceTemplateRepresentations>> | undefined;
    try {
      representations = await sourceTemplateRepresentations(
        page,
        "Community",
        "magic-links/raycast-magic-link",
        width,
        "Raycast Technologies Inc.",
      );
      const { reference, compiled, canvas } = representations;
      for (const [kind, root] of [
        ["source", reference.locator("body")],
        ["compiled", compiled.locator("body")],
        ["canvas", canvas],
      ] as const) {
        const capture: (typeof result.captures)[number] = { kind };
        result.captures.push(capture);
        try {
          if (kind === "canvas") {
            const [inputs] = await root.evaluate(inspectCanvasFontInputs, true);
            await waitForCanvasFontCss(root, expectedCanvasFonts(implicitFonts, inputs.scope));
            [capture.fontCss] = await root.evaluate(inspectCanvasFontInputs, true);
          }
          await root.evaluate(inspectArtwork, { decode: true });
          capture.value = await measure(root, kind);
        } catch (error) {
          capture.error = String(error);
        }
        try {
          await testInfo.attach(`raycast-${width}-${kind}.html`, {
            body: await root.evaluate((element) => element.outerHTML),
            contentType: "text/html",
          });
          await testInfo.attach(`raycast-${width}-${kind}.png`, {
            body:
              kind === "canvas"
                ? await canvas.screenshot()
                : await (kind === "source" ? reference : compiled).screenshot({ fullPage: true }),
            contentType: "image/png",
          });
        } catch (error) {
          capture.error = [capture.error, `Evidence capture: ${String(error)}`]
            .filter(Boolean)
            .join("\n");
        }
      }
      result.overflowFailures = canvasOverflowFailures(
        await canvas.evaluate(measureCanvasGeometry),
      );
    } catch (error) {
      result.setupError = String(error);
    } finally {
      await representations?.reference.close();
      await representations?.compiled.close();
    }
  }
  await testInfo.attach("raycast-source-geometry.json", {
    body: JSON.stringify(results, null, 2),
    contentType: "application/json",
  });

  for (const { width, captures, setupError, overflowFailures } of results) {
    expect(setupError, `${width}px setup`).toBeUndefined();
    expect(captures.map(({ kind }) => kind)).toEqual(["source", "compiled", "canvas"]);
    for (const capture of captures)
      expect(capture.error, `${width}px ${capture.kind}`).toBeUndefined();
    expect(overflowFailures, `${width}px native usable bounds`).toEqual([]);
    const source = captures[0].value!;
    expect(source.title.lineHeight).toBe("normal");
    expect(source.title.fontSize).toBe("28px");
    expect(source.gaps).toEqual({
      containerLogo: 20,
      logoTitle: 48,
      titleCta: 40,
      ctaCaution: 16,
      cautionBest: 40,
      bestDivider: 48,
      dividerLogo: 20,
      logoCompany: 20,
      companyAddress: 16,
      addressContainer: 64,
    });
    expect(source.background.y).toBe(8);
    expect(source.background.width).toBe(Math.min(600, width - 16));
    expect(source.link.decoration).toBe("none");
    expect(source.divider.borderTopColor).toBe("rgb(234, 234, 234)");
    for (const { kind, value: actual, fontCss } of captures) {
      const aliases: Record<string, string> = {};
      if (kind === "canvas") {
        expect(fontCss?.scope, `${width}px canvas scope`).toMatch(/^pm-canvas-/);
        expect(fontCss?.status, `${width}px canvas font CSS`).toBe("ready");
        expect(fontCss?.inputsCurrent, `${width}px current font inputs`).toBe(true);
        expect(fontCss?.errors, `${width}px font import errors`).toBeNull();
        expect(fontCss?.missingAliases, `${width}px missing font aliases`).toEqual([]);
        const expected = expectedCanvasFonts(implicitFonts, fontCss!.scope);
        expect(missingFontRegistrations(expected, actual!.fontFaces)).toEqual([]);
        const registeredFamilies: string[] = [];
        parse(fontCss!.css).walkAtRules("font-face", (rule) => {
          rule.walkDecls("font-family", (declaration) => {
            registeredFamilies.push(...familyStack(declaration.value));
          });
        });
        for (const { family, alias } of expected) {
          expect(registeredFamilies, `${width}px ${family} scoped @font-face`).toContain(alias);
          aliases[familyKey(family)] = alias;
        }
      }
      expect(actual!.overflow, `${width}px ${kind} document containment`).toBeLessThanOrEqual(1);
      for (const load of actual!.backgroundLoads)
        expect(load.error, `${kind} background`).toBeNull();
      for (const key of [
        "background",
        "logo",
        "title",
        "cta",
        "caution",
        "best",
        "divider",
        "muted",
        "company",
        "address",
      ] as const)
        for (const edge of ["x", "y", "width", "height"] as const)
          expect(
            Math.abs(actual![key][edge] - source[key][edge]),
            `${width}px ${kind} ${key} ${edge}`,
          ).toBeLessThanOrEqual(1);
      for (const key of Object.keys(source.gaps) as (keyof Measurement["gaps"])[])
        expect(
          Math.abs(actual!.gaps[key] - source.gaps[key]),
          `${width}px ${kind} ${key}`,
        ).toBeLessThanOrEqual(1);
      for (const key of ["title", "cta", "caution", "best", "company", "address"] as const) {
        expect(actual![key].text, `${width}px ${kind} ${key} text`).toBe(source[key].text);
        // Compare every declared family, including fallbacks and ordering.
        // Only aliases backed by this canvas's CSS and FontFace set are valid.
        const expectedStack = familyStack(source[key].fontFamily).map(
          (family) => aliases[familyKey(family)] ?? family,
        );
        expect(
          familyStack(actual![key].fontFamily),
          `${width}px ${kind} ${key} fontFamily`,
        ).toEqual(expectedStack);
        expect(
          Math.abs(actual![key].glyphAdvance - source[key].glyphAdvance),
          `${width}px ${kind} ${key} glyph advance`,
        ).toBeLessThanOrEqual(1);
        for (const property of ["fontSize", "fontWeight", "lineHeight", "color"] as const)
          expect(actual![key][property], `${width}px ${kind} ${key} ${property}`).toBe(
            source[key][property],
          );
      }
      expect(actual!.link).toEqual(source.link);
      expect(actual!.divider.borderTopColor).toBe(source.divider.borderTopColor);
      expect(actual!.divider.borderTopWidth).toBe(source.divider.borderTopWidth);
      expect(actual!.muted.filter).toBe(source.muted.filter);
      for (const layer of actual!.backgrounds) {
        expect(layer.position).toBe(source.background.position);
        expect(layer.repeat).toBe(source.background.repeat);
        expect(layer.size).toBe(source.background.size);
      }
    }
  }
});
