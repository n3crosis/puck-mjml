/* eslint-disable no-control-regex -- Asset URLs must reject controls and backslashes. */
import type { EmailDocument } from "./types";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGE_DIMENSION = 8192;
export const MAX_IMAGE_PIXELS = 16_777_216;
export const IMAGE_UPLOAD_ACCEPT = "image/png,image/jpeg,image/gif,image/webp";
export const LOCAL_IMAGE_WARNING =
  "Local images are embedded in this draft and its exports, not uploaded or hosted. Many email clients block embedded images. Replace them with hosted HTTPS image URLs before sending.";
const rasterTypes = new Set(IMAGE_UPLOAD_ACCEPT.split(","));

type ImageInfo = { mime: string; width: number; height: number };
const ascii = (bytes: Uint8Array, start: number, length: number) =>
  String.fromCharCode(...bytes.subarray(start, start + length));

export function validateImageDimensions(width: number, height: number) {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    width > MAX_IMAGE_DIMENSION ||
    height > MAX_IMAGE_DIMENSION ||
    width * height > MAX_IMAGE_PIXELS
  ) {
    throw new Error("Images must be at most 8192 pixels per side and 16 megapixels in total");
  }
}

/** Inspect only bounded raster formats. A browser decoder additionally checks demo files. */
export function inspectRasterImage(bytes: Uint8Array): ImageInfo {
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES)
    throw new Error("Choose a nonempty image no larger than 5 MiB");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let info: ImageInfo | undefined;
  if (
    bytes.length >= 33 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte) &&
    view.getUint32(8) === 13 &&
    ascii(bytes, 12, 4) === "IHDR"
  ) {
    info = { mime: "image/png", width: view.getUint32(16), height: view.getUint32(20) };
  } else if (bytes.length >= 13 && /^GIF8[79]a$/.test(ascii(bytes, 0, 6))) {
    info = { mime: "image/gif", width: view.getUint16(6, true), height: view.getUint16(8, true) };
  } else if (bytes.length >= 12 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let position = 2;
    while (position + 3 < bytes.length) {
      if (bytes[position++] !== 0xff) break;
      while (bytes[position] === 0xff) position++;
      const marker = bytes[position++];
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (position + 2 > bytes.length) break;
      const length = view.getUint16(position);
      if (length < 2 || position + length > bytes.length) break;
      if (
        [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(
          marker,
        )
      ) {
        if (length >= 8)
          info = {
            mime: "image/jpeg",
            height: view.getUint16(position + 3),
            width: view.getUint16(position + 5),
          };
        break;
      }
      position += length;
    }
  } else if (
    bytes.length >= 30 &&
    ascii(bytes, 0, 4) === "RIFF" &&
    ascii(bytes, 8, 4) === "WEBP" &&
    view.getUint32(4, true) === bytes.length - 8
  ) {
    const chunk = ascii(bytes, 12, 4);
    const length = view.getUint32(16, true);
    if (length <= bytes.length - 20) {
      if (chunk === "VP8X" && length === 10) {
        const uint24 = (offset: number) =>
          bytes[offset] + bytes[offset + 1] * 256 + bytes[offset + 2] * 65536;
        info = { mime: "image/webp", width: uint24(24) + 1, height: uint24(27) + 1 };
      } else if (chunk === "VP8 " && length >= 10 && ascii(bytes, 23, 3) === "\x9d\x01\x2a") {
        info = {
          mime: "image/webp",
          width: view.getUint16(26, true) & 0x3fff,
          height: view.getUint16(28, true) & 0x3fff,
        };
      } else if (chunk === "VP8L" && length >= 5 && bytes[20] === 0x2f) {
        const packed = view.getUint32(21, true);
        info = {
          mime: "image/webp",
          width: (packed & 0x3fff) + 1,
          height: ((packed >>> 14) & 0x3fff) + 1,
        };
      }
    }
  }
  if (!info) throw new Error("Choose a valid PNG, JPEG, GIF, or WebP image; SVG is not supported");
  validateImageDimensions(info.width, info.height);
  return info;
}

export async function readUploadImage(file: File) {
  if (!rasterTypes.has(file.type))
    throw new Error("Choose a PNG, JPEG, GIF, or WebP image; SVG is not supported");
  if (!file.size || file.size > MAX_IMAGE_BYTES)
    throw new Error("Choose a nonempty image no larger than 5 MiB");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const info = inspectRasterImage(bytes);
  if (info.mime !== file.type) throw new Error("Image contents do not match the file type");
  return { ...info, bytes };
}

/** Data URLs are never accepted as links, CSS, SVG, or arbitrary document content. */
export function isLocalImageSource(value: unknown): value is string {
  if (typeof value !== "string" || value.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 32)
    return false;
  const comma = value.indexOf(",");
  const mime = /^data:(image\/(?:png|jpeg|gif|webp));base64$/.exec(value.slice(0, comma))?.[1];
  if (!mime) return false;
  const encoded = value.slice(comma + 1);
  if (!encoded || encoded.length % 4 || /[^A-Za-z0-9+/=]/.test(encoded)) return false;
  try {
    const binary = atob(encoded);
    if (btoa(binary) !== encoded) return false;
    // Avoid the iterable/callback allocation cost for multi-megabyte images.
    // atob returns one byte per character, including zero and high-bit bytes.
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    return inspectRasterImage(bytes).mime === mime;
  } catch {
    return false;
  }
}

/** Public asset URL rules, also used to check the host upload callback's result. */
export function safeImageSource(value: unknown, allowLocalImages = false): string {
  if (allowLocalImages === true && isLocalImageSource(value)) return value;
  if (typeof value !== "string" || /[\u0000-\u001f\u007f-\u009f\\]/.test(value)) return "";
  try {
    const url = new URL(value.trim());
    return ["http:", "https:"].includes(url.protocol) &&
      url.hostname &&
      !url.username &&
      !url.password
      ? url.href
      : "";
  } catch {
    return "";
  }
}

export function hasEmbeddedLocalImages(document: EmailDocument): boolean {
  // The document is JSON. Detect potential local assets even if they are invalid,
  // so an export validation error never hides the local-image warning.
  const visit = (value: unknown): boolean =>
    typeof value === "string"
      ? value.startsWith("data:image/")
      : Boolean(value && typeof value === "object" && Object.values(value).some(visit));
  return visit(document);
}
