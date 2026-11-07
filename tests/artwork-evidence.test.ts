// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { inspectArtwork } from "./browser/artwork-evidence";

const fontDescriptor = Object.getOwnPropertyDescriptor(document, "fonts");
afterEach(() => {
  document.body.innerHTML = "";
  if (fontDescriptor) Object.defineProperty(document, "fonts", fontDescriptor);
  else Reflect.deleteProperty(document, "fonts");
});

function fixture(image = '<img class="ProseMirror-separator" alt="">') {
  document.body.innerHTML = `<div class="pm-canvas"><div class="tiptap ProseMirror" contenteditable="true">${image}</div></div>`;
  return document.querySelector("img")!;
}

function readyFonts(faces: { status: string; family: string; weight: string }[] = []) {
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: Object.assign(new Set(faces), { ready: Promise.resolve() }),
  });
}

describe("actual email artwork versus editor decorations", () => {
  it("records only the exact source-less zero-size ProseMirror cursor hack separately", async () => {
    const image = fixture();
    image.decode = vi.fn().mockRejectedValue(new Error("Source image cannot be decoded"));
    readyFonts();
    const result = await inspectArtwork(document.body, { decode: true });
    expect(result.images).toEqual([]);
    expect(result.editorDecorations).toEqual([
      expect.objectContaining({
        reason: "ProseMirror source-less cursor separator",
        src: "",
        alt: "",
        width: 0,
        height: 0,
      }),
    ]);
    expect(image.decode).not.toHaveBeenCalled();
  });

  it.each([
    '<img class="ProseMirror-separator">',
    '<img class="ProseMirror-separator" alt="Actual artwork">',
    '<img class="ProseMirror-separator" alt="" src="">',
    '<img class="ProseMirror-separator" alt="" srcset="">',
    '<img class="ProseMirror-separator" alt="" src="https://example.com/photo.png">',
    '<img alt="">',
  ])("does not exclude real or malformed artwork: %s", async (markup) => {
    const image = fixture(markup);
    image.decode = vi.fn().mockRejectedValue(new Error("Actual broken artwork"));
    readyFonts();
    expect((await inspectArtwork(document.body)).images).toHaveLength(1);
    expect((await inspectArtwork(document.body)).editorDecorations).toEqual([]);
    await expect(inspectArtwork(document.body, { decode: true })).rejects.toThrow(
      "Actual broken artwork",
    );
    expect(image.decode).toHaveBeenCalledOnce();
  });

  it.each(["outside canvas", "not editable", "not Tiptap", "nonzero size"])(
    "does not exclude separator-like images that are %s",
    async (condition) => {
      const image = fixture();
      if (condition === "outside canvas") document.querySelector(".pm-canvas")!.className = "";
      if (condition === "not editable")
        image.parentElement!.setAttribute("contenteditable", "false");
      if (condition === "not Tiptap") image.parentElement!.classList.remove("tiptap");
      if (condition === "nonzero size")
        image.getBoundingClientRect = () => new DOMRect(0, 0, 12, 12);
      const result = await inspectArtwork(document.body);
      expect(result.images).toHaveLength(1);
      expect(result.editorDecorations).toEqual([]);
    },
  );

  it("still decodes every real image and records its natural/rendered dimensions", async () => {
    const image = fixture('<img alt="Logo" src="https://example.com/logo.png">');
    image.decode = vi.fn().mockResolvedValue(undefined);
    Object.defineProperties(image, {
      complete: { value: true },
      naturalWidth: { value: 24 },
      naturalHeight: { value: 12 },
    });
    readyFonts();
    const result = await inspectArtwork(document.body, { decode: true });
    expect(image.decode).toHaveBeenCalledOnce();
    expect(result.images[0]).toMatchObject({ alt: "Logo", naturalWidth: 24, naturalHeight: 12 });
  });

  it("does not mask failed font faces", async () => {
    fixture();
    readyFonts([{ status: "error", family: "Example", weight: "400" }]);
    await expect(inspectArtwork(document.body, { decode: true })).rejects.toThrow(
      "Font failed to load: Example 400",
    );
  });
});
