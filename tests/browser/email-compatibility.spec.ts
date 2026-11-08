import { expect, test, type Page } from "@playwright/test";
import { chooseImportFile } from "./import-email";

async function importEmail(page: Page) {
  await chooseImportFile(page, {
    name: "compatibility.mjml",
    mimeType: "application/xml",
    buffer: Buffer.from(
      '<mjml><mj-head><mj-style>.compatibility-probe { border-radius:12px; box-shadow:0 2px 8px #aaa; }</mj-style></mj-head><mj-body><mj-section><mj-column><mj-text css-class="compatibility-probe">Compatibility draft</mj-text></mj-column></mj-section></mj-body></mjml>',
    ),
  });
  await expect(page.getByRole("combobox", { name: "Email template" })).toHaveValue("imported");
}

test("compatibility detects current compiled CSS and exposes client-specific caveats without a remote request", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await importEmail(page);
  const remote: string[] = [];
  page.on("request", (request) => {
    if (/caniemail\.com/.test(request.url())) remote.push(request.url());
  });
  const compatibility = page.getByRole("button", { name: "Compatibility", exact: true });
  await expect(page.getByRole("tab", { name: "Editor", exact: true })).toHaveCount(0);
  expect(
    await compatibility.evaluate((element) => {
      const nav = element.closest("nav");
      return Boolean(
        nav?.querySelector('button[aria-label="Blocks"]') &&
        nav.querySelector('button[aria-label="Outline"]'),
      );
    }),
  ).toBe(true);
  await compatibility.focus();
  await compatibility.press("Enter");
  await expect(compatibility).toHaveAttribute("aria-pressed", "true");
  const panel = page.getByRole("region", { name: "Compatibility panel", exact: true });
  await expect(panel.getByRole("heading", { name: "Email compatibility" })).toBeVisible();
  await expect(panel.getByLabel("Analysis summary")).toBeVisible();
  // The default checks all recorded clients, with unrecorded webmail kept explicit.
  const client = panel.getByRole("combobox", { name: "Email client", exact: true });
  await expect(client).toHaveValue("");
  await expect(client).toHaveAccessibleDescription(/iCloud.com webmail is not in this snapshot/);
  await expect(panel.getByText(/Apple Mail results do not cover it/)).toBeVisible();
  await panel.getByLabel("Find a feature").fill("border-radius");
  const feature = panel.locator(".compatibility-feature");
  await expect(feature).toHaveCount(1);
  await feature.locator("summary").click();
  await expect(feature.locator(".compatibility-client-result")).toHaveCount(
    (await client.locator("option").count()) - 1,
  );
  for (const label of ["Outlook · Windows", "Gmail · Desktop Webmail", "Apple Mail · macOS"])
    await expect(feature.getByText(label, { exact: true })).toBeVisible();
  await expect(feature.locator("summary")).toContainText(/unsupported · \d+ partial/);
  expect(await panel.evaluate((element) => element.scrollWidth - element.clientWidth)).toBe(0);
  // Narrow the same results to classic Outlook and inspect its recorded caveat.
  await client.selectOption("outlook/windows");
  await feature.locator("summary").click();
  await expect(
    feature
      .locator("dt")
      .filter({ hasText: /^Recorded version \/ date$/ })
      .locator("+ dd"),
  ).toHaveText("2019");
  await expect(feature.locator("table")).toHaveCount(0);
  expect(await panel.evaluate((element) => element.scrollWidth - element.clientWidth)).toBe(0);
  await expect(feature).toContainText("Round corners can be used in VML");
  await expect(feature.getByRole("link", { name: /Full support table/ })).toHaveAttribute(
    "href",
    "https://www.caniemail.com/features/css-border-radius/",
  );
  // The label contains the select, so getByLabel includes option text. Match
  // the exact accessible role/name, as confirmed in the CI accessibility tree.
  await expect(client).toHaveAccessibleName("Email client");
  await client.selectOption("apple-mail/macos");
  await expect(client).toHaveValue("apple-mail/macos");
  await expect(panel.getByText("No matching features.")).toBeVisible();
  await panel.getByLabel("Needs review only").uncheck();
  await expect(feature.locator("summary")).toContainText("Supported");
  await panel.getByLabel("Needs review only").check();
  await client.selectOption("");
  await expect(feature).toHaveCount(1);
  await expect(feature.locator("summary")).toContainText(/unsupported · \d+ partial/);
  await panel.getByRole("button", { name: "Browse 56 checks", exact: true }).click();
  await client.selectOption("gmail/desktop-webmail");
  await expect(panel.getByText("No matching features.")).toBeVisible();
  await client.selectOption("");
  await expect(feature).toHaveCount(1);
  expect(remote).toEqual([]);
});

test("tab round trips preserve authored text, canvas geometry, undo/redo and the mounted editor", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await importEmail(page);
  const frame = page.frameLocator("#preview-frame");
  const text = frame.locator(".pm-text").filter({ hasText: "Compatibility draft" });
  await text.getByText("Compatibility draft", { exact: true }).dblclick();
  // Puck briefly mounts an editable fallback before the initialized textbox.
  const editable = text.getByRole("textbox");
  await expect(editable).toHaveCount(1);
  await expect(editable).toBeVisible();
  await editable.click();
  await expect(editable).toBeFocused();
  await editable.press("ControlOrMeta+End");
  await page.keyboard.insertText(" edited");
  await expect(text).toContainText("Compatibility draft edited");
  await expect(page.getByRole("button", { name: /^undo$/i })).toBeEnabled();
  await page.locator("#preview-frame").evaluate((element) => {
    element.setAttribute("data-compatibility-test", "preserved");
  });
  const width = await frame
    .locator(".pm-email")
    .evaluate((element) => element.getBoundingClientRect().width);
  const viewport = await frame
    .locator("html")
    .evaluate((element) => element.ownerDocument.defaultView!.innerWidth);
  for (let round = 0; round < 2; round++) {
    await page.getByRole("button", { name: "Compatibility", exact: true }).click();
    await expect(page.getByLabel("Analysis summary")).toBeVisible();
    await expect(page.locator("#preview-frame")).toBeVisible();
    const tab = page.getByRole("button", { name: "Compatibility", exact: true });
    await tab.press("Home");
    await expect(page.getByRole("button", { name: "Blocks", exact: true })).toBeFocused();
    await expect(page.locator("#preview-frame")).toHaveAttribute(
      "data-compatibility-test",
      "preserved",
    );
    await expect(text).toContainText("Compatibility draft edited");
    await expect
      .poll(() =>
        frame.locator(".pm-email").evaluate((element) => element.getBoundingClientRect().width),
      )
      .toBe(width);
    await expect
      .poll(() =>
        frame.locator("html").evaluate((element) => element.ownerDocument.defaultView!.innerWidth),
      )
      .toBe(viewport);
  }
  await page.getByRole("button", { name: /^undo$/i }).click();
  await expect(text).toHaveText("Compatibility draft");
  await page.getByRole("button", { name: /^redo$/i }).click();
  await expect(text).toHaveText("Compatibility draft edited");
});

for (const width of [390, 768]) {
  test(`compatibility tabs and controls remain usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const tab = page.getByRole("button", { name: "Compatibility", exact: true });
    await expect(tab).toBeVisible();
    await tab.click();
    const panel = page.getByRole("region", { name: "Compatibility panel", exact: true });
    await expect(panel.getByLabel("Analysis summary")).toBeVisible();
    expect(await panel.evaluate((element) => element.scrollWidth - element.clientWidth)).toBe(0);
    const client = panel.getByRole("combobox", { name: "Email client", exact: true });
    await expect(client).toBeVisible();
    await expect(client).toHaveAccessibleName("Email client");
    await expect(client).toHaveValue("");
    await expect(client).toHaveAccessibleDescription(/iCloud.com webmail is not in this snapshot/);
    await panel.getByLabel("Find a feature").fill("not-a-feature");
    await expect(panel.getByText("No matching features.")).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
    ).toBe(0);
    await tab.press("Home");
    await expect(page.getByRole("button", { name: "Blocks", exact: true })).toBeFocused();
    await expect(page.locator("#preview-frame")).toBeVisible();
  });
}
