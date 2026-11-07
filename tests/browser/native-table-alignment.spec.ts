import { expect, test, type Page } from "@playwright/test";

for (const width of [390, 800]) {
  test(`native table alignment inherits like compiled cells at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/tests/browser/fixtures/native-table-alignment.html");
    await expect(page.getByLabel("Compilation status")).toHaveText("ready");
    const canvas = page.getByRole("region", { name: "Canvas" }),
      compiled = page.frameLocator("#compiled");
    for (const name of ["left", "center", "right", "default", "inherited"]) {
      const expected = name === "default" ? "left" : name === "inherited" ? "right" : name;
      await expect(canvas.locator(`.table-${name}`)).toHaveCSS("text-align", expected);
      const actual = canvas.locator(`.table-${name} tr > th, .table-${name} tr > td`);
      const reference = compiled.locator(
        `.table-${name} > table > tbody > tr > th, .table-${name} > table > tbody > tr > td`,
      );
      await expect(actual).toHaveCount(4);
      await expect(reference).toHaveCount(4);
      for (let index = 0; index < 4; index++) {
        const align = await reference
          .nth(index)
          .evaluate((element) => getComputedStyle(element).textAlign);
        await expect(actual.nth(index)).toHaveCSS("text-align", align);
      }
      await expect(actual.nth(2)).toHaveCSS("text-align", "right");
      await expect(actual.nth(3)).toHaveCSS("text-align", "center");
      const geometry = (element: Element) => {
        const r = element.getBoundingClientRect();
        return { x: r.x, width: r.width };
      };
      const table = await canvas.locator(`.table-${name} > table`).evaluate(geometry);
      const compiledTable = await compiled.locator(`.table-${name} > table`).evaluate(geometry);
      expect(table.x).toBeCloseTo(compiledTable.x, 1);
      expect(table.width).toBeCloseTo(compiledTable.width, 1);
    }
  });
}

async function exportedMjml(page: Page) {
  await page.getByRole("button", { name: "Export email", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Export email", exact: true });
  await dialog.getByRole("button", { name: "MJML", exact: true }).click();
  const source = await dialog.getByRole("textbox", { name: "MJML source" }).inputValue();
  await dialog.getByRole("button", { name: "Close export" }).click();
  return source;
}
for (const family of ["arcane", "studio"]) {
  test(`${family} order summary retains left labels, right amounts, and edit/undo`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/");
    await page
      .getByRole("combobox", { name: "Email template" })
      .selectOption(`${family === "arcane" ? "04" : "05"}-${family}/order-confirmation`);
    const frame = page.frameLocator("#preview-frame");
    const table = frame.locator(`.${family}-summary`);
    for (const viewport of ["Desktop", "Mobile"] as const) {
      if (viewport === "Mobile")
        await page.getByRole("button", { name: "Switch to Mobile viewport" }).click();
      const labels = table.locator("tr > td:first-child"),
        amounts = table.locator("tr > td:last-child");
      await expect(labels).toHaveCount(4);
      await expect(amounts).toHaveCount(4);
      for (let index = 0; index < 4; index++) {
        await expect(labels.nth(index)).toHaveCSS("text-align", "left");
        await expect(amounts.nth(index)).toHaveCSS("text-align", "right");
      }
    }
    const original = await exportedMjml(page);
    const label = table.locator("tr > td:first-child").first();
    await label.getByText("Subtotal", { exact: true }).dblclick();
    const editor = label.locator('[contenteditable="true"]');
    await expect(editor).toBeVisible();
    await editor.press("ControlOrMeta+End");
    await page.keyboard.insertText(" edited");
    await expect(label).toContainText("Subtotal edited");
    await expect(label).toHaveCSS("text-align", "left");
    expect(await exportedMjml(page)).toContain("Subtotal edited");
    await page.getByRole("button", { name: /^undo$/i }).click();
    await expect(label).toHaveText("Subtotal");
    expect(await exportedMjml(page)).toBe(original);
  });
}
