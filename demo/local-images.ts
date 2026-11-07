import { readUploadImage, validateImageDimensions } from "../src/image-upload";

/** Local demo only. No storage service, fetch, object URL, or persistent hosting. */
export async function uploadLocalImage(file: File): Promise<string> {
  const { bytes, mime } = await readUploadImage(file);
  // Keep conversion bounded without spreading megabytes onto the call stack.
  let binary = "";
  for (let start = 0; start < bytes.length; start += 8192)
    binary += String.fromCharCode(...bytes.subarray(start, start + 8192));
  const source = `data:${mime};base64,${btoa(binary)}`;
  // Headers alone cannot prove a file is a decodable image. Check the browser's
  // decoded dimensions as well, then release the detached decoder on every path.
  await new Promise<void>((resolve, reject) => {
    const image = new Image();
    const finish = (error?: Error) => {
      clearTimeout(timeout);
      image.onload = null;
      image.onerror = null;
      image.removeAttribute("src");
      if (error) reject(error);
      else resolve();
    };
    const timeout = setTimeout(
      () => finish(new Error("Image decoding timed out. Choose a smaller image.")),
      10_000,
    );
    image.onload = () => {
      try {
        validateImageDimensions(image.naturalWidth, image.naturalHeight);
        finish();
      } catch (error) {
        finish(error instanceof Error ? error : new Error("Invalid image dimensions"));
      }
    };
    image.onerror = () =>
      finish(
        new Error(
          "This image could not be decoded. Choose a different PNG, JPEG, GIF, or WebP file.",
        ),
      );
    image.src = source;
  });
  return source;
}
