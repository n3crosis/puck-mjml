import { readFileSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { inspectArtwork } from "./artwork-evidence";
import { waitForCanvasFontCss } from "./font-evidence";
import { loadReactEmailReference } from "./reference-document";

test.describe.configure({ timeout: 120_000 });

async function rectangle(locator: Locator) {
  return locator.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      right: bounds.right,
      bottom: bounds.bottom,
    };
  });
}

async function selectTemplate(page: Page, name: string) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/");
  await page.getByRole("combobox", { name: "Email template" }).selectOption(name);
  await page.getByRole("button", { name: "Preview email" }).click();
  const dialog = page.getByRole("dialog", { name: "Email preview" });
  await expect(dialog).toBeVisible();
  const frame = page.frameLocator('iframe[title="Rendered email"]');
  await expect(
    frame
      .locator(
        name.endsWith("product-update")
          ? ".bare-step-slot"
          : name.endsWith("feature-announcement")
            ? ".bare-feature-description"
            : name.endsWith("subscription-confirmation")
              ? ".collage-confirm-rule"
              : "h1",
      )
      .first(),
  ).toBeAttached();
  const html = await page
    .locator('iframe[title="Rendered email"]')
    .evaluate((iframe: HTMLIFrameElement) => iframe.srcdoc);
  await dialog.getByRole("button", { name: "Close preview" }).click();
  await expect(dialog).toBeHidden();
  return html;
}

async function setCanvasViewport(page: Page, width: number) {
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
  return canvas;
}

for (const width of [800, 390]) {
  test(`Barebone numbered rows keep original badge and copy edges at ${width}px`, async ({
    page,
  }) => {
    const html = await selectTemplate(page, "01-barebone/product-update");
    const compiled = await page.context().newPage();
    try {
      await compiled.setViewportSize({ width, height: 900 });
      await compiled.setContent(html, { waitUntil: "load" });
      await compiled.locator("body").evaluate(inspectArtwork, { decode: true });
      const canvas = await setCanvasViewport(page, width);
      for (const root of [compiled.locator("body"), canvas]) {
        const slots = root.locator(".bare-step-slot");
        const badges = root.locator(".bare-step-number p");
        const bodies = root.locator(".bare-step-body");
        await expect(slots).toHaveCount(3);
        for (let index = 0; index < 3; index++) {
          const slot = await rectangle(slots.nth(index));
          const badge = await rectangle(badges.nth(index));
          const body = await rectangle(bodies.nth(index));
          const copy = await rectangle(
            bodies
              .nth(index)
              .getByText(
                ["Review the highlights", "Try it when you're ready", "Share with your team"][
                  index
                ],
                { exact: true },
              ),
          );
          expect(slot.width).toBeCloseTo(52, 1);
          expect(badge.width).toBeCloseTo(28, 1);
          expect(badge.x).toBeCloseTo(width === 800 ? 154 : 54, 1);
          expect(body.x).toBeCloseTo(width === 800 ? 200 : 100, 1);
          expect(copy.x).toBeCloseTo(body.x, 1);
          expect(copy.width).toBeCloseTo(width === 800 ? 420 : 210, 1);
          expect(copy.right).toBeCloseTo(width === 800 ? 620 : 310, 1);
          expect(copy.x - badge.right).toBeGreaterThanOrEqual(18);
        }
      }
    } finally {
      await compiled.close();
    }
  });

  test(`Barebone feature descriptions retain original caps and title gap at ${width}px`, async ({
    page,
  }) => {
    const html = await selectTemplate(page, "01-barebone/feature-announcement");
    const compiled = await page.context().newPage();
    try {
      await compiled.setViewportSize({ width, height: 900 });
      await compiled.setContent(html, { waitUntil: "load" });
      await compiled.locator("body").evaluate(inspectArtwork, { decode: true });
      const canvas = await setCanvasViewport(page, width);
      for (const root of [compiled.locator("body"), canvas]) {
        const copies = root.locator(".bare-feature-description > div");
        const titles = root.getByText("Hello feature. Goodbye old feature.", { exact: true });
        await expect(copies).toHaveCount(3);
        for (let index = 0; index < 3; index++) {
          const copy = await rectangle(copies.nth(index));
          const title = await rectangle(titles.nth(index));
          expect(copy.width).toBeCloseTo(width === 800 ? 420 : 326, 1);
          expect(copy.x).toBeCloseTo(width === 800 ? 136 : 32, 1);
          expect(copy.y - title.bottom).toBeCloseTo(16, 1);
        }
      }
    } finally {
      await compiled.close();
    }
  });

  test(`Matte onboarding dividers stay left aligned and fluid at ${width}px`, async ({ page }) => {
    const html = await selectTemplate(page, "02-matte/subscription-confirmation");
    const compiled = await page.context().newPage();
    try {
      await compiled.setViewportSize({ width, height: 900 });
      await compiled.setContent(html, { waitUntil: "load" });
      await compiled.locator("body").evaluate(inspectArtwork, { decode: true });
      const canvas = await setCanvasViewport(page, width);
      const roots = [
        { root: compiled.locator("body"), selector: ".collage-confirm-rule p" },
        { root: canvas, selector: ".collage-confirm-rule hr" },
      ];
      for (const { root, selector } of roots) {
        const rules = root.locator(selector);
        await expect(rules).toHaveCount(2);
        for (let index = 0; index < 2; index++) {
          const rule = await rectangle(rules.nth(index));
          expect(rule.x).toBeCloseTo(width === 800 ? 137 : 41, 1);
          expect(rule.width).toBeCloseTo(width === 800 ? 490 : 308, 1);
        }
        expect(
          await root.evaluate(
            (element) =>
              element.ownerDocument.documentElement.scrollWidth -
              element.ownerDocument.defaultView!.innerWidth,
          ),
        ).toBe(0);
      }
      await expect(canvas.locator(".collage-confirm-rule").getByRole("separator")).toHaveCount(2);
    } finally {
      await compiled.close();
    }
  });
}

for (const width of [800, 390]) {
  for (const name of ["welcome", "product-update"]) {
    test(`Barebone ${name} preserves static source heading metrics at ${width}px`, async ({
      page,
    }) => {
      const html = await selectTemplate(page, `01-barebone/${name}`);
      const compiled = await page.context().newPage();
      const reference = await page.context().newPage();
      try {
        await compiled.setViewportSize({ width, height: 900 });
        await reference.setViewportSize({ width, height: 900 });
        await compiled.setContent(html, { waitUntil: "load" });
        await compiled.locator("body").evaluate(inspectArtwork, { decode: true });
        await loadReactEmailReference(
          reference,
          readFileSync(
            new URL(`../fixtures/react-email-reference/01-Barebone/${name}.html`, import.meta.url),
            "utf8",
          ),
        );
        await reference.locator("body").evaluate(inspectArtwork, { decode: true });
        const canvas = await setCanvasViewport(page, width);
        const expected = await rectangle(reference.locator("h1").first());
        expect(expected.height).toBeCloseTo(
          name === "product-update" && width === 390 ? 132 : 88,
          1,
        );
        expect(expected.width).toBeCloseTo(width === 800 ? 422 : 342, 1);
        for (const root of [compiled.locator("body"), canvas]) {
          const actual = await rectangle(root.locator("h1").first());
          expect(actual.x).toBeCloseTo(expected.x, 1);
          expect(actual.width).toBeCloseTo(expected.width, 1);
          expect(actual.height).toBeCloseTo(expected.height, 1);
          const headingFont = await root
            .locator("h1")
            .first()
            .evaluate((heading) => {
              const family = getComputedStyle(heading)
                .fontFamily.split(",")[0]
                .replace(/["']/g, "")
                .trim();
              return Array.from(heading.ownerDocument.fonts)
                .filter(
                  (face) =>
                    face.family.replace(/["']/g, "") === family &&
                    face.weight === "600" &&
                    face.style === "normal",
                )
                .map(({ weight, style, status }) => ({ weight, style, status }));
            });
          expect(headingFont).toContainEqual({ weight: "600", style: "normal", status: "loaded" });
        }
      } finally {
        await compiled.close();
        await reference.close();
      }
    });
  }
}
