import { expect, test, type Locator } from "@playwright/test";
import { PNG_IMAGE_SOURCE } from "../fixtures/images";

const dimensions = (image: Locator) =>
  image.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return { width: box.width, height: box.height };
  });

for (const width of [390, 800]) {
  test(`image borders match compiled content dimensions under a host reset at ${width}px`, async ({
    page,
  }) => {
    await page.route("https://example.com/image-box.png", (route) =>
      route.fulfill({
        contentType: "image/png",
        body: Buffer.from(PNG_IMAGE_SOURCE.split(",")[1], "base64"),
      }),
    );
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/tests/browser/fixtures/native-image-box.html");
    await expect(page.getByLabel("Compilation status")).toHaveText("ready");
    const canvas = page.getByRole("region", { name: "Canvas" });
    const compiled = page.frameLocator("#compiled");
    const expected: Record<string, { width: number; height: number }> = {
      plain: { width: 64, height: 64 },
      bordered: { width: 66, height: 66 },
      linked: { width: 66, height: 66 },
      asymmetric: { width: 68, height: 70 },
      authored: { width: 64, height: 64 },
      auto: { width: 66, height: 66 },
    };
    for (const name of [...Object.keys(expected), "constrained"]) {
      const actual = canvas.locator(`.probe-${name} img`);
      const reference = compiled.locator(`.probe-${name} img`);
      for (const image of [actual, reference]) {
        await expect
          .poll(() => image.evaluate((node: HTMLImageElement) => node.naturalWidth))
          .toBe(1);
      }
      const referenceBox = await dimensions(reference);
      if (expected[name]) expect(referenceBox).toEqual(expected[name]);
      await expect.poll(() => dimensions(actual)).toEqual(referenceBox);
      await expect(actual).toHaveCSS(
        "box-sizing",
        name === "authored" ? "border-box" : "content-box",
      );
    }
    // The email correction must not disable the surrounding application's reset.
    await expect(page.locator("[data-host-reset]")).toHaveCSS("box-sizing", "border-box");
    expect(await dimensions(page.locator("[data-host-reset]"))).toEqual({ width: 64, height: 64 });
  });
}
