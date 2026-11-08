import { expect, test } from "@playwright/test";

const fixture = "/tests/browser/fixtures/property-inspector.html";
for (const width of [240, 304, 380]) {
  test(`expanded Custom CSS stays inside a ${width}px inspector with an independent code scrollbar`, async ({
    page,
  }) => {
    await page.goto(fixture);
    await page.getByLabel("Inspector width").fill(String(width));
    const inspector = page.getByTestId("inspector");
    const css = inspector.locator('[data-property-name="headStyles"]');
    await css.getByRole("button", { name: /^CSS 1 \(head\)/ }).click();
    const editor = css.getByRole("textbox", { name: "CSS", exact: true });
    await expect(editor).toBeVisible();
    const bounded = () =>
      inspector.evaluate((root) =>
        [
          root,
          ...root.querySelectorAll(
            ".pm-property-body, .pm-property-label, .pm-css-field, .pm-css-editor-host",
          ),
        ].every((element) => element.scrollWidth <= element.clientWidth + 1),
      );
    await expect.poll(bounded).toBe(true);
    await page.getByRole("button", { name: "Load long CSS" }).click();
    await expect(editor).toContainText("background-image");
    await css.getByRole("button", { name: "Expand CSS editor" }).click();
    await expect.poll(bounded).toBe(true);
    const scroller = css.locator(".cm-scroller");
    await expect
      .poll(() => scroller.evaluate((element) => element.scrollWidth > element.clientWidth))
      .toBe(true);
    await editor.focus();
    await editor.press("Control+End");
    await editor.press("Enter");
    await editor.press("x");
    await expect(page.getByLabel("Saved document")).toContainText("x");
    await editor.press("Escape");
    await page.keyboard.press("Tab");
    await expect(editor).not.toBeFocused();
    await css.getByRole("button", { name: "Collapse CSS editor" }).click();
    await expect.poll(bounded).toBe(true);
  });
}

test("root, class, per-element, local and generated HTML property names all support searchable editing", async ({
  page,
}) => {
  await page.goto(fixture);
  const inspector = page.getByTestId("inspector");
  const edit = async (fieldName: string, query: string, expected: string) => {
    const field = inspector.locator(`[data-property-name="${fieldName}"]`);
    const input = field.getByRole("combobox", { name: "Attribute 1", exact: true });
    await input.fill(query);
    await expect(input).toHaveAttribute("aria-expanded", "true");
    const option = field
      .getByRole("option")
      .filter({ has: page.locator(`span`, { hasText: new RegExp(`^${expected}$`) }) });
    await expect(option).toBeVisible();
    const bounds = await option.boundingBox();
    const panel = await inspector.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(panel!.x);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(panel!.x + panel!.width + 1);
    await input.press("Enter");
    await expect(input).toHaveValue(expected);
  };
  await edit("bodyAttributes", "background-color", "background-color");
  await edit("attributeDefaults", "font si", "font-size");
  await inspector
    .locator('[data-property-name="componentDefaults"]')
    .getByRole("button", { name: /^mj-text/ })
    .click();
  await edit("componentDefaults", "line-height", "line-height");
  const classes = inspector.locator('[data-property-name="mjmlClasses"]');
  await classes.getByRole("button", { name: /^theme/ }).click();
  await edit("mjmlClasses", "font-weight", "font-weight");
  const html = inspector.locator('[data-property-name="htmlAttributes"]');
  await html.getByRole("button", { name: /^\.card/ }).click();
  const htmlName = html.getByRole("combobox", { name: "Attribute name", exact: true });
  await htmlName.fill("aria-label");
  await htmlName.press("Tab");
  await expect(htmlName).toHaveValue("aria-label");
  await page.getByRole("button", { name: "Select text", exact: true }).click();
  await edit("mjmlAttributes", "font-size", "font-size");
  const search = inspector.getByRole("searchbox", { name: "Search properties" });
  await search.fill("font-size");
  await expect(inspector.locator('[data-property-name="fontSize"]')).toBeVisible();
  await expect(inspector.locator('[data-property-name="padding"]')).toBeHidden();
  await search.press("Tab");
  const clear = inspector.getByRole("button", { name: "Clear property search" });
  await expect(clear).toBeFocused();
  const saved = await page.getByLabel("Saved document").textContent();
  await clear.press("Enter");
  await expect(search).toBeFocused();
  await expect(search).toHaveValue("");
  await expect(page.getByLabel("Saved document")).toHaveText(saved!);
  await expect(inspector.locator('[data-property-name="padding"]')).toBeVisible();
  await search.fill("no-such-property");
  await expect(inspector.getByRole("status")).toHaveText("No matching properties");
  await search.press("Escape");
  await expect(search).toBeFocused();
  await expect(inspector.locator('[data-property-name="padding"]')).toBeVisible();
});
