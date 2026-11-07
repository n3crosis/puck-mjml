import { expect, test, type Locator, type Page } from "@playwright/test";

/** Exercise Puck's pointer sensor, including the iframe boundary and canvas zoom. */
async function dragBlock(page: Page, source: Locator, target: Locator) {
  await source.scrollIntoViewIfNeeded();
  await target.scrollIntoViewIfNeeded();
  const sourceBounds = await source.boundingBox();
  const targetBounds = await target.boundingBox();
  expect(sourceBounds, "The palette block must have a visible drag handle").not.toBeNull();
  expect(targetBounds, "The destination slot must have a visible drop area").not.toBeNull();
  if (!sourceBounds || !targetBounds) throw new Error("Missing drag bounds");

  const start = {
    x: sourceBounds.x + sourceBounds.width / 2,
    y: sourceBounds.y + sourceBounds.height / 2,
  };
  const end = {
    x: targetBounds.x + targetBounds.width / 2,
    y: targetBounds.y + targetBounds.height / 2,
  };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  // First activate the pointer sensor, then cross the iframe with real steps.
  await page.mouse.move(start.x + 12, start.y + 4, { steps: 4 });
  await page.mouse.move(end.x, end.y, { steps: 30 });
  // A final in-slot move lets nested collision detection replace the root zone.
  await page.mouse.move(end.x + 2, end.y + 2, { steps: 2 });
  await page.mouse.up();
}

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status === testInfo.expectedStatus) return;
  const path = testInfo.outputPath("editing-failure.png");
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach("Editor at failure", { path, contentType: "image/png" });
});

test("preview closes with Escape while its isolated email iframe has focus", async ({ page }) => {
  await page.goto("/");
  const opener = page.getByRole("button", { name: "Preview email" });
  await opener.click();
  const dialog = page.getByRole("dialog", { name: "Email preview" });
  await expect(dialog).toBeVisible();
  const iframe = page.locator('iframe[title="Rendered email"]');
  await expect(iframe).toHaveAttribute("sandbox", "");
  const rendered = page.frameLocator('iframe[title="Rendered email"]');
  await rendered.getByText("Monthly roundup", { exact: true }).click();
  await expect(iframe).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
  await opener.click();
  await expect(dialog).toBeVisible();
  await dialog.click({ position: { x: 5, y: 5 } });
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});

for (const canvas of ["Desktop", "Mobile"] as const) {
  test(`blank email accepts a layout and nested text in ${canvas} canvas`, async ({ page }) => {
    await page.setViewportSize({ width: 1180, height: 900 });
    await page.goto("/");
    const template = page.getByRole("combobox", { name: "Email template" });
    await template.selectOption("blank");
    await expect(template).toHaveValue("blank");
    const frame = page.frameLocator("#preview-frame");
    const root = frame.getByTestId("dropzone:root:sections");
    await expect(root).toBeVisible();
    await expect(root.locator("[data-puck-component]")).toHaveCount(0);
    if (canvas === "Mobile") {
      await page.getByRole("button", { name: "Switch to Mobile viewport" }).click();
      await expect(page.getByRole("button", { name: "Switch to Mobile viewport" })).toBeDisabled();
    }

    await dragBlock(page, page.getByRole("button", { name: "1 column", exact: true }), root);
    const section = root.locator('[data-puck-component^="Section1-"]');
    await expect(section).toHaveCount(1);
    const column = section.locator('[data-puck-dropzone$=":column"]');
    await expect(column).toBeVisible();
    await expect(column.locator("[data-puck-component]")).toHaveCount(0);

    await dragBlock(page, page.getByRole("button", { name: "Text", exact: true }), column);
    await expect(column.locator('[data-puck-component^="Text-"]')).toHaveCount(1);
    await expect(column.getByText("Your text here", { exact: true })).toBeVisible();
    await expect(page.getByText("You have unsaved edits.", { exact: false })).toBeVisible();
  });
}
