import { expect, type Page } from "@playwright/test";

/** Exercise the same import surface as a user, including the native chooser. */
export async function openImportDialog(page: Page) {
  const dialog = page.getByRole("dialog", { name: "Import MJML", exact: true });
  if (!(await dialog.isVisible())) {
    const trigger = page.getByRole("button", { name: "Import", exact: true });
    if (!(await trigger.isVisible()))
      await page.getByRole("button", { name: "Toggle menu bar", exact: true }).click();
    await trigger.click();
  }
  await expect(dialog).toBeVisible();
  return dialog;
}

export async function chooseImportFile(
  page: Page,
  file: { name: string; mimeType: string; buffer: Buffer },
) {
  const dialog = await openImportDialog(page);
  const chooser = page.waitForEvent("filechooser");
  await dialog.getByRole("button", { name: "Choose file", exact: true }).click();
  await (await chooser).setFiles(file);
}
