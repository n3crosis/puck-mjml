import { expect, test, type Locator, type Page } from "@playwright/test";
import type { EmailBlock, EmailDocument } from "../../src/types";

const fixture = "/tests/browser/fixtures/block-operations.html";
const readDocument = async (page: Page) =>
  JSON.parse((await page.getByLabel("Host document").textContent())!) as EmailDocument;
const sections = async (page: Page) => (await readDocument(page)).root.props!.sections!;
const historyIndex = async (page: Page) =>
  Number(await page.getByLabel("History index").textContent());
async function keyboardChoose(page: Page, select: Locator, value: string) {
  await select.focus();
  await page.keyboard.press("Home");
  await expect(select).toHaveValue("");
  // Reset before inspecting options: a stale prior selection is deliberately
  // represented until the user chooses again, never silently retargeted.
  const values = await select
    .locator("option")
    .evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value));
  const index = values.indexOf(value);
  expect(index).toBeGreaterThanOrEqual(0);
  for (let step = 0; step < index; step++) await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Tab");
  await expect(select).toHaveValue(value);
}

async function openPanel(page: Page) {
  const panel = page.locator(".pm-block-operations");
  const disclosure = panel.locator("summary");
  await disclosure.focus();
  await page.keyboard.press("Enter");
  await expect(panel.locator(".pm-block-operations-add")).toBeVisible();
  return panel;
}
async function add(page: Page, panel: Locator, zone: string, type: string, key = "Enter") {
  await keyboardChoose(page, panel.getByLabel("Destination", { exact: true }), zone);
  await keyboardChoose(page, panel.getByLabel("Block", { exact: true }), type);
  const button = panel.getByRole("button", { name: "Add block", exact: true });
  await expect(button).toHaveAttribute("aria-disabled", "false");
  await expect(button).toHaveAttribute("type", "button");
  await button.focus();
  const before = await historyIndex(page);
  await page.keyboard.press(key);
  await expect(button).toBeFocused();
  await expect.poll(() => historyIndex(page)).toBeGreaterThan(before);
}

test("keyboard controls build an empty email and reorders within a slot without losing edge focus or history", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1180, height: 900 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(fixture);
  const panel = await openPanel(page);
  await expect(page.locator("[data-puck-drawer-item]")).not.toHaveCount(0);
  await add(page, panel, "root:sections", "Section1");
  const first = (await sections(page))[0];
  await add(page, panel, "root:sections", "Section1", "Space");
  const second = (await sections(page))[1];
  expect(second.props.id).not.toBe(first.props.id);
  await expect(panel.getByRole("status")).toContainText("position 2");
  const earlier = panel.getByRole("button", { name: "Move earlier", exact: true });
  await earlier.focus();
  const before = await historyIndex(page);
  await page.keyboard.press("Enter");
  await expect
    .poll(async () => (await sections(page)).map((item) => item.props.id))
    .toEqual([second.props.id, first.props.id]);
  await expect.poll(() => historyIndex(page)).toBeGreaterThan(before);
  await expect(earlier).toBeFocused();
  await expect(earlier).toHaveAttribute("aria-disabled", "true");
  const unchanged = await readDocument(page);
  await page.keyboard.press("Space");
  expect(await readDocument(page)).toEqual(unchanged);
  await expect(earlier).toBeFocused();
  await page.keyboard.press("Control+z");
  await expect
    .poll(async () => (await sections(page)).map((item) => item.props.id))
    .toEqual([first.props.id, second.props.id]);
  await expect(earlier).toBeFocused();
  await page.keyboard.press("Control+Shift+z");
  await expect
    .poll(async () => (await sections(page)).map((item) => item.props.id))
    .toEqual([second.props.id, first.props.id]);
  await expect(page.getByLabel("Selected block ID")).toHaveText(second.props.id!);
  await expect(earlier).toBeFocused();
  await add(page, panel, `${first.props.id}:column`, "Text");
  const current = await sections(page);
  expect(
    current.find((item) => item.props.id === first.props.id)!.props.column as EmailBlock[],
  ).toHaveLength(1);
  expect(current.find((item) => item.props.id === second.props.id)!.props.column).toEqual([]);
  await expect(
    page.frameLocator("#preview-frame").locator('[data-puck-component^="Text-"]'),
  ).toHaveCount(1);
  expect(errors).toEqual([]);
});

for (const width of [240, 304]) {
  test(`controls remain contained in a ${width}px sidebar and collapse without leaving a mounted panel`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1180, height: 900 });
    await page.goto(`${fixture}?panel=${width}`);
    const panel = await openPanel(page);
    await add(page, panel, "root:sections", "Section3");
    await expect
      .poll(() =>
        panel.evaluate((root) =>
          [
            root,
            ...root.querySelectorAll(
              "select, button, .pm-block-operations-add, .pm-block-operations-panel, .pm-block-operations-move",
            ),
          ].every((element) => element.scrollWidth <= element.clientWidth + 1),
        ),
      )
      .toBe(true);
    const summary = panel.locator("summary");
    await summary.focus();
    await page.keyboard.press("Space");
    await expect(panel.locator(".pm-block-operations-add")).toHaveCount(0);
    await expect(summary).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(panel.locator(".pm-block-operations-add")).toBeVisible();
  });
}

for (const trusted of [false, true]) {
  test(`imported Hero additions preserve Raw policy, source history and replacement (trusted=${trusted})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1180, height: 900 });
    await page.goto(`${fixture}?imported${trusted ? "&trusted" : ""}`);
    const panel = await openPanel(page);
    const initial = JSON.parse(
      (await page.getByLabel("Editor document").textContent())!,
    ) as EmailDocument;
    await add(page, panel, "root:sections", "Hero");
    const hero = (await sections(page)).at(-1)!;
    await keyboardChoose(
      page,
      panel.getByLabel("Destination", { exact: true }),
      `${hero.props.id}:content`,
    );
    const block = panel.getByLabel("Block", { exact: true });
    await expect(block.locator('option[value="Raw"]')).toHaveCount(trusted ? 1 : 0);
    const rawRoot = panel.getByRole("button", { name: "Add block", exact: true });
    // The old Hero choice must not silently become a content block on destination change.
    await expect(rawRoot).toHaveAttribute("aria-disabled", "true");
    const prior = await readDocument(page);
    await rawRoot.focus();
    await page.keyboard.press("Enter");
    expect(await readDocument(page)).toEqual(prior);
    await expect(rawRoot).toBeFocused();
    await page.keyboard.press("Control+z");
    await expect.poll(() => readDocument(page)).toEqual(initial);
    await expect(rawRoot).toBeFocused();
    await expect(rawRoot).toHaveAttribute("aria-disabled", "true");
    await page.keyboard.press("Control+Shift+z");
    await expect.poll(async () => (await sections(page)).at(-1)!.props.id).toBe(hero.props.id);
    await add(page, panel, `${hero.props.id}:content`, trusted ? "Raw" : "Text");
    await page
      .getByRole("button", { name: "Replace with blank email", exact: true })
      .press("Enter");
    await expect.poll(() => sections(page)).toEqual([]);
    await expect(page.getByLabel("History index")).toHaveText("0");
    await expect(panel.locator(".pm-block-operations-add")).toHaveCount(0);
    await openPanel(page);
    await expect(
      panel
        .getByLabel("Destination", { exact: true })
        .locator(`option[value="${hero.props.id}:content"]`),
    ).toHaveCount(0);
  });
}

test("read-only root blocks keyboard insertion without changing data or losing Add focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1180, height: 900 });
  await page.goto(`${fixture}?locked`);
  const panel = await openPanel(page);
  const before = await readDocument(page);
  const add = panel.getByRole("button", { name: "Add block", exact: true });
  await expect(add).toHaveAttribute("aria-disabled", "true");
  await add.focus();
  await page.keyboard.press("Space");
  expect(await readDocument(page)).toEqual(before);
  await expect(add).toBeFocused();
  await expect(panel.getByRole("status")).toContainText("cannot be added");
});
