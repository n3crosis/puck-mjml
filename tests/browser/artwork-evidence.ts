/** Self-contained so Playwright can execute this function in the document. */
export async function inspectArtwork(root: HTMLElement, options: { decode?: boolean } = {}) {
  const document = root.ownerDocument;
  const images = Array.from(root.querySelectorAll("img"));
  const decorations = new Set(
    images.filter((image) => {
      const bounds = image.getBoundingClientRect();
      // ProseMirror's Chrome/Safari cursor hack is not an email asset. Match
      // its exact live-editor shape, never arbitrary missing or hidden images.
      return (
        image.classList.contains("ProseMirror-separator") &&
        !image.hasAttribute("src") &&
        !image.hasAttribute("srcset") &&
        image.getAttribute("alt") === "" &&
        image.closest('.pm-canvas .tiptap.ProseMirror[contenteditable="true"]') !== null &&
        bounds.width === 0 &&
        bounds.height === 0
      );
    }),
  );
  const artwork = images.filter((image) => !decorations.has(image));
  if (options.decode) {
    root.getBoundingClientRect();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        Promise.allSettled([
          document.fonts.ready,
          ...artwork.map(async (image) => {
            await image.decode();
            if (!image.complete || image.naturalWidth === 0)
              throw new Error(`Artwork failed to load: ${image.src}`);
          }),
        ]).then((results) => {
          const messages = [
            ...results
              .filter((result) => result.status === "rejected")
              .map((result) => String(result.reason)),
            ...Array.from(document.fonts)
              .filter((font) => font.status === "error")
              .map((font) => `Font failed to load: ${font.family} ${font.weight}`),
          ];
          if (messages.length) throw new Error(messages.join("\n"));
        }),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () => reject(new Error("Template fonts or artwork did not finish loading")),
            20_000,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
  const evidence = (image: HTMLImageElement) => {
    const bounds = image.getBoundingClientRect();
    return {
      src: image.src,
      alt: image.alt,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
    };
  };
  return {
    images: artwork.map(evidence),
    editorDecorations: Array.from(decorations, (image) => ({
      reason: "ProseMirror source-less cursor separator",
      ...evidence(image),
    })),
  };
}
