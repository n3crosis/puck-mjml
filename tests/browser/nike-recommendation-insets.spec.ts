import { readFileSync, writeFileSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { inspectArtwork } from "./artwork-evidence";
import { waitForCanvasFontCss } from "./font-evidence";
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

async function recommendations(root: Locator, kind: "source" | "compiled" | "canvas") {
  return root.evaluate((root, kind) => {
    const document = root.ownerDocument;
    const view = document.defaultView!;
    const images = Array.from(
      root.querySelectorAll<HTMLImageElement>('img[src*="/nike-recomendation-"]'),
    );
    const area =
      kind === "source"
        ? images[0].closest("table")!
        : root.querySelector(".nike-recommendations")!;
    const origin = area.getBoundingClientRect();
    const box = (node: Element | Range) => {
      const { x, y, width, height } = node.getBoundingClientRect();
      return { x: x - origin.x, y: y - origin.y, width, height };
    };
    const paddingHost = (node: Element) =>
      kind === "canvas"
        ? node.matches('[data-pm-mjml-padding="self"]')
          ? node
          : node.querySelector(":scope > [data-pm-mjml-padding-target]")!
        : node.querySelector(":scope > table > tbody > tr > td")!;
    const areaStyle = view.getComputedStyle(kind === "source" ? area : paddingHost(area));
    return {
      width: origin.width,
      height: origin.height,
      horizontalPadding: [areaStyle.paddingLeft, areaStyle.paddingRight],
      pairCount: area.querySelectorAll(".nike-recommendation-pair").length,
      pairs: Array.from(area.querySelectorAll(".nike-recommendation-pair"), box),
      overflow: document.documentElement.scrollWidth - view.innerWidth,
      cards: images.map((image) => {
        const card =
          kind === "source" ? image.closest("td")! : image.closest(".nike-recommendation-card")!;
        const host = kind === "source" ? card : paddingHost(card);
        const style = view.getComputedStyle(host);
        const labels = Array.from(
          card.querySelectorAll(kind === "source" ? "p" : ".nike-recommendation-text"),
        );
        return {
          box: box(card),
          horizontalPadding: [style.paddingLeft, style.paddingRight],
          image: {
            ...box(image),
            src: image.src,
            alt: image.alt,
            naturalWidth: image.naturalWidth,
          },
          labels: labels.map((label) => {
            const style = view.getComputedStyle(label);
            const lines = new Map<
              string,
              { x: number; y: number; width: number; height: number }
            >();
            const walker = document.createTreeWalker(label, view.NodeFilter.SHOW_TEXT);
            let typography: { size: string; leading: string; weight: string } | undefined;
            while (walker.nextNode()) {
              const node = walker.currentNode;
              const text = node.textContent ?? "";
              if (!text.trim()) continue;
              const font = view.getComputedStyle(node.parentElement!);
              typography = {
                size: font.fontSize,
                leading: font.lineHeight,
                weight: font.fontWeight,
              };
              for (const word of text.matchAll(/[^ \t\n\f\r]+/g)) {
                const range = document.createRange();
                range.setStart(node, word.index!);
                range.setEnd(node, word.index! + word[0].length);
                for (const rect of Array.from(range.getClientRects())) {
                  if (!rect.width || !rect.height) continue;
                  const key = `${rect.y}:${rect.height}`;
                  const previous = lines.get(key);
                  const left = Math.min(previous?.x ?? rect.x - origin.x, rect.x - origin.x);
                  const right = Math.max(
                    previous ? previous.x + previous.width : left,
                    rect.right - origin.x,
                  );
                  lines.set(key, {
                    x: left,
                    y: rect.y - origin.y,
                    width: right - left,
                    height: rect.height,
                  });
                }
              }
            }
            return {
              text: label.textContent!.replace(/\s+/g, " ").trim(),
              horizontalPadding: [style.paddingLeft, style.paddingRight],
              typography,
              lines: Array.from(lines.values()).sort((a, b) => a.y - b.y || a.x - b.x),
            };
          }),
        };
      }),
    };
  }, kind);
}
const close = (actual: number, expected: number, label: string) =>
  expect(Math.abs(actual - expected), `${label}: ${actual} vs ${expected}`).toBeLessThanOrEqual(
    1 / 64,
  );

test("Nike recommendations retain source insets and editable mobile pairs without claiming intrinsic-width parity", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/");
  await page
    .getByRole("combobox", { name: "Email template" })
    .selectOption("community/receipts/nike-receipt");
  const canvas = page.frameLocator("#preview-frame");
  const canvasRoot = canvas.locator(".pm-canvas");
  await expect(canvas.locator(".nike-recommendations")).toBeVisible();
  const original = await page.context().newPage();
  const compiled = await page.context().newPage();
  const captures: {
    mode: string;
    width: number;
    source: Awaited<ReturnType<typeof recommendations>>;
    compiled: Awaited<ReturnType<typeof recommendations>>;
    canvas: Awaited<ReturnType<typeof recommendations>>;
    canvasGeometry: ReturnType<typeof measureCanvasGeometry>;
  }[] = [];
  try {
    await loadReactEmailReference(
      original,
      readFileSync(
        new URL(
          "../fixtures/react-email-reference/Community/receipts/nike-receipt.html",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await compiled.setContent(await compiledEmail(page), { waitUntil: "load" });
    // Preserve every capture before checking geometry so one mismatch cannot
    // hide evidence for the other viewport or representation.
    for (const [mode, width] of [
      ["Desktop", 800],
      ["Mobile", 390],
    ] as const) {
      const button = page.getByRole("button", { name: `Switch to ${mode} viewport` });
      if (!(await button.isDisabled())) await button.click();
      await expect
        .poll(() =>
          canvas.locator("html").evaluate((node) => node.ownerDocument.defaultView!.innerWidth),
        )
        .toBe(width);
      await original.setViewportSize({ width, height: 900 });
      await compiled.setViewportSize({ width, height: 900 });
      await waitForCanvasFontCss(canvasRoot);
      for (const root of [original.locator("body"), compiled.locator("body"), canvasRoot])
        await root.evaluate(inspectArtwork, { decode: true });
      captures.push({
        mode,
        width,
        source: await recommendations(original.locator("body"), "source"),
        compiled: await recommendations(compiled.locator("body"), "compiled"),
        canvas: await recommendations(canvasRoot, "canvas"),
        canvasGeometry: await canvas.locator(".pm-email").evaluate(measureCanvasGeometry),
      });
      await original.screenshot({
        path: testInfo.outputPath(`nike-source-${width}.png`),
        fullPage: true,
      });
      await compiled.screenshot({
        path: testInfo.outputPath(`nike-compiled-${width}.png`),
        fullPage: true,
      });
      await canvas
        .locator(".nike-recommendations")
        .screenshot({ path: testInfo.outputPath(`nike-native-recommendations-${width}.png`) });
    }
    for (const capture of captures) {
      expect(canvasOverflowFailures(capture.canvasGeometry)).toEqual([]);
      const { width, source, compiled: port, canvas: native } = capture;
      expect(source.cards).toHaveLength(4);
      expect(source.horizontalPadding).toEqual(["0px", "0px"]);
      for (const actual of [port, native]) {
        expect(actual.cards).toHaveLength(4);
        expect(actual.pairCount).toBe(2);
        expect(actual.overflow).toBeLessThanOrEqual(1);
        expect(actual.horizontalPadding).toEqual(width === 800 ? ["0px", "0px"] : ["14px", "14px"]);
        for (const [index, card] of actual.cards.entries()) {
          const expected = source.cards[index];
          expect(expected.horizontalPadding).toEqual([
            index === 0 ? "4px" : "2px",
            index === 3 ? "4px" : "2px",
          ]);
          expect(card.horizontalPadding).toEqual(
            width === 800 ? expected.horizontalPadding : ["6px", "6px"],
          );
          expect(card.image.src).toBe(expected.image.src);
          expect(card.image.alt).toBe(expected.image.alt);
          expect(card.image.naturalWidth).toBeGreaterThan(0);
          expect(card.labels).toHaveLength(2);
          for (const [labelIndex, label] of card.labels.entries()) {
            expect(label.text).toBe(expected.labels[labelIndex].text);
            expect(expected.labels[labelIndex].horizontalPadding).toEqual(["10px", "10px"]);
            expect(label.horizontalPadding).toEqual(
              width === 800 ? ["10px", "10px"] : ["4px", "4px"],
            );
            expect(label.typography).toEqual({
              size: "15px",
              leading: width === 800 ? "15px" : "21px",
              weight: labelIndex === 0 ? "500" : "400",
            });
          }
          if (width === 800) {
            close(
              card.image.width,
              Math.floor(actual.width / 4 - (index === 0 || index === 3 ? 6 : 4)),
              `desktop image ${index} native allocation`,
            );
          } else {
            close(
              card.image.width,
              (actual.width - 28) / 2 - 12,
              `mobile image ${index} retained width`,
            );
            close(
              card.image.x,
              index % 2 === 0 ? 20 : actual.width / 2 + 6,
              `mobile image ${index} retained left`,
            );
            expect(card.image.x + card.image.width).toBeLessThanOrEqual(actual.width - 20 + 1 / 64);
          }
        }
        if (width === 800) {
          close(actual.cards[0].image.x, source.cards[0].image.x, "source first artwork edge");
          // MJML floors fluid image pixel widths. The last edge can retain its
          // ordinary half-pixel remainder; source content-based widths differ.
          expect(
            Math.abs(
              actual.width -
                actual.cards[3].image.x -
                actual.cards[3].image.width -
                (source.width - source.cards[3].image.x - source.cards[3].image.width),
            ),
          ).toBeLessThanOrEqual(1);
        } else {
          close(actual.cards[0].image.y, actual.cards[1].image.y, "first mobile pair");
          close(actual.cards[2].image.y, actual.cards[3].image.y, "second mobile pair");
          expect(actual.cards[2].image.y).toBeGreaterThan(
            actual.cards[0].image.y + actual.cards[0].image.height,
          );
        }
      }
      // Compare all local geometry exactly without compensating unrelated
      // source section heights or the editor workspace's global y origin.
      close(native.width, port.width, "native region width");
      close(native.height, port.height, "native region height");
      for (let index = 0; index < 4; index++) {
        for (const property of ["x", "y", "width", "height"] as const)
          close(
            native.cards[index].image[property],
            port.cards[index].image[property],
            `native image ${index} ${property}`,
          );
        for (let label = 0; label < 2; label++) {
          const actual = native.cards[index].labels[label].lines;
          const expected = port.cards[index].labels[label].lines;
          expect(actual).toHaveLength(expected.length);
          for (let line = 0; line < actual.length; line++)
            for (const property of ["x", "y", "width", "height"] as const)
              close(
                actual[line][property],
                expected[line][property],
                `native label ${index}/${label}/${line} ${property}`,
              );
        }
      }
    }
    // The native image inspector remains available for every recommendation.
    for (const image of await canvas.locator(".nike-recommendation-card .pm-image").all()) {
      await image.click();
      await expect(page.getByRole("textbox", { name: "Image URL", exact: true })).toHaveValue(
        (await image.locator("img").getAttribute("src"))!,
      );
    }
    for (const label of await canvas.locator(".nike-recommendation-text").all()) {
      await label.dblclick();
      await expect(label.locator('[contenteditable="true"]')).toBeVisible();
    }
  } finally {
    const path = testInfo.outputPath("nike-recommendation-insets.json");
    writeFileSync(
      path,
      JSON.stringify(
        {
          note: "Source auto-layout widths remain unequal; only insets are source-matched. Mobile keeps two readable pairs.",
          captures,
        },
        null,
        2,
      ),
    );
    await testInfo.attach("Nike recommendation source and native geometry", {
      path,
      contentType: "application/json",
    });
    await original.close();
    await compiled.close();
  }
});

test("Nike switches its actual compiled and native recommendation layout at 479/480px", async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/");
  await page
    .getByRole("combobox", { name: "Email template" })
    .selectOption("community/receipts/nike-receipt");
  const canvas = page.frameLocator("#preview-frame");
  const canvasRoot = canvas.locator(".pm-canvas");
  await expect(canvas.locator(".nike-recommendations")).toBeVisible();
  const compiled = await page.context().newPage();
  const captures: {
    width: number;
    iframeWidth: number;
    compiledViewportWidth: number;
    compiled: Awaited<ReturnType<typeof recommendations>>;
    canvas: Awaited<ReturnType<typeof recommendations>>;
    canvasGeometry: ReturnType<typeof measureCanvasGeometry>;
  }[] = [];
  try {
    await compiled.setContent(await compiledEmail(page), { waitUntil: "load" });
    for (const width of [479, 480]) {
      // The public viewport controls offer390/800. Resize the actual preview
      // iframe between those presets, as the existing source-image gate does.
      // Never mock innerWidth or change any authored email styles.
      await page.locator("#preview-frame").evaluate((iframe: HTMLIFrameElement, width) => {
        iframe.style.setProperty("width", `${width}px`, "important");
      }, width);
      await expect
        .poll(() =>
          canvas.locator("html").evaluate((node) => node.ownerDocument.defaultView!.innerWidth),
        )
        .toBe(width);
      await compiled.setViewportSize({ width, height: 900 });
      await waitForCanvasFontCss(canvasRoot);
      for (const root of [compiled.locator("body"), canvasRoot])
        await root.evaluate(inspectArtwork, { decode: true });
      captures.push({
        width,
        iframeWidth: await canvas
          .locator("html")
          .evaluate((node) => node.ownerDocument.defaultView!.innerWidth),
        compiledViewportWidth: await compiled.evaluate(() => innerWidth),
        compiled: await recommendations(compiled.locator("body"), "compiled"),
        canvas: await recommendations(canvasRoot, "canvas"),
        canvasGeometry: await canvas.locator(".pm-email").evaluate(measureCanvasGeometry),
      });
      await compiled.screenshot({
        path: testInfo.outputPath(`nike-compiled-boundary-${width}.png`),
        fullPage: true,
      });
      await canvas
        .locator(".nike-recommendations")
        .screenshot({ path: testInfo.outputPath(`nike-native-boundary-${width}.png`) });
    }
    // Complete both widths' evidence before testing overflow, computed styles,
    // or geometry. Original mobile overflow is not the responsive target.
    for (const capture of captures) {
      const mobile = capture.width === 479;
      expect(capture.iframeWidth).toBe(capture.width);
      expect(capture.compiledViewportWidth).toBe(capture.width);
      expect(canvasOverflowFailures(capture.canvasGeometry)).toEqual([]);
      for (const actual of [capture.compiled, capture.canvas]) {
        expect(actual.overflow).toBeLessThanOrEqual(1);
        expect(actual.pairCount).toBe(2);
        expect(actual.cards).toHaveLength(4);
        expect(actual.horizontalPadding).toEqual(mobile ? ["14px", "14px"] : ["0px", "0px"]);
        for (const pair of actual.pairs)
          close(pair.width, mobile ? actual.width - 28 : actual.width / 2, "breakpoint pair width");
        for (const [index, card] of actual.cards.entries()) {
          expect(card.horizontalPadding).toEqual(
            mobile ? ["6px", "6px"] : [index === 0 ? "4px" : "2px", index === 3 ? "4px" : "2px"],
          );
          close(
            card.box.width,
            mobile ? (actual.width - 28) / 2 : actual.width / 4,
            "breakpoint card width",
          );
          expect(card.image.x).toBeGreaterThanOrEqual(0);
          expect(card.image.x + card.image.width).toBeLessThanOrEqual(actual.width + 1 / 64);
          expect(card.labels).toHaveLength(2);
          for (const label of card.labels) {
            expect(label.horizontalPadding).toEqual(mobile ? ["4px", "4px"] : ["10px", "10px"]);
            expect(label.typography?.leading).toBe(mobile ? "21px" : "15px");
          }
        }
        if (mobile) {
          close(actual.cards[0].image.y, actual.cards[1].image.y, "479 first pair");
          close(actual.cards[2].image.y, actual.cards[3].image.y, "479 second pair");
          expect(actual.cards[2].image.y).toBeGreaterThan(
            actual.cards[0].image.y + actual.cards[0].image.height,
          );
        } else {
          for (let index = 1; index < 4; index++) {
            close(actual.cards[index].image.y, actual.cards[0].image.y, "480 four-card row");
            expect(actual.cards[index].image.x).toBeGreaterThan(actual.cards[index - 1].image.x);
          }
        }
      }
      //480px is a narrowed email, not the800px card's image dimensions.
      // Retain exact native/compiler parity without imposing a viewport-derived
      // source auto-layout width or changing the existing strict tolerances.
      close(capture.canvas.width, capture.compiled.width, "boundary region width");
      close(capture.canvas.height, capture.compiled.height, "boundary region height");
      for (let index = 0; index < 4; index++)
        for (const property of ["x", "y", "width", "height"] as const)
          close(
            capture.canvas.cards[index].image[property],
            capture.compiled.cards[index].image[property],
            `boundary native image ${index} ${property}`,
          );
    }
  } finally {
    const path = testInfo.outputPath("nike-recommendation-breakpoint.json");
    writeFileSync(
      path,
      JSON.stringify(
        {
          note: "Actual iframe479/480px media-query boundary; source mobile overflow is deliberately not restored.",
          captures,
        },
        null,
        2,
      ),
    );
    await testInfo.attach("Nike recommendation479/480 boundary", {
      path,
      contentType: "application/json",
    });
    await compiled.close();
  }
});
