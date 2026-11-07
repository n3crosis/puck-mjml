import { expect, test, type Locator, type Page } from "@playwright/test";
import { moveToGap, nativeColumnTargets } from "./native-column-drag-target";

const sourceRow = (page: Page) =>
  page
    .frameLocator("#preview-frame")
    .locator(".editable > .pm-native-inline-section > [data-puck-dropzone]");
const destinationRow = (page: Page) =>
  page
    .frameLocator("#preview-frame")
    .locator(".drag-destination > .pm-native-inline-section > [data-puck-dropzone]");
const emptyRow = (page: Page) =>
  page
    .frameLocator("#preview-frame")
    .locator(".drag-empty > .pm-native-inline-section > [data-puck-dropzone]");
const history = async (page: Page) => Number(await page.getByLabel("History index").textContent());
async function committed(page: Page, before: number) {
  await expect.poll(() => history(page)).toBeGreaterThan(before);
}
async function authoredGeometry(page: Page) {
  // The hit area may grow, but neither the authored columns nor their Section's
  // layout box may grow or move relative to each other.
  const dimensions = (element: Element) => {
    const { width, height } = element.getBoundingClientRect();
    return { width, height };
  };
  const actualSection = await page
    .frameLocator("#preview-frame")
    .locator(".drag-authored")
    .evaluate(dimensions);
  const expectedSection = await page
    .frameLocator("#compiled")
    .locator(".drag-authored")
    .evaluate(dimensions);
  for (const key of ["width", "height"] as const)
    expect(
      Math.abs(actualSection[key] - expectedSection[key]),
      `active Section ${key}`,
    ).toBeLessThanOrEqual(1 / 64);
  const position = (element: Element) => {
    const parent = element.closest(".drag-authored")!.getBoundingClientRect(),
      r = element.getBoundingClientRect();
    return { x: r.x - parent.x, y: r.y - parent.y, width: r.width, height: r.height };
  };
  for (const name of ["drag-authored-a", "drag-authored-b"]) {
    const actual = await page.frameLocator("#preview-frame").locator(`.${name}`).evaluate(position);
    const expected = await page.frameLocator("#compiled").locator(`.${name}`).evaluate(position);
    for (const key of ["x", "y", "width", "height"] as const)
      expect(Math.abs(actual[key] - expected[key]), `active ${name} ${key}`).toBeLessThanOrEqual(
        1 / 64,
      );
  }
}
async function begin(page: Page, source: Locator) {
  const emptySection = page.frameLocator("#preview-frame").locator(".drag-empty");
  const emptyBefore = await emptySection.boundingBox();
  if (!emptyBefore) throw new Error("Missing empty Section geometry");
  await source.scrollIntoViewIfNeeded();
  const bounds = await source.boundingBox();
  if (!bounds) throw new Error("Missing drag source");
  const x = bounds.x + bounds.width / 2,
    y = bounds.y + bounds.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 12, y + 5, { steps: 5 });
  await expect(page.getByLabel("Drag state")).toHaveText("true");
  // Both rows must be ready before the pointer enters the destination. This
  // catches circular activation based on a line placeholder already existing.
  for (const target of [sourceRow(page), destinationRow(page)]) {
    await expect(target).toHaveAttribute("data-pm-native-dragging", "true");
    await expect(target).toHaveCSS("display", "flex");
    await expect(target).toHaveCSS("padding", "8px");
    await expect(target).toHaveCSS("margin", "-8px");
  }
  await expect(
    page.frameLocator("#preview-frame").locator(".editable-group > [data-puck-dropzone]"),
  ).toHaveCSS("padding", "0px");
  await expect
    .poll(async () => {
      const current = await emptySection.boundingBox();
      return current
        ? Math.max(
            Math.abs(current.width - emptyBefore.width),
            Math.abs(current.height - emptyBefore.height),
          )
        : Infinity;
    })
    .toBeLessThanOrEqual(1 / 64);
}
async function rest(page: Page) {
  await expect(page.getByLabel("Drag state")).toHaveText("false");
  const frame = page.frameLocator("#preview-frame");
  await expect(frame.locator("[data-pm-native-dragging]")).toHaveCount(0);
  await expect(frame.locator("[data-puck-line-placeholder]")).toHaveCount(0);
  await expect(sourceRow(page)).toHaveCSS("display", "block");
  await expect(destinationRow(page)).toHaveCSS("display", "block");
  for (const row of [sourceRow(page), destinationRow(page), emptyRow(page)]) {
    await expect(row).toHaveCSS("padding", "0px");
    await expect(row).toHaveCSS("margin", "0px");
  }
  await expect(frame.locator(".editable > .pm-native-inline-section")).toHaveCSS(
    "display",
    "block",
  );
  await expect(page.getByLabel("Compilation status")).toHaveText("ready");
  // Final source geometry must return after both successful drops and cancel.
  const position = (element: Element) => {
    const section = element.closest(".editable")!.getBoundingClientRect(),
      r = element.getBoundingClientRect();
    return { x: r.x - section.x, y: r.y - section.y, width: r.width, height: r.height };
  };
  // Puck's commit-FLIP transform can outlive ui.isDragging by 250ms. Poll the
  // final measured boxes rather than treating an in-flight transform as drift.
  await expect
    .poll(async () => {
      const actual = await frame.locator(".editable-group").evaluate(position);
      const expected = await page
        .frameLocator("#compiled")
        .locator(".editable-group")
        .evaluate(position);
      return Math.max(
        ...(["x", "y", "width", "height"] as const).map((key) =>
          Math.abs(actual[key] - expected[key]),
        ),
      );
    })
    .toBeLessThanOrEqual(1 / 64);
}
const order = (row: Locator) =>
  row
    .locator(":scope > [data-puck-component]")
    .evaluateAll((elements) =>
      elements.map(
        (element) =>
          ["editable-solo", "editable-group", "destination-a", "destination-b"].find((name) =>
            element.classList.contains(name),
          ) || "inserted",
      ),
    );

async function expectOrder(page: Page, section: number, expected: string[]) {
  const row =
    section === 0 ? sourceRow(page) : section === 1 ? destinationRow(page) : emptyRow(page);
  await expect.poll(() => order(row)).toEqual(expected);
  await expect
    .poll(
      async () =>
        JSON.parse((await page.getByLabel("Document column order").textContent())!)[section],
    )
    .toEqual(expected);
}

for (const direction of ["ltr", "rtl"])
  for (const viewport of ["Desktop", "Mobile"]) {
    test(`native column handle/body/palette/cross-row drag and cancel in ${direction} ${viewport}`, async ({
      page,
    }) => {
      test.setTimeout(120_000);
      await page.setViewportSize({ width: 1600, height: 1400 });
      await page.goto(`/tests/browser/fixtures/native-column-edit.html?dir=${direction}`);
      await expect(page.getByLabel("Compilation status")).toHaveText("ready");
      const frame = page.frameLocator("#preview-frame");
      const selectViewport = async () => {
        const width = viewport === "Mobile" ? 390 : 800;
        const button = page.getByRole("button", { name: `Switch to ${viewport} viewport` });
        if (await button.isEnabled()) await button.click();
        await page.locator("#compiled").evaluate((element, width) => {
          (element as HTMLIFrameElement).style.width = `${width}px`;
        }, width);
        // Puck animates the iframe width. Capture drag geometry only after the
        // exact CSS width and the iframe's own viewport reach the requested size.
        for (const selector of ["#preview-frame", "#compiled"]) {
          await expect(page.locator(selector)).toHaveCSS("width", `${width}px`);
          await expect
            .poll(() =>
              page
                .frameLocator(selector)
                .locator("html")
                .evaluate((element) => element.ownerDocument.defaultView!.innerWidth),
            )
            .toBe(width);
        }
      };
      await selectViewport();
      await rest(page);
      const selectColumn = async () => {
        await page.getByRole("button", { name: "Select first column", exact: true }).click();
        return frame.getByRole("button", { name: "Drag to reorder", exact: true });
      };
      const handle = await selectColumn();
      await begin(page, handle);
      await expect(sourceRow(page).locator(nativeColumnTargets)).toHaveCount(1);
      await expect(sourceRow(page).locator(nativeColumnTargets)).toHaveClass(/editable-group/);
      await expect(frame.locator(".editable-group > [data-puck-dropzone]")).toHaveCSS(
        "flex-direction",
        "row",
      );
      await expect(
        frame.locator(".drag-authored > .pm-native-inline-section > [data-puck-dropzone]"),
      ).toHaveCSS("flex-direction", "row");
      await authoredGeometry(page);
      await moveToGap(page, sourceRow(page), 1, direction);
      const before = Number(await page.getByLabel("History index").textContent());
      await page.mouse.up();
      await expectOrder(page, 0, ["editable-group", "editable-solo"]);
      await rest(page);
      await expect
        .poll(async () => Number(await page.getByLabel("History index").textContent()))
        .toBeGreaterThan(before);
      await page.getByRole("button", { name: /^undo$/i }).click();
      await expectOrder(page, 0, ["editable-solo", "editable-group"]);
      await selectViewport();
      await rest(page);
      await page.getByRole("button", { name: /^redo$/i }).click();
      await expectOrder(page, 0, ["editable-group", "editable-solo"]);
      await selectViewport();
      await rest(page);
      await page.getByRole("button", { name: /^undo$/i }).click();
      await expectOrder(page, 0, ["editable-solo", "editable-group"]);
      await selectViewport();
      await rest(page);

      // Direct body movement uses Puck's fluid path, unlike the action-bar handle.
      const solo = frame.locator(".editable-solo");
      await solo.scrollIntoViewIfNeeded();
      const bounds = await solo.boundingBox();
      if (!bounds) throw new Error("Missing fluid drag geometry");
      // The fixture supplies real 8px Column padding. Prove this point does not
      // hit the nested Text component's independent PointerSensor.
      expect(
        await solo.evaluate((element) => {
          const r = element.getBoundingClientRect();
          return (
            element.ownerDocument
              .elementFromPoint(r.x + 2, r.y + 2)
              ?.closest("[data-puck-component]") === element
          );
        }),
      ).toBe(true);
      const beforeBody = await history(page);
      await page.mouse.move(bounds.x + 2, bounds.y + 2);
      await page.mouse.down();
      await page.mouse.move(bounds.x + 14, bounds.y + 7, { steps: 5 });
      await expect(page.getByLabel("Drag state")).toHaveText("true");
      const group = await frame.locator(".editable-group").boundingBox();
      if (!group) throw new Error("Missing active fluid target");
      await authoredGeometry(page);
      await page.mouse.move(
        viewport === "Mobile"
          ? group.x + group.width / 2
          : direction === "rtl"
            ? group.x + 2
            : group.x + group.width - 2,
        viewport === "Mobile" ? group.y + group.height - 2 : group.y + group.height / 2,
        { steps: 30 },
      );
      await page.mouse.up();
      await expectOrder(page, 0, ["editable-group", "editable-solo"]);
      await rest(page);
      await committed(page, beforeBody);
      await expect(page.getByRole("button", { name: /^undo$/i })).toBeEnabled();
      await page.getByRole("button", { name: /^undo$/i }).click();
      await expectOrder(page, 0, ["editable-solo", "editable-group"]);
      await selectViewport();

      const beforeCross = await history(page);
      await begin(page, await selectColumn());
      await moveToGap(page, destinationRow(page), 1, direction);
      await page.mouse.up();
      await expectOrder(page, 1, ["destination-a", "editable-solo", "destination-b"]);
      await expectOrder(page, 0, ["editable-group"]);
      await rest(page);
      await committed(page, beforeCross);
      await page.getByRole("button", { name: /^undo$/i }).click();
      await expectOrder(page, 1, ["destination-a", "destination-b"]);
      await selectViewport();

      const palette = page.getByRole("button", { name: "Column", exact: true });
      await begin(page, palette);
      await moveToGap(page, destinationRow(page), 0, direction);
      await page.keyboard.press("Escape");
      await page.mouse.up();
      await rest(page);
      await expectOrder(page, 1, ["destination-a", "destination-b"]);
      const beforePalette = await history(page);
      await begin(page, palette);
      await moveToGap(page, destinationRow(page), 0, direction);
      await page.mouse.up();
      await expectOrder(page, 1, ["inserted", "destination-a", "destination-b"]);
      await rest(page);
      await committed(page, beforePalette);
      await page.getByRole("button", { name: /^undo$/i }).click();
      await expectOrder(page, 1, ["destination-a", "destination-b"]);
      await selectViewport();
      await rest(page);

      const beforeEmpty = await history(page);
      await begin(page, palette);
      await expect(emptyRow(page)).toHaveAttribute(
        "data-pm-native-drag-axis",
        viewport === "Mobile" ? "y" : "x",
      );
      await moveToGap(page, emptyRow(page), 0, direction);
      await page.mouse.up();
      await expectOrder(page, 3, ["inserted"]);
      await rest(page);
      await committed(page, beforeEmpty);
      await page.getByRole("button", { name: /^undo$/i }).click();
      await expectOrder(page, 3, []);
      await selectViewport();
      await rest(page);

      // Host replacement can interrupt a pointer drag. Its keyed Puck instance
      // and bridge must clean up even when the original pointer is still down.
      await begin(page, await selectColumn());
      await page
        .getByRole("button", { name: "Replace source", exact: true })
        .evaluate((element) => (element as HTMLButtonElement).click());
      // Replacement itself must clear the old instance before mouseup can
      // contribute any cleanup. The new document also changes group alignment.
      await expect(page.getByLabel("Drag state")).toHaveText("false");
      await expect(frame.locator(".editable-group")).toHaveCSS("vertical-align", "bottom");
      await expect(frame.locator("[data-pm-native-dragging]")).toHaveCount(0);
      await expect(frame.locator("[data-puck-line-placeholder]")).toHaveCount(0);
      await expect.poll(() => history(page)).toBe(0);
      await page.mouse.up();
      await selectViewport();
      await rest(page);
      await expect.poll(() => history(page)).toBe(0);
      await expectOrder(page, 0, ["editable-solo", "editable-group"]);
    });
  }

test("custom bridged Puck host preserves disabled column drag permissions", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/tests/browser/fixtures/native-column-edit.html?direct=1&locked=1");
  await page.getByRole("button", { name: "Select first column", exact: true }).click();
  const frame = page.frameLocator("#preview-frame");
  await expect(frame.locator(".editable-solo")).toHaveAttribute("data-puck-disabled", "");
  await expect(frame.getByRole("button", { name: "Drag to reorder", exact: true })).toHaveCount(0);
  await expect(frame.locator("[data-pm-native-dragging]")).toHaveCount(0);
});
