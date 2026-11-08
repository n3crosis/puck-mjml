import { chooseImportFile } from "./import-email";
import { expect, test, type Locator } from "@playwright/test";
import { waitForCanvasFontCss } from "./font-evidence";
import { scopeDocumentCss } from "../../src/canvas-css";

test.beforeEach(async ({ page }) => {
  await page.route("https://example.com/background.png", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="128"><rect width="640" height="128" fill="#ddeeff"/></svg>',
    }),
  );
});

const ordinaryChain = "> table > tbody > tr > td";
const backgroundChain = "> div > table > tbody > tr > td";
const contentGeometry = (box: Locator, probe: string) =>
  box.evaluate((element, selector) => {
    const outer = element.getBoundingClientRect();
    const content = element.querySelector(selector)!.getBoundingClientRect();
    return {
      left: content.left - outer.left,
      top: content.top - outer.top,
      width: content.width,
      height: content.height,
    };
  }, probe);

for (const width of [390, 600, 601, 800]) {
  test(`background padding boxes match compiled cells at ${width}px without crossing structure or scope`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/tests/browser/fixtures/native-background-padding.html");
    await expect(page.getByLabel("Compilation status")).toHaveText("ready");
    const canvas = page.getByRole("region", { name: "Styled canvas" });
    const other = page.getByRole("region", { name: "Other canvas" });
    const compiled = page.frameLocator("#compiled");
    await waitForCanvasFontCss(canvas);
    await waitForCanvasFontCss(other);
    await canvas.evaluate((element) => element.ownerDocument.fonts.ready);
    await compiled.locator("html").evaluate((element) => element.ownerDocument.fonts.ready);
    await expect
      .poll(() =>
        compiled
          .locator("html")
          .evaluate((element) => element.ownerDocument.defaultView!.innerWidth),
      )
      .toBe(width);
    const mobile = width <= 600;
    for (const [name, marker, chain, inset] of [
      ["ordinary", "self", ordinaryChain, 16],
      ["background", "background", backgroundChain, 24],
      ["shell", "background", backgroundChain, 8],
      ["ordinary-rule-only", "background", backgroundChain, 32],
      ["background-rule-only", "self", ordinaryChain, 32],
    ] as const) {
      const native = canvas.locator(`.${name}[data-pm-mjml-padding="${marker}"]`);
      const reference = compiled.locator(`.${name} ${chain}`);
      for (const edge of ["padding-left", "padding-right"]) {
        await expect(native).toHaveCSS(edge, `${mobile ? inset : 32}px`);
        await expect(reference).toHaveCSS(edge, `${mobile ? inset : 32}px`);
        await expect(other.locator(`.${name}[data-pm-mjml-padding="${marker}"]`)).toHaveCSS(
          edge,
          "32px",
        );
      }
      const expected = await contentGeometry(reference, `.probe-${name}`);
      await expect
        .poll(async () => {
          const actual = await contentGeometry(native, `.probe-${name}`);
          return Math.max(
            ...Object.keys(expected).map((key) =>
              Math.abs(actual[key as keyof typeof actual] - expected[key as keyof typeof expected]),
            ),
          );
        })
        .toBeLessThanOrEqual(1 / 64);
    }
    for (const name of ["full-section", "full-wrapper"]) {
      await expect(canvas.locator(`.${name}`)).not.toHaveAttribute("data-pm-mjml-padding");
      await expect(canvas.locator(`.${name} > .pm-native-layout-content`)).toHaveCSS(
        "padding",
        "32px",
      );
      await expect(
        compiled.locator(`.${name} ${ordinaryChain}, .${name} ${backgroundChain}`),
      ).toHaveCount(0);
    }
    // Normal stylesheet padding cannot beat the original native/compiler inline padding.
    await expect(canvas.locator(".priority")).toHaveCSS("padding-left", "32px");
    await expect(compiled.locator(`.priority ${backgroundChain}`)).toHaveCSS(
      "padding-left",
      "32px",
    );
    // The five type selectors retained by :is must beat a later four-type rule.
    await expect(canvas.locator(".specificity")).toHaveCSS(
      "padding-left",
      mobile ? "24px" : "32px",
    );
    await expect(compiled.locator(`.specificity ${backgroundChain}`)).toHaveCSS(
      "padding-left",
      mobile ? "24px" : "32px",
    );
    await expect(canvas.locator(".authored")).not.toHaveAttribute("data-pm-mjml-padding");
    await expect(canvas.locator(".authored td")).toHaveCSS("padding-right", "9px");
    await expect(compiled.locator(".authored td")).toHaveCSS("padding-right", "9px");
    await expect(page.locator(".host-target")).toHaveCSS("padding-left", "32px");
    expect(errors).toEqual([]);
  });
}

test("live CSS and background updates replace only the matching padding adapter", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/tests/browser/fixtures/native-background-padding.html");
  await expect(page.getByLabel("Compilation status")).toHaveText("ready");
  const canvas = page.getByRole("region", { name: "Styled canvas" });
  const compiled = page.frameLocator("#compiled");
  await waitForCanvasFontCss(canvas);
  await canvas.evaluate((element) => element.ownerDocument.fonts.ready);
  const target = canvas.locator(".background.inset");
  await expect(target).toHaveCSS("padding-left", "24px");
  await page.getByRole("button", { name: "Change CSS inset" }).click();
  await expect(target).toHaveCSS("padding-left", "18px");
  await expect(compiled.locator(`.background ${backgroundChain}`)).toHaveCSS(
    "padding-left",
    "18px",
  );
  await page.getByRole("button", { name: "Toggle background" }).click();
  await expect(target).toHaveAttribute("data-pm-mjml-padding", "self");
  await expect(target).toHaveCSS("padding-left", "16px");
  await expect(compiled.locator(`.background ${ordinaryChain}`)).toHaveCSS("padding-left", "16px");
  await page.getByRole("button", { name: "Toggle background" }).click();
  await expect(target).toHaveAttribute("data-pm-mjml-padding", "background");
  await expect(target).toHaveCSS("padding-left", "18px");
  await page.getByRole("button", { name: "Change CSS inset" }).click();
  await expect(target).toHaveCSS("padding-left", "24px");
  await expect(compiled.locator(`.background ${backgroundChain}`)).toHaveCSS(
    "padding-left",
    "24px",
  );
});

test("background padding CSS survives editing and undo/redo in the actual editor", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/");
  const css =
    "@media(max-width:600px) { .background > div > table > tbody > tr > td { padding-left:24px!important; padding-right:24px!important; } }";
  await chooseImportFile(page, {
    name: "background-padding.mjml",
    mimeType: "application/xml",
    buffer: Buffer.from(
      `<mjml><mj-head><mj-attributes><mj-all font-family="Arial, sans-serif" /></mj-attributes><mj-breakpoint width="601px" /><mj-style>${css}</mj-style></mj-head><mj-body><mj-section css-class="background" background-url="https://example.com/background.png" padding="32px"><mj-column padding="0px"><mj-text>Editable background padding</mj-text></mj-column></mj-section></mj-body></mjml>`,
    ),
  });
  await expect(page.getByRole("combobox", { name: "Email template" })).toHaveValue("imported");
  const frame = page.frameLocator("#preview-frame");
  const target = frame.locator('.background[data-pm-mjml-padding="background"]');
  await waitForCanvasFontCss(frame.locator(".pm-canvas"));
  await frame.locator("html").evaluate((element) => element.ownerDocument.fonts.ready);
  await expect(target).toHaveCSS("padding-left", "32px");
  await page.getByRole("button", { name: "Switch to Mobile viewport" }).click();
  await expect(target).toHaveCSS("padding-left", "24px");
  const field = page.locator('[data-property-name="headStyles"]:visible');
  await field.getByRole("button", { name: /^CSS 1 \(head\)/ }).click();
  const editor = field.getByRole("textbox", { name: "CSS", exact: true });
  await editor.fill(css.replaceAll("24px", "18px"));
  await expect(target).toHaveCSS("padding-left", "18px");
  await expect(target).toHaveCSS("padding-right", "18px");
  await page.getByRole("button", { name: /^undo$/i }).click();
  // Puck restores the initial desktop viewport together with document history.
  await expect(target).toHaveCSS("padding-left", "32px");
  await page.getByRole("button", { name: "Switch to Mobile viewport" }).click();
  await expect(target).toHaveCSS("padding-left", "24px");
  await page.getByRole("button", { name: /^redo$/i }).click();
  await expect(target).toHaveCSS("padding-left", "18px");
  await page.getByRole("button", { name: "Export email", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Export email", exact: true });
  await dialog.getByRole("button", { name: "MJML", exact: true }).click();
  const exported = await dialog.getByRole("textbox", { name: "MJML source" }).inputValue();
  expect(exported).toContain(css.replaceAll("24px", "18px"));
  expect(exported).not.toContain("data-pm-mjml-padding");
  expect(exported).not.toContain(":is(");
});

test("scoped background aliases leave authored nested tables on their original CSS path", async ({
  page,
}) => {
  const css = scopeDocumentCss(
    [{ css: ".inset > div > table > tbody > tr > td {padding-left:24px!important;}" }],
    { scope: "pm-canvas-nested" },
  ).css;
  await page.setContent(`<style>${css}</style><div class="pm-canvas-nested">
    <div class="inset" data-pm-mjml-padding="background" id="native" style="padding-left:32px"></div>
    <div class="inset" data-pm-mjml-padding="self" id="ordinary" style="padding-left:32px"></div>
    <div class="inset"><div><table><tbody><tr><td id="authored" style="padding-left:32px"><table><tbody><tr><td id="nested" style="padding-left:6px">Nested authored table</td></tr></tbody></table></td></tr></tbody></table></div></div>
    </div><div class="inset" data-pm-mjml-padding="background" id="host" style="padding-left:32px"></div>`);
  await expect(page.locator("#native")).toHaveCSS("padding-left", "24px");
  await expect(page.locator("#ordinary")).toHaveCSS("padding-left", "32px");
  await expect(page.locator("#authored")).toHaveCSS("padding-left", "24px");
  await expect(page.locator("#nested")).toHaveCSS("padding-left", "6px");
  await expect(page.locator("#host")).toHaveCSS("padding-left", "32px");
});
