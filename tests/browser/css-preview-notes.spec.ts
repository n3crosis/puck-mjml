import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

for (const width of [390, 768]) {
  test(`CSS preview notes stay accessible and bounded at ${width}px`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/tests/browser/fixtures/css-editor.html");
    const editor = page.getByRole("textbox", { name: "Custom CSS", exact: true });
    const hostSource = page.getByLabel("Host source");
    const source = `.card{& + .${"long-selector-".repeat(20)}{color:red}}`;
    await editor.fill(source);
    await expect(editor).toBeFocused();
    await expect(page.getByLabel("Change count")).toHaveText("1");
    await expect(hostSource).toHaveJSProperty("textContent", source);
    // The fixture's change-count <output> also has an implicit status role.
    // Scope to the CSS field so this follows its live region even when cleared.
    const status = page.locator(".pm-css-field").getByRole("status");
    await expect(status).toHaveCount(1);
    await expect(status).toHaveAttribute("aria-live", "polite");
    await expect(status).toHaveAttribute("aria-atomic", "true");
    const notes = page.locator(".pm-css-preview-notes");
    const summary = notes.locator("summary");
    const details = notes.locator("details");
    await expect(notes).toContainText("Native editor preview may differ");
    await expect(notes).toContainText("Source CSS and export are unchanged");
    await expect(summary).toHaveText("1 preview note");
    await expect(status).toHaveText(
      "Custom CSS: 1 native preview note. Source CSS and export are unchanged.",
    );
    await expect(editor).toHaveAccessibleDescription(/Native editor preview may differ/);
    await expect(notes.locator("li")).toBeHidden();
    await editor.press("Escape");
    await editor.press("Tab");
    await expect(summary).toBeFocused();
    await summary.press("Enter");
    await expect(details).toHaveJSProperty("open", true);
    await expect(notes.locator("li")).toBeVisible();
    await expect(notes.locator("li")).toContainText("nesting subset");
    await expect(page.getByLabel("Change count")).toHaveText("1");
    await expect(hostSource).toHaveJSProperty("textContent", source);
    const bounds = await notes.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    expect(await notes.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true,
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await summary.press("Space");
    await expect(details).toHaveJSProperty("open", false);
    await summary.press("Enter");
    await page.getByRole("button", { name: "Expand Custom CSS editor" }).click();
    await expect(details).toHaveJSProperty("open", true);
    await page.getByRole("button", { name: "Format Custom CSS", exact: true }).click();
    await expect(page.getByLabel("Change count")).toHaveText("2");
    await expect(summary).toHaveText("1 preview note");
    await editor.focus();
    await editor.press("Control+z");
    await expect(hostSource).toHaveJSProperty("textContent", source);
    await expect(editor).toBeFocused();
    await page.screenshot({ path: `test-results/css-preview-notes-${width}.png`, fullPage: false });
    await page.getByRole("button", { name: "Toggle read-only" }).click();
    await expect(editor).toHaveAttribute("aria-readonly", "true");
    await expect(summary).toBeVisible();
    const changes = await page.getByLabel("Change count").textContent();
    await page.getByRole("button", { name: "Replace source" }).click();
    await expect(notes).toHaveCount(0);
    await expect(editor).not.toHaveAccessibleDescription(/Native editor preview may differ/);
    await expect(page.getByLabel("Change count")).toHaveText(changes!);
    await expect(hostSource).toHaveJSProperty("textContent", ".host{color:green}");
    await expect(status).toHaveText("Custom CSS: Native preview notes cleared.");
    expect(errors).toEqual([]);
  });
}

test("Puck Custom CSS preview notes preserve original imported CSS in the MJML download", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const css = '@scope (.card){p{color:blue}} @keyframes "pulse"{to{opacity:1}}';
  await page.getByLabel("Import MJML", { exact: true }).setInputFiles({
    name: "preview-notes.mjml",
    mimeType: "application/xml",
    buffer: Buffer.from(
      `<mjml><mj-head><mj-style>${css}</mj-style></mj-head><mj-body><mj-section><mj-column><mj-text css-class="card">Preview notes example</mj-text></mj-column></mj-section></mj-body></mjml>`,
    ),
  });
  await expect(page.getByRole("combobox", { name: "Email template" })).toHaveValue("imported");
  await expect(
    page.frameLocator("#preview-frame").getByText("Preview notes example", { exact: true }),
  ).toBeVisible();
  const field = page.locator('[data-property-name="headStyles"]:visible');
  await expect(field).toHaveCount(1);
  await field.getByRole("button", { name: /^CSS 1 \(head\)/ }).click();
  const notes = field.locator(".pm-css-preview-notes");
  await expect(notes.locator("summary")).toHaveText("2 preview notes");
  await notes.locator("summary").click();
  await expect(notes.locator("li")).toHaveCount(2);
  await expect(
    field.getByRole("textbox", { name: "CSS", exact: true }),
  ).toHaveAccessibleDescription(/Source CSS and export are unchanged/);
  await page.getByRole("button", { name: "Export email" }).click();
  await page.getByRole("button", { name: "MJML", exact: true }).click();
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download MJML" }).click();
  const download = await downloading;
  const mjml = await readFile((await download.path())!, "utf8");
  expect(mjml).toContain(css);
  expect(mjml).not.toContain("pm-css-diagnostics");
  await page.getByRole("button", { name: "Close export" }).click();
  await expect(notes.locator("summary")).toHaveText("2 preview notes");
});
