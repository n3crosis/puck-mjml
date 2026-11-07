import { expect, type Locator, type Page } from "@playwright/test";

import { nativeColumnTargets } from "./native-column-drag-selectors";
export { nativeColumnTargets } from "./native-column-drag-selectors";

export async function moveToGap(page: Page, row: Locator, index: number, direction: string) {
  // Puck leaves an inert clone in the source row. It is not a destination and
  // must not shift a requested gap from after the last sibling to before it.
  const items = row.locator(nativeColumnTargets);
  const count = await items.count();
  if (!count) {
    await row.scrollIntoViewIfNeeded();
    const bounds = await row.boundingBox();
    if (!bounds) throw new Error("Missing empty row");
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 10, { steps: 30 });
    const marker = row.locator(":scope > [data-puck-line-placeholder]");
    await expect(marker).toBeVisible();
    const size = await marker.boundingBox();
    if ((await row.getAttribute("data-pm-native-drag-axis")) === "y") {
      expect(size!.height).toBeLessThanOrEqual(4);
      expect(size!.width).toBeGreaterThan(10);
    }
    return;
  }
  const target = items.nth(Math.min(index, count - 1));
  await target.scrollIntoViewIfNeeded();
  const bounds = await target.boundingBox();
  if (!bounds) throw new Error("Missing drag target");
  const axis = await row.getAttribute("data-pm-native-drag-axis");
  expect(index).toBeGreaterThanOrEqual(0);
  expect(index).toBeLessThanOrEqual(count);
  const after = index === count;
  const x =
    axis === "y"
      ? bounds.x + bounds.width / 2
      : direction === "rtl"
        ? after
          ? bounds.x + 2
          : bounds.x + bounds.width - 2
        : after
          ? bounds.x + bounds.width - 2
          : bounds.x + 2;
  const y =
    axis === "y"
      ? after
        ? bounds.y + bounds.height - 2
        : bounds.y + 2
      : bounds.y + bounds.height / 2;
  await page.mouse.move(x, y, { steps: 30 });
  await page.mouse.move(x + 0.25, y + 0.25, { steps: 2 });
  const marker = row.locator(":scope > [data-puck-line-placeholder]");
  await expect(marker).toBeVisible();
  // A visible line at the old gap is not enough. Verify the actual insertion
  // edge after Puck's nested-zone update has settled, without sleeping.
  await expect
    .poll(async () => {
      const size = await marker.boundingBox();
      const targetBounds = await target.boundingBox();
      if (!size || !targetBounds) return Infinity;
      const edge =
        axis === "y"
          ? targetBounds.y + (after ? targetBounds.height : 0)
          : targetBounds.x + ((direction === "rtl") !== after ? targetBounds.width : 0);
      const line = axis === "y" ? size.y + size.height / 2 : size.x + size.width / 2;
      return Math.abs(line - edge);
    })
    .toBeLessThanOrEqual(1 / 64);
  const size = await marker.boundingBox();
  expect(size).not.toBeNull();
  if (axis === "x") {
    expect(size!.width).toBeLessThanOrEqual(4);
    expect(size!.height).toBeGreaterThan(10);
  } else {
    expect(size!.height).toBeLessThanOrEqual(4);
    expect(size!.width).toBeGreaterThan(10);
  }
}
