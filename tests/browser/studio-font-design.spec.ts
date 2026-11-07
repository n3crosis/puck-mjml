import { readFileSync } from "node:fs";
import { expect, test, type Locator } from "@playwright/test";
import { inspectArtwork } from "./artwork-evidence";
import { waitForCanvasFontCss } from "./font-evidence";
import { loadReactEmailReference } from "./reference-document";
import { readVisibleTextFragments, visibleTextLineBounds } from "./text-line-geometry";

test.describe.configure({ timeout: 120_000 });

const introduction =
  "We're glad you're here. This is our space for Halo ring drops, sizing tips, and the stories behind each batch—we share what we're building, what we're learning, and when limited finishes return.";
const heading = "Why your finger is the calmest screen";

async function textMetrics(locator: Locator) {
  const metrics = await locator.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const family = style.fontFamily.split(",")[0].replace(/["']/g, "").trim();
    return {
      x: box.x,
      width: box.width,
      height: box.height,
      loadedFaces: Array.from(element.ownerDocument.fonts)
        .filter(
          (face) =>
            face.family.replace(/["']/g, "") === family &&
            face.weight === style.fontWeight &&
            face.style === "normal",
        )
        .map(({ weight, status }) => ({ weight, status })),
    };
  });
  return {
    ...metrics,
    glyphLines: visibleTextLineBounds(await locator.evaluate(readVisibleTextFragments)),
  };
}

for (const width of [800, 390]) {
  test(`Studio newsletter preserves source Inter450 and Geist v4 metrics at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto("/");
    await page
      .getByRole("combobox", { name: "Email template" })
      .selectOption("05-studio/newsletter");
    await page.getByRole("button", { name: "Preview email" }).click();
    const dialog = page.getByRole("dialog", { name: "Email preview" });
    await expect(dialog).toBeVisible();
    await expect(
      page.frameLocator('iframe[title="Rendered email"]').getByText(introduction, { exact: true }),
    ).toBeAttached();
    const html = await page
      .locator('iframe[title="Rendered email"]')
      .evaluate((iframe: HTMLIFrameElement) => iframe.srcdoc);
    await dialog.getByRole("button", { name: "Close preview" }).click();
    await expect(dialog).toBeHidden();
    const control = page.getByRole("button", {
      name: `Switch to ${width === 390 ? "Mobile" : "Desktop"} viewport`,
    });
    if (await control.isEnabled()) await control.click();
    const frame = page.frameLocator("#preview-frame");
    await expect
      .poll(() =>
        frame.locator("html").evaluate((element) => element.ownerDocument.defaultView!.innerWidth),
      )
      .toBe(width);
    const canvas = frame.locator(".pm-email");
    await waitForCanvasFontCss(canvas);
    await canvas.evaluate(inspectArtwork, { decode: true });

    const reference = await page.context().newPage();
    const compiled = await page.context().newPage();
    try {
      await reference.setViewportSize({ width, height: 900 });
      await compiled.setViewportSize({ width, height: 900 });
      await loadReactEmailReference(
        reference,
        readFileSync(
          new URL("../fixtures/react-email-reference/05-Studio/newsletter.html", import.meta.url),
          "utf8",
        ),
      );
      await reference.locator("body").evaluate(inspectArtwork, { decode: true });
      await compiled.setContent(html, { waitUntil: "load" });
      await compiled.locator("body").evaluate(inspectArtwork, { decode: true });
      const originalCopy = await textMetrics(reference.getByText(introduction, { exact: true }));
      expect(originalCopy.width).toBeCloseTo(width === 800 ? 430 : 342, 1);
      expect(originalCopy.height).toBeCloseTo(width === 800 ? 67.171875 : 89.5625, 1);
      for (const text of [introduction, heading]) {
        const original = await textMetrics(reference.getByText(text, { exact: true }));
        for (const root of [compiled.locator("body"), canvas]) {
          const actual = await textMetrics(root.getByText(text, { exact: true }));
          for (const dimension of ["x", "width", "height"] as const) {
            expect(actual[dimension]).toBeCloseTo(original[dimension], 1);
          }
          expect(actual.glyphLines).toHaveLength(original.glyphLines.length);
          actual.glyphLines.forEach((line, index) => {
            for (const edge of ["left", "right", "top", "bottom"] as const) {
              expect(line[edge]).toBeCloseTo(original.glyphLines[index][edge], 1);
            }
          });
          expect(actual.loadedFaces).toContainEqual({
            weight: text === introduction ? "450" : "700",
            status: "loaded",
          });
          expect(
            await root.evaluate((element) =>
              Array.from(
                element.ownerDocument.querySelectorAll("style"),
                (style) => style.textContent,
              ).join("\n"),
            ),
          ).toContain("https://fonts.gstatic.com/s/geist/v4/gyByhwUxId8gMEwcGFU.woff2");
        }
      }
    } finally {
      await reference.close();
      await compiled.close();
    }
  });
}
