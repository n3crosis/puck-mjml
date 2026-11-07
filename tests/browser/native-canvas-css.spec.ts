import { expect, test } from "@playwright/test";

for (const width of [390, 600, 601, 800]) {
  test(`native padding targets match compiled cells at ${width}px without leaking`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/tests/browser/fixtures/native-canvas-css.html");
    await expect(page.getByLabel("Compilation status")).toHaveText("ready");
    const canvas = page.getByRole("region", { name: "Styled canvas" });
    const other = page.getByRole("region", { name: "Other canvas" });
    const compiled = page.frameLocator("#compiled");
    await expect
      .poll(() =>
        compiled
          .locator("html")
          .evaluate((element) => element.ownerDocument.defaultView!.innerWidth),
      )
      .toBe(width);
    const mobile = width <= 600;
    // The later `.inset` !important rule must not beat the adapted selector's
    // original four type-selector specificity on the canvas padding box.
    for (const edge of ["padding-left", "padding-right"]) {
      await expect(canvas.locator('.inset[data-pm-mjml-padding="self"]')).toHaveCSS(
        edge,
        mobile ? "24px" : "40px",
      );
      await expect(compiled.locator(".inset > table > tbody > tr > td")).toHaveCSS(
        edge,
        mobile ? "24px" : "40px",
      );
      await expect(other.locator('.inset[data-pm-mjml-padding="self"]')).toHaveCSS(edge, "40px");
      await expect(page.locator(".host-target")).toHaveCSS(edge, "40px");
      await expect(canvas.locator(".shell")).toHaveCSS(edge, mobile ? "8px" : "24px");
      await expect(compiled.locator(".shell > table > tbody > tr > td")).toHaveCSS(
        edge,
        mobile ? "8px" : "24px",
      );
    }
    await expect(canvas.locator(".column > [data-pm-mjml-padding-target]")).toHaveCSS(
      "padding",
      mobile ? "7px" : "12px",
    );
    await expect(compiled.locator(".column > table > tbody > tr > td")).toHaveCSS(
      "padding",
      mobile ? "7px" : "12px",
    );
    // In the mobile stack the first column's top gutter is zero, not the 7px
    // content padding. The adapter must never overwrite the outer gutter.
    await expect(canvas.locator(".column")).toHaveCSS("padding-top", "0px");
    await expect(canvas.locator(".unpadded")).not.toHaveAttribute("data-pm-mjml-padding");
    await expect(canvas.locator(".unpadded")).toHaveCSS("padding-left", "0px");
    await expect(canvas.locator(".full")).not.toHaveAttribute("data-pm-mjml-padding");
    await expect(canvas.locator(".full > .pm-native-layout-content")).toHaveCSS(
      "padding-left",
      "40px",
    );
    await expect(canvas.locator(".authored td")).toHaveCSS("padding-right", "9px");
    await expect(compiled.locator(".authored td")).toHaveCSS("padding-right", "9px");
    await expect(other.locator(".authored td")).toHaveCSS("padding-right", "0px");
    expect(errors).toEqual([]);
  });
}

test("padding CSS updates and undo apply to the real editable canvas", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/");
  const css =
    "@media (max-width: 600px) { .inset > table > tbody > tr > td { padding-left: 24px !important; padding-right: 24px !important; } }";
  await page.getByLabel("Import MJML", { exact: true }).setInputFiles({
    name: "native-padding.mjml",
    mimeType: "application/xml",
    buffer: Buffer.from(
      `<mjml><mj-head><mj-breakpoint width="601px" /><mj-style>${css}</mj-style></mj-head><mj-body><mj-section css-class="inset" padding="40px"><mj-column padding="0px"><mj-text>Editable padding fixture</mj-text></mj-column></mj-section></mj-body></mjml>`,
    ),
  });
  await expect(page.getByRole("combobox", { name: "Email template" })).toHaveValue("imported");
  const frame = page.frameLocator("#preview-frame");
  const target = frame.locator('.inset[data-pm-mjml-padding="self"]');
  await expect(target).toBeVisible();
  await expect(target).toHaveCSS("padding-left", "40px");
  await page.getByRole("button", { name: "Switch to Mobile viewport" }).click();
  await expect(target).toHaveCSS("padding-left", "24px");
  const field = page.locator('[data-property-name="headStyles"]:visible');
  await field.getByRole("button", { name: /^CSS 1 \(head\)/ }).click();
  const editor = field.getByRole("textbox", { name: "CSS", exact: true });
  await editor.fill(css.replaceAll("24px", "18px"));
  await expect(target).toHaveCSS("padding-left", "18px");
  await expect(target).toHaveCSS("padding-right", "18px");
  await expect(page.getByRole("button", { name: /^undo$/i })).toBeEnabled();
  await page.getByRole("button", { name: /^undo$/i }).click();
  await expect(target).toHaveCSS("padding-left", "24px");
  await expect(target).toHaveCSS("padding-right", "24px");
  await page.getByRole("button", { name: "Switch to Desktop viewport" }).click();
  await expect(target).toHaveCSS("padding-left", "40px");
});
