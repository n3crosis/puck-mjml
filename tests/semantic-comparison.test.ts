import { describe, expect, it } from "vitest";
import {
  alignWords,
  compareInventoryCaptures,
  compareRepresentations,
  type ComparisonCapture,
  type SemanticWord,
} from "./browser/semantic-comparison";

const word = (text: string, x = 0): SemanticWord => ({
  text,
  boxes: [{ x, y: 0, width: 10, height: 20 }],
  style: { fontFamily: "Arial", fontSize: "16px", textDecoration: "none" },
});
function capture(words = [word("Hello")], representation = "react-email"): ComparisonCapture {
  return {
    representation,
    mode: "desktop",
    issues: [],
    semantics: { words, links: [], images: [], backgrounds: [] },
  };
}

describe("generic three-representation comparison", () => {
  it("aligns duplicates in document order and preserves missing, added and reordered content", () => {
    expect(alignWords(["one", "one", "two"], ["one", "two", "three"])).toEqual({
      matches: [
        [0, 0],
        [2, 1],
      ],
      removed: [1],
      added: [2],
    });
    const result = compareRepresentations(
      capture([word("A"), word("B")]),
      capture([word("B"), word("A")]),
    );
    expect(result.counts.text).toBe(2);
    expect(result.status).toBe("differences");
  });

  it("records style, word wrapping and geometry independently without template exceptions", () => {
    const source = capture();
    const target = capture([word("Hello", 1)], "canvas");
    target.semantics.words[0]!.style.textDecoration = "underline";
    target.semantics.words[0]!.boxes.push({ x: 0, y: 20, width: 5, height: 20 });
    const result = compareRepresentations(source, target);
    expect(result.counts.style).toBe(1);
    expect(result.counts.layout).toBe(1);
    expect(result.counts.text).toBe(0);
    expect(result.differences[0]!.path).toContain("textDecoration");
  });

  it("normalizes only explicitly recorded canvas font aliases, not arbitrary font differences", () => {
    const source = capture();
    const target = capture([word("Hello")], "canvas");
    target.semantics.words[0]!.style.fontFamily = '"Arial-pm-canvas-test"';
    target.aliases = [{ family: "Arial", alias: "Arial-pm-canvas-test" }];
    expect(compareRepresentations(source, target).status).toBe("matching-measurements");
    target.aliases = [];
    expect(compareRepresentations(source, target).counts.style).toBe(1);
  });

  it("reports link destinations, duplicate assets, broken images and paint differences", () => {
    const source = capture(),
      target = capture();
    const box = { x: 0, y: 0, width: 100, height: 40 };
    source.semantics.images = [
      { src: "https://example.com/a.png", alt: "Logo", box, loaded: true },
    ];
    target.semantics.images = [...source.semantics.images, ...source.semantics.images];
    source.semantics.links = [{ text: "Hello", href: "/old", boxes: [box] }];
    target.semantics.links = [{ text: "Hello", href: "/new", boxes: [box] }];
    target.semantics.backgrounds = [{ image: "none", color: "rgb(0, 0, 0)", border: "none", box }];
    const result = compareRepresentations(source, target);
    expect(result.counts.image).toBe(1);
    expect(result.counts.link).toBe(1);
    expect(result.counts.background).toBe(1);
  });

  it("never labels identical fallback rendering as parity when references failed or overflowed", () => {
    for (const kind of ["font-transport", "unloaded-images", "document-overflow"]) {
      const source = capture();
      source.issues = [{ kind, evidence: kind === "document-overflow" ? 210 : "HTTP 404" }];
      const result = compareRepresentations(source, capture());
      expect(result.status).toBe("inconclusive");
      expect(result.issues[0]!.kind).toBe(kind);
      expect(result.observedDifferences).toBe(0);
    }
  });

  it("keeps real differences visible even when resources make the outcome inconclusive", () => {
    const source = capture();
    source.issues = [{ kind: "font-transport", evidence: "404" }];
    const result = compareRepresentations(source, capture([word("Changed")]));
    expect(result.status).toBe("inconclusive");
    expect(result.counts.text).toBe(2);
    expect(result.differences).toHaveLength(2);
  });

  it("always schedules all three pairs at both widths and reports incomplete captures", () => {
    const captures = ["desktop", "mobile"].flatMap((mode) =>
      ["react-email", "mjml", "canvas"].map((representation) => ({
        ...capture(undefined, representation),
        mode,
      })),
    );
    const result = compareInventoryCaptures(captures);
    expect(result.comparisons).toHaveLength(6);
    expect(result.missingCaptures).toEqual([]);
    const incomplete = compareInventoryCaptures(captures.slice(0, -1));
    expect(incomplete.missingCaptures).toEqual([{ mode: "mobile", representation: "canvas" }]);
    expect(incomplete.comparisons).toHaveLength(4);
  });

  it("does not silently tolerate multi-pixel offsets", () => {
    expect(compareRepresentations(capture(), capture([word("Hello", 0.02)])).counts.layout).toBe(1);
    expect(compareRepresentations(capture(), capture([word("Hello", 20)])).counts.layout).toBe(1);
  });
});
