/** Computed opaque-surface contrast evidence, never an inferred pixel-parity claim. */
export function inspectContrast(root: Element) {
  const document = root.ownerDocument;
  const view = document.defaultView!;
  const rgb = (value: string): number[] | undefined => {
    const match = value.match(/^rgba?\(([^)]+)\)$/);
    if (!match) return;
    const parts = match[1]
      .split(/[,\s/]+/)
      .filter(Boolean)
      .map(Number);
    if (parts.length < 3 || parts.some((part) => !Number.isFinite(part))) return;
    return [parts[0], parts[1], parts[2], parts[3] ?? 1];
  };
  const luminance = (color: number[]) => {
    const values = color
      .slice(0, 3)
      .map((v) => v / 255)
      .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
  };
  const measurements: {
    text: string;
    foreground: string;
    background: string | null;
    ratio: number | null;
    minimum: number;
    status: string;
    limitations: string[];
  }[] = [];
  const walker = document.createTreeWalker(root, view.NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const parent = node.parentElement!;
    const text = node.data.replace(/\s+/g, " ").trim();
    if (!text || parent.closest("script,style,noscript")) continue;
    const style = view.getComputedStyle(parent);
    if (["hidden", "collapse"].includes(style.visibility)) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    if (!Array.from(range.getClientRects()).some((rect) => rect.width > 0 && rect.height > 0))
      continue;
    const limitations: string[] = [];
    let background: number[] | undefined;
    let hidden = false;
    for (let ancestor: Element | null = parent; ancestor; ancestor = ancestor.parentElement) {
      const css = view.getComputedStyle(ancestor);
      if (css.display === "none" || css.opacity === "0") hidden = true;
      if (css.opacity && Number(css.opacity) < 1) limitations.push("ancestor opacity");
      if (css.filter && css.filter !== "none") limitations.push("filter");
      if (css.mixBlendMode && css.mixBlendMode !== "normal") limitations.push("blend mode");
      if (!background) {
        if (css.backgroundImage && css.backgroundImage !== "none")
          limitations.push("background image or gradient");
        const color = rgb(css.backgroundColor);
        if (css.backgroundColor && css.backgroundColor !== "transparent" && !color)
          limitations.push("unsupported background color");
        if (color && color[3] === 1) background = color;
        else if (color && color[3] > 0) limitations.push("translucent background");
      }
    }
    if (hidden) continue;
    background ??= [255, 255, 255, 1];
    const foreground = rgb(style.color);
    if (!foreground || foreground[3] !== 1)
      limitations.push("unsupported or translucent foreground");
    const size = parseFloat(style.fontSize),
      weight = parseFloat(style.fontWeight);
    const minimum = size >= 24 || (size >= 18.6666666667 && weight >= 700) ? 3 : 4.5;
    const ratio =
      !limitations.length && foreground
        ? (Math.max(luminance(foreground), luminance(background)) + 0.05) /
          (Math.min(luminance(foreground), luminance(background)) + 0.05)
        : null;
    measurements.push({
      text,
      foreground: style.color,
      background: background ? `rgb(${background.slice(0, 3).join(", ")})` : null,
      ratio,
      minimum,
      status:
        ratio === null ? "inconclusive" : ratio < minimum ? "below-threshold" : "meets-threshold",
      limitations: [...new Set(limitations)],
    });
  }
  return {
    policy:
      "WCAG text thresholds on computed opaque ancestor backgrounds; transparent page defaults to white. Images, gradients, opacity and filters are inconclusive. Overlapping siblings, clipping, pseudo-elements and raster text need manual review. This is diagnostic evidence, not an accessibility certification.",
    measurements,
    belowThreshold: measurements.filter(({ status }) => status === "below-threshold").length,
    inconclusive: measurements.filter(({ status }) => status === "inconclusive").length,
  };
}
