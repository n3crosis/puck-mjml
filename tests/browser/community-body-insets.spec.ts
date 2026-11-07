import { expect, test, type Locator, type Page } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { communityBodyInsetNames, dropboxName } from "./community-body-insets";
import { waitForCanvasFontCss } from "./font-evidence";
import { inspectArtwork } from "./artwork-evidence";
import { loadReactEmailReference } from "./reference-document";
import { canvasOverflowFailures, measureCanvasGeometry } from "./template-overflow";

async function compiledEmail(page: Page) {
  await page.getByRole("button", { name: "Preview email" }).click();
  const dialog = page.getByRole("dialog", { name: "Email preview" });
  await expect(dialog).toBeVisible();
  const iframe = page.locator('iframe[title="Rendered email"]');
  await expect
    .poll(() => iframe.evaluate((node: HTMLIFrameElement) => node.srcdoc))
    .toContain("<html");
  const html = await iframe.evaluate((node: HTMLIFrameElement) => node.srcdoc);
  await dialog.getByRole("button", { name: "Close preview" }).click();
  return html;
}

async function boundaries(root: Locator, kind: "original" | "compiled" | "canvas") {
  return root.evaluate((element, kind) => {
    const document = element.ownerDocument;
    const view = document.defaultView!;
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const px = (value: string) => Number.parseFloat(value) || 0;
    const offset = kind === "canvas" ? { x: box.x, y: box.y } : { x: 0, y: 0 };
    const flow = element.querySelector(
      kind === "original"
        ? ":scope > table > tbody > tr > td"
        : kind === "canvas"
          ? ".pm-email"
          : ':scope > div[role="article"]',
    )!;
    const flowBox = flow.getBoundingClientRect();
    const flowStyle = getComputedStyle(flow);
    const left = box.left + px(style.paddingLeft) - offset.x;
    const right = box.right - px(style.paddingRight) - offset.x;
    const top = flowBox.top + (kind === "original" ? px(flowStyle.paddingTop) : 0) - offset.y;
    const bottomInset =
      kind === "original"
        ? px(style.marginBottom) + px(style.paddingBottom) + px(flowStyle.paddingBottom)
        : px(style.paddingBottom);
    // Canvas can intentionally be taller than the email. Ignore only that
    // editor workspace, retaining the measured email bottom and body padding.
    const naturalBottom =
      kind === "canvas"
        ? flowBox.bottom + bottomInset - offset.y
        : box.bottom + (kind === "original" ? px(style.marginBottom) : 0);
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let lastText: { text: string; bottom: number } | null = null;
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const text = node.textContent?.replace(/\s+/g, " ").trim();
      if (!text || node.parentElement?.closest("style,script")) continue;
      const range = document.createRange();
      range.selectNode(node);
      const bounds = range.getBoundingClientRect();
      if (bounds.width && bounds.height) lastText = { text, bottom: bounds.bottom - offset.y };
    }
    const images = Array.from(element.querySelectorAll("img"))
      .filter((node) => node.getBoundingClientRect().width > 1)
      .map((node) => {
        const bounds = node.getBoundingClientRect();
        return {
          src: node.src,
          x: bounds.x - offset.x,
          y: bounds.y - offset.y,
          width: bounds.width,
          height: bounds.height,
        };
      });
    return {
      left,
      right,
      width: right - left,
      top,
      bottomInset,
      naturalBottom,
      lastText,
      bottomTextGap: lastText ? naturalBottom - lastText.bottom : null,
      background: style.backgroundColor,
      images,
      overflow: document.documentElement.scrollWidth - view.innerWidth,
    };
  }, kind);
}

async function gutterPixel(page: Page, root?: Locator) {
  const box = root ? await root.boundingBox() : { x: 0, y: 0 };
  expect(box).not.toBeNull();
  const png = await page.screenshot({
    clip: { x: box!.x + 1, y: box!.y + 1, width: 1, height: 1 },
  });
  return page.evaluate(async (data) => {
    const image = new Image();
    image.src = `data:image/png;base64,${data}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d")!;
    context.drawImage(image, 0, 0);
    return Array.from(context.getImageData(0, 0, 1, 1).data);
  }, png.toString("base64"));
}

for (const name of communityBodyInsetNames) {
  test(`${name} retains original outer boundaries and gutter paint at both widths`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto("/");
    await page.getByRole("combobox", { name: "Email template" }).selectOption(`community/${name}`);
    const canvas = page.frameLocator("#preview-frame");
    const canvasRoot = canvas.locator(".pm-canvas");
    await expect(canvasRoot).toBeVisible();
    const original = await page.context().newPage();
    const compiled = await page.context().newPage();
    const comparisons: unknown[] = [];
    try {
      await loadReactEmailReference(
        original,
        readFileSync(
          new URL(`../fixtures/react-email-reference/Community/${name}.html`, import.meta.url),
          "utf8",
        ),
      );
      await compiled.setContent(await compiledEmail(page), { waitUntil: "load" });
      for (const [mode, width] of [
        ["Desktop", 800],
        ["Mobile", 390],
      ] as const) {
        const button = page.getByRole("button", { name: `Switch to ${mode} viewport` });
        if (!(await button.isDisabled())) await button.click();
        await expect(button).toBeDisabled();
        await expect
          .poll(() =>
            canvas.locator("html").evaluate((node) => node.ownerDocument.defaultView!.innerWidth),
          )
          .toBe(width);
        await original.setViewportSize({ width, height: 900 });
        await compiled.setViewportSize({ width, height: 900 });
        await waitForCanvasFontCss(canvasRoot);
        // inspectArtwork waits on document.fonts.ready only after the canvas
        // stylesheet and implicit/imported font registration have settled.
        for (const root of [original.locator("body"), compiled.locator("body"), canvasRoot])
          await root.evaluate(inspectArtwork, { decode: true });
        const source = await boundaries(original.locator("body"), "original");
        const port = await boundaries(compiled.locator("body"), "compiled");
        const native = await boundaries(canvasRoot, "canvas");
        const colors = {
          source: await gutterPixel(original),
          compiled: await gutterPixel(compiled),
          canvas: await gutterPixel(page, canvasRoot),
        };
        comparisons.push({ mode, width, source, compiled: port, canvas: native, colors });
        expect(source.left).toBe(8);
        expect(source.width).toBe(width - 16);
        expect(source.top).toBe(name === dropboxName ? 18 : 8);
        expect(source.bottomInset).toBe(name === dropboxName ? 18 : 8);
        for (const [representation, actual] of [
          ["compiled", port],
          ["canvas", native],
        ] as const) {
          for (const edge of ["left", "right", "width", "top", "bottomInset"] as const)
            expect(actual[edge], `${mode} ${representation} source ${edge}`).toBeCloseTo(
              source[edge],
              1,
            );
          expect(actual.background).toBe(source.background);
          expect(colors[representation], `${mode} ${representation} source gutter paint`).toEqual(
            colors.source,
          );
          expect(actual.overflow).toBeLessThanOrEqual(1);
          const logo = source.images[0];
          const actualLogo = actual.images.find(({ src }) => src === logo.src)!;
          expect(actualLogo).toBeDefined();
          expect(actualLogo.width).toBeCloseTo(logo.width, 1);
          expect(actualLogo.height).toBeCloseTo(logo.height, 1);
          // Logos preceding all body copy give independent rendered top-edge
          // evidence. Notion/Nike place their first image after reflowing text.
          if (logo.y < 100)
            expect(
              Math.abs(actualLogo.y - logo.y),
              `${representation} source logo top`,
            ).toBeLessThanOrEqual(1.1);
          // Original fixed-width mobile overflow is deliberately not restored.
          if (source.overflow <= 1 || name === "receipts/apple-receipt")
            expect(actualLogo.x, `${representation} source logo left`).toBeCloseTo(logo.x, 1);
        }
        expect(
          canvasOverflowFailures(await canvas.locator(".pm-email").evaluate(measureCanvasGeometry)),
        ).toEqual([]);
      }
    } finally {
      writeFileSync(
        testInfo.outputPath("source-boundaries.json"),
        JSON.stringify({ name, comparisons }, null, 2),
      );
      await compiled.close();
      await original.close();
    }
  });
}
