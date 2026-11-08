/** Browser evidence for email content versus intentional renderer background bleed. */
export type HorizontalBox = { x: number; y: number; width: number; height: number };
export type CanvasBox = HorizontalBox & {
  label: string;
  fullWidth: boolean;
  scrollOverflow: number;
  /** Raw evidence for MJML's percentage-width image border paint. */
  imageBorderPaint?: {
    image: HorizontalBox;
    outer: HorizontalBox;
    contentWidth: number;
    borderLeft: number;
    borderRight: number;
    boxSizing: string;
    overflowX: string;
    overflowY: string;
  };
};
export type CanvasGeometry = {
  viewport: number;
  documentOverflow: number;
  canvas: HorizontalBox & { scrollOverflow: number };
  email: HorizontalBox;
  boxes: CanvasBox[];
  text: (HorizontalBox & { label: string })[];
  /** Unfiltered browser ranges, including collapsed/hanging whitespace. */
  rawText?: (HorizontalBox & { label: string })[];
};

// Self-contained so Playwright can execute the function in the actual iframe.
export function measureCanvasGeometry(email: Element): CanvasGeometry {
  const document = email.ownerDocument;
  const view = document.defaultView!;
  const canvas = email.closest(".pm-canvas")!;
  const box = (element: Element | Range): HorizontalBox => {
    const { x, y, width, height } = element.getBoundingClientRect();
    return { x, y, width, height };
  };
  const visible = (element: Element) => {
    const style = view.getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden" && box(element).height > 0;
  };
  const fullWidth = (element: Element) =>
    element.matches(".pm-section.pm-native-full-width, .pm-wrapper.pm-native-full-width") &&
    (element as HTMLElement).style.width === "100cqw" &&
    !element.parentElement?.closest(".pm-wrapper") &&
    !!element.querySelector(":scope > .pm-native-layout-content");
  const elements = Array.from(email.querySelectorAll("*")).filter(visible);
  const fullWidthElements = elements.filter(fullWidth);
  const imageBorderPaint = (element: Element): CanvasBox["imageBorderPaint"] => {
    // Only the renderer's direct, otherwise empty image sizing box qualifies.
    // Authored links, arbitrary descendants and generated content remain ordinary
    // overflow. Keep the measurements even when their classification will fail.
    if (
      !element.matches("a[data-pm-mjml-image-width]") ||
      !element.parentElement?.matches(".pm-image") ||
      element.children.length !== 1 ||
      !element.firstElementChild?.matches("img") ||
      Array.from(element.childNodes).some(
        (node) => node.nodeType === view.Node.TEXT_NODE && node.textContent?.trim(),
      )
    )
      return undefined;
    const image = element.firstElementChild;
    const style = view.getComputedStyle(element);
    const imageStyle = view.getComputedStyle(image);
    const number = (value: string) => Number.parseFloat(value) || 0;
    if (
      ["::before", "::after"].some(
        (pseudo) => !["none", "normal"].includes(view.getComputedStyle(element, pseudo).content),
      ) ||
      [style, imageStyle].some(
        (value) =>
          value.transform !== "none" ||
          number(value.paddingLeft) !== 0 ||
          number(value.paddingRight) !== 0,
      ) ||
      number(style.borderLeftWidth) !== 0 ||
      number(style.borderRightWidth) !== 0
    )
      return undefined;
    return {
      image: box(image),
      outer: box(element.parentElement),
      contentWidth: number(imageStyle.width),
      borderLeft: number(imageStyle.borderLeftWidth),
      borderRight: number(imageStyle.borderRightWidth),
      boxSizing: imageStyle.boxSizing,
      overflowX: style.overflowX,
      overflowY: style.overflowY,
    };
  };
  const boxes = elements.map((element) => ({
    ...box(element),
    label: `${element.tagName.toLowerCase()}.${Array.from(element.classList).join(".")}`,
    fullWidth: fullWidth(element),
    // Ancestor scroll widths include deliberate background bleed. Inspect their
    // descendants and text ranges instead, never exempt the entire subtree.
    scrollOverflow: fullWidthElements.some((child) => element.contains(child))
      ? 0
      : element.scrollWidth - element.clientWidth,
    ...(element.matches("a[data-pm-mjml-image-width]")
      ? { imageBorderPaint: imageBorderPaint(element) }
      : {}),
  }));
  const text: CanvasGeometry["text"] = [];
  const rawText: CanvasGeometry["text"] = [];
  const walker = document.createTreeWalker(email, view.NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const parent = node.parentElement;
    if (!node.textContent?.trim() || !parent || !visible(parent)) continue;
    if (parent.closest("style,script")) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    const label = node.textContent.trim().slice(0, 120);
    const originalRects = Array.from(range.getClientRects());
    for (const bounds of originalRects) {
      if (!bounds.width || !bounds.height) continue;
      rawText.push({
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        label,
      });
    }
    // CSS normal/nowrap/pre-line collapses ASCII whitespace; pre-wrap hangs
    // trailing spaces outside a line without painting glyphs or causing scroll
    // overflow. Chromium still reports rectangles for those spaces. Measure
    // actual non-space spans, then merge their rectangles by line. Keep all
    // ranges for pre/break-spaces or unknown modes, and retain NBSP/Unicode
    // spacing characters. Never exempt a subtree, a glyph, or an image.
    const whiteSpace = view.getComputedStyle(parent).whiteSpace;
    const rectangles: HorizontalBox[] = [];
    if (["normal", "nowrap", "pre-line", "pre-wrap"].includes(whiteSpace)) {
      for (const match of node.textContent.matchAll(/[^ \t\n\f\r]+/g)) {
        range.setStart(node, match.index!);
        range.setEnd(node, match.index! + match[0].length);
        rectangles.push(...Array.from(range.getClientRects()));
      }
    } else rectangles.push(...originalRects);
    const lines = new Map<string, HorizontalBox>();
    for (const bounds of rectangles) {
      if (!bounds.width || !bounds.height) continue;
      const key = `${bounds.y}:${bounds.height}`;
      const previous = lines.get(key);
      const x = Math.min(previous?.x ?? bounds.x, bounds.x);
      const right = Math.max(
        previous ? previous.x + previous.width : bounds.x + bounds.width,
        bounds.x + bounds.width,
      );
      lines.set(key, { x, y: bounds.y, width: right - x, height: bounds.height });
    }
    text.push(...Array.from(lines.values(), (bounds) => ({ ...bounds, label })));
  }
  return {
    viewport: view.innerWidth,
    documentOverflow: document.documentElement.scrollWidth - view.innerWidth,
    canvas: { ...box(canvas), scrollOverflow: canvas.scrollWidth - canvas.clientWidth },
    email: box(email),
    boxes,
    text,
    rawText,
  };
}

/** MJML's image table can stay content-width while its borders paint outside it. */
export function isContainedImageBorderPaint(item: CanvasBox, email: HorizontalBox): boolean {
  const evidence = item.imageBorderPaint;
  if (!evidence) return false;
  const { image, outer, contentWidth, borderLeft, borderRight } = evidence;
  const border = borderLeft + borderRight;
  const close = (actual: number, expected: number) => Math.abs(actual - expected) <= 0.05;
  const contains = (boundary: HorizontalBox) =>
    image.x >= boundary.x - 0.05 &&
    image.x + image.width <= boundary.x + boundary.width + 0.05 &&
    image.y >= boundary.y - 0.05 &&
    image.y + image.height <= boundary.y + boundary.height + 0.05;
  return (
    evidence.boxSizing === "content-box" &&
    evidence.overflowX === "visible" &&
    evidence.overflowY === "visible" &&
    border > 0 &&
    close(contentWidth, item.width) &&
    close(image.width, contentWidth + border) &&
    close(image.x, item.x) &&
    close(image.y, item.y) &&
    close(image.height, item.height) &&
    item.scrollOverflow >= Math.floor(border) &&
    item.scrollOverflow <= Math.ceil(border) &&
    contains(outer) &&
    contains(email)
  );
}

export function canvasOverflowFailures(geometry: CanvasGeometry, tolerance = 1): string[] {
  const failures: string[] = [];
  const inside = (item: HorizontalBox, boundary: HorizontalBox) =>
    item.x >= boundary.x - tolerance &&
    item.x + item.width <= boundary.x + boundary.width + tolerance;
  const viewport = { x: 0, y: 0, width: geometry.viewport, height: 0 };
  if (geometry.documentOverflow > tolerance) failures.push("document scroll overflow");
  if (geometry.canvas.scrollOverflow > tolerance) failures.push("canvas scroll overflow");
  if (!inside(geometry.canvas, viewport)) failures.push("canvas outside iframe viewport");
  if (!inside(geometry.email, geometry.canvas)) failures.push("email outside canvas");
  for (const item of geometry.boxes) {
    const boundary = item.fullWidth ? geometry.canvas : geometry.email;
    if (!inside(item, boundary))
      failures.push(`${item.label} outside ${item.fullWidth ? "canvas" : "email"}`);
    if (
      item.fullWidth &&
      (Math.abs(item.x - geometry.canvas.x) > tolerance ||
        Math.abs(item.width - geometry.canvas.width) > tolerance)
    ) {
      failures.push(`${item.label} does not match full canvas width`);
    }
    if (item.scrollOverflow > tolerance && !isContainedImageBorderPaint(item, geometry.email))
      failures.push(`${item.label} scroll overflow`);
  }
  for (const item of geometry.text) {
    if (!inside(item, geometry.email)) failures.push(`text outside email: ${item.label}`);
  }
  return failures;
}

export function canvasScreenshotBounds(geometry: CanvasGeometry): HorizontalBox {
  // Only the renderer's intentional full-width surfaces expand the crop. A real
  // overflowing child still fails the checks above and cannot enlarge its bounds.
  const surfaces = [geometry.email, ...geometry.boxes.filter((item) => item.fullWidth)];
  const x = Math.floor(Math.min(...surfaces.map((item) => item.x)));
  const right = Math.ceil(Math.max(...surfaces.map((item) => item.x + item.width)));
  const y = Math.floor(geometry.email.y);
  return {
    x,
    y,
    width: right - x,
    height: Math.ceil(geometry.email.y + geometry.email.height) - y,
  };
}
