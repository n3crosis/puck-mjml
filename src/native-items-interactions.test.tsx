// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { NativeItems } from "./NativeItems";
import { createCanvasScope, getCanvasElement } from "./native-canvas-context";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | undefined;
let container: HTMLDivElement | undefined;
afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

function mountCarousel() {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  const render = (thumbnails = "visible", count = 3, offset = 0) => {
    const props = {
      thumbnails,
      images: Array.from({ length: count }, (_, index) => ({
        src: `https://example.com/image-${index + 1 + offset}.png`,
        href: `https://example.com/page-${index + 1 + offset}`,
        alt: `Image ${index + 1 + offset}`,
      })),
    };
    const resolved = getCanvasElement("mj-carousel", props, createCanvasScope());
    expect(resolved).toBeDefined();
    act(() => root!.render(<NativeItems name="Carousel" props={props} {...resolved!} />));
  };
  render();
  const thumbnail = (index: number) =>
    container!.querySelector<HTMLButtonElement>(`button[aria-label="Show image ${index}"]`)!;
  const currentImage = () => container!.querySelector<HTMLImageElement>(".pm-carousel-main")!;
  return { render, thumbnail, currentImage };
}

describe("native Carousel interactions", () => {
  it("previews a hovered thumbnail and its link, then restores the selected image on leave", () => {
    const { thumbnail, currentImage } = mountCarousel();
    act(() => thumbnail(2).click());
    expect(currentImage().alt).toBe("Image 2");
    act(() => thumbnail(3).dispatchEvent(new MouseEvent("mouseover", { bubbles: true })));
    expect(currentImage().alt).toBe("Image 3");
    expect(currentImage().closest("a")!.href).toBe("https://example.com/page-3");
    expect(thumbnail(2).getAttribute("aria-pressed")).toBe("true");
    expect(thumbnail(3).getAttribute("aria-pressed")).toBe("false");
    act(() => thumbnail(3).dispatchEvent(new MouseEvent("mouseout", { bubbles: true })));
    expect(currentImage().alt).toBe("Image 2");
    expect(currentImage().closest("a")!.href).toBe("https://example.com/page-2");
  });

  it("keeps a clicked thumbnail selected after its hover preview ends", () => {
    const { thumbnail, currentImage } = mountCarousel();
    act(() => thumbnail(3).dispatchEvent(new MouseEvent("mouseover", { bubbles: true })));
    act(() => thumbnail(3).click());
    act(() => thumbnail(3).dispatchEvent(new MouseEvent("mouseout", { bubbles: true })));
    expect(currentImage().alt).toBe("Image 3");
    expect(thumbnail(3).getAttribute("aria-pressed")).toBe("true");
    act(() =>
      container!.querySelector<HTMLButtonElement>('button[aria-label="Next image"]')!.click(),
    );
    expect(currentImage().alt).toBe("Image 1");
  });

  it("clears hover when thumbnails are hidden and preserves selection when they return", () => {
    const { render, thumbnail, currentImage } = mountCarousel();
    act(() => thumbnail(2).click());
    act(() => thumbnail(3).dispatchEvent(new MouseEvent("mouseover", { bubbles: true })));
    expect(currentImage().alt).toBe("Image 3");
    render("hidden");
    expect(currentImage().alt).toBe("Image 2");
    render("visible");
    expect(currentImage().alt).toBe("Image 2");
    expect(thumbnail(2).getAttribute("aria-pressed")).toBe("true");
  });

  it("clears hover when images are removed and does not revive it after adding them back", () => {
    const { render, thumbnail, currentImage } = mountCarousel();
    act(() => thumbnail(3).dispatchEvent(new MouseEvent("mouseover", { bubbles: true })));
    expect(currentImage().alt).toBe("Image 3");
    render("visible", 2);
    expect(currentImage().alt).toBe("Image 1");
    render("visible", 3);
    expect(currentImage().alt).toBe("Image 1");
  });

  it("does not carry a hovered index into a replacement image list of the same size", () => {
    const { render, thumbnail, currentImage } = mountCarousel();
    act(() => thumbnail(3).dispatchEvent(new MouseEvent("mouseover", { bubbles: true })));
    expect(currentImage().alt).toBe("Image 3");
    render("visible", 3, 3);
    expect(currentImage().alt).toBe("Image 4");
  });
});
