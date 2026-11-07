import { expect, test, type Locator } from "@playwright/test";
import { sourceTemplateRepresentations } from "./source-template-representations";

test.describe.configure({ timeout: 120_000 });
const review =
  "“It's wild how fast Halo on my finger felt like calm help whenever my head was full and my hands were busy.”";

async function rectangle(locator: Locator) {
  return locator.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return { x: box.x, y: box.y, width: box.width, height: box.height, bottom: box.bottom };
  });
}

async function reviewPaint(locator: Locator, radius = 10) {
  return locator.evaluate((element, radius) => {
    for (let ancestor: Element | null = element; ancestor; ancestor = ancestor.parentElement) {
      const style = getComputedStyle(ancestor);
      if (
        style.backgroundColor !== "rgb(240, 240, 240)" ||
        parseFloat(style.borderTopLeftRadius) !== radius
      )
        continue;
      const box = ancestor.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height, bottom: box.bottom };
    }
    throw new Error("Rounded review card background was not found");
  }, radius);
}

const dispatch =
  "After dispatch we can’t edit items, but you can follow or reroute delivery through the carrier’s tools anytime.";

for (const width of [800, 390]) {
  test(`Studio shipping preserves source card, rule, blank line and note rhythm at ${width}px`, async ({
    page,
  }) => {
    const { reference, compiled, roots } = await sourceTemplateRepresentations(
      page,
      "05-Studio",
      "order-shipping",
      width,
      dispatch,
    );
    try {
      const expectedCard = await reviewPaint(
        reference.getByAltText("Halo Ring 1", { exact: true }),
        16,
      );
      const sourceRule = reference.locator('table[style*="border-top-width:1px"]').first();
      const expectedRule = await rectangle(sourceRule);
      const blank = await rectangle(sourceRule.locator("td").first());
      expect(blank.height).toBe(20);
      const expectedNote = await rectangle(reference.getByText(dispatch, { exact: true }));
      const expectedFaq = await rectangle(reference.getByText("Common questions", { exact: true }));
      expect(expectedRule.y - expectedCard.bottom).toBe(48);
      expect(expectedNote.y - expectedRule.y).toBe(45);
      for (const root of roots) {
        const card = await reviewPaint(root.getByAltText("Halo Ring 1", { exact: true }), 16);
        const rule = await rectangle(
          root.locator(".studio-dispatch-divider p, .studio-dispatch-divider hr"),
        );
        const line = await rectangle(root.locator(".studio-dispatch-line"));
        const note = await rectangle(root.getByText(dispatch, { exact: true }));
        const faq = await rectangle(root.getByText("Common questions", { exact: true }));
        for (const dimension of ["x", "width", "height"] as const)
          expect(card[dimension]).toBeCloseTo(expectedCard[dimension], 1);
        expect(line.height).toBe(20);
        expect(rule.x).toBeCloseTo(expectedRule.x, 1);
        expect(rule.width).toBeCloseTo(expectedRule.width, 1);
        expect(rule.y - card.bottom).toBeCloseTo(expectedRule.y - expectedCard.bottom, 1);
        expect(note.y - rule.y).toBeCloseTo(expectedNote.y - expectedRule.y, 1);
        expect(note.y - card.bottom).toBeCloseTo(expectedNote.y - expectedCard.bottom, 1);
        expect(faq.y - card.bottom).toBeCloseTo(expectedFaq.y - expectedCard.bottom, 1);
        // The later FAQ border keeps its own48px upper gap and49px border-to-copy distance.
        const faqRule = await rectangle(
          root.locator(".studio-faq-divider p, .studio-faq-divider hr"),
        );
        expect(faqRule.y - note.bottom).toBeCloseTo(48, 1);
        expect(faq.y - faqRule.y).toBeCloseTo(49, 1);
      }
    } finally {
      await reference.close();
      await compiled.close();
    }
  });
  test(`Studio promo review paint and quote preserve separate source insets at ${width}px`, async ({
    page,
  }) => {
    const { reference, compiled, roots } = await sourceTemplateRepresentations(
      page,
      "05-Studio",
      "promo",
      width,
      review,
    );
    try {
      const originalQuote = reference.getByText(review, { exact: true });
      const expectedPaint = await reviewPaint(originalQuote);
      const expectedQuote = await rectangle(originalQuote);
      expect(expectedPaint.x).toBe(width === 390 ? 32 : 112);
      expect(expectedPaint.width).toBe(width === 390 ? 326 : 576);
      expect(expectedQuote.x).toBe(width === 390 ? 48 : 160);
      for (const root of roots) {
        const quote = root.getByText(review, { exact: true });
        const paint = await reviewPaint(quote);
        const bounds = await rectangle(quote);
        for (const dimension of ["x", "width", "height"] as const) {
          expect(paint[dimension]).toBeCloseTo(expectedPaint[dimension], 1);
          expect(bounds[dimension]).toBeCloseTo(expectedQuote[dimension], 1);
        }
        expect(bounds.y - paint.y).toBeCloseTo(expectedQuote.y - expectedPaint.y, 1);
      }
    } finally {
      await reference.close();
      await compiled.close();
    }
  });
}
