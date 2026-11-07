import { describe, expect, it } from "vitest";
import {
  canvasOverflowFailures,
  canvasScreenshotBounds,
  type CanvasGeometry,
} from "../../tests/browser/template-overflow";

function codePen(): CanvasGeometry {
  return {
    viewport: 800,
    documentOverflow: 0,
    canvas: { x: 0, y: 34, width: 800, height: 3071, scrollOverflow: 0 },
    email: { x: 76, y: 34, width: 648, height: 3070.34375 },
    boxes: [
      {
        label: "div.pm-section.pm-native-full-width",
        x: 0,
        y: 34,
        width: 800,
        height: 201.421875,
        fullWidth: true,
        scrollOverflow: 0,
      },
      {
        label: "div.pm-native-layout-content",
        x: 76,
        y: 34,
        width: 648,
        height: 201.421875,
        fullWidth: false,
        scrollOverflow: 0,
      },
      {
        label: "img",
        x: 100,
        y: 34,
        width: 600,
        height: 171.421875,
        fullWidth: false,
        scrollOverflow: 0,
      },
    ],
    text: [
      { label: "This week: #CodePenChallenge: Cubes", x: 106, y: 315, width: 588, height: 80 },
    ],
  };
}

describe("canvas overflow evidence", () => {
  it("keeps the proven CodePen background bleed while recording an 800px crop and 648px email", () => {
    const geometry = codePen();
    expect(canvasOverflowFailures(geometry)).toEqual([]);
    expect(canvasScreenshotBounds(geometry)).toEqual({ x: 0, y: 34, width: 800, height: 3071 });
    expect(geometry.email.width).toBe(648);
  });
  it("does not exempt an image inside the full-width section from email bounds", () => {
    const geometry = codePen();
    geometry.boxes[2].width = 640;
    expect(canvasOverflowFailures(geometry)).toContain("img outside email");
  });
  it("detects rendered text outside the email even when its element still fits", () => {
    const geometry = codePen();
    geometry.text[0].width = 650;
    expect(canvasOverflowFailures(geometry)).toContain(
      "text outside email: This week: #CodePenChallenge: Cubes",
    );
  });
  it("does not accept a normal element masquerading as background bleed", () => {
    const geometry = codePen();
    geometry.boxes[0].fullWidth = false;
    expect(canvasOverflowFailures(geometry)).toContain(
      "div.pm-section.pm-native-full-width outside email",
    );
    expect(canvasScreenshotBounds(geometry).width).toBe(648);
  });
  it("rejects a full-width surface or document that spills past the canvas", () => {
    const geometry = codePen();
    geometry.boxes[0].width = 820;
    geometry.documentOverflow = 20;
    geometry.canvas.scrollOverflow = 20;
    expect(canvasOverflowFailures(geometry)).toEqual(
      expect.arrayContaining([
        "document scroll overflow",
        "canvas scroll overflow",
        "div.pm-section.pm-native-full-width outside canvas",
        "div.pm-section.pm-native-full-width does not match full canvas width",
      ]),
    );
  });
  it("retains the email crop when no full-width surface is present", () => {
    const geometry = codePen();
    geometry.boxes.shift();
    expect(canvasScreenshotBounds(geometry)).toEqual({ x: 76, y: 34, width: 648, height: 3071 });
  });
});
