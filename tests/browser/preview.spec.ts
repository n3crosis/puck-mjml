import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status === testInfo.expectedStatus) return;
  const path = testInfo.outputPath("preview-interaction-failure.png");
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach("Preview interaction at failure", { path, contentType: "image/png" });
});

test("isolated preview keeps CSS accordion interaction and touch scrolling", async ({
  page,
  context,
}) => {
  await page.goto("/tests/browser/fixtures/preview.html");
  const opener = page.getByRole("button", { name: "Preview email" });
  if (!(await opener.isVisible()))
    await page.getByRole("button", { name: "Toggle menu bar" }).click();
  await opener.click();
  const dialog = page.getByRole("dialog", { name: "Email preview" });
  const close = dialog.getByRole("button", { name: "Close preview" });
  const iframe = page.locator('iframe[title="Rendered email"]');
  await expect(iframe).toHaveAttribute("sandbox", "");
  const rendered = page.frameLocator('iframe[title="Rendered email"]');
  const answer = rendered.getByText("The pointer opened this answer.", { exact: true });
  await expect(answer).toBeHidden();
  await close.focus();
  await rendered.getByText("Show the answer", { exact: true }).tap();
  await expect(answer).toBeVisible();
  await expect(close).toBeFocused();

  const bounds = await iframe.boundingBox();
  expect(bounds).not.toBeNull();
  const x = bounds!.x + bounds!.width / 2;
  const startY = bounds!.y + bounds!.height * 0.8;
  const endY = bounds!.y + bounds!.height * 0.25;
  const before = await rendered
    .locator("body")
    .evaluate((body) => body.ownerDocument.scrollingElement!.scrollTop);
  const session = await context.newCDPSession(page);
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y: startY }],
  });
  for (let step = 1; step <= 12; step++) {
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x, y: startY + ((endY - startY) * step) / 12 }],
    });
  }
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await session.detach();
  await expect
    .poll(() =>
      rendered.locator("body").evaluate((body) => body.ownerDocument.scrollingElement!.scrollTop),
    )
    .toBeGreaterThan(before);
  await expect(close).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});
