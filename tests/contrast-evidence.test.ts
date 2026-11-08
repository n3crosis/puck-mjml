import { Window } from "happy-dom";
import { describe, expect, it } from "vitest";
import { inspectContrast } from "./browser/contrast-evidence";

function evidence(html: string) {
  const window = new Window();
  window.document.body.innerHTML = html;
  const create = window.document.createRange.bind(window.document);
  window.document.createRange = () => {
    const range = create();
    Object.defineProperty(range, "getClientRects", { value: () => [{ width: 100, height: 20 }] });
    return range;
  };
  return inspectContrast(window.document.body as unknown as Element);
}

describe("inventory-wide contrast evidence", () => {
  it("reports low contrast and retains accessible inherited foreground colors", () => {
    const result = evidence(
      '<div style="background-color:rgb(0,0,0);color:rgb(255,255,255);font-size:12px"><span>Readable</span><span style="color:rgb(20,20,20)">Low contrast</span></div>',
    );
    expect(result.measurements[0]).toMatchObject({
      text: "Readable",
      ratio: 21,
      minimum: 4.5,
      status: "meets-threshold",
    });
    expect(result.measurements[1].status).toBe("below-threshold");
    expect(result.belowThreshold).toBe(1);
  });
  it("applies the common large-text threshold without template-specific exceptions", () => {
    const result = evidence(
      '<p style="color:rgb(140,140,140);background-color:rgb(255,255,255);font-size:24px">Large</p>',
    );
    expect(result.measurements[0].minimum).toBe(3);
    expect(result.measurements[0].status).toBe("meets-threshold");
  });
  it("marks image, translucent and filtered backgrounds inconclusive instead of guessing", () => {
    for (const style of [
      "background-image:linear-gradient(red,blue)",
      "opacity:0.5",
      "filter:blur(1px)",
      "background-color:rgba(0,0,0,0.5)",
    ]) {
      const result = evidence(`<p style="color:rgb(0,0,0);${style}">Unknown surface</p>`);
      expect(result.measurements[0]).toMatchObject({ ratio: null, status: "inconclusive" });
      expect(result.inconclusive).toBe(1);
    }
  });
});
