import { expect, test, type Locator } from "@playwright/test";
import { hasIntrinsicLabel, intrinsicCases } from "./fixtures/native-intrinsic-layout-source";

async function waitForEditableCanvas(canvas: Locator) {
  // The fixture has a 3-by-3 table plus one text label in each group case.
  // Compilation can finish while Puck still shows its lazy-editor fallback.
  const editors = canvas.getByRole("textbox");
  await expect(editors).toHaveCount(3 * 3 + intrinsicCases.length);
  for (const editor of await editors.all())
    await expect(editor).toHaveAttribute("contenteditable", "true");
}

async function groupGeometry(row: Locator, id: string) {
  return row.evaluate((element, id) => {
    const origin = element.getBoundingClientRect();
    const rect = (node: Element) => {
      const r = node.getBoundingClientRect();
      return { x: r.x - origin.x, y: r.y - origin.y, width: r.width, height: r.height };
    };
    return Object.fromEntries(
      ["group", "symbol", "label"].map((part) => [
        part,
        rect(element.querySelector(`.${id}-${part}`)!),
      ]),
    );
  }, id);
}
async function tableGeometry(table: Locator) {
  return table.evaluate((element) => {
    const origin = element.getBoundingClientRect();
    return [...element.querySelectorAll("tr")].map((row) => ({
      height: row.getBoundingClientRect().height,
      cells: [...row.cells].map((cell) => {
        const r = cell.getBoundingClientRect();
        return { x: r.x - origin.x, y: r.y - origin.y, width: r.width, height: r.height };
      }),
    }));
  });
}
for (const width of [390, 800])
  for (const editing of [false, true]) {
    test(`native intrinsic groups and empty cells match compiled layout at ${width}px, editing=${editing}`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(
        `/tests/browser/fixtures/native-intrinsic-layout.html${editing ? "?editing" : ""}`,
      );
      await expect(page.getByLabel("Compilation status")).toHaveText("ready");
      const canvas = page.getByRole("region", { name: "Canvas" }),
        compiled = page.frameLocator("#compiled");
      if (editing) await waitForEditableCanvas(canvas);
      const groups = [];
      for (const id of intrinsicCases) {
        await expect(canvas.locator(`.${id}-symbol .pm-native-column-table`)).toHaveCSS(
          "table-layout",
          "fixed",
        );
        await expect(canvas.locator(`.${id}-label .pm-native-column-table`)).toHaveCSS(
          "table-layout",
          hasIntrinsicLabel(id) ? "auto" : "fixed",
        );
        const actual = await groupGeometry(canvas.locator(`.${id}`), id),
          expected = await groupGeometry(compiled.locator(`.${id}`), id);
        groups.push({ id, actual, expected });
      }
      const actual = await tableGeometry(canvas.locator(".intrinsic-table > table")),
        expected = await tableGeometry(compiled.locator(".intrinsic-table > table"));
      await testInfo.attach("intrinsic-layout.json", {
        body: JSON.stringify({ groups, table: { actual, expected } }, null, 2),
        contentType: "application/json",
      });
      for (const { id, actual, expected } of groups)
        for (const part of ["group", "symbol", "label"])
          for (const key of ["x", "y", "width", "height"] as const)
            expect(
              Math.abs(actual[part][key] - expected[part][key]),
              `${id} ${part} ${key}`,
            ).toBeLessThanOrEqual(1 / 64);
      expect(actual).toEqual(expected);
      expect(actual[0].height).toBe(40);
      expect(actual[1].height).toBe(40);
      expect(actual[2].height).toBe(40);
    });
  }

test("empty imported cells remain keyboard editable and restore geometry after undo", async ({
  page,
}) => {
  await page.setViewportSize({ width: 800, height: 1000 });
  await page.goto("/tests/browser/fixtures/native-intrinsic-layout.html?editing");
  await expect(page.getByLabel("Compilation status")).toHaveText("ready");
  const canvas = page.getByRole("region", { name: "Canvas" });
  await waitForEditableCanvas(canvas);
  const table = canvas.locator(".intrinsic-table > table");
  const initial = await tableGeometry(table);
  const source = await page.getByLabel("Exported MJML").textContent();
  await expect(page.getByLabel("Editor MJML")).toHaveText(source!);
  const first = table.locator("tr").first().getByRole("textbox");
  // Puck can briefly expose an uninitialized contenteditable fallback before
  // the real Tiptap textbox mounts. Only tab once all three editors are ready.
  await expect(first).toHaveCount(3);
  for (const editor of await first.all())
    await expect(editor).toHaveAttribute("contenteditable", "true");
  // Tab into the genuinely empty source cell, rather than requiring a hit on
  // its zero-height non-editing line. Focus restores the normal caret line.
  await first.nth(0).press("Tab");
  await expect(first.nth(1)).toBeFocused();
  await expect(first.nth(1).locator("p")).toHaveCSS("line-height", "20px");
  // One native insertion is one edit/history transaction, independent of the
  // test runner's typing speed relative to Puck's history debounce.
  await page.keyboard.insertText("Typed");
  await first.nth(1).press("Tab");
  await expect(table.locator(".pm-imported-empty-cell")).toHaveCount(0);
  await expect(page.getByLabel("Exported MJML")).toContainText(">Typed</td>");
  await expect
    .poll(async () => Number(await page.getByLabel("History index").textContent()))
    .toBeGreaterThan(0);
  await page.getByRole("button", { name: "Undo change" }).click();
  await expect(table.locator(".pm-imported-empty-cell")).toHaveCount(1);
  await expect(page.getByLabel("Exported MJML")).toHaveText(source!);
  await expect(page.getByLabel("Editor MJML")).toHaveText(source!);
  expect(await tableGeometry(table)).toEqual(initial);
  await page.getByRole("button", { name: "Redo change" }).click();
  await expect(table.locator(".pm-imported-empty-cell")).toHaveCount(0);
  await expect(page.getByLabel("Exported MJML")).toContainText(">Typed</td>");
});
