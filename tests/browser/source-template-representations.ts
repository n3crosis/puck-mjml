import { readFileSync } from "node:fs";
import { expect, type Page } from "@playwright/test";
import { inspectArtwork } from "./artwork-evidence";
import { waitForCanvasFontCss } from "./font-evidence";
import { loadReactEmailReference } from "./reference-document";

/** Original, exported HTML and editable canvas after fonts and images settle. */
export async function sourceTemplateRepresentations(
  page: Page,
  family: string,
  name: string,
  width: number,
  readyText: string,
) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/");
  await page
    .getByRole("combobox", { name: "Email template" })
    .selectOption(`${family.toLowerCase()}/${name}`);
  await page.getByRole("button", { name: "Preview email" }).click();
  const dialog = page.getByRole("dialog", { name: "Email preview" });
  await expect(dialog).toBeVisible();
  await expect(
    page.frameLocator('iframe[title="Rendered email"]').getByText(readyText, { exact: true }),
  ).toBeAttached();
  const html = await page
    .locator('iframe[title="Rendered email"]')
    .evaluate((iframe: HTMLIFrameElement) => iframe.srcdoc);
  await dialog.getByRole("button", { name: "Close preview" }).click();
  await expect(dialog).toBeHidden();
  const control = page.getByRole("button", {
    name: `Switch to ${width === 390 ? "Mobile" : "Desktop"} viewport`,
  });
  if (await control.isEnabled()) await control.click();
  const frame = page.frameLocator("#preview-frame");
  await expect
    .poll(() =>
      frame.locator("html").evaluate((element) => element.ownerDocument.defaultView!.innerWidth),
    )
    .toBe(width);
  const canvas = frame.locator(".pm-email");
  await waitForCanvasFontCss(canvas);
  await canvas.evaluate(inspectArtwork, { decode: true });
  const reference = await page.context().newPage();
  const compiled = await page.context().newPage();
  try {
    await reference.setViewportSize({ width, height: 900 });
    await compiled.setViewportSize({ width, height: 900 });
    await loadReactEmailReference(
      reference,
      readFileSync(
        new URL(`../fixtures/react-email-reference/${family}/${name}.html`, import.meta.url),
        "utf8",
      ),
    );
    await reference.locator("body").evaluate(inspectArtwork, { decode: true });
    await compiled.setContent(html, { waitUntil: "load" });
    await compiled.locator("body").evaluate(inspectArtwork, { decode: true });
    return { reference, compiled, canvas, roots: [compiled.locator("body"), canvas] };
  } catch (error) {
    await reference.close();
    await compiled.close();
    throw error;
  }
}
