export type SourceRect = { x: number; y: number; width: number; height: number };
export type SourcePoint = SourceRect & {
  text: string;
  occurrence: number;
  kind: "text" | "button";
  node: {
    tagName: string;
    className: string;
    html: string;
    box: SourceRect;
    style: Record<string, string>;
  };
  rawRects: SourceRect[];
  lines: SourceRect[];
  textNodes: {
    text: string;
    style: Record<string, string>;
    rawRects: SourceRect[];
    segments: { start: number; end: number; text: string; rects: SourceRect[] }[];
  }[];
};
export type PaperGeometry = { targets: string[]; points: SourcePoint[] };

/** Self-contained: executed in the actual original, compiled or editor document. */
export function measurePaperSourceGeometry(element: Element): PaperGeometry {
  const document = element.ownerDocument;
  const view = document.defaultView!;
  const normalize = (text: string | null | undefined) =>
    (text ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  const renderedText = (node: Element) => {
    const clone = node.cloneNode(true) as Element;
    clone.querySelectorAll("br").forEach((br) => br.replaceWith(" "));
    return normalize(clone.textContent);
  };
  const targets = [
    "Papermark",
    "2024 in review",
    "Your Year with Papermark",
    "Viewers spent",
    "Your activity",
    "You uploaded",
    "25",
    "documents",
    "Your top document",
    "Your most active month",
    "September",
    "You're in the top",
    "95%",
    "of sharers on Papermark",
    "Your documents were viewed from",
    "Your documents get attention from all over the world!",
    "We're excited to support you next year! Happy Holidays from the Papermark team :)",
    "Share your stats",
    "Go to your dashboard",
  ];
  const offset = element.matches(".pm-canvas") ? element.getBoundingClientRect() : { x: 0, y: 0 };
  const rectangle = (bounds: SourceRect): SourceRect => ({
    x: bounds.x - offset.x,
    y: bounds.y - offset.y,
    width: bounds.width,
    height: bounds.height,
  });
  const styleOf = (node: Element) => {
    const css = view.getComputedStyle(node);
    return Object.fromEntries(
      [
        "font-family",
        "font-size",
        "font-weight",
        "line-height",
        "letter-spacing",
        "white-space",
        "text-align",
        "padding-top",
        "padding-right",
        "padding-bottom",
        "padding-left",
        "display",
        "color",
      ].map((property) => [property, css.getPropertyValue(property)]),
    );
  };
  const candidates = Array.from(element.querySelectorAll("p,h1,h2,a,div,.pm-button"));
  const textByNode = new Map(candidates.map((node) => [node, renderedText(node)]));
  const points = targets.flatMap((text) => {
    const matching = candidates.filter(
      (node) => textByNode.get(node) === normalize(text) && node.getBoundingClientRect().height > 0,
    );
    const leaves = matching.filter(
      (node) => !matching.some((child) => child !== node && node.contains(child)),
    );
    return leaves.flatMap((node, occurrence): SourcePoint[] => {
      const range = document.createRange();
      range.selectNodeContents(node);
      const rawRects = Array.from(range.getClientRects(), rectangle);
      const textNodes: SourcePoint["textNodes"] = [];
      const glyphs: SourceRect[] = [];
      const walker = document.createTreeWalker(node, view.NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const child = walker.currentNode;
        const value = child.textContent ?? "";
        const parent = child.parentElement;
        if (!value || !parent || parent.closest("style,script")) continue;
        const style = styleOf(parent);
        range.selectNodeContents(child);
        const raw = Array.from(range.getClientRects(), rectangle);
        // Normal/nowrap/pre-line collapse ASCII spaces; pre-wrap hangs them at
        // line ends. Those blank rectangles are not glyphs. Preserve pre,
        // break-spaces, unknown modes and NBSP/other Unicode spacing characters.
        const offsets = ["normal", "nowrap", "pre-line", "pre-wrap"].includes(style["white-space"])
          ? Array.from(value.matchAll(/[^ \t\n\f\r]+/g), (match) => ({
              start: match.index!,
              end: match.index! + match[0].length,
            }))
          : [{ start: 0, end: value.length }];
        const segments = offsets.map(({ start, end }) => {
          range.setStart(child, start);
          range.setEnd(child, end);
          const rects = Array.from(range.getClientRects(), rectangle).filter(
            (bounds) => bounds.width > 0 && bounds.height > 0,
          );
          glyphs.push(...rects);
          return { start, end, text: value.slice(start, end), rects };
        });
        textNodes.push({ text: value, style, rawRects: raw, segments });
      }
      const lineMap = new Map<string, SourceRect>();
      for (const bounds of glyphs) {
        const key = `${bounds.y}:${bounds.height}`;
        const prior = lineMap.get(key);
        const x = Math.min(prior?.x ?? bounds.x, bounds.x);
        const right = Math.max(
          prior ? prior.x + prior.width : bounds.x + bounds.width,
          bounds.x + bounds.width,
        );
        lineMap.set(key, { x, y: bounds.y, width: right - x, height: bounds.height });
      }
      const lines = Array.from(lineMap.values()).sort((a, b) => a.y - b.y || a.x - b.x);
      if (!lines.length) return [];
      const x = Math.min(...lines.map((bounds) => bounds.x));
      const y = Math.min(...lines.map((bounds) => bounds.y));
      const details = {
        text,
        occurrence,
        node: {
          tagName: node.tagName,
          className: node.className,
          html: node.innerHTML,
          box: rectangle(node.getBoundingClientRect()),
          style: styleOf(node),
        },
        rawRects,
        lines,
        textNodes,
      };
      const result: SourcePoint[] = [
        {
          ...details,
          kind: "text",
          x,
          y,
          width: Math.max(...lines.map((bounds) => bounds.x + bounds.width)) - x,
          height: Math.max(...lines.map((bounds) => bounds.y + bounds.height)) - y,
        },
      ];
      if (text === "Share your stats")
        result.push({ ...details, kind: "button", ...rectangle(node.getBoundingClientRect()) });
      return result;
    });
  });
  return { targets, points };
}

/** Report every discrepancy; never let a first mismatch hide another target. */
export function paperGeometryDifferences(
  source: PaperGeometry,
  actual: PaperGeometry,
  label: string,
  tolerance = 1,
): string[] {
  const failures: string[] = [];
  const key = (point: Pick<SourcePoint, "text" | "occurrence" | "kind">) =>
    `${point.text} #${point.occurrence} ${point.kind}`;
  for (const target of source.targets) {
    const expected = target === "Share your stats" ? 2 : 1;
    for (const [name, geometry] of [
      ["original", source],
      [label, actual],
    ] as const) {
      const count = geometry.points.filter(
        (point) => point.text === target && point.kind === "text",
      ).length;
      if (count !== expected)
        failures.push(`${name}: ${target} text occurrences ${count}, expected ${expected}`);
    }
  }
  for (const [name, geometry] of [
    ["original", source],
    [label, actual],
  ] as const) {
    const count = geometry.points.filter((point) => point.kind === "button").length;
    if (count !== 2) failures.push(`${name}: button surfaces ${count}, expected 2`);
  }
  const expected = new Map(source.points.map((point) => [key(point), point]));
  const found = new Map(actual.points.map((point) => [key(point), point]));
  for (const [identity, point] of expected) {
    const other = found.get(identity);
    if (!other) {
      failures.push(`${label}: missing ${identity}`);
      continue;
    }
    for (const field of ["x", "y", "width", "height"] as const) {
      const difference = Math.abs(point[field] - other[field]);
      if (!Number.isFinite(difference) || difference > tolerance)
        failures.push(
          `${label}: ${identity} ${field}: original ${point[field]}, actual ${other[field]}, delta ${difference}`,
        );
    }
    if (point.kind !== "text") continue;
    if (point.lines.length !== other.lines.length)
      failures.push(
        `${label}: ${identity} line count ${other.lines.length}, original ${point.lines.length}`,
      );
    for (let i = 0; i < Math.min(point.lines.length, other.lines.length); i++)
      for (const field of ["x", "y", "width", "height"] as const) {
        const difference = Math.abs(point.lines[i][field] - other.lines[i][field]);
        if (!Number.isFinite(difference) || difference > tolerance)
          failures.push(
            `${label}: ${identity} line ${i} ${field}: original ${point.lines[i][field]}, actual ${other.lines[i][field]}, delta ${difference}`,
          );
      }
  }
  for (const identity of found.keys())
    if (!expected.has(identity)) failures.push(`${label}: unexpected ${identity}`);
  return failures;
}
