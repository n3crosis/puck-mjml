// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { PNG_IMAGE_SOURCE, pngImageBytes } from "../tests/fixtures/images";
import { uploadLocalImage } from "./local-images";
import { reviewImport } from "./import-review";
import { toMjml } from "../src/export";

let decoder: {
  onload: (() => void) | null;
  onerror: (() => void) | null;
  naturalWidth: number;
  naturalHeight: number;
  removeAttribute: ReturnType<typeof vi.fn>;
  src: string;
};
function stubDecoder(width = 1, height = 1, fail = false) {
  vi.stubGlobal(
    "Image",
    class {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      naturalWidth = width;
      naturalHeight = height;
      removeAttribute = vi.fn();
      constructor() {
        // eslint-disable-next-line typescript/no-this-alias -- Expose the test decoder to assert resource cleanup.
        decoder = this;
      }
      set src(_value: string) {
        queueMicrotask(() => (fail ? this.onerror?.() : this.onload?.()));
      }
    },
  );
}
const file = () => new File([pngImageBytes()], "pixel.png", { type: "image/png" });
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("local demo images", () => {
  it("embeds only a decoded raster, with no network request or object URL", async () => {
    stubDecoder();
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const createObjectURL = vi.spyOn(URL, "createObjectURL");
    const result = await uploadLocalImage(file());
    expect(result).toBe(PNG_IMAGE_SOURCE);
    expect(fetch).not.toHaveBeenCalled();
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(decoder.removeAttribute).toHaveBeenCalledExactlyOnceWith("src");
    expect(decoder.onload).toBeNull();
    expect(decoder.onerror).toBeNull();
    createObjectURL.mockRestore();
  });
  it("rejects a malformed image that passes header checks and releases its decoder", async () => {
    stubDecoder(1, 1, true);
    await expect(uploadLocalImage(file())).rejects.toThrow("could not be decoded");
    expect(decoder.removeAttribute).toHaveBeenCalledExactlyOnceWith("src");
  });
  it("checks actual decoded dimensions independently of the file header", async () => {
    stubDecoder(10000, 10000);
    await expect(uploadLocalImage(file())).rejects.toThrow("pixels");
    expect(decoder.removeAttribute).toHaveBeenCalledExactlyOnceWith("src");
  });
  it("times out stalled decoding and releases callbacks and source", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "Image",
      class {
        onload = null;
        onerror = null;
        naturalWidth = 0;
        naturalHeight = 0;
        src = "";
        removeAttribute = vi.fn();
        constructor() {
          // eslint-disable-next-line typescript/no-this-alias -- Expose the test decoder to assert resource cleanup.
          decoder = this;
        }
      },
    );
    const promise = uploadLocalImage(file());
    const rejected = expect(promise).rejects.toThrow("timed out");
    await vi.waitFor(() => expect(decoder.src).toBe(PNG_IMAGE_SOURCE));
    await vi.advanceTimersByTimeAsync(10_000);
    await rejected;
    expect(decoder.removeAttribute).toHaveBeenCalledExactlyOnceWith("src");
    expect(decoder.onload).toBeNull();
  });
  it("round-trips downloaded local MJML in the explicitly opted-in demo", () => {
    const source = `<mjml><mj-body><mj-section><mj-column><mj-image src="${PNG_IMAGE_SOURCE}" /></mj-column></mj-section></mj-body></mjml>`;
    const imported = reviewImport(source);
    expect(imported.warnings).toEqual([]);
    const output = toMjml(imported.document, { allowLocalImages: true });
    expect(output).toContain(PNG_IMAGE_SOURCE);
    expect(toMjml(reviewImport(output).document, { allowLocalImages: true })).toContain(
      PNG_IMAGE_SOURCE,
    );
  });
  it.each(["image/svg+xml", "text/html"])(
    "does not gain raw-source trust by enabling local images: %s",
    (mime) => {
      const source = `<mjml><mj-body><mj-section><mj-column><mj-image src="data:${mime};base64,PHN2Zy8+" /></mj-column></mj-section></mj-body></mjml>`;
      expect(toMjml(reviewImport(source).document, { allowLocalImages: true })).not.toContain(
        `data:${mime}`,
      );
      expect(() =>
        reviewImport("<mjml><mj-body><mj-raw><script>alert(1)</script></mj-raw></mj-body></mjml>"),
      ).toThrow();
    },
  );
});
