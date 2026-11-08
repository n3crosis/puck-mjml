/** Common, representation-independent evidence. No template names or DOM probes. */
export type Box = { x: number; y: number; width: number; height: number };
export type NavigationEvidence = {
  hasHref: boolean;
  href: string | null;
  destination: string | null;
};
export type SemanticWord = {
  text: string;
  boxes: Box[];
  style: Record<string, string>;
  navigation?: NavigationEvidence | null;
};
export type SemanticDocument = {
  words: SemanticWord[];
  links: {
    text: string;
    href: string;
    hasHref?: boolean;
    destination?: string | null;
    boxes: Box[];
  }[];
  images: {
    src: string;
    alt: string;
    box: Box;
    loaded: boolean;
    navigation?: NavigationEvidence | null;
  }[];
  backgrounds: { image: string; color: string; border: string; box: Box }[];
};

/** Self-contained browser callback. Word ranges survive different HTML wrappers. */
export function inspectSemantics(root: HTMLElement): SemanticDocument {
  const document = root.ownerDocument;
  const view = document.defaultView!;
  const navigation = (node: Element): NavigationEvidence | null => {
    const anchor = node.closest("a");
    if (!anchor) return null;
    const href = anchor.getAttribute("href");
    let destination: string | null = null;
    if (href !== null) {
      try {
        destination = new URL(href, "https://demo.react.email/").href;
      } catch {
        destination = href;
      }
    }
    return { hasHref: anchor.hasAttribute("href"), href, destination };
  };
  const box = (rect: DOMRect): Box => ({
    // Each representation lives in its own matched viewport, including the canvas iframe.
    // Keep authored margins, padding and editor gutters in both axes.
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  });
  const painted = (node: Element, rect: DOMRect) => {
    if (rect.width <= 0 || rect.height <= 0) return false;
    // Exclude fully clipped/transparent content, not partially overflowing glyphs.
    // Retain the original range bounds when any of the fragment is painted.
    let left = rect.left,
      right = rect.right,
      top = rect.top,
      bottom = rect.bottom;
    for (let ancestor: Element | null = node; ancestor; ancestor = ancestor.parentElement) {
      const css = view.getComputedStyle(ancestor);
      if (css.opacity === "0" || css.display === "none" || css.contentVisibility === "hidden")
        return false;
      const bounds = ancestor.getBoundingClientRect();
      if (["hidden", "clip", "scroll", "auto"].includes(css.overflowX)) {
        left = Math.max(left, bounds.left);
        right = Math.min(right, bounds.right);
      }
      if (["hidden", "clip", "scroll", "auto"].includes(css.overflowY)) {
        top = Math.max(top, bounds.top);
        bottom = Math.min(bottom, bounds.bottom);
      }
      if (left >= right || top >= bottom) return false;
    }
    return true;
  };
  const visible = (node: Element) => {
    const style = view.getComputedStyle(node);
    return (
      style.visibility !== "hidden" &&
      style.visibility !== "collapse" &&
      Array.from(node.getClientRects()).some((rect) => painted(node, rect))
    );
  };
  const words: SemanticWord[] = [];
  const walker = document.createTreeWalker(root, view.NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const parent = node.parentElement!;
    if (parent.closest("script,style,noscript") || !visible(parent)) continue;
    const css = view.getComputedStyle(parent);
    // Decoration propagates through inline descendants but is not inherited CSS.
    const decorations = new Set<string>();
    for (let ancestor: Element | null = parent; ancestor; ancestor = ancestor.parentElement) {
      const value = view.getComputedStyle(ancestor).textDecorationLine;
      if (value !== "none") decorations.add(value);
      if (ancestor === root) break;
    }
    const style = {
      fontFamily: css.fontFamily,
      fontSize: css.fontSize,
      fontWeight: css.fontWeight,
      fontStyle: css.fontStyle,
      lineHeight: css.lineHeight,
      letterSpacing: css.letterSpacing,
      color: css.color,
      textTransform: css.textTransform,
      textAlign: css.textAlign,
      textDecoration: [...decorations].sort().join(" ") || "none",
    };
    for (const match of node.data.matchAll(/\S+/gu)) {
      const range = document.createRange();
      range.setStart(node, match.index!);
      range.setEnd(node, match.index! + match[0].length);
      const boxes = Array.from(range.getClientRects())
        .filter((r) => painted(parent, r))
        .map(box);
      if (boxes.length)
        words.push({ text: match[0], boxes, style, navigation: navigation(parent) });
    }
  }
  return {
    words,
    links: Array.from(root.querySelectorAll("a"))
      .filter(visible)
      .map((node) => ({
        text: (node.innerText || node.textContent || "").replace(/\s+/gu, " ").trim(),
        href: node.getAttribute("href") ?? "",
        hasHref: node.hasAttribute("href"),
        destination: navigation(node)?.destination ?? null,
        boxes: Array.from(node.getClientRects(), box),
      })),
    images: Array.from(root.querySelectorAll("img"))
      .filter((node) => visible(node) && (node.hasAttribute("src") || node.hasAttribute("srcset")))
      .map((node) => ({
        src: node.currentSrc || node.src,
        alt: node.alt,
        box: box(node.getBoundingClientRect()),
        loaded: node.complete && node.naturalWidth > 0,
        navigation: navigation(node),
      })),
    backgrounds: [root, ...Array.from(root.querySelectorAll("*"))]
      .filter(visible)
      .filter((node) => {
        const css = view.getComputedStyle(node);
        return (
          css.backgroundImage !== "none" ||
          !["transparent", "rgba(0, 0, 0, 0)"].includes(css.backgroundColor) ||
          [
            css.borderTopStyle,
            css.borderRightStyle,
            css.borderBottomStyle,
            css.borderLeftStyle,
          ].some((style) => !["none", "hidden"].includes(style))
        );
      })
      .map((node) => {
        const css = view.getComputedStyle(node);
        return {
          image: css.backgroundImage,
          color: css.backgroundColor,
          border: [
            css.borderTop,
            css.borderRight,
            css.borderBottom,
            css.borderLeft,
            css.borderRadius,
          ].join(" | "),
          box: box(node.getBoundingClientRect()),
        };
      }),
  };
}

export type ComparisonCapture = {
  representation: string;
  mode: string;
  semantics: SemanticDocument;
  rootBox?: Box;
  issues: { kind: string; evidence: unknown }[];
  aliases?: { family: string; alias: string }[];
};
export type Difference = {
  category: "text" | "style" | "layout" | "link" | "image" | "background";
  path: string;
  before: unknown;
  after: unknown;
};

/** Deterministic LCS alignment; duplicates retain document order, never fuzzy-match. */
export function alignWords(before: string[], after: string[]) {
  const rows = Array.from({ length: before.length + 1 }, () => new Uint32Array(after.length + 1));
  for (let i = before.length - 1; i >= 0; i--)
    for (let j = after.length - 1; j >= 0; j--)
      rows[i]![j] =
        before[i] === after[j]
          ? rows[i + 1]![j + 1]! + 1
          : Math.max(rows[i + 1]![j]!, rows[i]![j + 1]!);
  const matches: [number, number][] = [];
  const removed: number[] = [];
  const added: number[] = [];
  let i = 0,
    j = 0;
  while (i < before.length || j < after.length) {
    if (i < before.length && j < after.length && before[i] === after[j]) matches.push([i++, j++]);
    else if (i < before.length && (j === after.length || rows[i + 1]![j]! >= rows[i]![j + 1]!))
      removed.push(i++);
    else added.push(j++);
  }
  return { matches, removed, added };
}

function canonicalStyle(word: SemanticWord, aliases: ComparisonCapture["aliases"] = []) {
  const style = { ...word.style };
  if (style.fontFamily)
    style.fontFamily = style.fontFamily
      .split(",")
      .map((part) => {
        const family = part
          .trim()
          .replace(/^["']|["']$/g, "")
          .toLowerCase();
        return (
          aliases.find((entry) => entry.alias.toLowerCase() === family)?.family.toLowerCase() ||
          family
        );
      })
      .join(",");
  return style;
}

export function compareRepresentations(before: ComparisonCapture, after: ComparisonCapture) {
  const differences: Difference[] = [];
  const record = (category: Difference["category"], path: string, a: unknown, b: unknown) => {
    if (JSON.stringify(a) !== JSON.stringify(b))
      differences.push({ category, path, before: a, after: b });
  };
  // 1/64 CSS px is Chromium's layout-unit precision, not a visual tolerance.
  const geometry = (boxes: Box[]) =>
    boxes.map((box) =>
      Object.fromEntries(
        Object.entries(box).map(([key, value]) => [key, Math.round(value * 64) / 64]),
      ),
    );
  if (before.rootBox || after.rootBox)
    record(
      "layout",
      "rootBox",
      before.rootBox ? geometry([before.rootBox]) : null,
      after.rootBox ? geometry([after.rootBox]) : null,
    );
  const alignment = alignWords(
    before.semantics.words.map((w) => w.text),
    after.semantics.words.map((w) => w.text),
  );
  for (const index of alignment.removed)
    record("text", `words.before[${index}]`, before.semantics.words[index]!.text, null);
  for (const index of alignment.added)
    record("text", `words.after[${index}]`, null, after.semantics.words[index]!.text);
  for (const [i, j] of alignment.matches) {
    const a = before.semantics.words[i]!,
      b = after.semantics.words[j]!;
    const as = canonicalStyle(a, before.aliases),
      bs = canonicalStyle(b, after.aliases);
    for (const key of new Set([...Object.keys(as), ...Object.keys(bs)]))
      record("style", `words[${i}→${j}].${key}`, as[key], bs[key]);
    record("layout", `words[${i}→${j}].boxes`, geometry(a.boxes), geometry(b.boxes));
    // Navigation is bound to matched content independently of split/merged
    // anchor wrappers; raw ordered anchor evidence is still retained below.
    record(
      "link",
      `words[${i}→${j}].destination`,
      a.navigation?.destination ?? null,
      b.navigation?.destination ?? null,
    );
  }
  // Asset and link inventories are ordered; duplicates are not collapsed into sets.
  for (const kind of ["links", "images", "backgrounds"] as const) {
    const a = before.semantics[kind],
      b = after.semantics[kind];
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const category = kind === "links" ? "link" : kind === "images" ? "image" : "background";
      record(category, `${kind}[${i}]`, a[i] || null, b[i] || null);
    }
  }
  const issues = [before, after].flatMap((capture) =>
    capture.issues.map((issue) => ({ representation: capture.representation, ...issue })),
  );
  return {
    before: before.representation,
    after: after.representation,
    mode: before.mode,
    status: issues.length
      ? "inconclusive"
      : differences.length
        ? "differences"
        : "matching-measurements",
    observedDifferences: differences.length,
    matchedWords: alignment.matches.length,
    counts: Object.fromEntries(
      ["text", "style", "layout", "link", "image", "background"].map((category) => [
        category,
        differences.filter((difference) => difference.category === category).length,
      ]),
    ),
    issues,
    differences,
  };
}

export function compareInventoryCaptures(captures: ComparisonCapture[]) {
  const comparisons = [];
  const missingCaptures = [];
  for (const mode of ["desktop", "mobile"]) {
    const representations = ["react-email", "mjml", "canvas"];
    for (const representation of representations)
      if (!captures.some((c) => c.mode === mode && c.representation === representation))
        missingCaptures.push({ mode, representation });
    for (let i = 0; i < representations.length; i++)
      for (let j = i + 1; j < representations.length; j++) {
        const a = captures.find((c) => c.mode === mode && c.representation === representations[i]);
        const b = captures.find((c) => c.mode === mode && c.representation === representations[j]);
        if (a && b) comparisons.push(compareRepresentations(a, b));
      }
  }
  return {
    schemaVersion: 2,
    status:
      missingCaptures.length || comparisons.some((pair) => pair.status === "inconclusive")
        ? "inconclusive"
        : comparisons.some((pair) => pair.status === "differences")
          ? "differences"
          : "matching-measurements",
    policy: {
      geometryPrecisionCssPx: 1 / 64,
      matching:
        "Case-sensitive ordered word LCS with normalized navigation destinations; ordered image occurrences retain alt and nearest-anchor navigation; raw ordered link/paint inventories; exact computed style values except explicit canvas font aliases.",
      coordinates:
        "Word, asset and root boxes retain matched-viewport coordinates in both axes, including authored margins, padding and canvas gutters.",
      interpretation:
        "An evidence audit, not a pixel or email-client parity gate. Resource failures and overflow make comparisons inconclusive without suppressing observed differences. DOM text-node segmentation and structurally different paint inventories can require manual review.",
    },
    missingCaptures,
    comparisons,
  };
}
