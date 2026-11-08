import { chooseImportFile } from "./import-email";
import { expect, test, type Page } from "@playwright/test";

for (const width of [390, 800]) {
  test(`native table alignment inherits like compiled cells at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/tests/browser/fixtures/native-table-alignment.html");
    await expect(page.getByLabel("Compilation status")).toHaveText("ready");
    const canvas = page.getByRole("region", { name: "Canvas" }),
      compiled = page.frameLocator("#compiled");
    for (const name of [
      "left",
      "center",
      "right",
      "default",
      "inherited",
      "head-css",
      "css-inherit",
      "rtl",
    ]) {
      const wrapper = canvas.locator(`.table-${name}`);
      const compiledWrapper = compiled.locator(`.table-${name}`);
      await expect(wrapper).toHaveAttribute(
        "align",
        (await compiledWrapper.getAttribute("align"))!,
      );
      await expect(wrapper).toHaveCSS(
        "text-align",
        await compiledWrapper.evaluate((element) => getComputedStyle(element).textAlign),
      );
      const actual = canvas.locator(`.table-${name} tr > th, .table-${name} tr > td`);
      const reference = compiled.locator(
        `.table-${name} > table > tbody > tr > th, .table-${name} > table > tbody > tr > td`,
      );
      await expect(actual).toHaveCount(5);
      await expect(reference).toHaveCount(5);
      for (let index = 0; index < 5; index++) {
        const align = await reference
          .nth(index)
          .evaluate((element) => getComputedStyle(element).textAlign);
        await expect(actual.nth(index)).toHaveCSS("text-align", align);
      }
      await expect(actual.nth(0)).toHaveCSS(
        "text-align",
        ["head-css", "css-inherit"].includes(name) ? "right" : "center",
      );
      await expect(actual.nth(2)).toHaveCSS("text-align", "left");
      await expect(actual.nth(3)).toHaveCSS("text-align", "right");
      await expect(actual.nth(4)).toHaveCSS("text-align", "center");
      if (name === "rtl") {
        await expect(actual.nth(1)).toHaveCSS("direction", "rtl");
        await expect.poll(() => actual.nth(1).evaluate(physicalTextAlign)).toBe("right");
      }
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

function physicalTextAlign(element: Element) {
  const { textAlign, direction } = getComputedStyle(element);
  if (textAlign === "start") return direction === "rtl" ? "right" : "left";
  if (textAlign === "end") return direction === "rtl" ? "left" : "right";
  return textAlign.replace(/^-webkit-/, "");
}

async function exportedMjml(page: Page) {
  await page.getByRole("button", { name: "Export email", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Export email", exact: true });
  await dialog.getByRole("button", { name: "MJML", exact: true }).click();
  const source = await dialog.getByRole("textbox", { name: "MJML source" }).inputValue();
  await dialog.getByRole("button", { name: "Close export" }).click();
  return source;
}
for (const align of ["left", "center"]) {
  test(`${align} table retains left labels, right amounts, and edit/undo`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/");
    await chooseImportFile(page, {
      name: "table-alignment.mjml",
      mimeType: "application/xml",
      buffer:
        Buffer.from(`<mjml><mj-body><mj-section><mj-column><mj-table css-class="summary" align="${align}">
        ${["Subtotal", "Tax", "Shipping", "Total"].map((label) => `<tr><td style="text-align:left">${label}</td><td style="text-align:right">$12</td></tr>`).join("")}
      </mj-table></mj-column></mj-section></mj-body></mjml>`),
    });
    const frame = page.frameLocator("#preview-frame");
    const table = frame.locator(".summary");
    for (const viewport of ["Desktop", "Mobile"] as const) {
      if (viewport === "Mobile")
        await page.getByRole("button", { name: "Switch to Mobile viewport" }).click();
      const labels = table.locator("tr > td:first-child"),
        amounts = table.locator("tr > td:last-child");
      await expect(labels).toHaveCount(4);
      await expect(amounts).toHaveCount(4);
      for (let index = 0; index < 4; index++) {
        await expect.poll(() => labels.nth(index).evaluate(physicalTextAlign)).toBe("left");
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
    await expect.poll(() => label.evaluate(physicalTextAlign)).toBe("left");
    expect(await exportedMjml(page)).toContain("Subtotal edited");
    await page.getByRole("button", { name: /^undo$/i }).click();
    await expect(label).toHaveText("Subtotal");
    expect(await exportedMjml(page)).toBe(original);
  });
}
