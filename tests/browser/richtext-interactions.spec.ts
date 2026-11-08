import { expect, test, type Locator, type Page } from "@playwright/test";
import { richTextInteractionSource } from "./fixtures/richtext-interaction-source";

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

async function selectWord(editor: Locator) {
  // Modal dismissal restores its opener, and undo/redo replaces the editor's
  // DOM selection. Re-enter as a user would instead of relying on programmatic
  // focus alone to recreate the caret range.
  await editor.click();
  await expect(editor).toBeFocused();
  await editor.press("ControlOrMeta+Home");
  for (let offset = 0; offset < 6; offset++) await editor.press("ArrowRight");
  for (let offset = 0; offset < 9; offset++) await editor.press("Shift+ArrowRight");
  await expect
    .poll(() => editor.evaluate((node) => node.ownerDocument.getSelection()?.toString()))
    .toBe("selection");
}

for (const viewport of ["Desktop", "Mobile"] as const) {
  for (const surface of ["canvas", "sidebar"] as const) {
    test(`${surface} rich text formats a selection, manages links and keeps history on ${viewport}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1600, height: 1000 });
      await page.goto("/");
      await page.getByLabel("Import MJML", { exact: true }).setInputFiles({
        name: "richtext-interactions.mjml",
        mimeType: "application/xml",
        buffer: Buffer.from(richTextInteractionSource),
      });
      if (viewport === "Mobile")
        await page.getByRole("button", { name: "Switch to Mobile viewport" }).click();
      const canvas = page.frameLocator("#preview-frame");
      const target = canvas.locator(
        surface === "canvas" ? ".formatting-target" : ".formatting-table td:first-child",
      );
      await target.dblclick();
      // Puck also keeps an inactive Fields plugin mounted under display:none.
      // Exercise the one visible inspector, not an arbitrary matching copy.
      const sidebarContent = page.locator('[data-table-cell-property="content"]:visible');
      if (surface === "sidebar") await expect(sidebarContent).toHaveCount(1);
      // The lazy editor first renders an editable .rich-text fallback. Wait
      // for its initialized textbox before clicking or sending navigation keys;
      // otherwise hydration can replace the caret halfway through selection.
      const editor =
        surface === "canvas" ? target.getByRole("textbox") : sidebarContent.getByRole("textbox");
      await expect(editor).toHaveCount(1);
      await expect(editor).toBeVisible();
      const controls =
        surface === "canvas"
          ? canvas.locator(".pm-richtext-toolbar--inline")
          : sidebarContent.locator(".pm-richtext-toolbar");
      await expect(controls.getByRole("button", { name: "Bold", exact: true })).toBeEnabled();
      await selectWord(editor);
      for (const name of ["Bold", "Italic", "Underline", "Strikethrough"]) {
        const button = controls.getByRole("button", { name, exact: true });
        await expect(button).toBeEnabled();
        await button.click();
        await expect(editor).toBeFocused();
        await expect
          .poll(() => editor.evaluate((node) => node.ownerDocument.getSelection()?.toString()))
          .toBe("selection");
      }
      await expect(target.locator("strong")).toHaveText("selection");
      await expect(target.locator("strong")).toHaveCSS("font-weight", "700");
      await expect(target.locator("em")).toHaveCSS("font-style", "italic");
      await expect(target.locator("u")).toHaveCSS("text-decoration-line", "underline");
      await expect(target.locator("s")).toHaveCSS("text-decoration-line", "line-through");
      await expect(canvas.locator(".source-target strong")).not.toHaveAttribute(
        "style",
        /font-weight/,
      );
      await expect(canvas.locator(".formatting-table td:last-child")).toHaveText(
        "Untouched neighbor.",
      );

      await controls.getByRole("button", { name: "Add link", exact: true }).click();
      const link = controls.getByRole("textbox", { name: "Link URL", exact: true });
      await link.fill("javascript:alert(1)");
      await link.press("Enter");
      await expect(controls.getByRole("alert")).toContainText("Enter an HTTP");
      await expect(target.locator("a")).toHaveCount(0);
      await link.fill("https://example.com/help");
      await link.press("Enter");
      await expect(editor).toBeFocused();
      await expect(target.locator("a")).toHaveText("selection");
      await expect(target.locator("a")).toHaveAttribute("href", "https://example.com/help");
      await controls.getByRole("button", { name: "Edit link", exact: true }).click();
      await link.fill("https://example.com/cancelled");
      await link.press("Escape");
      await expect(editor).toBeFocused();
      await expect(target.locator("a")).toHaveAttribute("href", "https://example.com/help");
      await controls.getByRole("button", { name: "Edit link", exact: true }).click();
      await controls.getByRole("button", { name: "Remove link", exact: true }).click();
      await expect(editor).toBeFocused();
      await expect(target.locator("a")).toHaveCount(0);

      const formatted = await exportedMjml(page);
      expect(formatted).toContain('<strong style="font-weight:bold">');
      expect(formatted).not.toContain("example.com/cancelled");
      await page.getByRole("button", { name: "Preview email", exact: true }).click();
      const preview = page.getByRole("dialog", { name: "Email preview", exact: true });
      const compiled = page.frameLocator('iframe[title="Rendered email"]');
      await expect(
        compiled.locator(
          surface === "canvas" ? ".formatting-target strong" : ".formatting-table strong",
        ),
      ).toHaveCSS("font-weight", "700");
      await preview.getByRole("button", { name: "Close preview", exact: true }).click();

      await expect(preview).not.toBeVisible();
      await expect(page.getByRole("button", { name: "Preview email", exact: true })).toBeFocused();
      await editor.click();
      await expect(editor).toBeFocused();
      await editor.press("ControlOrMeta+End");
      // Insert one text transaction, like paste/IME input. Individual key
      // events can span Puck's 250ms history grouping window on a busy runner,
      // legitimately making the final period a separate undo step.
      await page.keyboard.insertText(" Extra.");
      await expect.poll(() => exportedMjml(page)).toContain(" Extra.");
      const changed = await exportedMjml(page);
      await page.getByRole("button", { name: /^undo$/i }).click();
      await expect.poll(() => exportedMjml(page)).toBe(formatted);
      await page.getByRole("button", { name: /^redo$/i }).click();
      await expect.poll(() => exportedMjml(page)).toBe(changed);
      await selectWord(editor);
      for (const name of ["Bold", "Italic", "Underline", "Strikethrough"])
        await controls.getByRole("button", { name, exact: true }).click();
      await expect(target.locator("strong, em, u, s")).toHaveCount(0);
      await editor.press("ControlOrMeta+b");
      await expect(target.locator("strong")).toHaveCSS("font-weight", "700");
      await editor.press("ControlOrMeta+b");
      await expect(target.locator("strong")).toHaveCount(0);
    });
  }
}
