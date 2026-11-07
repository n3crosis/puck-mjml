import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { expect, test } from "@playwright/test";

const require = createRequire(import.meta.url);
const runtime = readFileSync(
  join(dirname(require.resolve("@tailwindcss/browser/package.json")), "dist/index.global.js"),
  "utf8",
);

test("Tailwind requires host permission and owns each compiler's runtime, CSS and lifecycle", async ({
  page,
}) => {
  let approvedLoads = 0;
  let documentLoads = 0;
  await page.route("**/tailwind-runtime.js", async (route) => {
    approvedLoads += 1;
    await route.fulfill({ contentType: "application/javascript", body: runtime });
  });
  await page.route("**/document-script.js", async (route) => {
    documentLoads += 1;
    await route.fulfill({
      contentType: "application/javascript",
      body: "window.parent.document.body.dataset.untrusted = 'executed'",
    });
  });
  await page.goto("/tests/browser/fixtures/tailwind.html");
  await expect(page.locator("#first")).toBeVisible();
  await expect(page.locator("iframe[data-pm-tailwind-compiler]")).toHaveCount(0);
  expect(approvedLoads).toBe(0);
  expect(documentLoads).toBe(0);

  const update = async (value: Record<string, unknown>) =>
    page.evaluate((next) => {
      (
        window as unknown as { updateTailwindFixture: (value: Record<string, unknown>) => void }
      ).updateTailwindFixture(next);
    }, value);
  await update({ permission: true });
  await expect(page.locator("iframe[data-pm-tailwind-compiler]")).toHaveCount(2);
  await expect(page.locator("#first")).toHaveCSS("font-weight", "700");
  await expect(page.locator("#first")).toHaveCSS("padding", "16px");
  await expect(page.locator("#first")).toHaveCSS("rotate", "45deg");
  await expect(page.locator("#first")).toHaveCSS("translate", /^8px(?: 0px)?$/);
  await expect(page.locator("#first")).toHaveCSS("animation-name", /pm-canvas-.*-spin/);
  await expect(page.locator("#second")).toHaveCSS("padding", "32px");
  await expect(page.locator("#second")).toHaveCSS("rotate", "90deg");
  await expect(page.locator("#host-control")).toHaveCSS("font-weight", "300");
  expect(approvedLoads).toBe(2);
  expect(documentLoads).toBe(0);
  await expect(page.locator("body")).not.toHaveAttribute("data-untrusted");

  await update({ className: "font-normal p-2 rotate-12" });
  await expect(page.locator("#first")).toHaveCSS("font-weight", "400");
  await expect(page.locator("#first")).toHaveCSS("padding", "8px");
  await expect(page.locator("#first")).toHaveCSS("rotate", "12deg");
  await expect(page.locator("#second")).toHaveCSS("padding", "32px");

  await update({ enabled: false });
  await expect(page.locator("iframe[data-pm-tailwind-compiler]")).toHaveCount(1);
  await expect(page.locator("#first")).toHaveCSS("padding", "0px");
  await expect(page.locator("#second")).toHaveCSS("padding", "32px");
  await expect(page.locator("#host-style")).toHaveCount(1);

  await update({ enabled: true });
  await expect(page.locator("iframe[data-pm-tailwind-compiler]")).toHaveCount(2);
  await expect(page.locator("#first")).toHaveCSS("padding", "8px");
  await update({ showFirst: false });
  await expect(page.locator("iframe[data-pm-tailwind-compiler]")).toHaveCount(1);
  await expect(page.locator("style[data-pm-tailwind-css]")).toHaveCount(1);
  await expect(page.locator("#second")).toHaveCSS("padding", "32px");

  await update({ permission: false });
  await expect(page.locator("iframe[data-pm-tailwind-compiler]")).toHaveCount(0);
  await expect(page.locator("style[data-pm-tailwind-css]")).toHaveCount(0);
  await expect(page.locator("#second")).toHaveCSS("padding", "0px");
  await expect(page.locator("#host-style")).toHaveCount(1);
  await expect(page.locator("#host-control")).toHaveCSS("font-weight", "300");
  expect(documentLoads).toBe(0);
});
