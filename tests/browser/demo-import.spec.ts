import { chooseImportFile, expectUnsavedChanges, openImportDialog } from "./import-email";
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
  await chooseImportFile(page, {
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
  test(`a cancelled delayed import cannot replace a later ${selection.id} selection`, async ({
    page,
  }) => {
    await beginDelayedImport(page, source("Superseded import", true));
    await page
      .getByRole("dialog", { name: "Import MJML", exact: true })
      .getByRole("button", { name: "Cancel", exact: true })
      .click();
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
    await expectUnsavedChanges(page, false);
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
    await expectUnsavedChanges(page, false);
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
    await expectUnsavedChanges(page, false);
    await beginDelayedImport(page, source("Delayed replacement", true));

    // Simulate a host update after file.text() starts. The modal correctly
    // prevents user edits behind it, but the import must still check the latest
    // dirty state rather than a flag captured when the file was selected.
    await page.locator('[data-property-name="previewText"] input').evaluateAll((fields) => {
      const field = fields.find(
        (element) => (element as HTMLElement).offsetParent !== null,
      ) as HTMLInputElement;
      if (!field) throw new Error("Missing preview text field");
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
        field,
        "Keep my in-flight edit",
      );
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await expectUnsavedChanges(page, true);
    const undo = page.getByRole("button", { name: /^undo$/i });

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
      const dialog = page.getByRole("dialog", { name: "Import MJML", exact: true });
      await expect(dialog.getByRole("status")).toContainText("current email is unchanged");
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
      expect(await exportedMjml(page)).toContain("<mj-preview>Keep my in-flight edit</mj-preview>");
      await expect(picker).toHaveValue("blank");
      await expect(preview).toHaveValue("Keep my in-flight edit");
      await expectUnsavedChanges(page, true);
      await expect(page.locator('.demo-status[role="status"]')).toHaveCount(0);
      await expect(page.locator("details.demo-status")).toHaveCount(0);
      await expect(undo).toBeEnabled();
      await undo.click();
      await expect(preview).toHaveValue("");
      await expectUnsavedChanges(page, false);
      await page.getByRole("button", { name: /^redo$/i }).click();
      await expect(preview).toHaveValue("Keep my in-flight edit");
      await expectUnsavedChanges(page, true);
    } else {
      await expect(picker).toHaveValue("imported");
      await expect(preview).toHaveValue("Delayed replacement preview");
      const importedSource = await exportedMjml(page);
      expect(importedSource).toContain("Delayed replacement");
      expect(importedSource).not.toContain("Keep my in-flight edit");
      await expect(page.locator('.demo-status[role="status"]')).toContainText(
        `Imported ${delayedFile} with 1 note:`,
      );
      await expectUnsavedChanges(page, false);
      await expect(undo).toBeDisabled();
    }
  });
}

async function dropSource(page: Page, text: string, fileSource?: string) {
  const dialog = await openImportDialog(page);
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
  const area = dialog.locator(".demo-import-panel");
  await area.dispatchEvent("dragover", { dataTransfer: data });
  await expect(area).toHaveAttribute("data-dragging", "true");
  await area.dispatchEvent("drop", { dataTransfer: data });
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
    if (decision === "dismiss") {
      const dialog = page.getByRole("dialog", { name: "Import MJML", exact: true });
      await expect(dialog.getByRole("status")).toContainText("current email is unchanged");
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    }
    const result = await exportedMjml(page);
    if (decision === "dismiss") expect(result).toBe(draft);
    else expect(result).toContain("Dropped replacement");
  });
}

test("invalid imports preserve a dirty draft and its undo history without asking to discard", async ({
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
    const dialog = page.getByRole("dialog", { name: "Import MJML", exact: true });
    await expect(dialog.getByRole("alert")).toContainText("Your previous email is unchanged.");
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    expect(await exportedMjml(page)).toBe(draft);
    await expect(page.getByRole("button", { name: /^undo$/i })).toBeEnabled();
  }
  for (const method of ["paste", "file", "drop"] as const) {
    const incomplete = "<mjml><mj-body>";
    if (method === "file") await importFile(page, "incomplete.mjml", incomplete);
    else if (method === "drop") await dropSource(page, incomplete);
    else {
      const dialog = await openImportDialog(page);
      await dialog.getByRole("textbox", { name: "MJML source to import" }).fill(incomplete);
      await dialog.getByRole("button", { name: "Import text", exact: true }).click();
    }
    const dialog = page.getByRole("dialog", { name: "Import MJML", exact: true });
    await expect(dialog.getByRole("alert")).toContainText("Your previous email is unchanged.");
    await expect(dialog.getByRole("alert")).toContainText("Missing </mj-body>");
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    expect(await exportedMjml(page)).toBe(draft);
    await expect(page.getByRole("button", { name: /^undo$/i })).toBeEnabled();
  }
  expect(dialogs).toEqual([]);
  const preview = page.getByRole("textbox", { name: "Preview text", exact: true });
  await page.getByRole("button", { name: /^undo$/i }).click();
  await expect(preview).toHaveValue("");
  await page.getByRole("button", { name: /^redo$/i }).click();
  await expect(preview).toHaveValue("Keep draft");
  expect(await exportedMjml(page)).toBe(draft);
});

test("paste stays editable until explicit import, and drag leave/cancel clears highlighting", async ({
  page,
}) => {
  const dialog = await openImportDialog(page);
  const area = dialog.locator(".demo-import-panel");
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
  await openImportDialog(page);
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
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: "Import", exact: true })).toBeFocused();
  await openImportDialog(page);
  await expect(area).not.toHaveAttribute("data-dragging");
  await data.dispose();
});

test("Import opens one paste/drop dialog without opening the file chooser, then supports cancel and retry", async ({
  page,
}) => {
  const original = await exportedMjml(page);
  let choosers = 0;
  page.on("filechooser", () => {
    choosers += 1;
  });
  await expect(page.getByRole("textbox", { name: "MJML source to import" })).toHaveCount(0);
  const dialog = await openImportDialog(page);
  expect(choosers).toBe(0);
  const field = dialog.getByRole("textbox", { name: "MJML source to import" });
  await expect(field).toBeFocused();
  await expect(dialog.getByRole("button", { name: "Import text", exact: true })).toBeDisabled();
  await field.fill(source("Cancelled paste"));
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: "Import", exact: true })).toBeFocused();
  expect(await exportedMjml(page)).toBe(original);

  await openImportDialog(page);
  await expect(field).toHaveValue("");
  await field.fill("ordinary selected text");
  await dialog.getByRole("button", { name: "Import text", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Your previous email is unchanged.");
  await expect(field).toHaveValue("ordinary selected text");
  await field.fill(source("Corrected paste"));
  await dialog.getByRole("button", { name: "Import text", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: "Import", exact: true })).toBeFocused();
  await expect(page.locator('.demo-status[role="status"]')).toHaveText("Imported MJML text.");
  expect(await exportedMjml(page)).toContain("Corrected paste");
  expect(choosers).toBe(0);
});

for (const dismissal of ["Cancel", "Close import", "Escape"] as const) {
  for (const outcome of ["release", "reject"] as const) {
    test(`${dismissal} cancels an in-flight read and its late ${outcome} does not affect a reopened dialog`, async ({
      page,
    }) => {
      const original = await exportedMjml(page);
      await beginDelayedImport(page, source("Cancelled read", true));
      const dialog = page.getByRole("dialog", { name: "Import MJML", exact: true });
      await expect(dialog.getByRole("status")).toContainText("Reading and checking MJML");
      if (dismissal === "Escape") await page.keyboard.press("Escape");
      else await dialog.getByRole("button", { name: dismissal, exact: true }).click();
      await expect(dialog).toBeHidden();
      await expect(page.getByRole("button", { name: "Import", exact: true })).toBeFocused();
      await openImportDialog(page);
      const field = dialog.getByRole("textbox", { name: "MJML source to import" });
      await field.fill("New unfinished paste");
      await finishDelayedImport(page, outcome);
      await expect(dialog).toBeVisible();
      await expect(field).toHaveValue("New unfinished paste");
      await expect(dialog.getByRole("alert")).toHaveCount(0);
      await expect(dialog.getByRole("status")).toBeEmpty();
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
      expect(await exportedMjml(page)).toBe(original);
      await expect(page.locator('.demo-status[role="status"]')).toHaveCount(0);
      await expect(page.locator("details.demo-status")).toHaveCount(0);
    });
  }
}

test("file chooser cancellation leaves the dialog usable and the same file can be imported again", async ({
  page,
}) => {
  const dialog = await openImportDialog(page);
  const field = dialog.getByRole("textbox", { name: "MJML source to import" });
  await field.fill(source("Untouched paste"));
  const chooser = page.waitForEvent("filechooser");
  await dialog.getByRole("button", { name: "Choose file", exact: true }).click();
  await (await chooser).setFiles([]);
  await expect(dialog).toBeVisible();
  await expect(field).toHaveValue(source("Untouched paste"));
  await expect(dialog.getByRole("status")).toBeEmpty();
  for (let round = 0; round < 2; round++) {
    await importFile(page, "repeat.mjml", source("Repeatable file"));
    await expect(dialog).toBeHidden();
    await expect(page.locator('.demo-status[role="status"]')).toHaveText("Imported repeat.mjml.");
    expect(await exportedMjml(page)).toContain("Repeatable file");
  }
});

test("import dialog traps focus, fits a narrow screen and restores focus after close", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const dialog = await openImportDialog(page);
  await dialog.getByRole("textbox", { name: "MJML source to import" }).fill(source("Focus test"));
  const submit = dialog.getByRole("button", { name: "Import text", exact: true });
  await submit.focus();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "Close import", exact: true })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(submit).toBeFocused();
  const geometry = await dialog.locator(".demo-import-panel").evaluate((panel) => {
    const rect = panel.getBoundingClientRect();
    return {
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      overflow: panel.scrollWidth > panel.clientWidth,
    };
  });
  expect(geometry.left).toBeGreaterThanOrEqual(0);
  expect(geometry.right).toBeLessThanOrEqual(390);
  expect(geometry.top).toBeGreaterThanOrEqual(0);
  expect(geometry.bottom).toBeLessThanOrEqual(844);
  expect(geometry.overflow).toBe(false);
  await dialog.getByRole("button", { name: "Close import", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: "Import", exact: true })).toBeFocused();
});

test("a successful delayed file import restores focus after the editor replaces its header", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Import", exact: true }).evaluate((button) => {
    button.setAttribute("data-import-focus-before-replacement", "true");
  });
  await beginDelayedImport(page, source("Asynchronous import"));
  await finishDelayedImport(page);
  await expect(page.getByRole("dialog", { name: "Import MJML", exact: true })).toBeHidden();
  await expect(page.getByRole("combobox", { name: "Email template" })).toHaveValue("imported");
  await expect(page.getByRole("textbox", { name: "Preview text", exact: true })).toHaveValue(
    "Asynchronous import preview",
  );
  // Puck intentionally remounts on document replacement. Wait for the original
  // trigger to disappear, then check its successor rather than an old node.
  await expect(page.locator("[data-import-focus-before-replacement]")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Import", exact: true })).toBeFocused();
});
