# Image uploads

The Image URL field always accepts a hosted URL. To add its upload control, supply the host-owned `onUploadImage(file): Promise<string>` callback. No storage provider, account, API key, or upload endpoint is built into the editor.

```tsx
async function uploadImage(file: File): Promise<string> {
  const body = new FormData();
  body.append("image", file);
  const response = await fetch("/api/email-images", { method: "POST", body });
  if (!response.ok) throw new Error("Image upload failed. Please try again.");
  const result = await response.json();
  if (typeof result.url !== "string")
    throw new Error("The upload service did not return an image URL.");
  return result.url;
}

<EmailEditor value={document} onChange={setDocument} onUploadImage={uploadImage} />;
```

Implement `/api/email-images` in your own host, or replace the callback with your storage SDK. The resolved URL must use HTTP or HTTPS, have a hostname, and contain no credentials or unsafe encoded characters. Return a stable, publicly readable image URL suitable for the email's recipients, preferably HTTPS. The editor validates its syntax; it cannot verify public accessibility, expiration, ownership, or email-client support. Authenticate, authorize, validate, and scan uploads on your server. Never ship storage credentials to the browser.

## Behavior and validation

- Supported file types: PNG, JPEG, GIF, and WebP. The file's declared MIME must match its raster signature. SVG and other active formats are rejected.
- Maximum file size: 5 MiB. Dimensions must be positive, at most 8192 pixels per side, and no more than 16,777,216 pixels in total. These checks run before the host callback. Hosts remain responsible for complete decoding and server validation.
- The field announces uploading status and failures, links its file input to help/error text, and leaves the URL input editable. Invalid files, callback failures, and invalid returned URLs retain the current image. You can retry the same file.
- Editing the URL, replacing the document, changing selection, locking the field, disabling upload/local-image permission, or unmounting discards stale results. A newer upload wins over older work. These guards do not cancel an upload already running in your service; handle storage cleanup and cancellation in your host when needed.
- A locked field disables file selection and refuses callbacks, including late completions. Ordinary host rerenders keep the callback fresh without recreating the editor config.

Custom Puck shells can call `createEmailConfig(onUploadImage, allowRawHtml, allowLocalImages)` and must retain the documented field-permissions integration.

## Local demo images

The standalone demo enables a separate, explicit `allowLocalImages` host option and supplies a local callback. It reads the selected raster file in the browser, checks its signature and dimensions, asks the browser to decode it, checks the decoded dimensions, and stores a bounded base64 data URL in the draft. It does not contact a storage service or create temporary object URLs. Decoder sources and event handlers are released after success, failure, or timeout; replacing an image leaves its old data available only where still referenced, such as undo history.

Local images are embedded assets, not uploaded or hosted images. The demo does not save drafts: reload or leaving the page discards the in-memory draft. Downloaded MJML/HTML contains the image bytes, increases file size, and can reveal the selected image to anyone you share the export with. Many email clients block data URLs. Replace local assets with hosted HTTPS URLs before sending a real email. The demo, upload field, and export dialog display this limitation.

The option is off by default and is not inferred from imported JSON or MJML. It permits only bounded raster data URLs in an Image block's `src` or native `mj-image src`; it does not permit data links, backgrounds, CSS, `srcset`, SVG, blob URLs, scripts, or raw HTML. Other image-bearing components still require hosted URLs.

Each conversion entry point needs its own opt-in:

```tsx
<EmailEditor
  value={document}
  onChange={setDocument}
  onUploadImage={localHandler}
  allowLocalImages
/>;

const mjml = toMjml(document, { allowLocalImages: true });
const { html } = await compileEmail(document, { allowLocalImages: true });
const imported = fromMjml(mjml, { allowLocalImages: true });
```

The editor's built-in preview and export dialog use its host option. The demo explicitly enables the same policy when reviewing imports, so its downloaded MJML can be loaded again. Ordinary `fromMjml(source)` drops unsupported local sources with warnings; ordinary exports reject local image URLs. `allowRawHtml` is unrelated and does not enable local images.
