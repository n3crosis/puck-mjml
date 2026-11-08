import { chooseImportFile } from "./import-email";
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
      await chooseImportFile(page, {
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

async function shapingSnapshot(target: Locator) {
  return target.evaluate(async (element) => {
    const doc = element.ownerDocument;
    await doc.fonts.ready;
    const walker = doc.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const runs = [];
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const text = node.textContent!;
      const style = doc.defaultView!.getComputedStyle(node.parentElement!);
      for (const match of text.matchAll(/office|planet/g)) {
        const range = doc.createRange();
        range.setStart(node, match.index!);
        range.setEnd(node, match.index! + match[0].length);
        runs.push({
          text: match[0],
          width: range.getBoundingClientRect().width,
          ligatures: style.fontVariantLigatures,
          features: style.fontFeatureSettings,
          weight: style.fontWeight,
        });
      }
    }
    return runs;
  });
}

test("canvas ligatures retain compiled shaping, authored overrides and character editing", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/");
  await chooseImportFile(page, {
    name: "shaping.mjml",
    mimeType: "application/xml",
    buffer: Buffer.from(
      await page.evaluate(async () => {
        // Use Vite's module loader for the public exporter (including its JSON
        // catalog), rather than Playwright's Node-side TypeScript loader.
        const fixtureUrl = "/tests/browser/fixtures/richtext-interaction-source.ts";
        return (await import(/* @vite-ignore */ fixtureUrl)).createShapingSource();
      }),
    ),
  });
  const canvas = page.frameLocator("#preview-frame");
  const selectors = [
    ".shaping-text",
    ".shaping-disabled",
    ".shaping-direct",
    ".shaping-descendant",
    ".shaping-table td",
    ".shaping-intrinsic",
  ];
  for (const selector of selectors)
    await expect(canvas.locator(selector).getByRole("textbox")).toHaveCount(1);
  await expect(canvas.locator(".shaping-intrinsic")).toHaveClass(/pm-intrinsic-text/);
  const original = await exportedMjml(page);
  await page.getByRole("button", { name: "Preview email", exact: true }).click();
  const compiled = page.frameLocator('iframe[title="Rendered email"]');
  const expected = [];
  for (const selector of selectors)
    expected.push(await shapingSnapshot(compiled.locator(selector)));
  // Fail if the fixture silently falls back or ceases exercising real substitution.
  expect(expected[0].map((run) => run.width)).toEqual([40, 48, 40, 40]);
  expect(expected[1].map((run) => run.width)).toEqual([48, 48, 48]);
  expect(expected[3].map((run) => run.width)).toEqual([40, 48, 48]);
  await page
    .getByRole("dialog", { name: "Email preview", exact: true })
    .getByRole("button", { name: "Close preview", exact: true })
    .click();
  for (const [index, selector] of selectors.entries()) {
    const target = canvas.locator(selector);
    await expect.poll(() => shapingSnapshot(target)).toEqual(expected[index]);
    await target.dblclick();
    const editor = target.getByRole("textbox");
    await expect(editor).toBeFocused();
    await expect(
      canvas
        .locator(".pm-richtext-toolbar--inline")
        .getByRole("button", { name: "Bold", exact: true }),
    ).toBeEnabled();
    await expect.poll(() => shapingSnapshot(target)).toEqual(expected[index]);
    await editor.press("Tab");
    await expect(editor).not.toBeFocused();
    await expect.poll(() => shapingSnapshot(target)).toEqual(expected[index]);
  }
  await expect(canvas.locator(".shaping-disabled .ProseMirror")).toHaveCSS(
    "font-variant-ligatures",
    "none",
  );
  await expect(canvas.locator(".shaping-direct .ProseMirror")).toHaveCSS(
    "font-variant-ligatures",
    "normal",
  );
  await expect(canvas.locator(".shaping-direct .ProseMirror")).toHaveCSS(
    "font-feature-settings",
    "normal",
  );
  expect(await exportedMjml(page)).toBe(original);

  const target = canvas.locator(".shaping-text");
  await target.dblclick();
  const editor = target.getByRole("textbox");
  await expect(editor).toBeVisible();
  await expect(editor).toBeFocused();
  const controls = canvas.locator(".pm-richtext-toolbar--inline");
  await expect(controls.getByRole("button", { name: "Bold", exact: true })).toBeEnabled();
  await editor.press("ControlOrMeta+Home");
  await editor.press("ArrowRight");
  for (let offset = 0; offset < 3; offset++) await editor.press("Shift+ArrowRight");
  await expect
    .poll(() => editor.evaluate((node) => node.ownerDocument.getSelection()?.toString()))
    .toBe("ffi");
  await controls.getByRole("button", { name: "Bold", exact: true }).click();
  await expect(target.locator("strong").first()).toHaveText("ffi");
  await controls.getByRole("button", { name: "Add link", exact: true }).click();
  const url = controls.getByRole("textbox", { name: "Link URL", exact: true });
  await url.fill("https://example.com/ligature");
  await url.press("Enter");
  await expect(target.locator('a[href="https://example.com/ligature"]')).toHaveText("ffi");
  const formatted = await exportedMjml(page);
  expect(formatted).toContain("https://example.com/ligature");
  await editor.click();
  await editor.press("ControlOrMeta+Home");
  for (let offset = 0; offset < 4; offset++) await editor.press("ArrowRight");
  await editor.press("ArrowLeft");
  await editor.press("Shift+ArrowRight");
  await expect
    .poll(() => editor.evaluate((node) => node.ownerDocument.getSelection()?.toString()))
    .toBe("i");
  await editor.press("ArrowRight");
  await page.keyboard.insertText("X");
  await expect(editor).toHaveText("offiXce planet office office");
  await editor.press("Backspace");
  await expect(editor).toHaveText("office planet office office");
  expect(await exportedMjml(page)).toBe(formatted);
  await editor.click();
  await editor.press("ControlOrMeta+End");
  await page.keyboard.insertText(" office");
  await expect.poll(() => exportedMjml(page)).not.toBe(formatted);
  const changed = await exportedMjml(page);
  await page.getByRole("button", { name: /^undo$/i }).click();
  await expect.poll(() => exportedMjml(page)).toBe(formatted);
  await page.getByRole("button", { name: /^redo$/i }).click();
  await expect.poll(() => exportedMjml(page)).toBe(changed);
});
