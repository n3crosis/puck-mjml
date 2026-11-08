import { chooseImportFile } from "./import-email";
import { expect, test } from "@playwright/test";

for (const width of [390, 600, 601, 800]) {
  for (const padding of [0, 16]) {
    test(`canvas uses the compiled viewport width at ${width}px with ${padding}px authored body padding`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(
        `/tests/browser/fixtures/native-canvas-width.html?padding=${padding}&email=${padding ? 600 : 640}`,
      );
      await expect(page.getByLabel("Compilation status")).toHaveText("ready");
      const canvas = page.getByRole("region", { name: "Canvas" });
      const compiled = page.frameLocator("#compiled");
      const expected = Math.min(padding ? 600 : 640, width - padding * 2);
      for (const locator of [
        canvas.locator(".pm-email"),
        canvas.locator(".width-probe"),
        compiled.locator("div.width-probe"),
      ]) {
        await expect
          .poll(() => locator.evaluate((element) => element.getBoundingClientRect().width))
          .toBe(expected);
      }
      for (const locator of [canvas.locator(".full-probe"), compiled.locator("table.full-probe")]) {
        await expect
          .poll(() => locator.evaluate((element) => element.getBoundingClientRect().width))
          .toBe(width - padding * 2);
      }
      await expect(canvas.locator(".pm-canvas")).toHaveCSS("padding-left", `${padding}px`);
      await expect(canvas.locator(".pm-canvas")).toHaveCSS("padding-right", `${padding}px`);
      if (!padding) await expect(canvas.locator(".pm-canvas")).toHaveCSS("padding-top", "34px");
      for (const locator of [canvas.locator(".pm-canvas"), compiled.locator("body")]) {
        expect(
          await locator.evaluate(
            (element) =>
              element.ownerDocument.documentElement.scrollWidth -
              element.ownerDocument.defaultView!.innerWidth,
          ),
        ).toBe(0);
      }
    });
  }
}

test("edge-to-edge mobile email retains selection, editing, drag handle, and undo", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await chooseImportFile(page, {
    name: "edge-width.mjml",
    mimeType: "application/xml",
    buffer: Buffer.from(
      '<mjml><mj-body width="640px"><mj-section padding="0px"><mj-column padding="0px"><mj-text padding="30px 0px">First edge block</mj-text><mj-text padding="30px 0px">Second edge block</mj-text><mj-text padding="30px 0px">Third edge block</mj-text></mj-column></mj-section></mj-body></mjml>',
    ),
  });
  await page.getByRole("button", { name: "Switch to Mobile viewport" }).click();
  const frame = page.frameLocator("#preview-frame");
  const email = frame.locator(".pm-email");
  await expect
    .poll(() =>
      email.evaluate(
        (element) =>
          element.getBoundingClientRect().width - element.ownerDocument.defaultView!.innerWidth,
      ),
    )
    .toBe(0);
  const blocks = frame.locator('[data-puck-component^="text-"]');
  await expect(blocks).toHaveCount(3);
  await blocks.first().click({ position: { x: 2, y: 5 } });
  const handle = frame.getByRole("button", { name: "Drag to reorder", exact: true });
  await expect(handle).toBeVisible();
  const inViewport = (element: Element) => {
    const r = element.getBoundingClientRect();
    return r.left >= 0 && r.right <= element.ownerDocument.defaultView!.innerWidth;
  };
  expect(await handle.evaluate(inViewport)).toBe(true);
  await blocks.first().getByText("First edge block", { exact: true }).dblclick();
  const editor = blocks.first().locator('[contenteditable="true"]');
  await expect(editor).toBeVisible();
  const toolbar = frame.locator(".pm-richtext-toolbar--inline");
  await expect(toolbar).toBeVisible();
  expect(await toolbar.evaluate(inViewport)).toBe(true);
  await editor.press("ControlOrMeta+End");
  await page.keyboard.insertText(" edited");
  await expect(blocks.first()).toContainText("First edge block edited");
  await page.getByRole("button", { name: /^undo$/i }).click();
  await expect(blocks.first()).toHaveText("First edge block");
  // Undo restores the viewport stored with the document snapshot. Re-enter
  // Mobile explicitly so the following drag still exercises the narrow edges.
  const mobile = page.getByRole("button", { name: "Switch to Mobile viewport" });
  if (await mobile.isEnabled()) await mobile.click();
  await expect
    .poll(() =>
      frame.locator("html").evaluate((element) => element.ownerDocument.defaultView!.innerWidth),
    )
    .toBe(390);
  await blocks.first().click({ position: { x: 2, y: 5 } });
  await expect(handle).toBeVisible();
  const source = await handle.boundingBox();
  const destination = await blocks.nth(1).boundingBox();
  if (!source || !destination) throw new Error("Missing mobile drag bounds");
  const x = source.x + source.width / 2,
    y = source.y + source.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 10, y + 5, { steps: 5 });
  await page.mouse.move(
    destination.x + destination.width / 2,
    destination.y + destination.height - 2,
    { steps: 30 },
  );
  await expect(
    frame.locator('[data-puck-dropzone$=":content"] > [data-puck-line-placeholder]'),
  ).toBeVisible();
  await page.mouse.up();
  const order = async () => (await blocks.allTextContents()).map((text) => text.trim());
  await expect.poll(order).toEqual(["Second edge block", "First edge block", "Third edge block"]);
  await page.getByRole("button", { name: /^undo$/i }).click();
  await expect.poll(order).toEqual(["First edge block", "Second edge block", "Third edge block"]);
  if (await mobile.isEnabled()) await mobile.click();
  await expect
    .poll(() =>
      frame.locator("html").evaluate((element) => element.ownerDocument.defaultView!.innerWidth),
    )
    .toBe(390);
  expect(
    await email.evaluate(
      (element) =>
        element.ownerDocument.documentElement.scrollWidth -
        element.ownerDocument.defaultView!.innerWidth,
    ),
  ).toBe(0);
});
