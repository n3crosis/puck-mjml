import { readFileSync, writeFileSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { inspectArtwork } from "./artwork-evidence";
import { waitForCanvasFontCss } from "./font-evidence";
import { loadReactEmailReference } from "./reference-document";
import { canvasOverflowFailures, measureCanvasGeometry } from "./template-overflow";

test.describe.configure({ timeout: 120_000 });

async function representations(page: Page, template: string, width: number, readyText: string) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/");
  await page.getByRole("combobox", { name: "Email template" }).selectOption(template.toLowerCase());
  await page.getByRole("button", { name: "Preview email" }).click();
  const dialog = page.getByRole("dialog", { name: "Email preview" });
  await expect(dialog).toBeVisible();
  await expect(
    page.frameLocator('iframe[title="Rendered email"]').getByText(readyText, { exact: true }),
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
  // The public controls cover 390/800. Resize only the iframe viewport for
  // source breakpoints between those presets, without changing email styles.
  if (width !== 390 && width !== 800)
    await page.locator("#preview-frame").evaluate((iframe: HTMLIFrameElement, width) => {
      iframe.style.setProperty("width", `${width}px`, "important");
    }, width);
  const frame = page.frameLocator("#preview-frame");
  await expect
    .poll(() =>
      frame.locator("html").evaluate((element) => element.ownerDocument.defaultView!.innerWidth),
    )
    .toBe(width);
  const canvas = frame.locator(".pm-canvas");
  await waitForCanvasFontCss(canvas);
  await canvas.evaluate(inspectArtwork, { decode: true });
  const original = await page.context().newPage();
  const compiled = await page.context().newPage();
  try {
    await original.setViewportSize({ width, height: 900 });
    await compiled.setViewportSize({ width, height: 900 });
    await loadReactEmailReference(
      original,
      readFileSync(
        new URL(`../fixtures/react-email-reference/${template}.html`, import.meta.url),
        "utf8",
      ),
    );
    // Keep the original unchanged, including its known broken Inter400 URL.
    // Image geometry and horizontal source gaps do not depend on body wrapping.
    const sourceFonts = await original.locator("body").evaluate(async (body) => {
      await body.ownerDocument.fonts.ready;
      await Promise.all(Array.from(body.querySelectorAll("img"), (image) => image.decode()));
      return Array.from(body.ownerDocument.fonts)
        .filter((face) => face.status === "error")
        .map((face) => ({
          family: face.family.replace(/["']/g, ""),
          weight: face.weight,
          status: face.status,
        }));
    });
    expect(
      sourceFonts.filter(
        (face) =>
          !(template.startsWith("04-Arcane/") && face.family === "Inter" && face.weight === "400"),
      ),
    ).toEqual([]);
    await compiled.setContent(html, { waitUntil: "load" });
    await compiled.locator("body").evaluate(inspectArtwork, { decode: true });
    return { original, compiled, canvas, sourceFonts };
  } catch (error) {
    await original.close();
    await compiled.close();
    throw error;
  }
}

async function box(locator: Locator, origin = { x: 0, y: 0 }) {
  return locator.evaluate((element, origin) => {
    const { x, y, width, height, right, bottom } = element.getBoundingClientRect();
    return {
      x: x - origin.x,
      y: y - origin.y,
      width,
      height,
      right: right - origin.x,
      bottom: bottom - origin.y,
    };
  }, origin);
}
async function textLeft(locator: Locator) {
  return locator.evaluate((element) => {
    const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const first = node.textContent?.search(/\S/) ?? -1;
      if (first < 0) continue;
      const range = element.ownerDocument.createRange();
      range.setStart(node, first);
      range.setEnd(node, first + 1);
      return range.getBoundingClientRect().x;
    }
    throw new Error("Missing product title text");
  });
}
const close = (actual: number, expected: number, label: string) =>
  expect(Math.abs(actual - expected), `${label}: ${actual} vs ${expected}`).toBeLessThanOrEqual(
    1 / 64,
  );

for (const width of [390, 800])
  test(`Apple receipt source header alignment at ${width}px`, async ({ page }, testInfo) => {
    const { original, compiled, canvas } = await representations(
      page,
      "Community/receipts/apple-receipt",
      width,
      "Receipt",
    );
    const evidence: unknown[] = [];
    try {
      const source = await box(original.getByAltText("Apple Logo", { exact: true }));
      expect(source).toMatchObject({ x: width === 800 ? 70 : 8, y: 35, width: 42, height: 42 });
      for (const [name, root] of [
        ["compiled", compiled.locator("body")],
        ["canvas", canvas],
      ] as const) {
        // Canvas coordinates include editor workspace before the email. Compare
        // its local border-box origin, retaining the body's authored inset.
        const origin = name === "canvas" ? await box(root) : { x: 0, y: 0 };
        const actual = await box(root.getByAltText("Apple Logo", { exact: true }), origin);
        evidence.push({ name, origin, source, actual });
        for (const dimension of ["x", "y", "width", "height"] as const)
          close(actual[dimension], source[dimension], `${name} ${dimension}`);
      }
      // The original's fixed-width mobile receipt overflows; keep the port's
      // deliberate responsiveness while matching the unpadded logo edge.
      expect(
        await compiled.evaluate(() => document.documentElement.scrollWidth - innerWidth),
      ).toBeLessThanOrEqual(1);
      expect(
        canvasOverflowFailures(await canvas.locator(".pm-email").evaluate(measureCanvasGeometry)),
      ).toEqual([]);
    } finally {
      writeFileSync(
        testInfo.outputPath("source-header-geometry.json"),
        JSON.stringify({ width, evidence }, null, 2),
      );
      await original.close();
      await compiled.close();
    }
  });

for (const width of [390, 600, 601, 620, 639, 800])
  test(`Arcane cart source image sizing and flexible copy at ${width}px`, async ({
    page,
  }, testInfo) => {
    const { original, compiled, canvas, sourceFonts } = await representations(
      page,
      "04-Arcane/abandoned-cart",
      width,
      "Daily C Serum",
    );
    const evidence: unknown[] = [];
    try {
      for (const [file, title] of [
        ["skin-image-2.png", "Daily C Serum"],
        ["skin-image-3.png", "Overnight Repair Cream"],
      ]) {
        const selector = `img[src$="${file}"]`;
        const source = await box(original.locator(selector));
        const sourceTextX = await textLeft(original.getByText(title, { exact: true }));
        close(source.width, width <= 600 ? width - 48 : 178, "original artwork width");
        close(
          sourceTextX - (width <= 600 ? source.x : source.right),
          width <= 600 ? 0 : 36,
          "original copy gap",
        );
        for (const [name, root] of [
          ["compiled", compiled.locator("body")],
          ["canvas", canvas],
        ] as const) {
          const origin = name === "canvas" ? await box(root) : { x: 0, y: 0 };
          const actual = await box(root.locator(selector), origin);
          const textX = (await textLeft(root.getByText(title, { exact: true }))) - origin.x;
          evidence.push({ name, file, origin, source, actual, sourceTextX, textX });
          for (const dimension of ["x", "width", "height"] as const)
            close(actual[dimension], source[dimension], `${name} ${file} ${dimension}`);
          close(textX, sourceTextX, `${name} ${file} copy left`);
          if (width >= 601) {
            const details = root
              .locator(".arcane-cart-details")
              .nth(file === "skin-image-2.png" ? 0 : 1);
            close(
              (await box(details)).width,
              Math.min(width, 640) - 80 - 178,
              `${name} flexible column width`,
            );
          }
        }
      }
      expect(
        await compiled.evaluate(() => document.documentElement.scrollWidth - innerWidth),
      ).toBeLessThanOrEqual(1);
      expect(
        canvasOverflowFailures(await canvas.locator(".pm-email").evaluate(measureCanvasGeometry)),
      ).toEqual([]);
      if (width === 800) {
        const imageBefore = await box(canvas.locator('img[src$="skin-image-2.png"]'));
        await canvas.getByText("Daily C Serum", { exact: true }).dblclick();
        const editable = canvas
          .locator('[contenteditable="true"]')
          .filter({ hasText: "Daily C Serum" });
        await expect(editable).toBeVisible();
        await editable.fill("Daily C Serum updated");
        await expect(canvas.getByText("Daily C Serum updated", { exact: true })).toBeVisible();
        const imageAfter = await box(canvas.locator('img[src$="skin-image-2.png"]'));
        close(imageAfter.width, imageBefore.width, "native edit preserves artwork width");
        close(imageAfter.x, imageBefore.x, "native edit preserves artwork edge");
      }
    } finally {
      writeFileSync(
        testInfo.outputPath("source-cart-geometry.json"),
        JSON.stringify({ width, sourceFonts, evidence }, null, 2),
      );
      await original.close();
      await compiled.close();
    }
  });
