// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  measurePaperSourceGeometry,
  paperGeometryDifferences,
  type PaperGeometry,
  type SourcePoint,
  type SourceRect,
} from "../../tests/browser/community-source-geometry";

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

function headingFixture(whiteSpace: string, text = "Your Year with Papermark") {
  document.body.innerHTML = `<h1 style="font:500 36px/45px system-ui;white-space:${whiteSpace}">${text}</h1>`;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
    new DOMRect(40, 156, 310, 90),
  );
  const raw = [
    new DOMRect(68.828125, 158, 252.34375, 41),
    new DOMRect(321.171875, 158, 11.453125, 41),
    new DOMRect(97.9375, 203, 194.109375, 41),
  ];
  const words = new Map([
    ["0:4", new DOMRect(68.828125, 158, 80, 41)],
    ["5:9", new DOMRect(160, 158, 70, 41)],
    ["10:14", new DOMRect(240, 158, 81.171875, 41)],
    ["15:24", new DOMRect(97.9375, 203, 194.109375, 41)],
  ]);
  vi.spyOn(Range.prototype, "getClientRects").mockImplementation(function (this: Range) {
    const word =
      this.startContainer.nodeType === Node.TEXT_NODE
        ? words.get(`${this.startOffset}:${this.endOffset}`)
        : undefined;
    const rects = word ? [word] : raw;
    return Object.assign(rects, {
      item: (index: number) => rects[index] ?? null,
    }) as unknown as DOMRectList;
  });
  return measurePaperSourceGeometry(document.body);
}

function point(
  text: string,
  occurrence: number,
  kind: "text" | "button",
  rect: SourceRect,
): SourcePoint {
  return {
    text,
    occurrence,
    kind,
    ...rect,
    node: {
      tagName: kind === "button" ? "SPAN" : "H1",
      className: "",
      html: text,
      box: rect,
      style: {},
    },
    rawRects: [rect],
    lines: [rect],
    textNodes: [],
  };
}
function completeFixture(): PaperGeometry {
  const heading = { x: 68.828125, y: 158, width: 252.34375, height: 86 };
  return {
    targets: ["Your Year with Papermark", "Share your stats"],
    points: [
      point("Your Year with Papermark", 0, "text", heading),
      ...[0, 1].flatMap((occurrence) => [
        point("Share your stats", occurrence, "text", {
          x: 129.609375,
          y: 440 + occurrence * 100,
          width: 130.765625,
          height: 16,
        }),
        point("Share your stats", occurrence, "button", {
          x: 81.609375,
          y: 422 + occurrence * 100,
          width: 226.765625,
          height: 52,
        }),
      ]),
    ],
  };
}

describe("Papermark source geometry evidence", () => {
  it.each(["normal", "nowrap", "pre-line", "pre-wrap"])(
    "retains raw hanging rectangles but measures visible lines for %s",
    (mode) => {
      const geometry = headingFixture(mode);
      const heading = geometry.points[0];
      expect(heading.rawRects).toHaveLength(3);
      expect(heading.rawRects[1].width).toBe(11.453125);
      expect(heading.lines).toEqual([
        { x: 68.828125, y: 158, width: 252.34375, height: 41 },
        { x: 97.9375, y: 203, width: 194.109375, height: 41 },
      ]);
      expect(heading.width).toBe(252.34375);
      expect(heading.height).toBe(86);
      expect(heading.textNodes[0].segments.map(({ text }) => text)).toEqual([
        "Your",
        "Year",
        "with",
        "Papermark",
      ]);
    },
  );
  it.each(["pre", "break-spaces"])("does not erase preserved whitespace under %s", (mode) => {
    const heading = headingFixture(mode).points[0];
    expect(heading.textNodes[0].segments).toHaveLength(1);
    expect(heading.width).toBe(263.796875);
  });
  it("retains NBSP in a measured text segment", () => {
    const heading = headingFixture("pre-wrap", "Your Year with\u00a0Papermark").points[0];
    expect(heading.textNodes[0].segments.map(({ text }) => text)).toEqual([
      "Your",
      "Year",
      "with\u00a0Papermark",
    ]);
  });
  it("reports every real target/line/button difference rather than stopping at the first", () => {
    const source = completeFixture(),
      actual = structuredClone(source);
    actual.points[0].width += 2;
    actual.points[0].lines[0].width += 3;
    actual.points[2].x += 48;
    actual.points[3].y += 5;
    const failures = paperGeometryDifferences(source, actual, "Mobile canvas");
    expect(failures).toHaveLength(4);
    expect(failures.join("\n")).toContain("text width:");
    expect(failures.join("\n")).toContain("line 0 width:");
    expect(failures.join("\n")).toContain("#0 button x:");
    expect(failures.join("\n")).toContain("#1 text y:");
  });
  it("retains the strict 1px limit and requires both button labels and surfaces", () => {
    const source = completeFixture(),
      actual = structuredClone(source);
    actual.points[0].width += 1.01;
    actual.points.splice(3, 2);
    const failures = paperGeometryDifferences(source, actual, "Mobile canvas");
    expect(failures.join("\n")).toContain("delta 1.009");
    expect(failures.join("\n")).toContain("text occurrences 1, expected 2");
    expect(failures.join("\n")).toContain("button surfaces 1, expected 2");
    expect(failures.join("\n")).toContain("missing Share your stats #1 text");
    expect(failures.join("\n")).toContain("missing Share your stats #1 button");
  });
  it("keeps raw-space evidence without changing a passing visible comparison", () => {
    const source = completeFixture(),
      actual = structuredClone(source);
    actual.points[0].rawRects.push({ x: 321.171875, y: 158, width: 11.453125, height: 41 });
    expect(paperGeometryDifferences(source, actual, "Mobile canvas")).toEqual([]);
  });
});
