import { expect, test, type Locator, type Page } from "@playwright/test";
import { waitForCanvasFontCss } from "./font-evidence";
import { readFileSync } from "node:fs";
import { loadReactEmailReference } from "./reference-document";

const templates = [
  ["papermark", "community/notifications/papermark-year-in-review", ".paper-activity-stats"],
  ["stack", "community/newsletters/stack-overflow-tips", ".stack-heart"],
  ["vercel", "community/notifications/vercel-invite-user", ".vercel-invite-details"],
] as const;

async function compiledEmail(page: Page) {
  await page.getByRole("button", { name: "Preview email" }).click();
  const dialog = page.getByRole("dialog", { name: "Email preview" });
  await expect(dialog).toBeVisible();
  const iframe = page.locator('iframe[title="Rendered email"]');
  await expect
    .poll(() => iframe.evaluate((node: HTMLIFrameElement) => node.srcdoc))
    .toContain("<html");
  const html = await iframe.evaluate((node: HTMLIFrameElement) => node.srcdoc);
  await dialog.getByRole("button", { name: "Close preview" }).click();
  return html;
}

async function cells(table: Locator) {
  return table.locator("tr > td").evaluateAll((nodes) =>
    nodes.map((node) => {
      const bounds = node.getBoundingClientRect();
      const labels = Array.from(node.querySelectorAll("p"));
      return {
        x: bounds.x,
        width: bounds.width,
        paragraphs: labels.map((label) => {
          const rect = label.getBoundingClientRect();
          const style = getComputedStyle(label);
          return {
            text: label.textContent?.trim(),
            y: rect.y,
            height: rect.height,
            size: style.fontSize,
            leading: style.lineHeight,
          };
        }),
      };
    }),
  );
}

async function paperSourceGeometry(root: Locator) {
  return root.evaluate((element) => {
    const normalize = (text: string | null | undefined) =>
      (text ?? "").replace(/\s+/g, " ").trim().toLowerCase();
    const renderedText = (node: Element) => {
      // BR separates words visually even when the source has no adjacent space.
      // Clone only for matching; geometry still comes from the untouched DOM.
      const clone = node.cloneNode(true) as Element;
      clone.querySelectorAll("br").forEach((br) => br.replaceWith(" "));
      return normalize(clone.textContent);
    };
    const targets = [
      "Papermark",
      "2024 in review",
      "Your Year with Papermark",
      "Viewers spent",
      "Your activity",
      "You uploaded",
      "25",
      "documents",
      "Your top document",
      "Your most active month",
      "September",
      "You're in the top",
      "95%",
      "of sharers on Papermark",
      "Your documents were viewed from",
      "Your documents get attention from all over the world!",
      "We're excited to support you next year! Happy Holidays from the Papermark team :)",
      "Share your stats",
      "Go to your dashboard",
    ];
    const offset = element.matches(".pm-canvas") ? element.getBoundingClientRect() : { x: 0, y: 0 };
    const nodes = Array.from(element.querySelectorAll("p,h1,h2,a,div"));
    return targets.flatMap((text) => {
      const matching = nodes.filter(
        (node) => renderedText(node) === normalize(text) && node.getBoundingClientRect().height > 0,
      );
      const leaves = matching.filter(
        (node) => !matching.some((child) => child !== node && node.contains(child)),
      );
      return leaves.map((node, occurrence) => {
        const range = node.ownerDocument.createRange();
        range.selectNodeContents(node);
        const bounds = range.getBoundingClientRect();
        return {
          text,
          occurrence,
          x: bounds.x - offset.x,
          y: bounds.y - offset.y,
          width: bounds.width,
          height: bounds.height,
        };
      });
    });
  });
}

for (const [name, id, selector] of templates) {
  test(`${name} retains source intrinsic layout in compiled and actual editor at both widths`, async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto("/");
    await page.getByRole("combobox", { name: "Email template" }).selectOption(id);
    const canvas = page.frameLocator("#preview-frame");
    await expect(canvas.locator(selector)).toBeVisible();
    const email = await page.context().newPage();
    const original = name === "papermark" ? await page.context().newPage() : null;
    try {
      if (original)
        await loadReactEmailReference(
          original,
          readFileSync(
            new URL(
              "../fixtures/react-email-reference/Community/notifications/papermark-year-in-review.html",
              import.meta.url,
            ),
            "utf8",
          ),
        );
      await email.setContent(await compiledEmail(page), { waitUntil: "load" });
      for (const [mode, width] of [
        ["Desktop", 800],
        ["Mobile", 390],
      ] as const) {
        const button = page.getByRole("button", { name: `Switch to ${mode} viewport` });
        if (!(await button.isDisabled())) await button.click();
        await expect(button).toBeDisabled();
        await expect
          .poll(() =>
            canvas.locator("html").evaluate((node) => node.ownerDocument.defaultView!.innerWidth),
          )
          .toBe(width);
        await email.setViewportSize({ width, height: 900 });
        await email.evaluate(() => document.fonts.ready);
        await waitForCanvasFontCss(canvas.locator(".pm-canvas"));
        await canvas.locator("body").evaluate((node) => node.ownerDocument.fonts.ready);
        if (name === "papermark") {
          await original!.setViewportSize({ width, height: 900 });
          await original!.evaluate(() => document.fonts.ready);
          const sourceGeometry = await paperSourceGeometry(original!.locator("body"));
          for (const root of [email.locator("body"), canvas.locator(".pm-canvas")]) {
            const geometry = await paperSourceGeometry(root);
            expect(geometry.map(({ text, occurrence }) => ({ text, occurrence }))).toEqual(
              sourceGeometry.map(({ text, occurrence }) => ({ text, occurrence })),
            );
            for (let i = 0; i < geometry.length; i++) {
              const message = `${mode} ${geometry[i].text} #${geometry[i].occurrence} source geometry`;
              for (const key of ["x", "y", "width", "height"] as const)
                expect(
                  Math.abs(geometry[i][key] - sourceGeometry[i][key]),
                  `${message} ${key}`,
                ).toBeLessThanOrEqual(1);
            }
          }
          const compiled = email.locator(`${selector} > table`);
          const live = canvas.locator(`${selector} > table`);
          await expect(compiled).toHaveCSS("table-layout", "auto");
          await expect(live).toHaveCSS("table-layout", "auto");
          const expected = await cells(compiled),
            actual = await cells(live);
          expect(actual).toHaveLength(3);
          expect(expected).toHaveLength(3);
          for (let i = 0; i < 3; i++) {
            expect(actual[i].width).toBeCloseTo(expected[i].width, 0);
            expect(
              actual[i].paragraphs.map(({ text, height, size, leading }) => ({
                text,
                height,
                size,
                leading,
              })),
            ).toEqual(
              expected[i].paragraphs.map(({ text, height, size, leading }) => ({
                text,
                height,
                size,
                leading,
              })),
            );
            expect(actual[i].paragraphs.map(({ height }) => height)).toEqual([20, 40, 32]);
          }
          if (width === 390) {
            // Source auto-layout redistribution, not three fixed equal columns.
            expect(actual[0].width).toBeGreaterThan(actual[1].width);
            expect(actual[0].width).toBeGreaterThan(actual[2].width);
          } else {
            expect(Math.abs(actual[0].width - actual[2].width)).toBeLessThan(1);
          }
          const lines = actual.map(({ paragraphs }) => paragraphs[2].y);
          expect(Math.max(...lines) - Math.min(...lines)).toBeLessThan(1);
        } else if (name === "stack") {
          for (const root of [email, canvas]) {
            const chip = root.locator(".stack-heart > div");
            const box = await chip.boundingBox();
            expect(box!.width).toBeCloseTo(27.25, 0);
            expect(box!.height).toBeCloseTo(20, 0);
            const tips = root.locator(".stack-tips li");
            await expect(tips).toHaveCount(3);
            for (let i = 0; i < 3; i++)
              await expect(tips.nth(i)).toHaveCSS("margin-bottom", i < 2 ? "16px" : "0px");
            for (const paragraph of await tips.locator("p").all())
              await expect(paragraph).toHaveCSS("margin-bottom", "0px");
          }
        } else {
          for (const root of [email, canvas]) {
            const facts = root.locator(".vercel-invite-details b, .vercel-invite-details strong");
            await expect(facts).toHaveCount(3);
            for (const fact of await facts.all()) {
              await expect(fact).toHaveCSS("font-weight", "400");
              await expect(fact).toHaveCSS("color", "rgb(0, 0, 0)");
            }
          }
        }
        for (const root of [email, canvas]) {
          expect(
            await root
              .locator("html")
              .evaluate((node) => node.scrollWidth - node.ownerDocument.defaultView!.innerWidth),
          ).toBeLessThanOrEqual(1);
        }
      }
    } finally {
      await original?.close();
      await email.close();
    }
  });
}
