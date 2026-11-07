import { expect, test, type Locator, type Page } from "@playwright/test";

async function exportedMjml(page: Page) {
  await page.getByRole("button", { name: "Export email", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Export email", exact: true });
  await dialog.getByRole("button", { name: "MJML", exact: true }).click();
  const source = await dialog.getByRole("textbox", { name: "MJML source" }).inputValue();
  await dialog.getByRole("button", { name: "Close export" }).click();
  return source;
}

async function selectCanvasViewport(page: Page, viewport: "Desktop" | "Mobile") {
  const button = page.getByRole("button", { name: `Switch to ${viewport} viewport` });
  if (await button.isEnabled()) await button.click();
  await expect
    .poll(() =>
      page
        .frameLocator("#preview-frame")
        .locator("html")
        .evaluate((element) => element.ownerDocument.defaultView!.innerWidth),
    )
    .toBe(viewport === "Mobile" ? 390 : 800);
}

async function labelStyles(anchors: Locator) {
  return anchors.evaluateAll((nodes) =>
    nodes.map((node) => {
      const style = node.ownerDocument.defaultView!.getComputedStyle(node);
      return {
        text: node.textContent!.replace(/\s+/g, " ").trim(),
        color: style.color,
        decoration: style.textDecorationLine,
      };
    }),
  );
}

const cases = [
  ["community/newsletters/codepen-challengers", 26],
  ["community/welcome/netlify-welcome", 6],
  ["community/reviews/amazon-review", 6],
  ["community/notifications/github-access-token", 3],
  ["community/receipts/apple-receipt", 2],
] as const;

for (const viewport of ["Desktop", "Mobile"] as const) {
  for (const [template, count] of cases) {
    test(`${template} preserves ${count} non-navigating labels on the ${viewport} canvas`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1600, height: 1000 });
      await page.goto("/");
      await page.getByRole("combobox", { name: "Email template" }).selectOption(template);
      await selectCanvasViewport(page, viewport);
      const canvas = page.frameLocator("#preview-frame");
      const labels = canvas.locator(".pm-text a:not([href])");
      await expect(labels).toHaveCount(count);
      const source = await exportedMjml(page);
      await page.getByRole("button", { name: "Preview email", exact: true }).click();
      const preview = page.getByRole("dialog", { name: "Email preview" });
      if (viewport === "Mobile")
        await preview.getByRole("button", { name: "Mobile", exact: true }).click();
      const compiledLabels = page
        .frameLocator('iframe[title="Rendered email"]')
        .locator("a:not([href])")
        .filter({ hasText: /\S/ });
      await expect(compiledLabels).toHaveCount(count);
      const expected = await labelStyles(compiledLabels);
      await preview.getByRole("button", { name: "Close preview", exact: true }).click();
      expect(await labelStyles(labels)).toEqual(expected);
      expect(
        await labels.evaluateAll((nodes) =>
          nodes.every(
            (node) =>
              !node.hasAttribute("role") &&
              !node.hasAttribute("tabindex") &&
              !node.hasAttribute("target"),
          ),
        ),
      ).toBe(true);
      expect(await exportedMjml(page)).toBe(source);
    });
  }

  test(`Netlify retains anchor styling through ${viewport} inline edit and undo`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto("/");
    await page
      .getByRole("combobox", { name: "Email template" })
      .selectOption("community/welcome/netlify-welcome");
    await selectCanvasViewport(page, viewport);
    const canvas = page.frameLocator("#preview-frame");
    const labels = canvas.locator(".pm-text a:not([href])");
    await expect(labels).toHaveCount(6);
    const originalLabels = await labelStyles(labels);
    const originalSource = await exportedMjml(page);
    const block = canvas.locator(".pm-text").filter({ hasText: "Deploy your first project." });
    await block.locator("a:not([href])").first().dblclick();
    const editor = block.locator('[contenteditable="true"]');
    await expect(editor).toBeVisible();
    await editor.press("ControlOrMeta+End");
    await page.keyboard.insertText(" Edited.");
    await expect(block).toContainText("Edited.");
    await expect(labels).toHaveCount(6);
    await expect.poll(() => exportedMjml(page)).toContain("Edited.");
    await page.getByRole("button", { name: /^undo$/i }).click();
    await expect.poll(() => exportedMjml(page)).toBe(originalSource);
    // Native undo includes viewport UI, so verify and restore the requested
    // width before comparing the responsive anchor styling.
    await expect
      .poll(() =>
        canvas.locator("html").evaluate((element) => element.ownerDocument.defaultView!.innerWidth),
      )
      .toBe(800);
    await selectCanvasViewport(page, viewport);
    await expect(labels).toHaveCount(6);
    expect(await labelStyles(labels)).toEqual(originalLabels);
    expect(await exportedMjml(page)).toBe(originalSource);
  });

  test(`Apple labels stay 10px and values 12px through ${viewport} inline edit and undo`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto("/");
    await page
      .getByRole("combobox", { name: "Email template" })
      .selectOption("community/receipts/apple-receipt");
    await selectCanvasViewport(page, viewport);
    const canvas = page.frameLocator("#preview-frame");
    const labels = canvas.locator(".apple-invoice p:first-child");
    const values = canvas.locator(".apple-invoice p:not(:first-child)");
    await expect(labels).toHaveCount(5);
    await expect(values).toHaveCount(5);
    const checkType = async () => {
      for (const label of await labels.all()) {
        await expect(label).toHaveCSS("font-size", "10px");
        await expect(label).toHaveCSS("color", "rgb(102, 102, 102)");
      }
      for (const value of await values.all()) {
        await expect(value).toHaveCSS("font-size", "12px");
        // Chromium can report logical start after inheriting a native table
        // alignment hint. Check both its direction and physical text position,
        // rather than imposing an inline CSS value that changes TH defaults.
        await expect(value).toHaveCSS("text-align", /^(left|start)$/);
        await expect(value).toHaveCSS("direction", "ltr");
        await expect
          .poll(() =>
            value.evaluate((paragraph) => {
              const range = paragraph.ownerDocument.createRange();
              range.selectNodeContents(paragraph);
              const first = Array.from(range.getClientRects()).find(
                (rect) => rect.width > 0 && rect.height > 0,
              );
              if (!first) return Number.POSITIVE_INFINITY;
              const style = paragraph.ownerDocument.defaultView!.getComputedStyle(paragraph);
              const left =
                paragraph.getBoundingClientRect().left +
                Number.parseFloat(style.borderLeftWidth) +
                Number.parseFloat(style.paddingLeft);
              return Math.abs(first.left - left);
            }),
          )
          .toBeLessThanOrEqual(1);
      }
      await expect(canvas.locator(".apple-invoice a:not([href])")).toHaveCount(2);
    };
    await checkType();
    const initial = await exportedMjml(page);
    const cell = canvas.locator(".apple-invoice td").filter({ hasText: "INVOICE DATE" });
    await cell.getByText("18 Jan 2023", { exact: true }).dblclick();
    const editor = cell.locator('[contenteditable="true"]');
    await expect(editor).toBeVisible();
    await editor.click();
    await editor.press("ControlOrMeta+End");
    await page.keyboard.insertText(" Edited.");
    await expect(cell).toContainText("18 Jan 2023 Edited.");
    await expect(page.getByRole("button", { name: /^undo$/i })).toBeEnabled();
    await expect.poll(() => exportedMjml(page)).toContain("18 Jan 2023 Edited.");
    await checkType();
    await page.getByRole("button", { name: /^undo$/i }).click();
    await expect.poll(() => exportedMjml(page)).toBe(initial);
    await expect
      .poll(() =>
        canvas.locator("html").evaluate((element) => element.ownerDocument.defaultView!.innerWidth),
      )
      .toBe(800);
    await selectCanvasViewport(page, viewport);
    await checkType();
    expect(await exportedMjml(page)).toBe(initial);
    const path = testInfo.outputPath(`apple-richtext-${viewport.toLowerCase()}.png`);
    await canvas.locator(".apple-invoice").screenshot({ path });
    await testInfo.attach(`Apple invoice after edit and undo (${viewport})`, {
      path,
      contentType: "image/png",
    });
  });
}
