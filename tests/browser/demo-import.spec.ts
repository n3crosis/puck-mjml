import { templateInventory } from "../template-inventory";
import { expect, test, type Page } from "@playwright/test";

const delayedFile = "__deferred-demo-import__.mjml";
const discardMessage = "Discard your unsaved edits and replace this email?";

declare global {
  interface Window {
    __demoImportRead?: { release: () => void; reject: () => void };
  }
}

function source(text: string, withNote = false) {
  return `<mjml><mj-head><mj-preview>${text} preview</mj-preview>${withNote ? "<mj-import-note />" : ""}</mj-head><mj-body><mj-section><mj-column><mj-text>${text}</mj-text></mj-column></mj-section></mj-body></mjml>`;
}

async function importFile(page: Page, name: string, mjml: string) {
  await page.getByLabel("Import MJML", { exact: true }).setInputFiles({
    name,
    mimeType: "application/xml",
    buffer: Buffer.from(mjml),
  });
}

async function beginDelayedImport(page: Page, mjml: string) {
  await importFile(page, delayedFile, mjml);
  await expect.poll(() => page.evaluate(() => Boolean(window.__demoImportRead))).toBe(true);
}

function finishDelayedImport(page: Page, outcome: "release" | "reject" = "release") {
  return page.evaluate((result) => {
    const read = window.__demoImportRead;
    if (!read) throw new Error("The delayed import has not started reading");
    delete window.__demoImportRead;
    read[result]();
  }, outcome);
}

async function exportedMjml(page: Page) {
  // Read through real controls after settling the file promise. Besides checking
  // the complete document, this lets React finish the import before comparing it.
  await page.getByRole("button", { name: "Export email", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Export email", exact: true });
  await dialog.getByRole("button", { name: "MJML", exact: true }).click();
  const field = dialog.getByRole("textbox", { name: "MJML source" });
  await expect(field).toHaveValue(/<mjml/);
  const mjml = await field.inputValue();
  await dialog.getByRole("button", { name: "Close export" }).click();
  return mjml;
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.addInitScript((filename) => {
    const originalText = File.prototype.text;
    File.prototype.text = function () {
      if (this.name !== filename) return originalText.call(this);
      // Only hold this fixture's actual file contents. All other reads, the
      // import handler, validation, replacement, and history remain untouched.
      return originalText.call(this).then(
        (contents) =>
          new Promise<string>((resolve, reject) => {
            window.__demoImportRead = {
              release: () => resolve(contents),
              reject: () => reject(new Error("Delayed file read failed")),
            };
          }),
      );
    };
  }, delayedFile);
  await page.goto("/");
});

for (const selection of [
  { id: "blank", preview: "" },
  { id: templateInventory[0].id, preview: templateInventory[0].content.preview },
]) {
  test(`a delayed import cannot replace a later ${selection.id} selection`, async ({ page }) => {
    await beginDelayedImport(page, source("Superseded import", true));
    const picker = page.getByRole("combobox", { name: "Email template" });
    await picker.selectOption(selection.id);
    await expect(picker).toHaveValue(selection.id);
    await expect(page.getByRole("textbox", { name: "Preview text", exact: true })).toHaveValue(
      selection.preview,
    );
    const selectedSource = await exportedMjml(page);

    await finishDelayedImport(page);
    expect(await exportedMjml(page)).toBe(selectedSource);
    await expect(picker).toHaveValue(selection.id);
    await expect(page.locator('.demo-status[role="status"]')).toHaveCount(0);
    await expect(page.locator("details.demo-status")).toHaveCount(0);
    await expect(page.getByText("You have unsaved edits.", { exact: false })).toBeHidden();
  });
}

for (const outcome of ["release", "reject"] as const) {
  test(`an older import's late ${outcome === "release" ? "success" : "failure"} preserves the newer email and notes`, async ({
    page,
  }) => {
    await beginDelayedImport(page, source("Superseded import"));
    await importFile(page, "newest.mjml", source("Newest import wins", true));
    const picker = page.getByRole("combobox", { name: "Email template" });
    await expect(picker).toHaveValue("imported");
    await expect(page.getByRole("textbox", { name: "Preview text", exact: true })).toHaveValue(
      "Newest import wins preview",
    );
    await expect(
      page.frameLocator("#preview-frame").getByText("Newest import wins", { exact: true }),
    ).toBeVisible();
    const status = page.locator('.demo-status[role="status"]');
    const expectedStatus =
      "Imported newest.mjml with 1 note: Ignored unsupported head element <mj-import-note>.";
    await expect(status).toHaveText(expectedStatus);
    const notes = page.locator("details.demo-status");
    await notes.getByText("All import notes (1)", { exact: true }).click();
    await expect(notes.locator("li")).toHaveText([
      "Ignored unsupported head element <mj-import-note>.",
    ]);
    const newerSource = await exportedMjml(page);

    await finishDelayedImport(page, outcome);
    expect(await exportedMjml(page)).toBe(newerSource);
    await expect(picker).toHaveValue("imported");
    await expect(status).toHaveText(expectedStatus);
    await expect(notes.locator("li")).toHaveText([
      "Ignored unsupported head element <mj-import-note>.",
    ]);
    await expect(page.getByText("You have unsaved edits.", { exact: false })).toBeHidden();
    await expect(page.getByRole("button", { name: /^undo$/i })).toBeDisabled();
  });
}

for (const decision of ["dismiss", "accept"] as const) {
  test(`${decision === "dismiss" ? "dismissing" : "accepting"} import confirmation respects edits made while reading`, async ({
    page,
  }) => {
    const picker = page.getByRole("combobox", { name: "Email template" });
    await picker.selectOption("blank");
    await expect(picker).toHaveValue("blank");
    const preview = page.getByRole("textbox", { name: "Preview text", exact: true });
    await expect(preview).toHaveValue("");
    const dirtyNotice = page.getByText("You have unsaved edits.", { exact: false });
    await expect(dirtyNotice).toBeHidden();
    await beginDelayedImport(page, source("Delayed replacement", true));

    // This edit occurs after file.text() starts, so a dirty flag captured when
    // choosing the file would miss it. Wait for real undo history, not a timer.
    await preview.fill("Keep my in-flight edit");
    await expect(dirtyNotice).toBeVisible();
    const undo = page.getByRole("button", { name: /^undo$/i });
    await expect(undo).toBeEnabled();
    const draftSource = await exportedMjml(page);
    expect(draftSource).toContain("<mj-preview>Keep my in-flight edit</mj-preview>");

    // Install the listener before release. Do not await page.evaluate first:
    // window.confirm blocks that evaluation until the dialog is handled.
    await Promise.all([
      page.waitForEvent("dialog").then(async (dialog) => {
        try {
          expect(dialog.type()).toBe("confirm");
          expect(dialog.message()).toBe(discardMessage);
        } finally {
          await dialog[decision]();
        }
      }),
      finishDelayedImport(page),
    ]);

    if (decision === "dismiss") {
      expect(await exportedMjml(page)).toBe(draftSource);
      await expect(picker).toHaveValue("blank");
      await expect(preview).toHaveValue("Keep my in-flight edit");
      await expect(dirtyNotice).toBeVisible();
      await expect(page.locator('.demo-status[role="status"]')).toHaveCount(0);
      await expect(page.locator("details.demo-status")).toHaveCount(0);
      await expect(undo).toBeEnabled();
      await undo.click();
      await expect(preview).toHaveValue("");
      await expect(dirtyNotice).toBeHidden();
      await page.getByRole("button", { name: /^redo$/i }).click();
      await expect(preview).toHaveValue("Keep my in-flight edit");
      await expect(dirtyNotice).toBeVisible();
    } else {
      await expect(picker).toHaveValue("imported");
      await expect(preview).toHaveValue("Delayed replacement preview");
      const importedSource = await exportedMjml(page);
      expect(importedSource).toContain("Delayed replacement");
      expect(importedSource).not.toContain("Keep my in-flight edit");
      await expect(page.locator('.demo-status[role="status"]')).toContainText(
        `Imported ${delayedFile} with 1 note:`,
      );
      await expect(dirtyNotice).toBeHidden();
      await expect(undo).toBeDisabled();
    }
  });
}

async function dropSource(page: Page, text: string, fileSource?: string) {
  const data = await page.evaluateHandle(
    ({ text, fileSource }) => {
      const transfer = new DataTransfer();
      transfer.setData("text/plain", text);
      if (fileSource !== undefined)
        transfer.items.add(new File([fileSource], "dropped.mjml", { type: "application/xml" }));
      return transfer;
    },
    { text, fileSource },
  );
  const area = page.locator(".demo-import-source");
  await area.dispatchEvent("dragover", { dataTransfer: data });
  await expect(area).toHaveAttribute("data-dragging", "true");
  await area.dispatchEvent("drop", { dataTransfer: data });
  await expect(area).not.toHaveAttribute("data-dragging");
  await data.dispose();
}

test("imports external dropped text and gives a dropped file precedence over text", async ({
  page,
}) => {
  await dropSource(page, source("External text"));
  expect(await exportedMjml(page)).toContain("External text");
  await dropSource(page, source("Ignored text"), source("File wins"));
  const result = await exportedMjml(page);
  expect(result).toContain("File wins");
  expect(result).not.toContain("Ignored text");
});

for (const decision of ["dismiss", "accept"] as const) {
  test(`dropped text respects dirty confirmation: ${decision}`, async ({ page }) => {
    await page.getByRole("combobox", { name: "Email template" }).selectOption("blank");
    await page.getByRole("textbox", { name: "Preview text", exact: true }).fill("Keep draft");
    const draft = await exportedMjml(page);
    page.once("dialog", async (dialog) => {
      expect(dialog.message()).toBe(discardMessage);
      await dialog[decision]();
    });
    await dropSource(page, source("Dropped replacement"));
    const result = await exportedMjml(page);
    if (decision === "dismiss") expect(result).toBe(draft);
    else expect(result).toContain("Dropped replacement");
  });
}

test("invalid dropped text preserves a dirty draft and its undo history without asking to discard", async ({
  page,
}) => {
  await page.getByRole("combobox", { name: "Email template" }).selectOption("blank");
  await page.getByRole("textbox", { name: "Preview text", exact: true }).fill("Keep draft");
  const draft = await exportedMjml(page);
  const dialogs: string[] = [];
  page.on("dialog", async (dialog) => {
    dialogs.push(dialog.message());
    await dialog.dismiss();
  });
  for (const invalid of [
    "",
    "ordinary selected text",
    "<mjml><mj-body><mj-raw><script>alert(1)</script></mj-raw></mj-body></mjml>",
  ]) {
    await dropSource(page, invalid);
    await expect(page.locator('.demo-status[role="status"]')).toContainText(
      "Your previous email is unchanged.",
    );
    expect(await exportedMjml(page)).toBe(draft);
    await expect(page.getByRole("button", { name: /^undo$/i })).toBeEnabled();
  }
  expect(dialogs).toEqual([]);
});

test("paste stays editable until explicit import, and drag leave/cancel clears highlighting", async ({
  page,
}) => {
  const area = page.locator(".demo-import-source");
  await area.locator("summary").click();
  const field = page.getByRole("textbox", { name: "MJML source to import" });
  await field.fill(source("Pasted source"));
  await field.press("ControlOrMeta+A");
  await field.press("ControlOrMeta+C");
  await field.fill("");
  await field.press("ControlOrMeta+V");
  await expect(field).toHaveValue(source("Pasted source"));
  await field.fill(source("Edited pasted source"));
  await page.getByRole("button", { name: "Import text", exact: true }).click();
  expect(await exportedMjml(page)).toContain("Edited pasted source");
  const data = await page.evaluateHandle(() => {
    const data = new DataTransfer();
    data.setData("text/plain", "text");
    return data;
  });
  await area.dispatchEvent("dragover", { dataTransfer: data });
  await area.dispatchEvent("dragleave", { dataTransfer: data });
  await expect(area).not.toHaveAttribute("data-dragging");
  await area.dispatchEvent("dragover", { dataTransfer: data });
  await page.keyboard.press("Escape");
  await expect(area).not.toHaveAttribute("data-dragging");
  await data.dispose();
});
