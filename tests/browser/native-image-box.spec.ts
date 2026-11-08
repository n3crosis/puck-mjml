import { expect, test, type Locator } from "@playwright/test";
import { PNG_IMAGE_SOURCE } from "../fixtures/images";
import {
  canvasOverflowFailures,
  isContainedImageBorderPaint,
  measureCanvasGeometry,
} from "./template-overflow";

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
      left: { width: 66, height: 66 },
      right: { width: 66, height: 66 },
      "css-border": { width: 70, height: 70 },
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
      const placement = (image: Locator, compiled: boolean) =>
        image.evaluate(
          (element, { name, compiled }) => {
            const bounds = element.getBoundingClientRect();
            const outer = element.closest(`.probe-${name}`)!.getBoundingClientRect();
            const wrapper = compiled ? element.closest("td")! : element.parentElement!;
            return {
              x: bounds.x - outer.x,
              y: bounds.y - outer.y,
              absoluteY: bounds.y,
              wrapperWidth: wrapper.getBoundingClientRect().width,
              wrapperOverflow: wrapper.scrollWidth - wrapper.clientWidth,
            };
          },
          { name, compiled },
        );
      const actualPlacement = await placement(actual, false);
      const compiledPlacement = await placement(reference, true);
      // A percentage-width MJML image deliberately paints its borders beyond
      // the content-width sizing cell. Expanding that box would shift centering.
      for (const key of ["x", "y", "wrapperWidth", "wrapperOverflow"] as const)
        expect(actualPlacement[key], `${name} ${key}`).toBeCloseTo(compiledPlacement[key], 2);
      const geometry = await canvas.locator(".pm-email").evaluate(measureCanvasGeometry);
      const box = geometry.boxes.find(
        (box) => box.imageBorderPaint?.image.y === actualPlacement.absoluteY,
      )!;
      expect(box, `${name} raw image wrapper evidence`).toBeTruthy();
      const contained =
        !["plain", "authored", "right"].includes(name) &&
        !(name === "constrained" && width === 390);
      expect(isContainedImageBorderPaint(box, geometry.email), name).toBe(contained);
      // Preserve, rather than zero, the raw compiler-equivalent border extent.
      expect(box.scrollOverflow).toBe(actualPlacement.wrapperOverflow);
    }
    // The email correction must not disable the surrounding application's reset.
    await expect(page.locator("[data-host-reset]")).toHaveCSS("box-sizing", "border-box");
    expect(await dimensions(page.locator("[data-host-reset]"))).toEqual({ width: 64, height: 64 });

    // Hostile modifications must not be mistaken for the renderer's border
    // paint, even when the visible image still happens to fit inside the email.
    for (const mutation of ["clip", "content", "padding", "shift", "child", "outer"] as const) {
      const anchor = canvas.locator(".probe-bordered > a");
      await anchor.evaluate((element, mutation) => {
        const image = element.querySelector("img")!;
        if (mutation === "clip") (element as HTMLElement).style.overflow = "hidden";
        if (mutation === "content") {
          image.style.width = "80px";
          image.style.maxWidth = "none";
        }
        if (mutation === "padding") image.style.paddingRight = "2px";
        if (mutation === "shift") image.style.transform = "translateX(2px)";
        if (mutation === "child") element.append(element.ownerDocument.createElement("span"));
        if (mutation === "outer") element.parentElement!.style.width = "65px";
      }, mutation);
      const geometry = await canvas.locator(".pm-email").evaluate(measureCanvasGeometry);
      const y = await anchor.evaluate((element) => element.getBoundingClientRect().y);
      const box = geometry.boxes.find((box) => box.label === "a." && box.y === y)!;
      expect(isContainedImageBorderPaint(box, geometry.email), mutation).toBe(false);
      expect(box.scrollOverflow, mutation).toBeGreaterThan(1);
      expect(canvasOverflowFailures(geometry)).toContain("a. scroll overflow");
      // Reset only the deliberate mutation before testing the next failure.
      await anchor.evaluate((element) => {
        (element as HTMLElement).style.removeProperty("overflow");
        const image = element.querySelector("img")!;
        image.style.width = "100%";
        image.style.maxWidth = "100%";
        image.style.removeProperty("padding-right");
        image.style.removeProperty("transform");
        element.querySelector("span")?.remove();
        element.parentElement!.style.removeProperty("width");
      });
    }
  });
}
