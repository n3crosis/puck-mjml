import { chooseImportFile } from "./import-email";
import { expect, test, type Page } from "@playwright/test";
import { PNG_IMAGE_SOURCE } from "../fixtures/images";

const png = Buffer.from(PNG_IMAGE_SOURCE.split(",")[1], "base64");
async function chooseVisibleUpload(
  page: Page,
  file: { name: string; mimeType: string; buffer: Buffer },
) {
  // Puck also mounts hidden field instances. Exercise the visible native picker
  // a user can click, rather than setting files on a hidden backing input.
  const upload = page.locator(".pm-upload").filter({ visible: true });
  await expect(upload).toHaveCount(1);
  await expect(upload).toBeVisible();
  const chooser = page.waitForEvent("filechooser");
  await upload.click();
  await (await chooser).setFiles(file);
}

async function openImageField(page: Page) {
  await page.goto("/");
  const source = new URL("/fixture-image.png", page.url()).href;
  await page.route("**/fixture-image.png", (route) =>
    route.fulfill({ contentType: "image/png", body: png }),
  );
  await chooseImportFile(page, {
    name: "image.mjml",
    mimeType: "application/xml",
    buffer: Buffer.from(
      `<mjml><mj-body><mj-section><mj-column><mj-image width="160px" src="${source}" alt="Upload test" /></mj-column></mj-section></mj-body></mjml>`,
    ),
  });
  // Local file reading and Puck's controlled document remount are asynchronous.
  // Select the imported image only after the new document is on the canvas.
  await expect(page.getByRole("combobox", { name: "Email template" })).toHaveValue("imported");
  const frame = page.frameLocator("#preview-frame");
  await expect(frame.getByAltText("Upload test", { exact: true })).toBeVisible();
  const image = frame.locator('.pm-image:has(img[alt="Upload test"])');
  await image.click();
  const url = page.getByRole("textbox", { name: "Image URL", exact: true });
  await expect(url).toBeVisible();
  await page.getByText("Image URL", { exact: true }).filter({ visible: true }).click();
  await expect(url).toBeFocused();
  return image.locator("img");
}

test("local demo uploads render, export with a warning, and reimport without hosting", async ({
  page,
}) => {
  const image = await openImageField(page);
  await expect(
    page.getByText("Image uploads stay in this browser draft.", { exact: false }),
  ).toBeVisible();
  await chooseVisibleUpload(page, { name: "pixel.png", mimeType: "image/png", buffer: png });
  await expect(page.getByRole("textbox", { name: "Image URL", exact: true })).toHaveValue(
    PNG_IMAGE_SOURCE,
  );
  await expect(image).toHaveAttribute("src", PNG_IMAGE_SOURCE);
  await expect.poll(() => image.evaluate((node: HTMLImageElement) => node.naturalWidth)).toBe(1);

  await page.getByRole("button", { name: "Preview email", exact: true }).click();
  const rendered = page.frameLocator('iframe[title="Rendered email"]');
  await expect(rendered.getByAltText("Upload test")).toHaveAttribute("src", PNG_IMAGE_SOURCE);
  await page.getByRole("button", { name: "Close preview", exact: true }).click();

  await page.getByRole("button", { name: "Export email", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Export email", exact: true });
  await expect(dialog.getByRole("note")).toContainText("not uploaded or hosted");
  await dialog.getByRole("button", { name: "MJML", exact: true }).click();
  expect(await dialog.getByRole("textbox", { name: "MJML source" }).inputValue()).toContain(
    PNG_IMAGE_SOURCE,
  );
  const downloaded = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Download MJML", exact: true }).click();
  const download = await downloaded;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const saved = Buffer.concat(chunks);
  expect(saved.toString("utf8")).toContain(PNG_IMAGE_SOURCE);
  await dialog.getByRole("button", { name: "Close export", exact: true }).click();
  page.once("dialog", (confirmation) => confirmation.accept());
  await chooseImportFile(page, { name: "email.mjml", mimeType: "application/xml", buffer: saved });
  await expect(page.frameLocator("#preview-frame").getByAltText("Upload test")).toHaveAttribute(
    "src",
    PNG_IMAGE_SOURCE,
  );
});

test("unsupported uploads show an accessible error and preserve the editable hosted URL", async ({
  page,
}) => {
  const image = await openImageField(page);
  const original = await image.getAttribute("src");
  await chooseVisibleUpload(page, {
    name: "script.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'),
  });
  await expect(page.getByRole("alert")).toContainText("SVG is not supported");
  await expect(page.getByRole("textbox", { name: "Image URL", exact: true })).toHaveValue(
    original!,
  );
  await expect(image).toHaveAttribute("src", original!);
  await chooseVisibleUpload(page, { name: "pixel.png", mimeType: "image/png", buffer: png });
  await expect(image).toHaveAttribute("src", PNG_IMAGE_SOURCE);
  await page.getByRole("textbox", { name: "Image URL", exact: true }).fill(original!);
  await expect(image).toHaveAttribute("src", original!);
  await expect(page.getByRole("alert")).toHaveCount(0);
});
