import { expect, test } from "@playwright/test";
import { rootCascadeCases } from "./fixtures/canvas-css-root-source";

for (const width of [390, 600, 601, 800]) {
  test(`root selector cascade agrees with compiled MJML at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/tests/browser/fixtures/canvas-css-root.html");
    await expect(page.getByLabel("Compilation status")).toHaveText("ready");
    for (const entry of rootCascadeCases) {
      const region = page.locator(`[data-case="${entry.id}"]`);
      const expected = width >= 601 ? entry.desktop : entry.mobile;
      await expect(region.getByRole("region", { name: "Canvas" }).locator(".wide")).toHaveCSS(
        "max-width",
        expected,
      );
      // Keep the compiled media-query viewport exact even when the host scrolls.
      expect(
        await region
          .frameLocator("iframe")
          .locator("html")
          .evaluate(() => window.innerWidth),
      ).toBe(width);
      await expect(region.frameLocator("iframe").locator(".wide")).toHaveCSS("max-width", expected);
    }
  });
}

test("nested CSS cannot style host siblings or a sibling editor", async ({ page }, testInfo) => {
  await page.goto("/tests/browser/fixtures/canvas-css-root.html");
  await expect(page.getByLabel("Compilation status")).toHaveText("ready");
  const ids = ["host-before", "host-after", "sibling-target", "supported", "invalid-list"];
  const outlines = await page.locator(ids.map((id) => `#${id}`).join(", ")).evaluateAll((nodes) =>
    nodes.map((node) => {
      const style = getComputedStyle(node);
      return {
        id: node.id,
        style: style.outlineStyle,
        width: style.outlineWidth,
        color: style.outlineColor,
      };
    }),
  );
  await testInfo.attach("nested-css-isolation-outlines.json", {
    body: JSON.stringify(outlines, null, 2),
    contentType: "application/json",
  });
  await testInfo.attach("nested-css-isolation.png", {
    body: await page.getByRole("region", { name: "Isolation", exact: true }).screenshot(),
    contentType: "image/png",
  });
  for (const id of ids) {
    // Chromium can expose the initial medium width as 3px even when no outline
    // is painted. The rejected rules would set all three properties below.
    await expect(page.locator(`#${id}`)).toHaveCSS("outline-style", "none");
    await expect(page.locator(`#${id}`)).not.toHaveCSS("outline-width", "19px");
    await expect(page.locator(`#${id}`)).not.toHaveCSS("outline-color", "rgb(255, 0, 0)");
  }
  await expect(page.locator("#supported")).toHaveCSS("color", "rgb(11, 22, 33)");
  await expect(page.locator("#supported")).toHaveCSS("border-top-width", "7px");
  await expect(page.locator("#peer")).toHaveCSS("color", "rgb(41, 51, 61)");
  await expect(page.locator("#conditional")).toHaveCSS("color", "rgb(51, 61, 71)");
  await expect(page.getByLabel("Isolation warnings")).toContainText("canvas-safe nesting subset");
  await expect(page.getByLabel("Isolation warnings")).toContainText("unsupported @scope");
  await expect(page.getByLabel("Isolation warnings")).toContainText("unsupported @starting-style");
});

test("root and nested pseudo-elements stay outside forgiving selector functions", async ({
  page,
}) => {
  await page.goto("/tests/browser/fixtures/canvas-css-root.html");
  await expect(page.getByLabel("Compilation status")).toHaveText("ready");
  expect(
    await page
      .locator(".pm-canvas-isolation")
      .evaluate((node) => getComputedStyle(node, "::before").content),
  ).toBe('"root-marker"');
  expect(
    await page.locator("#supported").evaluate((node) => getComputedStyle(node, "::before").content),
  ).toBe('"nested-marker"');
  // Nesting containment is a DOM boundary, not a nested-editor scope boundary.
  await expect(page.locator("#nested-target")).toHaveCSS("padding-left", "3px");
});
