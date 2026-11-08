import { chooseImportFile } from "./import-email";
import { expect, test, type Page } from "@playwright/test";

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

for (const viewport of ["Desktop", "Mobile"] as const) {
  test(`Imported formatting spaces do not indent the ${viewport} canvas, including edit and undo`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/");
    await chooseImportFile(page, {
      name: "formatted-text.mjml",
      mimeType: "application/xml",
      buffer: Buffer.from(`<mjml><mj-body><mj-section><mj-column>
        <mj-text>Someone recently requested an update. If this was you,
          you can review it here:</mj-text>
        <mj-text>If you don't want the update, delete
          this message.</mj-text>
        </mj-column></mj-section></mj-body></mjml>`),
    });
    await selectCanvasViewport(page, viewport);
    const frame = page.frameLocator("#preview-frame");
    const paragraph = frame.locator(".pm-text").filter({ hasText: "Someone recently requested" });
    const deletion = frame.locator(".pm-text").filter({ hasText: "If you don't want" });
    const original =
      "Someone recently requested an update. If this was you, you can review it here:";
    await expect(paragraph).toBeVisible();
    expect(await paragraph.textContent()).toBe(original);
    expect(await deletion.textContent()).toBe("If you don't want the update, delete this message.");
    const initialSource = await exportedMjml(page);
    expect(initialSource).toContain("you,\n          you can review it here:");
    expect(initialSource).toContain("delete\n          this message.");

    await paragraph.getByText(original, { exact: true }).dblclick();
    const editor = paragraph.locator('[contenteditable="true"]');
    await expect(editor).toBeVisible();
    await editor.click();
    await editor.press("ControlOrMeta+End");
    await page.keyboard.insertText(" Edited.");
    await expect(paragraph).toContainText("here: Edited.");
    await expect(page.getByRole("button", { name: /^undo$/i })).toBeEnabled();
    await expect.poll(() => exportedMjml(page)).toContain("here: Edited.");
    await page.getByRole("button", { name: /^undo$/i }).click();
    await expect(paragraph).toHaveText(original);
    await expect.poll(() => exportedMjml(page)).toBe(initialSource);
    // Puck undo restores the initial Desktop UI snapshot too. Re-select and
    // measure the requested viewport before making labelled visual evidence.
    await expect
      .poll(() =>
        frame.locator("html").evaluate((element) => element.ownerDocument.defaultView!.innerWidth),
      )
      .toBe(800);
    await selectCanvasViewport(page, viewport);
    expect(await paragraph.textContent()).toBe(original);
    expect(await paragraph.textContent()).not.toMatch(/[\r\n\t]| {2}/);
    expect(await deletion.textContent()).toBe("If you don't want the update, delete this message.");
    expect(await deletion.textContent()).not.toMatch(/[\r\n\t]| {2}/);
    expect(await exportedMjml(page)).toBe(initialSource);

    const path = testInfo.outputPath(`formatted-text-canvas-${viewport.toLowerCase()}.png`);
    await page.screenshot({ path, fullPage: true });
    await testInfo.attach(`Formatted text canvas after edit and undo (${viewport})`, {
      path,
      contentType: "image/png",
    });
  });
}

test("import preserves preformatted code, NBSP, and inline links on the canvas", async ({
  page,
}) => {
  await page.goto("/");
  await chooseImportFile(page, {
    name: "whitespace.mjml",
    mimeType: "application/xml",
    buffer: Buffer.from(`<mjml><mj-body><mj-section><mj-column><mj-text>
      <p>One&nbsp;&nbsp;two
        <a href="https://example.com/">three</a> four.<br />Five.</p>
      <pre><code>  const x = 1;
    x++;</code></pre>
    </mj-text></mj-column></mj-section></mj-body></mjml>`),
  });
  const frame = page.frameLocator("#preview-frame");
  const text = frame.locator(".pm-text");
  await expect(text.locator("pre code")).toBeVisible();
  expect(await text.locator("pre code").textContent()).toBe("  const x = 1;\n    x++;");
  expect(await text.locator("p").textContent()).toBe("One\u00a0\u00a0two three four.Five.");
  await expect(text.locator("a")).toHaveAttribute("href", "https://example.com/");
  await expect(text.locator("br")).toHaveCount(1);
  const source = await exportedMjml(page);
  expect(source).toContain("<pre><code>  const x = 1;\n    x++;</code></pre>");
});
