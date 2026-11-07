import { Render, type Data } from "@puckeditor/core";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PNG_IMAGE_SOURCE, pngImageBytes } from "../tests/fixtures/images";
import { createEmailConfig } from "./config";
import { fromMjml } from "./import";
import { compileEmail, toMjml } from "./export";
import { getNativeBaseAttributes } from "./native-base";
import { readNativeAttributes } from "./native-attributes";
import {
  hasEmbeddedLocalImages,
  inspectRasterImage,
  isLocalImageSource,
  MAX_IMAGE_BYTES,
  readUploadImage,
  safeImageSource,
} from "./image-upload";
import type { EmailDocument } from "./types";

beforeAll(() => vi.stubGlobal("window", globalThis));
afterAll(() => vi.unstubAllGlobals());
const documentWithImage = (
  src = PNG_IMAGE_SOURCE,
  extra: Record<string, unknown> = {},
): EmailDocument => ({
  root: {
    props: {
      sections: [
        {
          type: "Section1",
          props: {
            id: "section",
            column: [{ type: "Image", props: { id: "image", src, ...extra } }],
          },
        },
      ],
    },
  },
  content: [],
});
const image = (document: EmailDocument) =>
  (document.root.props!.sections![0].props.column as { props: Record<string, unknown> }[])[0].props;
const dataUrl = (mime: string, bytes: Uint8Array) =>
  `data:${mime};base64,${btoa(String.fromCharCode(...bytes))}`;

describe("bounded raster upload validation", () => {
  it("checks PNG bytes, MIME, and dimensions before the host receives the file", async () => {
    const file = new File([pngImageBytes()], "pixel.png", { type: "image/png" });
    expect(await readUploadImage(file)).toMatchObject({ mime: "image/png", width: 1, height: 1 });
    expect(isLocalImageSource(PNG_IMAGE_SOURCE)).toBe(true);
    expect(safeImageSource(PNG_IMAGE_SOURCE)).toBe("");
    expect(safeImageSource(PNG_IMAGE_SOURCE, true)).toBe(PNG_IMAGE_SOURCE);
  });
  it("recognizes JPEG, GIF, and all three WebP header variants", () => {
    const jpeg = new Uint8Array([
      0xff, 0xd8, 0xff, 0xc0, 0, 11, 8, 0, 2, 0, 3, 1, 1, 0x11, 0, 0xff, 0xd9,
    ]);
    const gif = new Uint8Array([71, 73, 70, 56, 57, 97, 3, 0, 2, 0, 0, 0, 0]);
    expect(inspectRasterImage(jpeg)).toEqual({ mime: "image/jpeg", width: 3, height: 2 });
    expect(inspectRasterImage(gif)).toEqual({ mime: "image/gif", width: 3, height: 2 });
    for (const chunk of ["VP8X", "VP8 ", "VP8L"]) {
      const bytes = new Uint8Array(30);
      const view = new DataView(bytes.buffer);
      bytes.set([..."RIFF"].map((c) => c.charCodeAt(0)));
      view.setUint32(4, 22, true);
      bytes.set(
        [...`WEBP${chunk}`].map((c) => c.charCodeAt(0)),
        8,
      );
      view.setUint32(16, 10, true);
      if (chunk === "VP8X") {
        bytes[24] = 2;
        bytes[27] = 1;
      }
      if (chunk === "VP8 ") {
        bytes.set([0x9d, 1, 0x2a], 23);
        view.setUint16(26, 3, true);
        view.setUint16(28, 2, true);
      }
      if (chunk === "VP8L") {
        bytes[20] = 0x2f;
        view.setUint32(21, 2 | (1 << 14), true);
      }
      expect(inspectRasterImage(bytes)).toEqual({ mime: "image/webp", width: 3, height: 2 });
    }
  });
  it.each([
    ["empty.png", "image/png", new Uint8Array(), "nonempty"],
    ["script.svg", "image/svg+xml", new TextEncoder().encode('<svg onload="alert(1)"/>'), "SVG"],
    ["fake.png", "image/png", new TextEncoder().encode('<svg onload="alert(1)"/>'), "valid"],
    ["mismatch.jpg", "image/jpeg", pngImageBytes(), "match"],
  ])("rejects %s", async (name, mime, bytes, message) => {
    await expect(readUploadImage(new File([bytes], name, { type: mime }))).rejects.toThrow(message);
  });
  it("bounds bytes before reading and rejects oversized or zero image dimensions", async () => {
    const file = new File([new Uint8Array(MAX_IMAGE_BYTES + 1)], "huge.png", { type: "image/png" });
    const read = vi.spyOn(file, "arrayBuffer");
    await expect(readUploadImage(file)).rejects.toThrow("5 MiB");
    expect(read).not.toHaveBeenCalled();
    for (const [width, height] of [
      [8193, 1],
      [4097, 4097],
      [0, 1],
    ]) {
      const bytes = pngImageBytes();
      const view = new DataView(bytes.buffer);
      view.setUint32(16, width);
      view.setUint32(20, height);
      expect(() => inspectRasterImage(bytes)).toThrow("pixels");
      expect(isLocalImageSource(dataUrl("image/png", bytes))).toBe(false);
    }
  });
  it.each([
    "data:image/svg+xml;base64,PHN2Zy8+",
    "data:text/html;base64,PHNjcmlwdD4=",
    "data:image/png;base64,PHN2Zy8+",
    "data:image/png,%89PNG",
    PNG_IMAGE_SOURCE.replace("image/png", "image/jpeg"),
    PNG_IMAGE_SOURCE + "\n",
    PNG_IMAGE_SOURCE + "=",
    "blob:https://example.com/id",
    "javascript:alert(1)",
    "https://user:password@example.com/a.png",
    "https://example.com\\bad.png",
    "https://example.com/\nimage.png",
  ])("rejects unsafe upload results: %s", (source) => {
    expect(safeImageSource(source, true)).toBe("");
  });
  it("normalizes ordinary HTTP(S) URLs without requiring local mode", () => {
    expect(safeImageSource(" https://EXAMPLE.com/image.png ")).toBe(
      "https://example.com/image.png",
    );
  });
});

describe("explicit local image policy", () => {
  it("requires opt-in independently for export, canvas, and import", async () => {
    const document = documentWithImage();
    expect(() => toMjml(document)).toThrow();
    expect(() => toMjml(document, { allowRawHtml: true })).toThrow();
    const mjml = toMjml(document, { allowLocalImages: true });
    expect(mjml).toContain(`src="${PNG_IMAGE_SOURCE}"`);
    const compiled = await compileEmail(document, { allowLocalImages: true });
    expect(compiled.errors).toEqual([]);
    expect(compiled.html).toContain(PNG_IMAGE_SOURCE);
    expect(
      renderToStaticMarkup(<Render config={createEmailConfig()} data={document as Data} />),
    ).not.toContain(PNG_IMAGE_SOURCE);
    expect(
      renderToStaticMarkup(
        <Render config={createEmailConfig(undefined, false, true)} data={document as Data} />,
      ),
    ).toContain(PNG_IMAGE_SOURCE);
    const ordinary = fromMjml(mjml);
    expect(image(ordinary.document).src).toBeUndefined();
    expect(ordinary.warnings.length).toBeGreaterThan(0);
    const imported = fromMjml(mjml, { allowLocalImages: true });
    expect(imported.warnings).toEqual([]);
    expect(image(imported.document).src).toBe(PNG_IMAGE_SOURCE);
    expect(toMjml(imported.document, { allowLocalImages: true })).toContain(PNG_IMAGE_SOURCE);
    expect(() => toMjml(imported.document)).toThrow();
    expect(hasEmbeddedLocalImages(imported.document)).toBe(true);
    expect(hasEmbeddedLocalImages(documentWithImage("https://example.com/image.png"))).toBe(false);
  });
  it("validates local native image src overrides without allowing local links or other asset sinks", () => {
    expect(
      readNativeAttributes("mj-image", [{ name: "src", value: PNG_IMAGE_SOURCE }], {
        allowLocalImages: true,
      }).src,
    ).toBe(PNG_IMAGE_SOURCE);
    expect(() =>
      readNativeAttributes("mj-image", [{ name: "src", value: PNG_IMAGE_SOURCE }]),
    ).toThrow();
    const document = documentWithImage("https://example.com/fallback.png", {
      mjmlAttributes: [{ name: "src", value: PNG_IMAGE_SOURCE }],
    });
    const mjml = toMjml(document, { allowLocalImages: true });
    expect(mjml).toContain(PNG_IMAGE_SOURCE);
    expect(
      toMjml(fromMjml(mjml, { allowLocalImages: true }).document, { allowLocalImages: true }),
    ).toContain(PNG_IMAGE_SOURCE);
    for (const [tag, name] of [
      ["mj-image", "href"],
      ["mj-image", "srcset"],
      ["mj-section", "background-url"],
      ["mj-carousel-image", "src"],
      ["mj-social-element", "src"],
      ["*", "src"],
    ]) {
      expect(() =>
        readNativeAttributes(tag, [{ name, value: PNG_IMAGE_SOURCE }], { allowLocalImages: true }),
      ).toThrow();
    }
    expect(() =>
      getNativeBaseAttributes("mj-button", { href: PNG_IMAGE_SOURCE }, { allowLocalImages: true }),
    ).toThrow();
  });
  it("does not derive local image permission from document settings or raw HTML permission", () => {
    const document = documentWithImage();
    Object.assign(document.root.props!, { allowLocalImages: true });
    expect(() => toMjml(document)).toThrow();
    expect(
      renderToStaticMarkup(
        <Render config={createEmailConfig(undefined, true)} data={document as Data} />,
      ),
    ).not.toContain(PNG_IMAGE_SOURCE);
  });
});
