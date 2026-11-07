import { expect, test } from "@playwright/test";
import { canvasOverflowFailures, measureCanvasGeometry } from "./template-overflow";

test("overflow evidence excludes only hanging spaces while detecting real glyphs, preserved spaces and images", async ({
  page,
}) => {
  await page.setViewportSize({ width: 400, height: 400 });
  await page.setContent(`<style>
    body { margin: 0; }
    .pm-canvas { width: 400px; }
    .pm-email { width: 10ch; margin: auto; font: 16px/20px monospace; }
    p { margin: 0; white-space: pre-wrap; }
  </style><div class="pm-canvas"><div class="pm-email"><p>abcdefghij klmnopqrst uvwxyz</p></div></div>`);
  const email = page.locator(".pm-email");
  const paragraph = email.locator("p");
  const hanging = await email.evaluate(measureCanvasGeometry);
  expect(hanging.documentOverflow).toBe(0);
  expect(hanging.canvas.scrollOverflow).toBe(0);
  expect(
    hanging.rawText!.some(
      (bounds) => bounds.x + bounds.width > hanging.email.x + hanging.email.width + 1,
    ),
  ).toBe(true);
  expect(canvasOverflowFailures(hanging)).toEqual([]);

  await paragraph.evaluate((node) => {
    node.textContent = "abcdefghijZ";
    node.style.whiteSpace = "nowrap";
  });
  const glyph = await email.evaluate(measureCanvasGeometry);
  expect(canvasOverflowFailures(glyph)).toContain("text outside email: abcdefghijZ");

  await paragraph.evaluate((node) => {
    node.textContent = "abcdefghij  ";
    node.style.whiteSpace = "pre";
  });
  expect(canvasOverflowFailures(await email.evaluate(measureCanvasGeometry))).toContain(
    "text outside email: abcdefghij",
  );

  await paragraph.evaluate((node) => {
    node.textContent = "abcdefghij\u00a0";
    node.style.whiteSpace = "pre-wrap";
  });
  expect(canvasOverflowFailures(await email.evaluate(measureCanvasGeometry))).toContain(
    "text outside email: abcdefghij",
  );

  await paragraph.evaluate((node) => {
    node.textContent = "Safe";
    node.innerHTML +=
      '<img alt="overflow regression" width="140" height="10" src="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'140\' height=\'10\'/%3E">';
  });
  expect(canvasOverflowFailures(await email.evaluate(measureCanvasGeometry))).toContain(
    "img. outside email",
  );
});
