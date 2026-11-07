import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { readFileSync } from "node:fs";

const fixtures: { templates: { file: string; content: string[] }[] } = JSON.parse(
  readFileSync(new URL("../../src/templates/upstream-content.json", import.meta.url), "utf8"),
);
const normalize = (value: string) => value.replace(/\s+/g, " ").trim().toLowerCase();
const idFor = (file: string) => file.replace(/\.mjml$/, "").toLowerCase();
const screenshotTemplates = new Set([
  "01-Barebone/welcome.mjml",
  "01-Barebone/product-update.mjml",
  "02-Matte/welcome.mjml",
  "02-Matte/product-update.mjml",
  "03-Protocol/welcome.mjml",
  "03-Protocol/product-update.mjml",
  "04-Arcane/welcome.mjml",
  "04-Arcane/newsletter.mjml",
  "04-Arcane/promo.mjml",
  "05-Studio/welcome.mjml",
  "05-Studio/order-confirmation.mjml",
  "Community/receipts/apple-receipt.mjml",
  "Community/receipts/nike-receipt.mjml",
  "Community/newsletters/google-play-policy-update.mjml",
  "Community/reviews/airbnb-review.mjml",
]);

async function waitForArtwork(page: Page) {
  await page.evaluate(async () => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        Promise.all([
          document.fonts.ready,
          ...Array.from(document.images, async (image) => {
            await image.decode();
            if (!image.complete || image.naturalWidth === 0)
              throw new Error(`Artwork failed to load: ${image.src}`);
          }),
        ]),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () => reject(new Error("Template fonts or artwork did not finish loading")),
            20_000,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  });
}

async function captureCompleteEmail(page: Page, html: string, testInfo: TestInfo) {
  // The content comes from the actual demo's compiled iframe, after selecting
  // the canonical source. A fresh page exposes the whole email, not just the
  // small viewport inside the editor's preview dialog.
  const email = await page.context().newPage();
  try {
    for (const [mode, width] of [
      ["desktop", 800],
      ["mobile", 390],
    ] as const) {
      await email.setViewportSize({ width, height: 900 });
      await email.setContent(html, { waitUntil: "load", timeout: 30_000 });
      await waitForArtwork(email);
      await expect
        .poll(async () => email.evaluate(() => document.documentElement.scrollWidth - innerWidth))
        .toBeLessThanOrEqual(1);
      const path = testInfo.outputPath(`email-${mode}.png`);
      await email.screenshot({ path, fullPage: true });
      await testInfo.attach(`Complete email (${mode}, ${width}px)`, {
        path,
        contentType: "image/png",
      });
    }
  } finally {
    await email.close();
  }
}

test("template picker lists exactly 62 real MJML emails and one blank document", async ({
  page,
}) => {
  await page.goto("/");
  const picker = page.getByRole("combobox", { name: "Email template" });
  await expect(picker).toBeVisible();
  const values = await picker
    .locator("option")
    .evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value));
  expect(fixtures.templates).toHaveLength(62);
  expect(values.sort()).toEqual(
    ["blank", ...fixtures.templates.map(({ file }) => idFor(file))].sort(),
  );
  expect(await picker.locator("option").allTextContents()).not.toContain("Collage fonts");
  expect(await picker.locator("option").allTextContents()).not.toContain("Dither fonts");
});

for (const fixture of fixtures.templates) {
  test(`${idFor(fixture.file)} loads canonical content and responsive previews`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(90_000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/");
    const picker = page.getByRole("combobox", { name: "Email template" });
    await picker.selectOption(idFor(fixture.file));
    await expect(picker).toHaveValue(idFor(fixture.file));
    await page.getByRole("button", { name: "Preview email" }).click();
    const dialog = page.getByRole("dialog", { name: "Email preview" });
    await expect(dialog).toBeVisible();
    const frame = page.frameLocator('iframe[title="Rendered email"]');
    for (const content of fixture.content.filter((text) => normalize(text)).slice(0, 3)) {
      await expect
        .poll(async () => normalize(await frame.locator("body").innerText()), {
          message: fixture.file,
        })
        .toContain(normalize(content));
    }
    await expect(dialog.locator('[role="alert"]')).toHaveCount(0);
    for (const mode of ["Responsive", "Mobile"]) {
      await dialog.getByRole("button", { name: mode, exact: true }).click();
      await expect
        .poll(
          async () =>
            frame
              .locator("html")
              .evaluate((html) => html.scrollWidth - html.ownerDocument.defaultView!.innerWidth),
          { message: `${fixture.file} ${mode} overflow` },
        )
        .toBeLessThanOrEqual(1);
      if (/^01-Barebone\/(welcome|product-update|feature-announcement)\.mjml$/.test(fixture.file)) {
        const tile = frame.locator(".bare-app-icon");
        await expect(tile).toHaveCount(1);
        await expect
          .poll(async () => tile.evaluate((node) => node.getBoundingClientRect().width), {
            message: `${fixture.file} ${mode} app tile stays compact`,
          })
          .toBeCloseTo(56, 0);
      }
    }
    if (screenshotTemplates.has(fixture.file)) {
      const html = await page
        .locator('iframe[title="Rendered email"]')
        .evaluate((iframe: HTMLIFrameElement) => iframe.srcdoc);
      await captureCompleteEmail(page, html, testInfo);
    }
    await dialog.getByRole("button", { name: "Close preview" }).click();
    await expect(dialog).toBeHidden();
    expect(errors).toEqual([]);
  });
}
