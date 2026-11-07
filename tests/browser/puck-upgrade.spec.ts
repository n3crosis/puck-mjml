import { expect, test } from "@playwright/test";

test("Puck drag handle reorders nested email blocks and preserves undo/redo", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/tests/browser/fixtures/puck-upgrade.html");
  const frame = page.frameLocator("#preview-frame");
  const blocks = frame.locator('[data-puck-component^="text-"]');
  await expect(blocks).toHaveCount(3);
  const order = async () => (await blocks.allTextContents()).map((value) => value.trim());
  await expect.poll(order).toEqual(["First block", "Second block", "Third block"]);

  // Select the padding rather than entering the inline text editor.
  await blocks.nth(0).click({ position: { x: 10, y: 10 } });
  const handle = frame.getByRole("button", { name: "Drag to reorder", exact: true });
  await expect(handle).toBeVisible();
  const source = await handle.boundingBox();
  const destination = await blocks.nth(1).boundingBox();
  if (!source || !destination) throw new Error("Missing drag handle or destination bounds");
  const x = source.x + source.width / 2;
  const y = source.y + source.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 10, y + 5, { steps: 5 });
  await page.mouse.move(
    destination.x + destination.width / 2,
    destination.y + destination.height - 2,
    { steps: 30 },
  );
  await page.mouse.up();
  await expect.poll(order).toEqual(["Second block", "First block", "Third block"]);
  const document = await page.getByLabel("Host document").textContent();
  expect(document!.indexOf("Second block")).toBeLessThan(document!.indexOf("First block"));
  await page.getByRole("button", { name: /^undo$/i }).click();
  await expect.poll(order).toEqual(["First block", "Second block", "Third block"]);
  await page.getByRole("button", { name: /^redo$/i }).click();
  await expect.poll(order).toEqual(["Second block", "First block", "Third block"]);
  expect(errors).toEqual([]);
});
