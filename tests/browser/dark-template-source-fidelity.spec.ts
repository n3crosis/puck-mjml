import { readFileSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { inspectArtwork } from "./artwork-evidence";
import { waitForCanvasFontCss } from "./font-evidence";
import { loadReactEmailReference } from "./reference-document";

test.describe.configure({ timeout: 120_000 });

async function box(locator: Locator) {
  return locator.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return {
      x: bounds.x,
      y: bounds.y,
      right: bounds.right,
      bottom: bounds.bottom,
      width: bounds.width,
      height: bounds.height,
    };
  });
}
async function textStartX(locator: Locator) {
  return locator.evaluate((element) => {
    const document = element.ownerDocument;
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let text: Node | null;
    while ((text = walker.nextNode())) {
      const index = (text.textContent ?? "").search(/\S/);
      if (index < 0) continue;
      const range = document.createRange();
      range.setStart(text, index);
      range.setEnd(text, index + 1);
      return range.getBoundingClientRect().x;
    }
    throw new Error("Expected a visible text label");
  });
}
async function representations(page: Page, template: string, width: number, readyText: string) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/");
  await page.getByRole("combobox", { name: "Email template" }).selectOption(template.toLowerCase());
  await page.getByRole("button", { name: "Preview email" }).click();
  const dialog = page.getByRole("dialog", { name: "Email preview" });
  await expect(dialog).toBeVisible();
  await expect(
    page.frameLocator('iframe[title="Rendered email"]').getByText(readyText, { exact: true }),
  ).toBeAttached();
  const html = await page
    .locator('iframe[title="Rendered email"]')
    .evaluate((iframe: HTMLIFrameElement) => iframe.srcdoc);
  await dialog.getByRole("button", { name: "Close preview" }).click();
  await expect(dialog).toBeHidden();
  const control = page.getByRole("button", {
    name: `Switch to ${width === 390 ? "Mobile" : "Desktop"} viewport`,
  });
  if (await control.isEnabled()) await control.click();
  const frame = page.frameLocator("#preview-frame");
  await expect
    .poll(() =>
      frame.locator("html").evaluate((element) => element.ownerDocument.defaultView!.innerWidth),
    )
    .toBe(width);
  const canvas = frame.locator(".pm-email");
  await waitForCanvasFontCss(canvas);
  await canvas.evaluate(inspectArtwork, { decode: true });
  const reference = await page.context().newPage();
  const compiled = await page.context().newPage();
  await reference.setViewportSize({ width, height: 900 });
  await compiled.setViewportSize({ width, height: 900 });
  await loadReactEmailReference(
    reference,
    readFileSync(
      new URL(`../fixtures/react-email-reference/${template}.html`, import.meta.url),
      "utf8",
    ),
  );
  // Preserve the pinned original including its broken Inter400. Spacing below
  // is measured relative to adjacent content, independent of changed wrapping.
  await reference.locator("body").evaluate(async (body) => {
    await body.ownerDocument.fonts.ready;
    await Promise.all(Array.from(body.querySelectorAll("img"), (image) => image.decode()));
  });
  expect(
    await reference.locator("body").evaluate((body) =>
      Array.from(body.ownerDocument.fonts)
        .filter(
          (face) =>
            face.status === "error" &&
            !(face.family.replace(/["']/g, "") === "Inter" && face.weight === "400"),
        )
        .map((face) => `${face.family} ${face.weight}`),
    ),
  ).toEqual([]);
  await compiled.setContent(html, { waitUntil: "load" });
  await compiled.locator("body").evaluate(inspectArtwork, { decode: true });
  return { reference, compiled, canvas, roots: [compiled.locator("body"), canvas] };
}

for (const width of [800, 390]) {
  for (const name of ["order-confirmation", "order-shipping"]) {
    test(`Arcane ${name} source row geometry at ${width}px`, async ({ page }) => {
      const { reference, compiled, roots } = await representations(
        page,
        `04-Arcane/${name}`,
        width,
        "Daily C Serum",
      );
      try {
        const first = await box(reference.locator('img[src$="skin-image-2.png"]'));
        const second = await box(reference.locator('img[src$="skin-image-3.png"]'));
        expect(second.y - first.bottom).toBeCloseTo(18 + 1 + 22.5 + 18, 1);
        for (const root of roots) {
          const actualFirst = await box(root.locator('img[src$="skin-image-2.png"]'));
          const actualSecond = await box(root.locator('img[src$="skin-image-3.png"]'));
          expect(actualSecond.y - actualFirst.bottom).toBeCloseTo(second.y - first.bottom, 1);
          for (const [index, title] of ["Daily C Serum", "Overnight Repair Cream"].entries()) {
            const originalImage = index ? second : first;
            const actualImage = index ? actualSecond : actualFirst;
            const originalTitle = await box(reference.getByText(title, { exact: true }));
            const actualTitle = await box(root.getByText(title, { exact: true }));
            const actualQuantity = await box(root.getByText("x1", { exact: true }).nth(index));
            expect(actualTitle.y - actualImage.y).toBeCloseTo(originalTitle.y - originalImage.y, 1);
            expect((actualTitle.y + actualQuantity.bottom) / 2).toBeCloseTo(
              (actualImage.y + actualImage.bottom) / 2,
              1,
            );
            expect(actualTitle.x - actualImage.right).toBeCloseTo(24, 1);
          }
          if (name === "order-confirmation") {
            const originalSummary = await box(
              reference.getByText("Subtotal", { exact: true }).locator("xpath=ancestor::table[2]"),
            );
            const actualSummary = await box(root.locator(".arcane-summary > table"));
            expect(originalSummary.y - second.bottom).toBeCloseTo(64, 1);
            expect(actualSummary.y - actualSecond.bottom).toBeCloseTo(64, 1);
            // Downstream position relative to the first product, without
            // conflating the mobile introduction's fallback line wrapping.
            expect(actualSummary.y - actualFirst.y).toBeCloseTo(originalSummary.y - first.y, 1);
          } else {
            const originalFaq = await box(reference.getByText("Common questions", { exact: true }));
            const actualFaq = await box(root.getByText("Common questions", { exact: true }));
            expect(actualFaq.y - actualSecond.bottom).toBeCloseTo(originalFaq.y - second.bottom, 1);
          }
        }
      } finally {
        await reference.close();
        await compiled.close();
      }
    });
  }

  test(`Arcane cart preserves independent mobile margins at ${width}px`, async ({ page }) => {
    const { reference, compiled, roots } = await representations(
      page,
      "04-Arcane/abandoned-cart",
      width,
      "Don’t take it from us",
    );
    try {
      const price = await box(reference.getByText("$99", { exact: true }).nth(1));
      const image = await box(reference.locator('img[src$="skin-image-3.png"]'));
      const productBottom = Math.max(price.bottom, image.bottom);
      const cta = await box(reference.getByText("Return to cart →", { exact: true }));
      const review = await box(reference.getByText("Don’t take it from us", { exact: true }));
      for (const root of roots) {
        const actualPrice = await box(root.getByText("$99", { exact: true }).nth(1));
        const actualImage = await box(root.locator('img[src$="skin-image-3.png"]'));
        const actualProductBottom = Math.max(actualPrice.bottom, actualImage.bottom);
        const actualCta = await box(root.locator("a").filter({ hasText: /^Return to cart →$/ }));
        const actualReview = await box(root.getByText("Don’t take it from us", { exact: true }));
        expect(actualCta.y - actualProductBottom).toBeCloseTo(cta.y - productBottom, 1);
        expect(actualReview.y - actualCta.bottom).toBeCloseTo(review.y - cta.bottom, 1);
      }
    } finally {
      await reference.close();
      await compiled.close();
    }
  });

  test(`Arcane newsletter keeps first-tip and label insets at ${width}px`, async ({ page }) => {
    const { reference, compiled, roots } = await representations(
      page,
      "04-Arcane/newsletter",
      width,
      "Start with a patch test",
    );
    try {
      const heading = await box(reference.getByText("Tips and resources", { exact: true }));
      const step = await box(reference.getByText("1", { exact: true }));
      expect(step.y - heading.bottom).toBeCloseTo(width === 390 ? 48 : 88, 1);
      for (const root of roots) {
        const actualHeading = await box(root.getByText("Tips and resources", { exact: true }));
        const firstStep = await box(root.getByText("1", { exact: true }));
        expect(firstStep.y - actualHeading.bottom).toBeCloseTo(step.y - heading.bottom, 1);
        for (const [index, title] of [
          "Start with a patch test",
          "Layer for your climate",
          "Track what works",
        ].entries()) {
          // Cell edges are stable despite fallback glyph widths inside them.
          const originalNumber = await box(reference.getByText(String(index + 1), { exact: true }));
          const originalTitle = await box(reference.getByText(title, { exact: true }));
          const actualNumber = await box(
            root
              .getByText(String(index + 1), { exact: true })
              .locator("xpath=ancestor-or-self::td[1]"),
          );
          const actualTitleX = await textStartX(root.getByText(title, { exact: true }));
          expect(originalTitle.x - originalNumber.right).toBeCloseTo(width === 390 ? 12 : 22, 1);
          expect(actualTitleX - actualNumber.right).toBeCloseTo(
            originalTitle.x - originalNumber.right,
            1,
          );
        }
      }
    } finally {
      await reference.close();
      await compiled.close();
    }
  });

  for (const name of ["activation", "abandoned-cart", "newsletter", "welcome"]) {
    test(`Arcane ${name} retains source logo inset at ${width}px`, async ({ page }) => {
      const readyText = {
        activation: "Almost there",
        "abandoned-cart": "Don’t take it from us",
        newsletter: "Start with a patch test",
        welcome: "Welcome",
      }[name]!;
      const { reference, compiled, roots } = await representations(
        page,
        `04-Arcane/${name}`,
        width,
        readyText,
      );
      try {
        const logo = await box(reference.locator('img[src$="logo-white.png"]'));
        const inset = width === 390 && name !== "activation" && name !== "abandoned-cart" ? 24 : 40;
        expect(logo.x).toBeCloseTo(Math.max(0, (width - 640) / 2) + inset, 1);
        for (const root of roots)
          expect((await box(root.locator('img[src$="logo-white.png"]'))).x).toBeCloseTo(logo.x, 1);
      } finally {
        await reference.close();
        await compiled.close();
      }
    });
  }

  test(`Matte activation preserves source punctuation at ${width}px`, async ({ page }) => {
    const expected = "Thank you for signing up for Collage";
    const { reference, compiled, roots } = await representations(
      page,
      "02-Matte/activation",
      width,
      expected,
    );
    try {
      await expect(reference.getByText(expected, { exact: true })).toBeAttached();
      for (const root of roots) {
        await expect(root.getByText(expected, { exact: true })).toBeAttached();
        await expect(root.getByText(`${expected}.`, { exact: true })).toHaveCount(0);
      }
    } finally {
      await reference.close();
      await compiled.close();
    }
  });

  test(`Matte subscription CTA matches the loaded source label at ${width}px`, async ({ page }) => {
    const { reference, compiled, canvas } = await representations(
      page,
      "02-Matte/subscription-confirmation",
      width,
      "Manage subscription",
    );
    try {
      const original = reference.locator("a").filter({ hasText: /^Manage subscription$/ });
      const label = original.locator("span").filter({ hasText: /^Manage subscription$/ });
      const font = await label.evaluate((element) => ({
        family: getComputedStyle(element).fontFamily,
        weight: getComputedStyle(element).fontWeight,
        faces: Array.from(element.ownerDocument.fonts)
          .filter((face) => face.family.replace(/["']/g, "") === "Inter" && face.weight === "500")
          .map((face) => face.status),
      }));
      expect(font.family).toContain("Inter");
      expect(font.weight).toBe("500");
      expect(font.faces).toEqual(["loaded"]);
      const expected = await box(original);
      for (const button of [
        compiled.locator("a").filter({ hasText: /^Manage subscription$/ }),
        canvas.locator(".pm-button").filter({ hasText: /^Manage subscription$/ }),
      ]) {
        const actual = await box(button);
        expect(actual.width).toBeCloseTo(expected.width, 1);
        expect(actual.height).toBeCloseTo(expected.height, 1);
      }
    } finally {
      await reference.close();
      await compiled.close();
    }
  });
}
