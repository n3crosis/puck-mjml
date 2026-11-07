import { expect, test } from "@playwright/test";

test("background position survives mount, axis edits, removal, undo and source replacement", async ({
  page,
}) => {
  await page.route("https://example.com/background.svg", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="469"><rect width="640" height="469" fill="#431d26"/><rect x="320" width="320" height="234" fill="#87aec0"/><circle cx="220" cy="360" r="90" fill="#e3b6a1"/></svg>',
    }),
  );
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/tests/browser/fixtures/native-background.html");
  const frame = page.frameLocator("#preview-frame");
  const target = frame.locator(".background-target");
  const compiled = page.frameLocator("#compiled").locator(".background-target");
  await expect(target).toBeVisible();
  await page.getByRole("button", { name: "Switch to Mobile viewport" }).click();
  const check = async (position: string) => {
    await expect(page.getByLabel("Compilation status")).toHaveText("ready");
    await expect(target).toHaveCSS("background-position", position);
    await expect(compiled).toHaveCSS("background-position", position);
    await expect(target).toHaveCSS("background-size", "cover");
    const actual = await target.boundingBox(),
      reference = await compiled.boundingBox();
    expect(actual!.width).toBeCloseTo(reference!.width, 1);
    expect(actual!.height).toBeCloseTo(reference!.height, 1);
    expect(actual!.width).toBe(390);
  };
  const edit = async (label: string, position: string) => {
    const history = page.getByLabel("History index");
    const previous = Number(await history.textContent());
    await page.getByRole("button", { name: label, exact: true }).click();
    await check(position);
    // Wait for Puck's actual debounced snapshot so each edit is undoable.
    await expect.poll(async () => Number(await history.textContent())).toBeGreaterThan(previous);
  };
  await check("50% 0%");
  await edit("Set X override", "25% 0%");
  await edit("Set both overrides", "25% 75%");
  await edit("Remove overrides", "50% 0%");
  await page.getByRole("button", { name: /^undo$/i }).click();
  await check("25% 75%");
  await page.getByRole("button", { name: /^redo$/i }).click();
  await check("50% 0%");
  await edit("Change position", "100% 100%");
  await page.getByRole("button", { name: "Replace source", exact: true }).click();
  await expect(target).toHaveCSS("background-position", "0% 100%");
  // Source replacement may reset the Puck viewport; select mobile again if needed.
  const mobile = page.getByRole("button", { name: "Switch to Mobile viewport" });
  if (await mobile.isEnabled()) await mobile.click();
  await check("0% 100%");
  await expect(page.getByRole("button", { name: /^undo$/i })).toBeDisabled();
  await edit("Set X override", "25% 0%");
  await page.getByRole("button", { name: /^undo$/i }).click();
  await expect(target).toHaveCSS("background-position", "0% 100%");
  // The replacement's initial snapshot may have captured Desktop UI.
  if (await mobile.isEnabled()) await mobile.click();
  await check("0% 100%");
  expect(errors).toEqual([]);
});
