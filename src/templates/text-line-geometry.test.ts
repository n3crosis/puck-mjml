import { Window } from "happy-dom";
import { describe, expect, it, vi } from "vitest";
import {
  readVisibleTextFragments,
  visibleTextLineBounds,
} from "../../tests/browser/text-line-geometry";

describe("visible glyph-line evidence", () => {
  it("does not request rectangles for spaces, line breaks or inline-wrapper boundaries", () => {
    const window = new Window();
    const document = window.document;
    document.body.innerHTML = "<p>Alpha <strong>Beta</strong>\n Gamma </p>";
    const root = document.querySelector("p")!;
    Object.defineProperty(root, "getBoundingClientRect", {
      value: () => ({ left: 100, top: 200 }),
    });
    const range = document.createRange();
    const selected: string[] = [];
    Object.defineProperty(range, "getClientRects", {
      value: () => {
        const text = range.toString();
        selected.push(text);
        return [
          {
            left: 110,
            right: 110 + text.length * 10,
            top: 202,
            bottom: 219,
            width: text.length * 10,
            height: 17,
          },
        ];
      },
    });
    vi.spyOn(document, "createRange").mockReturnValue(range);
    const fragments = readVisibleTextFragments(root as unknown as HTMLElement);
    expect(selected).toEqual(["Alpha", "Beta", "Gamma"]);
    expect(fragments).toEqual([
      { left: 10, right: 60, top: 2, bottom: 19 },
      { left: 10, right: 50, top: 2, bottom: 19 },
      { left: 10, right: 60, top: 2, bottom: 19 },
    ]);
  });

  it("unions inline fragments without losing inter-word space or real line wrapping", () => {
    const fragments = [
      { left: 40, right: 90, top: 24.4, bottom: 41.4 },
      { left: 25, right: 75, top: 2, bottom: 19 },
      { left: 80, right: 125, top: 2, bottom: 19 },
      { left: 95, right: 110, top: 24.4, bottom: 41.4 },
    ];
    expect(visibleTextLineBounds(fragments)).toEqual([
      { left: 25, right: 125, top: 2, bottom: 19 },
      { left: 40, right: 110, top: 24.4, bottom: 41.4 },
    ]);
    expect(fragments[0].right).toBe(90);
  });

  it("keeps small font-metric differences visible rather than accepting only line counts", () => {
    const original = [{ left: 0.4453125, right: 429.5546875, top: 2, bottom: 19 }];
    const changed = [{ ...original[0], left: 1.4453125, right: 428.5546875 }];
    expect(visibleTextLineBounds(original)).not.toEqual(visibleTextLineBounds(changed));
  });

  it("supports wrapped words represented by more than one rectangle", () => {
    expect(
      visibleTextLineBounds([
        { left: 0, right: 100, top: 0, bottom: 17 },
        { left: 0, right: 30, top: 22.4, bottom: 39.4 },
      ]),
    ).toHaveLength(2);
  });
});
