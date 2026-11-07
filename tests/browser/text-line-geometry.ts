export type TextFragment = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

/** Self-contained for locator.evaluate. Select ink-bearing word ranges, not a
 * whole paragraph: pre-wrap adds separate rectangles for hanging wrap spaces.
 * Internal spaces still contribute to the distance between a line's edges. */
export function readVisibleTextFragments(element: HTMLElement): TextFragment[] {
  const document = element.ownerDocument;
  const origin = element.getBoundingClientRect();
  const walker = document.createTreeWalker(element, 4 /* NodeFilter.SHOW_TEXT */);
  const range = document.createRange();
  const fragments: TextFragment[] = [];
  let text: Node | null;
  while ((text = walker.nextNode())) {
    for (const match of (text.textContent ?? "").matchAll(/\S+/gu)) {
      range.setStart(text, match.index);
      range.setEnd(text, match.index + match[0].length);
      for (const rectangle of Array.from(range.getClientRects())) {
        if (rectangle.width <= 0 || rectangle.height <= 0) continue;
        fragments.push({
          left: rectangle.left - origin.left,
          right: rectangle.right - origin.left,
          top: rectangle.top - origin.top,
          bottom: rectangle.bottom - origin.top,
        });
      }
    }
  }
  return fragments;
}

/** Union fragments that occupy the same visual line, independent of inline
 * element or text-node boundaries. Adjacent text lines must remain distinct. */
export function visibleTextLineBounds(fragments: TextFragment[]): TextFragment[] {
  const lines: TextFragment[] = [];
  for (const fragment of [...fragments].sort((a, b) => a.top - b.top || a.left - b.left)) {
    const line = lines.find((candidate) => {
      const overlap =
        Math.min(candidate.bottom, fragment.bottom) - Math.max(candidate.top, fragment.top);
      const height = Math.min(candidate.bottom - candidate.top, fragment.bottom - fragment.top);
      return overlap > height / 2;
    });
    if (line) {
      line.left = Math.min(line.left, fragment.left);
      line.right = Math.max(line.right, fragment.right);
      line.top = Math.min(line.top, fragment.top);
      line.bottom = Math.max(line.bottom, fragment.bottom);
    } else {
      lines.push({ ...fragment });
    }
  }
  return lines;
}
