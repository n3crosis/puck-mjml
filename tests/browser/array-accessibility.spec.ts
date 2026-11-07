import { expect, test } from "@playwright/test";

const fixture = "/tests/browser/fixtures/array-accessibility.html";
const visibleFields = "[data-visible-fields]";

test("native array disclosure supports the keyboard, nesting, and read-only inspection", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(fixture);
  const fields = page.locator(visibleFields);
  const rules = fields.locator('[data-pm-array-field="CSS rules"]');
  const first = rules.getByRole("button", { name: /^First rule/ });
  const before = await page.getByLabel("Host document").textContent();
  const history = await page.getByLabel("History index").textContent();
  await expect(
    rules.getByRole("button", { name: "Add item to CSS rules", exact: true }),
  ).toBeVisible();
  await expect(first).toHaveAttribute("aria-expanded", "false");
  await first.press("Enter");
  await expect(first).toHaveAttribute("aria-expanded", "true");
  await expect(first).toBeFocused();
  await expect(rules.getByRole("textbox", { name: "Rule name", exact: true })).toHaveValue(
    "First rule",
  );
  await first.press("Space");
  await expect(first).toHaveAttribute("aria-expanded", "false");
  await first.press("Enter");
  const nested = rules.locator('[data-pm-array-field="Conditions"]');
  const condition = nested.getByRole("button", { name: /^Mobile/ });
  await condition.press("Space");
  await expect(condition).toHaveAttribute("aria-expanded", "true");
  await expect(first).toHaveAttribute("aria-expanded", "true");
  const query = nested.getByRole("textbox", { name: "Query", exact: true });
  await query.press("Enter");
  await expect(condition).toHaveAttribute("aria-expanded", "true");
  await expect(query).toBeFocused();
  const css = rules.getByRole("textbox", { name: "CSS", exact: true });
  await css.press("Escape");
  await page.keyboard.press("Tab");
  await expect(condition).toBeFocused();
  await expect(first).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByLabel("Host document")).toHaveText(before!);
  await expect(page.getByLabel("History index")).toHaveText(history!);

  const locked = fields.locator('[data-pm-array-field="Locked rules"]');
  const protectedRule = locked.getByRole("button", { name: "Protected rule", exact: true });
  await protectedRule.press("Enter");
  await expect(protectedRule).toHaveAttribute("aria-expanded", "true");
  await expect(locked.getByRole("textbox", { name: "Locked rule name" })).toHaveJSProperty(
    "readOnly",
    true,
  );
  await expect(locked.getByRole("button", { name: /Add item/ })).toHaveCount(0);

  const links = await page.locator("[data-pm-array-disclosure]").evaluateAll((nodes) =>
    nodes.map((node) => ({
      id: node.getAttribute("aria-controls"),
      ownsBody:
        node.nextElementSibling === document.getElementById(node.getAttribute("aria-controls")!),
    })),
  );
  expect(links.every((link) => link.ownsBody)).toBe(true);
  expect(new Set(links.map((link) => link.id)).size).toBe(links.length);
  await nested.getByRole("button", { name: "Add item to Conditions", exact: true }).press("Enter");
  await expect(nested.getByRole("button", { name: /^New condition/ })).toBeVisible();
  await expect(
    rules.getByRole("button", { name: "Add item to CSS rules", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("accessible array summaries retain Puck pointer reordering and native history", async ({
  page,
}) => {
  await page.goto(fixture);
  const rules = page.locator(`${visibleFields} [data-pm-array-field="CSS rules"]`);
  const summaries = rules.locator("[data-pm-array-disclosure]");
  await expect(summaries).toHaveCount(3);
  const order = () =>
    summaries.evaluateAll((nodes) => nodes.map((node) => node.firstChild!.textContent));
  await expect.poll(order).toEqual(["First rule", "Second rule", "Third rule"]);
  const first = summaries.nth(0);
  const controls = await first.getAttribute("aria-controls");
  const source = (await first.boundingBox())!;
  const target = (await summaries.nth(1).boundingBox())!;
  const x = source.x + 24;
  const y = source.y + source.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 8, y + 5, { steps: 5 });
  await page.mouse.move(x, target.y + target.height - 2, { steps: 30 });
  await page.mouse.up();
  await expect.poll(order).toEqual(["Second rule", "First rule", "Third rule"]);
  await expect(page.getByLabel("Host document")).toContainText(
    /Second rule.*First rule.*Third rule/,
  );
  await expect(summaries.nth(1)).toHaveAttribute("aria-controls", controls!);
  await page.getByRole("button", { name: "Undo array edit", exact: true }).click();
  await expect.poll(order).toEqual(["First rule", "Second rule", "Third rule"]);
  await page.getByRole("button", { name: "Redo array edit", exact: true }).click();
  await expect.poll(order).toEqual(["Second rule", "First rule", "Third rule"]);
  await summaries.nth(1).press("Enter");
  await expect(rules.getByRole("textbox", { name: "Rule name", exact: true })).toHaveValue(
    "First rule",
  );
});
