import { expect, test, type Locator } from "@playwright/test";
import { sourceTemplateRepresentations } from "./source-template-representations";

test.describe.configure({ timeout: 120_000 });
const copy =
  "Bring your team, tools, and workflows together in one place—with permissions that match how you work.";

async function rectangle(locator: Locator) {
  return locator.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return { x: box.x, y: box.y, width: box.width, height: box.height };
  });
}

for (const width of [800, 390]) {
  test(`Barebone welcome circle rows retain source cumulative height at ${width}px`, async ({
    page,
  }) => {
    const { reference, compiled, roots } = await sourceTemplateRepresentations(
      page,
      "01-Barebone",
      "welcome",
      width,
      "Getting started",
    );
    try {
      const originalCircles = reference.locator(
        'span[style*="border-radius:9999px"][style*="width:1.5rem"]',
      );
      await expect(originalCircles).toHaveCount(4);
      const anchor = await rectangle(reference.getByText("Getting started", { exact: true }));
      const after = await rectangle(reference.getByText("Some new things", { exact: true }));
      const expectedCopy = reference.getByText(copy, { exact: true });
      await expect(expectedCopy).toHaveCount(4);
      for (const root of roots) {
        const circles = root.locator(".bare-bullet-circle p");
        await expect(circles).toHaveCount(4);
        const currentAnchor = await rectangle(root.getByText("Getting started", { exact: true }));
        const currentAfter = await rectangle(root.getByText("Some new things", { exact: true }));
        expect(currentAfter.y - currentAnchor.y).toBeCloseTo(after.y - anchor.y, 1);
        const actualCopy = root.getByText(copy, { exact: true });
        await expect(actualCopy).toHaveCount(4);
        for (let index = 0; index < 4; index++) {
          const originalCircle = await rectangle(originalCircles.nth(index));
          const circle = await rectangle(circles.nth(index));
          expect(originalCircle.width).toBe(26);
          expect(originalCircle.height).toBe(26);
          for (const property of ["x", "width", "height"] as const)
            expect(circle[property]).toBeCloseTo(originalCircle[property], 1);
          expect(circle.y - currentAnchor.y).toBeCloseTo(originalCircle.y - anchor.y, 1);
          const originalText = await rectangle(expectedCopy.nth(index));
          const actualText = await rectangle(actualCopy.nth(index));
          for (const property of ["x", "width", "height"] as const)
            expect(actualText[property]).toBeCloseTo(originalText[property], 1);
          expect(actualText.y - currentAnchor.y).toBeCloseTo(originalText.y - anchor.y, 1);
        }
      }
    } finally {
      await reference.close();
      await compiled.close();
    }
  });
}
