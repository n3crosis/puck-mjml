import { expect, test, type Locator, type Page } from "@playwright/test";
import { adjacentLinkSource } from "./fixtures/richtext-interaction-source";

async function assertBoxes(anchors: Locator) {
  await expect(anchors).toHaveText(["First", "Second", "Third", "Fourth"]);
  for (const anchor of await anchors.all()) {
    await expect(anchor).toHaveCSS("display", "inline-block");
    await expect(anchor).toHaveCSS("margin-right", "10px");
  }
  const boxes = await anchors.evaluateAll((nodes) =>
    nodes.map((node) => {
      const box = node.getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, width: box.width };
    }),
  );
  for (let index = 1; index < boxes.length; index++) {
    expect(boxes[index].top).toBe(boxes[0].top);
    expect(boxes[index].left - boxes[index - 1].right).toBe(10);
  }
  return boxes.map(({ width }) => width);
}
async function exportedMjml(page: Page) {
  await page.getByRole("button", { name: "Export email", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Export email", exact: true });
  await dialog.getByRole("button", { name: "MJML", exact: true }).click();
  const source = await dialog.getByRole("textbox", { name: "MJML source" }).inputValue();
  await dialog.getByRole("button", { name: "Close export" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Export email", exact: true })).toBeFocused();
  return source;
}

for (const viewport of ["Desktop", "Mobile"] as const) {
  test(`adjacent identical-href anchors preserve independent boxes and edits on ${viewport}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto("/");
    await page.getByLabel("Import MJML", { exact: true }).setInputFiles({
      name: "adjacent-links.mjml",
      mimeType: "application/xml",
      buffer: Buffer.from(adjacentLinkSource),
    });
    if (viewport === "Mobile")
      await page.getByRole("button", { name: "Switch to Mobile viewport" }).click();
    const canvas = page.frameLocator("#preview-frame");
    const block = canvas.locator(".adjacent-links");
    const anchors = block.locator("a");
    const widths = await assertBoxes(anchors);
    const initial = await exportedMjml(page);
    expect(initial.match(/href="https:\/\/example.com\/shared"/g)).toHaveLength(4);
    expect(initial).not.toContain("anchorBoundary");
    await page.getByRole("button", { name: "Preview email", exact: true }).click();
    const preview = page.getByRole("dialog", { name: "Email preview", exact: true });
    if (viewport === "Mobile")
      await preview.getByRole("button", { name: "Mobile", exact: true }).click();
    expect(
      await assertBoxes(
        page.frameLocator('iframe[title="Rendered email"]').locator(".adjacent-links a"),
      ),
    ).toEqual(widths);
    await preview.getByRole("button", { name: "Close preview", exact: true }).click();
    await expect(preview).not.toBeVisible();
    await expect(page.getByRole("button", { name: "Preview email", exact: true })).toBeFocused();
    // Select from the component padding, not a navigating source link.
    await block.click({ position: { x: 2, y: 2 } });
    const editor = block.getByRole("textbox");
    await expect(editor).toHaveCount(1);
    await expect(editor).toBeVisible();
    await editor.click({ position: { x: 2, y: 2 } });
    await expect(editor).toBeFocused();
    await editor.press("ControlOrMeta+Home");
    for (let index = 0; index < 7; index++) await editor.press("ArrowRight");
    await expect
      .poll(() =>
        editor.evaluate((node) => {
          const selection = node.ownerDocument.getSelection();
          return selection?.isCollapsed
            ? selection.anchorNode?.parentElement?.closest("a")?.textContent
            : null;
        }),
      )
      .toBe("Second");
    const controls = canvas.locator(".pm-richtext-toolbar--inline");
    // Puck lazily replaces its initial menu on first focus. The standard
    // controls become enabled only once that replacement has completed.
    await expect(controls.getByRole("button", { name: "Bold", exact: true })).toBeEnabled();
    await controls.getByRole("button", { name: "Edit link", exact: true }).click();
    const linkInput = controls.getByRole("textbox", { name: "Link URL", exact: true });
    await expect(linkInput).toBeFocused();
    await expect(linkInput).toHaveValue("https://example.com/shared");
    await linkInput.fill("https://example.com/changed");
    await controls.getByRole("button", { name: "Apply", exact: true }).click();
    await expect(editor).toBeFocused();
    await expect(anchors.nth(1)).toHaveAttribute("href", "https://example.com/changed");
    for (const index of [0, 2, 3])
      await expect(anchors.nth(index)).toHaveAttribute("href", "https://example.com/shared");
    expect(await assertBoxes(anchors)).toEqual(widths);
    await controls.getByRole("button", { name: "Edit link", exact: true }).click();
    await controls.getByRole("button", { name: "Remove link", exact: true }).click();
    await expect(anchors).toHaveText(["First", "Third", "Fourth"]);
    await expect(block).toHaveText("FirstSecondThirdFourth");
    await expect.poll(() => exportedMjml(page)).not.toContain("example.com/changed");
    const removed = await exportedMjml(page);
    expect(removed.match(/href="https:\/\/example.com\/shared"/g)).toHaveLength(3);
    expect(removed).not.toContain("anchorBoundary");
  });
}
