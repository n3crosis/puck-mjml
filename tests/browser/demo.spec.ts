import { expect, test } from "@playwright/test";

test("demo loads, exports source, and rejects trusted imports without replacement", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("Demo only: drafts are not saved.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Preview email" })).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download MJML" }).click();
  expect((await download).suggestedFilename()).toBe("email.mjml");
  const template = await page.getByRole("combobox", { name: "Email template" }).inputValue();
  await page.getByLabel("Import MJML", { exact: true }).setInputFiles({
    name: "trusted.mjml",
    mimeType: "application/xml",
    buffer: Buffer.from(
      "<mjml><mj-body><mj-raw><div>Untrusted source</div></mj-raw></mj-body></mjml>",
    ),
  });
  await expect(page.getByRole("status")).toContainText("Import not loaded");
  await expect(page.getByRole("combobox", { name: "Email template" })).toHaveValue(template);
});

test("preview opens and dismisses with Escape", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Preview email" }).click();
  await expect(page.getByRole("dialog", { name: "Email preview" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Email preview" })).toBeHidden();
});

for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 834, height: 1112 },
  { width: 390, height: 844 },
]) {
  test(`demo and preview fit ${viewport.width}px viewport`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(
      page.getByText("Demo only: drafts are not saved.", { exact: false }),
    ).toBeVisible();
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
    await page.screenshot({ path: `test-results/preview-${viewport.width}.png`, fullPage: true });
  });
}
