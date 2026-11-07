import { expect, test, type Locator } from "@playwright/test";
import { sourceTemplateRepresentations } from "./source-template-representations";
import { readVisibleTextFragments, visibleTextLineBounds } from "./text-line-geometry";

test.describe.configure({ timeout: 120_000 });
const amounts = ["$198.00", "$16.00", "$0.00", "$214.00"];

async function amountMetrics(locator: Locator) {
  const metrics = await locator.evaluate((element) => {
    const style = getComputedStyle(element);
    const box = element.getBoundingClientRect();
    const family = style.fontFamily.split(",")[0].replace(/["']/g, "").trim();
    return {
      x: box.x,
      y: box.y,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      lineHeight: style.lineHeight,
      letterSpacing: style.letterSpacing,
      loaded: Array.from(element.ownerDocument.fonts).some(
        (face) =>
          face.family.replace(/["']/g, "") === family &&
          face.weight === "500" &&
          face.style === "normal" &&
          face.status === "loaded",
      ),
    };
  });
  const lines = visibleTextLineBounds(await locator.evaluate(readVisibleTextFragments));
  expect(lines).toHaveLength(1);
  const line = lines[0];
  return {
    ...metrics,
    left: metrics.x + line.left,
    right: metrics.x + line.right,
    top: metrics.y + line.top,
    height: line.bottom - line.top,
  };
}

for (const width of [800, 390]) {
  test(`Studio order amount glyphs preserve source typography at ${width}px`, async ({ page }) => {
    const { reference, compiled, roots } = await sourceTemplateRepresentations(
      page,
      "05-Studio",
      "order-confirmation",
      width,
      "$198.00",
    );
    try {
      const original = await Promise.all(
        amounts.map((amount) => amountMetrics(reference.getByText(amount, { exact: true }))),
      );
      for (const root of roots) {
        const actual = await Promise.all(
          amounts.map((amount) => amountMetrics(root.getByText(amount, { exact: true }))),
        );
        for (const [index, expected] of original.entries()) {
          const current = actual[index];
          expect(current.loaded).toBe(true);
          expect(expected.loaded).toBe(true);
          expect(current.fontSize).toBe("15px");
          expect(current.fontWeight).toBe("500");
          expect(current.lineHeight).toBe("24px");
          for (const property of ["fontSize", "fontWeight", "lineHeight", "letterSpacing"] as const)
            expect(current[property]).toBe(expected[property]);
          for (const edge of ["left", "right", "height"] as const)
            expect(current[edge]).toBeCloseTo(expected[edge], 1);
          // Compare the full amount stack independently of the editor's frame origin.
          expect(current.top - actual[0].top).toBeCloseTo(expected.top - original[0].top, 1);
        }
      }
    } finally {
      await reference.close();
      await compiled.close();
    }
  });
}
