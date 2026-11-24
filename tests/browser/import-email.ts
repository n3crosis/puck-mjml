import { expect, type Page } from "@playwright/test";

/** Exercise the same import surface as a user, including the native chooser. */
export async function openImportDialog(page: Page) {
  const dialog = page.getByRole("dialog", { name: "Import MJML", exact: true });
  if (!(await dialog.isVisible())) {
    const trigger = page.getByRole("button", { name: "Import", exact: true });
    const menu = page.getByRole("button", { name: "Toggle menu bar", exact: true });
    // A loading desktop editor has neither control yet. Wait for the header
    // before deciding whether the responsive menu needs to be opened.
    await trigger.or(menu).filter({ visible: true }).first().waitFor({ state: "visible" });
    if (!(await trigger.isVisible())) await menu.click();
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

/** Check the draft's unload guard without navigating or opening a native dialog. */
export async function expectUnsavedChanges(page: Page, dirty: boolean) {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const event = new Event("beforeunload", { cancelable: true });
        window.dispatchEvent(event);
        return event.defaultPrevented;
      }),
    )
    .toBe(dirty);
}
