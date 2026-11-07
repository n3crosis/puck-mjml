import { readFileSync } from "node:fs";
import { expect, test, type Locator } from "@playwright/test";
import { inspectArtwork } from "./artwork-evidence";
import { waitForCanvasFontCss } from "./font-evidence";
import { loadReactEmailReference } from "./reference-document";

test.describe.configure({ timeout: 120_000 });

const titles = ["Workflow improvements", "Reporting & visibility", "API & integrations"];
const body =
  "Built for teams who need reliability at scale: clearer behavior, better defaults, and less back-and-forth to get work done.";
const bulletCopy =
  "These updates roll out gradually. Check your workspace to see what's available to you today.";

async function rectangle(locator: Locator) {
  return locator.evaluate((element) => {
    const { x, y, width, height } = element.getBoundingClientRect();
    return { x, y, width, height };
  });
}

async function geometry(root: Locator, headings = titles) {
  const rows = [];
  for (const [index, title] of headings.entries()) {
    rows.push({
      title: await rectangle(root.getByText(title, { exact: true })),
      body: await rectangle(root.getByText(body, { exact: true }).nth(index)),
      link: await rectangle(
        root.getByRole("link", { name: "Learn about Pro", exact: true }).nth(index),
      ),
      image: await rectangle(root.locator('img[src$="barebones-image-2.png"]').nth(index + 2)),
    });
  }
  // Earlier cards have independent spacing contracts. A shared first-row
  // origin excludes that drift and editor chrome while retaining inter-row gaps.
  const origin = rows[0].image.y;
  return rows.map(
    (row) =>
      Object.fromEntries(
        Object.entries(row).map(([key, rect]) => [key, { ...rect, y: rect.y - origin }]),
      ) as typeof row,
  );
}

async function checkpoints(root: Locator) {
  const origin = (await rectangle(root.locator("h1"))).y;
  const points = [
    root.getByText("Share with your team", { exact: true }),
    root.getByRole("link", { name: "Explore updates", exact: true }).nth(0),
    root.getByText("Quality-of-life fixes", { exact: true }),
    root.getByText(titles[0], { exact: true }),
    ...Array.from({ length: 4 }, (_value, index) =>
      root.getByText(bulletCopy, { exact: true }).nth(index),
    ),
    root.getByRole("link", { name: "Explore updates", exact: true }).nth(2),
    root.getByText(/Get the app\.\s*The fastest, easiest way to use Barebones\./),
    root.getByText(
      "Barebones is the catchy slogan that perfectly encapsulates the vision of our company.",
      { exact: true },
    ),
  ];
  return Promise.all(
    points.map(async (point) => {
      const rect = await rectangle(point);
      return { ...rect, y: rect.y - origin };
    }),
  );
}

for (const width of [800, 390]) {
  test(`Barebone alternating rows match original centers and flow at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto("/");
    await page
      .getByRole("combobox", { name: "Email template" })
      .selectOption("01-barebone/product-update");
    await page.getByRole("button", { name: "Preview email" }).click();
    const dialog = page.getByRole("dialog", { name: "Email preview" });
    await expect(dialog).toBeVisible();
    await expect(
      page.frameLocator('iframe[title="Rendered email"]').getByText(titles[0], { exact: true }),
    ).toBeVisible();
    const html = await page
      .locator('iframe[title="Rendered email"]')
      .evaluate((iframe: HTMLIFrameElement) => iframe.srcdoc);
    await dialog.getByRole("button", { name: "Close preview" }).click();
    await expect(dialog).toBeHidden();

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

    const reference = await page.context().newPage();
    const compiled = await page.context().newPage();
    try {
      await reference.setViewportSize({ width, height: 900 });
      await compiled.setViewportSize({ width, height: 900 });
      await loadReactEmailReference(
        reference,
        readFileSync(
          new URL(
            "../fixtures/react-email-reference/01-Barebone/product-update.html",
            import.meta.url,
          ),
          "utf8",
        ),
      );
      await reference.locator("body").evaluate(inspectArtwork, { decode: true });
      await compiled.setContent(html, { waitUntil: "load" });
      await compiled.locator("body").evaluate(inspectArtwork, { decode: true });
      const expected = await geometry(reference.locator("body"));
      const actuals = {
        compiled: await geometry(compiled.locator("body")),
        canvas: await geometry(canvas),
      };
      const cumulative = {
        reference: await checkpoints(reference.locator("body")),
        compiled: await checkpoints(compiled.locator("body")),
        canvas: await checkpoints(canvas),
      };
      await testInfo.attach(`barebone-alternating-rows-${width}.json`, {
        body: JSON.stringify({ width, reference: expected, ...actuals, cumulative }, null, 2),
        contentType: "application/json",
      });
      for (const [representation, rows] of Object.entries(actuals)) {
        for (const [index, row] of rows.entries()) {
          for (const element of ["title", "body", "link", "image"] as const) {
            for (const dimension of ["x", "y", "width", "height"] as const) {
              expect(
                Math.abs(row[element][dimension] - expected[index][element][dimension]),
                `${representation} ${titles[index]} ${element}.${dimension}`,
              ).toBeLessThanOrEqual(0.06);
            }
          }
          if (width === 800) {
            // Both peers share a center, rather than one middle-aligned
            // inline-block being positioned against a top-aligned sibling.
            const textHeight = row.link.y + row.link.height + 2 - row.title.y;
            expect(
              Math.abs(row.title.y + textHeight / 2 - (row.image.y + row.image.height / 2)),
            ).toBeLessThanOrEqual(0.03);
            expect(row.image.width).toBeGreaterThan(index === 1 ? 241.8 : 221.8);
          } else {
            expect(row.image.width).toBe(294);
            expect(row.title.x).toBe(48);
            expect(row.title.width).toBe(294);
            if (index === 1) {
              // Preserve source order: text then image only in the middle row.
              expect(row.image.y - (row.link.y + row.link.height + 2)).toBe(32);
            } else {
              expect(row.title.y - row.image.y - row.image.height).toBe(32);
            }
          }
        }
      }
      for (const representation of ["compiled", "canvas"] as const) {
        for (const [index, rect] of cumulative[representation].entries()) {
          expect(
            Math.abs(rect.y - cumulative.reference[index].y),
            `${representation} cumulative checkpoint ${index}`,
          ).toBeLessThanOrEqual(0.125);
        }
      }
      for (const root of [compiled.locator("body"), canvas]) {
        for (const square of await root.locator(".bare-bullet-square p").all()) {
          expect((await rectangle(square)).width).toBe(26);
          expect((await rectangle(square)).height).toBe(26);
        }
        const lastStep = await rectangle(
          root.getByText(
            "Invite teammates so everyone sees the same improvements and clear next steps.",
            { exact: true },
          ),
        );
        const firstButton = await rectangle(
          root.getByRole("link", { name: "Explore updates", exact: true }).nth(0),
        );
        expect(firstButton.y - lastStep.y - lastStep.height).toBe(40);
      }
      for (const root of [reference.locator("body"), compiled.locator("body"), canvas]) {
        const links = root.getByRole("link", { name: "Learn about Pro", exact: true });
        for (let index = 0; index < 3; index++) {
          await expect(links.nth(index)).toHaveAttribute("href", "https://example.com/");
          await expect(links.nth(index)).toHaveAttribute("target", "_blank");
          await expect(links.nth(index)).toHaveCSS("text-decoration-line", "none");
        }
        expect(
          await root.evaluate(
            (element) =>
              element.ownerDocument.documentElement.scrollWidth -
              element.ownerDocument.defaultView!.innerWidth,
          ),
        ).toBe(0);
      }

      // The corrected rows remain native editable blocks. Recompilation must
      // recenter naturally after a real text edit, then restore after undo.
      await canvas.getByText(titles[0], { exact: true }).dblclick();
      const editable = canvas.locator('.bare-alternating-column [contenteditable="true"]');
      await expect(editable).toBeVisible();
      await editable.press("ControlOrMeta+End");
      await page.keyboard.insertText(" updated");
      const editedTitles = [titles[0] + " updated", ...titles.slice(1)];
      await expect(canvas.getByText(editedTitles[0], { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Preview email" }).click();
      await expect(dialog).toBeVisible();
      await expect(
        page
          .frameLocator('iframe[title="Rendered email"]')
          .getByText(editedTitles[0], { exact: true }),
      ).toBeVisible();
      const editedHtml = await page
        .locator('iframe[title="Rendered email"]')
        .evaluate((iframe: HTMLIFrameElement) => iframe.srcdoc);
      await dialog.getByRole("button", { name: "Close preview" }).click();
      await expect(dialog).toBeHidden();
      await compiled.setContent(editedHtml, { waitUntil: "load" });
      await compiled.locator("body").evaluate(inspectArtwork, { decode: true });
      await waitForCanvasFontCss(canvas);
      await canvas.evaluate(inspectArtwork, { decode: true });
      const editedExpected = await geometry(compiled.locator("body"), editedTitles);
      const editedActual = await geometry(canvas, editedTitles);
      for (const [index, row] of editedExpected.entries()) {
        for (const element of ["title", "body", "link", "image"] as const) {
          for (const dimension of ["x", "y", "width", "height"] as const) {
            expect(
              Math.abs(editedActual[index][element][dimension] - row[element][dimension]),
              `edited ${titles[index]} ${element}.${dimension}`,
            ).toBeLessThanOrEqual(0.06);
          }
        }
      }
      await page.getByRole("button", { name: /^undo$/i }).click();
      await expect(canvas.getByText(titles[0], { exact: true })).toBeVisible();
      expect(await geometry(canvas)).toEqual(actuals.canvas);
    } finally {
      await compiled.close();
      await reference.close();
    }
  });
}
