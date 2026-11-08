import { readFileSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { inspectArtwork } from "./artwork-evidence";
import { waitForCanvasFontCss } from "./font-evidence";
import { loadReactEmailReference } from "./reference-document";

test.describe.configure({ timeout: 120_000 });

const cartCopy =
  "Your cart still holds your Halo ring—we saved your size and finish. Check out soon before inventory shifts or your hold window expires.";
const welcomeCopy =
  "Voice-free smarts live in the ring: subtle taps, gentle haptics, and answers when you ask—no feeds, no glare, no friction at checkout or on the go.";
const reviewCopy =
  "“It's wild how fast Halo on my finger felt like calm help whenever my head was full and my hands were busy.”";
const joinHeading = "Join us on the journey";
const joinBody =
  "There's more ahead—new drops, member perks, and restock alerts. Explore what's new and stay in the loop while your cart is on hold.";

async function rectangle(locator: Locator) {
  return locator.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      bottom: bounds.bottom,
    };
  });
}

async function representations(page: Page, family: string, name: string, width: number) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/");
  await page
    .getByRole("combobox", { name: "Email template" })
    .selectOption(`${family.toLowerCase()}/${name}`);
  await page.getByRole("button", { name: "Preview email" }).click();
  const dialog = page.getByRole("dialog", { name: "Email preview" });
  await expect(dialog).toBeVisible();
  const readyText =
    family === "04-Arcane"
      ? joinHeading
      : name === "welcome"
        ? welcomeCopy
        : name === "promo"
          ? "Save on the ring that keeps you clear"
          : name === "abandoned-cart"
            ? cartCopy
            : "Common questions";
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
  // Font CSS must be installed before fonts.ready, otherwise it can resolve too early.
  await waitForCanvasFontCss(canvas);
  await canvas.evaluate(inspectArtwork, { decode: true });

  const reference = await page.context().newPage();
  const compiled = await page.context().newPage();
  await reference.setViewportSize({ width, height: 900 });
  await compiled.setViewportSize({ width, height: 900 });
  await loadReactEmailReference(
    reference,
    readFileSync(
      new URL(`../../.cache/react-email-reference/${family}/${name}.html`, import.meta.url),
      "utf8",
    ),
  );
  // Keep the immutable Arcane document and its known broken Inter400 URL unchanged.
  // Check spacing independently of fallback glyph widths, and still require every image.
  await reference.locator("body").evaluate(async (body) => {
    await body.ownerDocument.fonts.ready;
    await Promise.all(Array.from(body.querySelectorAll("img"), (image) => image.decode()));
  });
  const failedFonts = await reference.locator("body").evaluate((body) =>
    Array.from(body.ownerDocument.fonts)
      .filter((face) => face.status === "error")
      .map((face) => `${face.family.replace(/["']/g, "")} ${face.weight}`),
  );
  expect(failedFonts.filter((font) => family !== "04-Arcane" || font !== "Inter 400")).toEqual([]);
  await compiled.setContent(html, { waitUntil: "load" });
  await compiled.locator("body").evaluate(inspectArtwork, { decode: true });
  return { reference, compiled, roots: [compiled.locator("body"), canvas] };
}

for (const width of [800, 390]) {
  for (const name of ["welcome", "promo", "abandoned-cart", "order-shipping"]) {
    test(`Studio ${name} retains original region widths at ${width}px`, async ({ page }) => {
      const { reference, compiled, roots } = await representations(page, "05-Studio", name, width);
      try {
        const copy =
          name === "welcome"
            ? ["Meet the ring that thinks with you", welcomeCopy]
            : name === "promo"
              ? ["Save on the ring that keeps you clear"]
              : name === "abandoned-cart"
                ? [cartCopy, reviewCopy]
                : ["Common questions", "When will my ring arrive?", "Need a different size?"];
        for (const content of copy) {
          const expected = await rectangle(reference.getByText(content, { exact: true }));
          const mobileInset =
            content === welcomeCopy || name === "order-shipping"
              ? 32
              : content === cartCopy
                ? 48
                : content === reviewCopy
                  ? 40
                  : 0;
          if (width === 390) {
            expect(expected.x).toBeCloseTo(mobileInset, 1);
            expect(expected.width).toBeCloseTo(width - mobileInset * 2, 1);
          }
          for (const root of roots) {
            const actual = await rectangle(root.getByText(content, { exact: true }));
            for (const dimension of ["x", "width", "height"] as const)
              expect(actual[dimension]).toBeCloseTo(expected[dimension], 1);
          }
        }
        if (name === "abandoned-cart") {
          const originalProduct = await rectangle(
            reference.getByText("Halo Ring 1", { exact: true }),
          );
          expect(originalProduct.x).toBeCloseTo(width === 390 ? 152 : 232, 1);
          const originalImage = await rectangle(reference.locator('img[src$="tech-image.png"]'));
          const originalCard = await rectangle(
            reference.getByText(reviewCopy, { exact: true }).locator("xpath=ancestor::table[1]"),
          );
          expect(originalCard.x).toBeCloseTo(width === 390 ? 16 : 112, 1);
          for (const root of roots) {
            const product = await rectangle(root.getByText("Halo Ring 1", { exact: true }));
            const image = await rectangle(root.locator('img[src$="tech-image.png"]'));
            const card = await rectangle(root.locator(".studio-mobile-card"));
            expect(product.x).toBeCloseTo(originalProduct.x, 1);
            for (const dimension of ["x", "width", "height"] as const)
              expect(image[dimension]).toBeCloseTo(originalImage[dimension], 1);
            expect(card.x).toBeCloseTo(originalCard.x, 1);
            expect(card.width).toBeCloseTo(originalCard.width, 1);
          }
        }
        if (name === "order-shipping") {
          const expectedRule = await rectangle(
            reference
              .getByText("Common questions", { exact: true })
              .locator("xpath=ancestor::table[1]"),
          );
          const expectedCopy = await rectangle(
            reference.getByText("Common questions", { exact: true }),
          );
          expect(expectedRule.x).toBeCloseTo(width === 390 ? 24 : 104, 1);
          expect(expectedCopy.y - expectedRule.y).toBeCloseTo(49, 1);
          for (const root of roots) {
            const rule = await rectangle(root.locator(".studio-faq-divider").locator("p, hr"));
            const heading = await rectangle(root.getByText("Common questions", { exact: true }));
            expect(rule.x).toBeCloseTo(expectedRule.x, 1);
            expect(rule.width).toBeCloseTo(expectedRule.width, 1);
            expect(heading.y - rule.y).toBeCloseTo(expectedCopy.y - expectedRule.y, 1);
          }
        }
      } finally {
        await reference.close();
        await compiled.close();
      }
    });
  }

  for (const name of ["welcome", "promo", "abandoned-cart"]) {
    test(`Arcane ${name} preserves source feature and join-card gaps at ${width}px`, async ({
      page,
    }) => {
      const { reference, compiled, roots } = await representations(page, "04-Arcane", name, width);
      try {
        const originalHeading = await rectangle(reference.getByText(joinHeading, { exact: true }));
        const originalCard = await rectangle(
          reference.getByText(joinHeading, { exact: true }).locator("xpath=ancestor::table[1]"),
        );
        const originalBody = await rectangle(reference.getByText(joinBody, { exact: true }));
        expect(originalHeading.y - originalCard.y).toBeCloseTo(96, 1);
        expect(originalBody.y - originalHeading.bottom).toBeCloseTo(24, 1);
        for (const root of roots) {
          const heading = await rectangle(root.getByText(joinHeading, { exact: true }));
          const card = await rectangle(root.locator(".arcane-join"));
          const body = await rectangle(root.getByText(joinBody, { exact: true }));
          expect(heading.y - card.y).toBeCloseTo(originalHeading.y - originalCard.y, 1);
          expect(body.y - heading.bottom).toBeCloseTo(originalBody.y - originalHeading.bottom, 1);
          expect(card.x).toBeCloseTo(originalCard.x, 1);
          expect(card.width).toBeCloseTo(originalCard.width, 1);
        }
        if (name !== "abandoned-cart" && width === 390) {
          const firstTitle = name === "welcome" ? "Build your ritual" : "Bright morning serum";
          const secondLink = name === "welcome" ? "Learn more →" : "Shop the cream →";
          const expectedFirstImage = await rectangle(
            reference.locator('img[src$="skin-image-6.png"]'),
          );
          const expectedFirstTitle = await rectangle(
            reference.getByText(firstTitle, { exact: true }),
          );
          const expectedSecondImage = await rectangle(
            reference.locator('img[src$="skin-image-7.png"]'),
          );
          // Compare line boxes, not fallback-dependent inline glyph bounds.
          const expectedSecondLink = await rectangle(
            reference.getByRole("link", { name: secondLink, exact: true }).last().locator(".."),
          );
          expect(expectedFirstTitle.y - expectedFirstImage.bottom).toBeCloseTo(56, 1);
          expect(expectedSecondImage.y - expectedSecondLink.bottom).toBeCloseTo(56, 1);
          expect(originalCard.y - expectedSecondImage.bottom).toBeCloseTo(128, 1);
          for (const root of roots) {
            const firstImage = await rectangle(root.locator('img[src$="skin-image-6.png"]'));
            const first = await rectangle(root.getByText(firstTitle, { exact: true }));
            const secondImage = await rectangle(root.locator('img[src$="skin-image-7.png"]'));
            const second = await rectangle(
              root.getByRole("link", { name: secondLink, exact: true }).last().locator(".."),
            );
            const card = await rectangle(root.locator(".arcane-join"));
            expect(first.y - firstImage.bottom).toBeCloseTo(56, 1);
            expect(secondImage.y - second.bottom).toBeCloseTo(56, 1);
            expect(card.y - secondImage.bottom).toBeCloseTo(128, 1);
            expect(secondImage.width).toBeCloseTo(expectedSecondImage.width, 1);
            expect(secondImage.height).toBeCloseTo(expectedSecondImage.height, 1);
          }
        }
      } finally {
        await reference.close();
        await compiled.close();
      }
    });
  }
}
