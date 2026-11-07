/** Browser evidence for email content versus intentional renderer background bleed. */
export type HorizontalBox = { x: number; y: number; width: number; height: number };
export type CanvasBox = HorizontalBox & {
  label: string;
  fullWidth: boolean;
  scrollOverflow: number;
};
export type CanvasGeometry = {
  viewport: number;
  documentOverflow: number;
  canvas: HorizontalBox & { scrollOverflow: number };
  email: HorizontalBox;
  boxes: CanvasBox[];
  text: (HorizontalBox & { label: string })[];
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
  const boxes = elements.map((element) => ({
    ...box(element),
    label: `${element.tagName.toLowerCase()}.${Array.from(element.classList).join(".")}`,
    fullWidth: fullWidth(element),
    // Ancestor scroll widths include deliberate background bleed. Inspect their
    // descendants and text ranges instead, never exempt the entire subtree.
    scrollOverflow: fullWidthElements.some((child) => element.contains(child))
      ? 0
      : element.scrollWidth - element.clientWidth,
  }));
  const text: CanvasGeometry["text"] = [];
  const walker = document.createTreeWalker(email, view.NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const parent = node.parentElement;
    if (!node.textContent?.trim() || !parent || !visible(parent)) continue;
    if (parent.closest("style,script")) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    for (const bounds of range.getClientRects()) {
      if (!bounds.width || !bounds.height) continue;
      text.push({
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        label: node.textContent.trim().slice(0, 120),
      });
    }
  }
  return {
    viewport: view.innerWidth,
    documentOverflow: document.documentElement.scrollWidth - view.innerWidth,
    canvas: { ...box(canvas), scrollOverflow: canvas.scrollWidth - canvas.clientWidth },
    email: box(email),
    boxes,
    text,
  };
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
    if (item.scrollOverflow > tolerance) failures.push(`${item.label} scroll overflow`);
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
