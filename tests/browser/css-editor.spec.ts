import { chooseImportFile } from "./import-email";
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

test("CSS editor has stable controlled typing, indentation, completion, history, and a keyboard exit", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/tests/browser/fixtures/css-editor.html");
  const editor = page.getByRole("textbox", { name: "Custom CSS", exact: true });
  const source = page.getByLabel("Host source");
  await expect(editor).toHaveText(".card {  color: red;}");
  await expect(page.locator(".cm-lineNumbers")).toBeVisible();
  await expect(page.locator(".pm-css-property")).toHaveCSS("color", "rgb(29, 78, 216)");
  await expect(page.getByLabel("Change count")).toHaveText("0");
  await editor.fill(".card {\n  color: blue;\n}");
  await expect(source).toHaveJSProperty("textContent", ".card {\n  color: blue;\n}");
  await expect(editor).toBeFocused();
  await editor.press("Control+Home");
  await editor.press("ArrowDown");
  await editor.press("Home");
  await editor.press("Tab");
  await expect(source).toHaveJSProperty("textContent", ".card {\n    color: blue;\n}");
  await editor.press("Shift+Tab");
  await expect(source).toHaveJSProperty("textContent", ".card {\n  color: blue;\n}");
  await expect(editor).toBeFocused();
  await editor.press("Control+z");
  await expect(source).toHaveJSProperty("textContent", ".card {\n    color: blue;\n}");
  await editor.press("Control+Shift+z");
  await expect(source).toHaveJSProperty("textContent", ".card {\n  color: blue;\n}");
  await editor.fill(".card {\n  col\n}");
  await editor.press("Control+Home");
  await editor.press("ArrowDown");
  await editor.press("End");
  await editor.press("Control+Space");
  await expect(page.locator(".cm-tooltip-autocomplete")).toBeVisible();
  await expect(page.locator(".cm-tooltip-autocomplete")).toContainText("color");
  await editor.press("Escape");
  await expect(page.locator(".cm-tooltip-autocomplete")).toBeHidden();
  await expect(editor).toBeFocused();
  await page.keyboard.press("Tab");
  // The unfinished declaration has a preview note. Its disclosure is the
  // next keyboard stop after leaving the editor.
  await expect(page.locator(".pm-css-preview-notes summary")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Toggle read-only" })).toBeFocused();
  await expect(source).toHaveJSProperty("textContent", ".card {\n  col\n}");
  await editor.focus();
  await editor.press("Escape");
  await page.keyboard.press("Shift+Tab");
  await expect(page.getByRole("button", { name: "Expand Custom CSS editor" })).toBeFocused();
  await expect(source).toHaveJSProperty("textContent", ".card {\n  col\n}");
  expect(errors).toEqual([]);
});

test("CSS editor blocks locked edits, accepts replacement, and bounds large sources to its panel", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/tests/browser/fixtures/css-editor.html");
  const editor = page.getByRole("textbox", { name: "Custom CSS", exact: true });
  const source = page.getByLabel("Host source");
  await page.getByRole("button", { name: "Toggle read-only" }).click();
  await expect(editor).toHaveAttribute("contenteditable", "false");
  await expect(editor).toHaveAttribute("aria-readonly", "true");
  await expect(page.getByRole("button", { name: "Format Custom CSS" })).toBeDisabled();
  await editor.focus();
  await editor.press("Control+End");
  await editor.press("x");
  await editor.press("Tab");
  await expect(source).toHaveJSProperty("textContent", ".card{color:red}");
  await expect(page.getByLabel("Change count")).toHaveText("0");
  await page.getByRole("button", { name: "Replace source" }).click();
  await expect(editor).toContainText("green");
  await expect(page.getByLabel("Change count")).toHaveText("0");
  await page.getByRole("button", { name: "Load long source" }).click();
  await expect(source).toContainText(".card-59");
  const scroller = page.locator(".cm-scroller");
  await expect
    .poll(() => scroller.evaluate((element) => element.scrollWidth > element.clientWidth))
    .toBe(true);
  await expect
    .poll(() => scroller.evaluate((element) => element.scrollHeight > element.clientHeight))
    .toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  const before = (await scroller.boundingBox())!.height;
  await page.getByRole("button", { name: "Expand Custom CSS editor" }).click();
  expect((await scroller.boundingBox())!.height).toBeGreaterThan(before);
  await page.screenshot({ path: "test-results/css-editor-390.png", fullPage: false });
});

test("Custom CSS uses CodeMirror in the real Puck field and preserves edited source in MJML export", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await chooseImportFile(page, {
    name: "css.mjml",
    mimeType: "application/xml",
    buffer: Buffer.from(
      '<mjml><mj-head><mj-style>.card{color:red}</mj-style></mj-head><mj-body><mj-section><mj-column><mj-text css-class="card">CSS example</mj-text></mj-column></mj-section></mj-body></mjml>',
    ),
  });
  // File selection precedes async import and Puck remounting. Confirm the
  // imported document, rather than accidentally editing the prior template.
  await expect(page.getByRole("combobox", { name: "Email template" })).toHaveValue("imported");
  await expect(
    page.frameLocator("#preview-frame").getByText("CSS example", { exact: true }),
  ).toBeVisible();
  // Puck keeps an inactive Fields plugin mounted in the left sidebar. Assert
  // one visible inspector instead of picking the first of its two DOM copies.
  const field = page.locator('[data-property-name="headStyles"]:visible');
  await expect(field).toHaveCount(1);
  const style = field.getByRole("button", { name: /^CSS 1 \(head\)/ });
  await expect(style).toHaveCount(1);
  await style.click();
  const editor = field.getByRole("textbox", { name: "CSS", exact: true });
  await expect(editor).toBeVisible();
  await expect(field.locator(".cm-lineNumbers")).toBeVisible();
  await editor.fill(".card{color:blue}");
  await expect(editor).toBeFocused();
  await field.getByRole("button", { name: "Format CSS", exact: true }).click();
  await page.getByRole("button", { name: "Export email" }).click();
  await page.getByRole("button", { name: "MJML", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download MJML" }).click();
  const result = await download;
  const mjml = await readFile((await result.path())!, "utf8");
  expect(mjml).toContain(".card {\n  color: blue;\n}");
  await page.getByRole("button", { name: "Close export" }).click();
  await page.screenshot({ path: "test-results/css-editor-puck.png", fullPage: false });
});
