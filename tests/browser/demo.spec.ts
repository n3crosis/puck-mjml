import { chooseImportFile } from "./import-email";
import { expect, test } from "@playwright/test";

test("demo loads, exports source, and rejects trusted imports without replacement", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".demo-notice")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Preview email" })).toBeVisible();
  await page.getByRole("button", { name: "Export email" }).click();
  await page.getByRole("button", { name: "MJML", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download MJML" }).click();
  expect((await download).suggestedFilename()).toBe("email.mjml");
  await page.getByRole("button", { name: "Close export" }).click();
  const template = await page.getByRole("combobox", { name: "Email template" }).inputValue();
  await chooseImportFile(page, {
    name: "trusted.mjml",
    mimeType: "application/xml",
    buffer: Buffer.from(
      "<mjml><mj-body><mj-raw><div>Untrusted source</div></mj-raw></mj-body></mjml>",
    ),
  });
  const importDialog = page.getByRole("dialog", { name: "Import MJML", exact: true });
  await expect(importDialog.getByRole("alert")).toContainText("Import not loaded");
  await importDialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Email template" })).toHaveValue(template);
});

test("preview opens and dismisses with Escape", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Preview email" }).click();
  await expect(page.getByRole("dialog", { name: "Email preview" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Email preview" })).toBeHidden();
});

test("tablet sidebars preserve canvas space and expanded actions do not cover controls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 834, height: 1112 });
  await page.goto("/");
  const left = page.locator('[class*="_Sidebar--left_"]');
  const right = page.locator('[class*="_Sidebar--right_"]');
  const canvas = page.locator('[class*="_PuckCanvas_"]');
  const expectUsableCanvas = async () =>
    expect.poll(async () => (await canvas.boundingBox())?.width ?? 0).toBeGreaterThanOrEqual(440);

  await expect(left).toBeHidden();
  await expect(right).toBeVisible();
  await expectUsableCanvas();
  await page.getByRole("button", { name: "Toggle menu bar" }).click();
  await expect(page.getByRole("button", { name: "Preview email" })).toBeVisible();
  const header = page.locator('header[class*="_PuckHeader_"]');
  const controls = page.locator('[class*="_PuckCanvas-controls_"]');
  await expect(controls).toBeVisible();
  await expect
    .poll(async () => {
      const top = await controls.boundingBox();
      const above = await header.boundingBox();
      return top && above ? top.y - (above.y + above.height) : -1;
    })
    .toBeGreaterThanOrEqual(0);

  await page.getByRole("button", { name: "Toggle left sidebar" }).click();
  await expect(left).toBeVisible();
  await expect(right).toBeHidden();
  await expectUsableCanvas();
  await page.getByRole("button", { name: "Toggle right sidebar" }).click();
  await expect(right).toBeVisible();
  await expect(left).toBeHidden();
  await expectUsableCanvas();

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Toggle left sidebar" }).click();
  await expect(left).toBeVisible();
  await expect(right).toBeVisible();
  await page.setViewportSize({ width: 834, height: 1112 });
  await expect(left).toBeHidden();
  await expect(right).toBeVisible();
  await expectUsableCanvas();
});

for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 834, height: 1112 },
  { width: 390, height: 844 },
]) {
  test(`demo and preview fit ${viewport.width}px viewport`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(page.locator(".demo-app .pm-editor")).toBeVisible();
    await expect(page.locator(".demo-notice")).toHaveCount(0);
    const preview = page.getByRole("button", { name: "Preview email" });
    if (!(await preview.isVisible())) {
      await page.getByRole("button", { name: "Toggle menu bar" }).click();
    }
    await expect(page.getByRole("button", { name: "Preview email" })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({ path: `test-results/demo-${viewport.width}.png`, fullPage: true });
    await page.getByRole("button", { name: "Preview email" }).click();
    await expect(page.getByRole("dialog", { name: "Email preview" })).toBeVisible();
    const rendered = page.frameLocator('iframe[title="Rendered email"]');
    await expect(rendered.getByText("Monthly roundup", { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    const hero = rendered.locator("img").first();
    await expect(hero).toBeVisible();
    // Dialog visibility precedes iframe navigation, image decoding, and web fonts.
    // Wait for those resources, not a fixed delay or a partially painted frame.
    await hero.evaluate(async (image: HTMLImageElement) => {
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          Promise.all([image.ownerDocument.fonts.ready, image.decode()]),
          new Promise<never>((_, reject) => {
            timeout = setTimeout(() => reject(new Error("Preview resources did not load")), 15_000);
          }),
        ]);
        if (!image.complete || image.naturalWidth === 0) {
          throw new Error("Preview hero image failed to load");
        }
      } finally {
        clearTimeout(timeout);
      }
    });
    await page.screenshot({ path: `test-results/preview-${viewport.width}.png`, fullPage: true });
  });
}
