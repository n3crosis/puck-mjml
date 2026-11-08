import { expect, test, type Locator, type Page } from "@playwright/test";
import { waitForCanvasFontCss } from "./font-evidence";
import { readFileSync, writeFileSync } from "node:fs";
import {
  measurePaperSourceGeometry,
  paperGeometryDifferences,
  type PaperGeometry,
} from "./community-source-geometry";
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

type PaperRepresentation = {
  geometry: PaperGeometry;
  cells: Awaited<ReturnType<typeof cells>>;
  layout: string;
  overflow: number;
  fonts: { status: string; faces: { family: string; weight: string; status: string }[] };
};
type PaperCapture = {
  mode: string;
  width: number;
  original: PaperRepresentation;
  compiled: PaperRepresentation;
  canvas: PaperRepresentation;
};
async function capturePaper(root: Locator, table: Locator): Promise<PaperRepresentation> {
  return {
    geometry: await root.evaluate(measurePaperSourceGeometry),
    cells: await cells(table),
    layout: await table.evaluate((node) => getComputedStyle(node).tableLayout),
    ...(await root.evaluate((node) => ({
      overflow:
        node.ownerDocument.documentElement.scrollWidth - node.ownerDocument.defaultView!.innerWidth,
      fonts: {
        status: node.ownerDocument.fonts.status,
        faces: Array.from(node.ownerDocument.fonts, ({ family, weight, status }) => ({
          family,
          weight,
          status,
        })),
      },
    }))),
  };
}
function paperTableDifferences(capture: PaperCapture): string[] {
  const failures: string[] = [];
  const check = (valid: boolean, message: string) => {
    if (!valid) failures.push(`${capture.mode}: ${message}`);
  };
  for (const [name, actual] of Object.entries({
    original: capture.original,
    compiled: capture.compiled,
    canvas: capture.canvas,
  })) {
    check(actual.layout === "auto", `${name} table layout ${actual.layout}, expected auto`);
    check(actual.overflow <= 1, `${name} document overflow ${actual.overflow}`);
    check(actual.cells.length === 3, `${name} cell count ${actual.cells.length}, expected 3`);
    for (let i = 0; i < actual.cells.length; i++) {
      const expected = capture.original.cells[i];
      if (!expected) continue;
      const column = actual.cells[i];
      check(
        Math.abs(column.width - expected.width) < 0.5,
        `${name} cell ${i} width ${column.width}, original ${expected.width}`,
      );
      check(
        Math.abs(column.x - expected.x) <= 1,
        `${name} cell ${i} x ${column.x}, original ${expected.x}`,
      );
      check(
        column.paragraphs.length === 3,
        `${name} cell ${i} paragraph count ${column.paragraphs.length}, expected 3`,
      );
      for (let j = 0; j < column.paragraphs.length; j++) {
        const paragraph = column.paragraphs[j],
          source = expected.paragraphs[j];
        if (!source) continue;
        for (const property of ["text", "height", "size", "leading"] as const)
          check(
            paragraph[property] === source[property],
            `${name} cell ${i} paragraph ${j} ${property}: ${paragraph[property]}, original ${source[property]}`,
          );
        check(
          paragraph.height === [20, 40, 32][j],
          `${name} cell ${i} paragraph ${j} source line height changed`,
        );
        check(
          Math.abs(paragraph.y - source.y) <= 1,
          `${name} cell ${i} paragraph ${j} y ${paragraph.y}, original ${source.y}`,
        );
      }
    }
    if (actual.cells.length === 3) {
      if (capture.width === 390) {
        check(
          actual.cells[0].width > actual.cells[1].width &&
            actual.cells[0].width > actual.cells[2].width,
          `${name} lost source mobile intrinsic column redistribution`,
        );
      } else
        check(
          Math.abs(actual.cells[0].width - actual.cells[2].width) < 1,
          `${name} desktop columns are not equal`,
        );
      const lines = actual.cells.flatMap(({ paragraphs }) =>
        paragraphs[2] ? [paragraphs[2].y] : [],
      );
      check(
        lines.length === 3 && Math.max(...lines) - Math.min(...lines) < 1,
        `${name} statistics row does not remain aligned`,
      );
    }
  }
  return failures;
}

for (const [name, id, selector] of templates) {
  test(`${name} retains source intrinsic layout in compiled and actual editor at both widths`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto("/");
    await page.getByRole("combobox", { name: "Email template" }).selectOption(id);
    const canvas = page.frameLocator("#preview-frame");
    await expect(canvas.locator(selector)).toBeVisible();
    const email = await page.context().newPage();
    const original = name === "papermark" ? await page.context().newPage() : null;
    const paperCaptures: PaperCapture[] = [];
    const paperFailures: string[] = [];
    let attached = false;
    const attachEvidence = async () => {
      if (name !== "papermark" || attached) return;
      const path = testInfo.outputPath("papermark-source-geometry.json");
      writeFileSync(
        path,
        JSON.stringify({ captures: paperCaptures, failures: paperFailures }, null, 2),
      );
      await testInfo.attach("papermark-source-geometry", { path, contentType: "application/json" });
      attached = true;
    };
    try {
      if (original)
        await loadReactEmailReference(
          original,
          readFileSync(
            new URL(
              "../../.cache/react-email-reference/Community/notifications/papermark-year-in-review.html",
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
          // Capture every target and all three representations at both widths
          // before any geometry assertion. A mismatch must not hide later data.
          const sourceTable = original!
            .locator("p")
            .filter({ hasText: /^You uploaded$/ })
            .locator("xpath=ancestor::table[1]");
          paperCaptures.push({
            mode,
            width,
            original: await capturePaper(original!.locator("body"), sourceTable),
            compiled: await capturePaper(
              email.locator("body"),
              email.locator(`${selector} > table`),
            ),
            canvas: await capturePaper(
              canvas.locator(".pm-canvas"),
              canvas.locator(`${selector} > table`),
            ),
          });
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
        if (name !== "papermark")
          for (const root of [email, canvas]) {
            expect(
              await root
                .locator("html")
                .evaluate((node) => node.scrollWidth - node.ownerDocument.defaultView!.innerWidth),
            ).toBeLessThanOrEqual(1);
          }
      }
      if (name === "papermark") {
        for (const capture of paperCaptures) {
          for (const representation of ["compiled", "canvas"] as const)
            paperFailures.push(
              ...paperGeometryDifferences(
                capture.original.geometry,
                capture[representation].geometry,
                `${capture.mode} ${representation}`,
              ),
            );
          paperFailures.push(...paperTableDifferences(capture));
        }
        if (paperCaptures.length !== 2)
          paperFailures.push(`Captured ${paperCaptures.length} widths, expected 2`);
        await attachEvidence();
        expect(
          paperFailures,
          "All Papermark source geometry discrepancies; see attached complete evidence",
        ).toEqual([]);
      }
    } finally {
      await attachEvidence();
      await original?.close();
      await email.close();
    }
  });
}
