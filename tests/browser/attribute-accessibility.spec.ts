import { expect, test, type Locator } from "@playwright/test";

const fixture = "/tests/browser/fixtures/attribute-accessibility.html";

async function activateRowAction(row: Locator, action: string) {
  const summary = row.locator(".pm-attribute-menu > summary");
  await summary.focus();
  await summary.press("Enter");
  await expect(row.locator("details")).toHaveAttribute("open", "");
  await row.getByRole("button", { name: action, exact: true }).press("Enter");
}

test("native attribute keyboard actions retain focus through repeated moves and removals", async ({
  page,
}) => {
  await page.goto(fixture);
  const rows = page.locator(".pm-attribute-row");
  const summary = (index: number) => rows.nth(index).locator(".pm-attribute-menu > summary");
  await activateRowAction(rows.nth(1), "Move up");
  await expect(summary(0)).toBeFocused();
  await expect(rows.nth(0).getByRole("combobox", { name: "Attribute 1", exact: true })).toHaveValue(
    "background-color",
  );
  await expect(page.locator(".pm-attribute-menu[open]")).toHaveCount(0);
  await activateRowAction(rows.nth(0), "Move down");
  await expect(summary(1)).toBeFocused();
  await expect(rows.nth(1).getByRole("combobox", { name: "Attribute 2", exact: true })).toHaveValue(
    "background-color",
  );
  // Reopen the moved row and leave its checkbox with Escape.
  await summary(1).press("Enter");
  await rows.nth(1).getByRole("checkbox", { name: "Inherit attribute 2" }).focus();
  await page.keyboard.press("Escape");
  await expect(summary(1)).toBeFocused();
  await expect(page.locator(".pm-attribute-menu[open]")).toHaveCount(0);

  await activateRowAction(rows.nth(1), "Remove attribute");
  await expect(rows).toHaveCount(2);
  await expect(summary(1)).toBeFocused();
  await expect(rows.nth(1).getByRole("combobox", { name: "Attribute 2", exact: true })).toHaveValue(
    "css-class",
  );
  await activateRowAction(rows.nth(1), "Remove attribute");
  await expect(rows).toHaveCount(1);
  await expect(summary(0)).toBeFocused();
  await expect(rows.nth(0).getByRole("combobox", { name: "Attribute 1", exact: true })).toHaveValue(
    "width",
  );
  await activateRowAction(rows.nth(0), "Remove attribute");
  await expect(rows).toHaveCount(0);
  const add = page.getByRole("button", { name: "Add attribute", exact: true });
  await expect(add).toBeFocused();
  await add.press("Enter");
  await expect(rows).toHaveCount(1);
  await activateRowAction(rows.nth(0), "Remove attribute");
  await expect(add).toBeFocused();
  await expect(page.getByText("No overrides", { exact: true })).toBeVisible();
});

test("HTML source supports keyboard exit and selection while locked without document changes", async ({
  page,
}) => {
  await page.goto(fixture);
  const source = page.getByRole("textbox", { name: "Trusted HTML source", exact: true });
  const host = page.getByLabel("Host HTML source", { exact: true });
  const count = page.getByLabel("Source change count", { exact: true });
  const lock = page.getByRole("button", { name: "Toggle source lock" });
  await source.focus();
  await source.press("Control+Home");
  await source.press("Tab");
  const indented = "  <p>Keyboard-editable HTML</p>";
  await expect(source).toHaveValue(indented);
  await expect(host).toHaveJSProperty("textContent", indented);
  await expect(count).toHaveText("1");
  await source.press("Escape");
  await page.keyboard.press("Tab");
  await expect(lock).toBeFocused();
  await expect(source).toHaveValue(indented);
  await source.focus();
  await source.press("Shift+Tab");
  await expect(
    page.getByRole("button", { name: "Expand Trusted HTML source editor" }),
  ).toBeFocused();
  await expect(count).toHaveText("1");

  await lock.click();
  await expect(source).toHaveJSProperty("readOnly", true);
  await expect(source).toBeEnabled();
  await source.focus();
  await source.press("Control+a");
  await expect(source).toBeFocused();
  expect(
    await source.evaluate((element: HTMLTextAreaElement) => ({
      start: element.selectionStart,
      end: element.selectionEnd,
    })),
  ).toEqual({ start: 0, end: indented.length });
  await source.press("x");
  await expect(source).toHaveValue(indented);
  await expect(host).toHaveJSProperty("textContent", indented);
  await expect(count).toHaveText("1");
  await source.press("Tab");
  await expect(lock).toBeFocused();
});

for (const viewport of [
  { width: 320, height: 640 },
  { width: 640, height: 320 },
]) {
  test(`attribute and HTML controls stay reachable at ${viewport.width}×${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto(fixture);
    const summary = page.locator(".pm-attribute-menu > summary").first();
    await summary.press("Enter");
    await expect(page.locator(".pm-attribute-menu[open]")).toHaveCount(1);
    // Scroll each real control into view, including the open row popover.
    // Vertical page scrolling is allowed; horizontal page overflow is not.
    for (const control of await page
      .locator("main :is(input, select, textarea, button, summary):visible")
      .all()) {
      await control.scrollIntoViewIfNeeded();
      const box = await control.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThan(0);
      expect(box!.height).toBeGreaterThan(0);
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await summary.focus();
    await page.keyboard.press("Escape");
    await expect(summary).toBeFocused();
    await page.screenshot({
      path: `test-results/attribute-accessibility-${viewport.width}x${viewport.height}.png`,
      fullPage: true,
    });
  });
}
