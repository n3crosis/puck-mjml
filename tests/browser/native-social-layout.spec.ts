import { expect, test } from "@playwright/test";
import { socialCases } from "./fixtures/native-social-source";

test.beforeEach(async ({ page }) => {
  await page.route("https://example.com/social-icon.svg", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="#123456"/></svg>',
    }),
  );
});

for (const width of [390, 800]) {
  test(`native social baseline matches compiled rows at ${width}px`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/tests/browser/fixtures/native-social-layout.html");
    await expect(page.getByLabel("Compilation status")).toHaveText("ready");
    const canvas = page.getByRole("region", { name: "Canvas", exact: true });
    const compiled = page.frameLocator("#compiled");
    for (const name of socialCases.map((item) => item.name)) {
      const selector = `.social-${name}`;
      const actual = canvas.locator(selector);
      const reference = compiled.locator(selector);
      for (const row of [actual, reference]) {
        await expect(row).toHaveCSS("font-size", "0px");
        await expect
          .poll(() =>
            row.locator("img").evaluateAll((images) =>
              images.every((image) => {
                const img = image as HTMLImageElement;
                return img.complete && img.naturalWidth === 20;
              }),
            ),
          )
          .toBe(true);
      }
      const geometry = (element: Element, name: string) => {
        const bounds = element.getBoundingClientRect();
        const next = element.ownerDocument
          .querySelector(`.after-${name} p`)!
          .getBoundingClientRect();
        return {
          width: bounds.width,
          height: bounds.height,
          nextText: next.top - bounds.top,
          images: Array.from(element.querySelectorAll("img"), (image) => {
            const box = image.getBoundingClientRect();
            return {
              x: box.left - bounds.left,
              y: box.top - bounds.top,
              width: box.width,
              height: box.height,
            };
          }),
        };
      };
      const a = await actual.evaluate(geometry, name);
      const b = await reference.evaluate(geometry, name);
      for (const key of ["width", "height", "nextText"] as const)
        expect(a[key], `${name} ${key}`).toBeCloseTo(b[key], 1);
      expect(a.images).toHaveLength(b.images.length);
      for (const [index, image] of a.images.entries())
        for (const key of ["x", "y", "width", "height"] as const)
          expect(image[key], `${name} image ${index} ${key}`).toBeCloseTo(b.images[index][key], 1);
      if (name.endsWith("-icons")) {
        const bottom = Math.max(...a.images.map((image) => image.y + image.height));
        // The observed regression made this 36px in all 40 first-party footers.
        expect(a.nextText - bottom).toBe(32);
      }
      const labels = actual.locator(".pm-social-label a");
      for (const label of await labels.all()) {
        const text = await label.innerText();
        const expected = reference.getByRole("link", { name: text, exact: true });
        for (const property of [
          "font-family",
          "font-size",
          "font-weight",
          "line-height",
          "color",
        ]) {
          const value = await expected.evaluate(
            (element, key) => getComputedStyle(element).getPropertyValue(key),
            property,
          );
          await expect(label).toHaveCSS(property, value);
        }
        await expect(label).toBeVisible();
      }
    }
    const firstLink = canvas
      .locator(".social-horizontal-icons")
      .getByRole("link", { name: "first icon", exact: true });
    await expect(firstLink).toHaveAttribute("href", "https://example.com/first");
    await expect(firstLink).toHaveAttribute("target", "_blank");
    await expect(firstLink).toHaveAttribute("rel", "noopener");
    await firstLink.focus();
    await expect(firstLink).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(
      canvas.locator(".social-horizontal-icons").getByRole("link", { name: "second icon" }),
    ).toBeFocused();

    const previews = page.getByRole("region", { name: "Source previews" });
    for (const name of ["raw-child", "raw-label"]) {
      const preview = previews.locator(`.social-${name} .pm-raw`);
      const title = preview.locator(":scope > strong");
      await expect(title).toBeVisible();
      expect(
        await title.evaluate((element) => parseFloat(getComputedStyle(element).fontSize)),
      ).toBeGreaterThan(0);
      await expect(preview.locator("code")).toContainText("Stored");
      await expect(preview.locator("code em, code strong")).toHaveCount(0);
    }
    expect(errors).toEqual([]);
  });
}
