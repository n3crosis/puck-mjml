import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

for (const width of [1440, 834, 390]) {
  test(`export switches and downloads current source at ${width}px`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/tests/browser/fixtures/puck-upgrade.html");
    const exportButton = page.getByRole("button", { name: "Export email", exact: true });
    if (!(await exportButton.isVisible()))
      await page.getByRole("button", { name: "Toggle menu bar" }).click();
    const hostBefore = await page.getByLabel("Host document").textContent();
    const canvasBefore = page.frameLocator("#preview-frame");
    await expect(canvasBefore.getByText("First block", { exact: true })).toBeVisible();
    expect(
      await exportButton.evaluate((button) =>
        button.previousElementSibling?.getAttribute("aria-label"),
      ),
    ).toBe("Preview email");
    await exportButton.click();
    const dialog = page.getByRole("dialog", { name: "Export email", exact: true });
    await expect(dialog).toBeVisible();
    await expect(page.locator(".pm-editor-workspace")).toHaveAttribute("inert", "");
    for (const format of ["MJML", "HTML"] as const) {
      await dialog.getByRole("button", { name: format, exact: true }).click();
      const source = dialog.getByRole("textbox", { name: `${format} source` });
      await expect(source).toHaveAttribute("readonly", "");
      await expect(source).toHaveValue(/First block/);
      const expected = await source.inputValue();
      expect(expected).toContain(format === "MJML" ? "<mjml" : "<html");
      const download = page.waitForEvent("download");
      await dialog.getByRole("button", { name: `Download ${format}` }).click();
      const file = await download;
      expect(file.suggestedFilename()).toBe(`email.${format.toLowerCase()}`);
      expect(await readFile((await file.path())!, "utf8")).toBe(expected);
    }
    const bounds = await dialog.locator(".pm-export-dialog").boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(900);
    await page.screenshot({ path: `test-results/export-${width}.png`, fullPage: true });
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(exportButton).toBeFocused();
    await expect(page.locator(".pm-editor-workspace")).not.toHaveAttribute("inert", "");
    expect(await page.getByLabel("Host document").textContent()).toBe(hostBefore);
    await exportButton.click();
    await expect(dialog.getByRole("button", { name: "HTML", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await dialog.getByRole("button", { name: "Close export" }).click();
    await expect(exportButton).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(dialog).toBeVisible();
    // Source selection remains interactive; only the backdrop cancels its
    // mousedown default so it cannot steal focus after the modal disappears.
    const source = dialog.getByRole("textbox", { name: "HTML source" });
    await source.click();
    await expect(source).toBeFocused();
    await dialog.click({ position: { x: 5, y: 5 } });
    await expect(dialog).toBeHidden();
    await expect(exportButton).toBeFocused();
    await expect(page.locator(".pm-editor-workspace")).not.toHaveAttribute("inert", "");
    await page.keyboard.press("Enter");
    await expect(dialog).toBeVisible();
    await page.mouse.move(5, 5);
    await page.mouse.down();
    await expect(dialog).toBeHidden();
    await expect(exportButton).toBeFocused();
    await page.mouse.up();
    await expect(exportButton).toBeFocused();
    expect(errors).toEqual([]);
  });
}
