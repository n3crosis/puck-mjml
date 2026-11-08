import { expect, test } from "@playwright/test";
import { scopeDocumentCss } from "../../src/canvas-css";

const selectors = [
  String.raw`.escaped\(, .target`,
  String.raw`.escaped\[, .target`,
  String.raw`.escaped\", .target`,
  String.raw`.escaped\', .target`,
  String.raw`.escaped\\\(, .target`,
  String.raw`.escaped\28 , .target`,
  String.raw`[title="trailing\\"], .target`,
  String.raw`.unused/* ( [ ' " */, .target`,
];

test("imported selector escapes cannot style host UI or another editor", async ({ page }) => {
  for (const selector of selectors) {
    await page.setContent(`<div id="host" class="target">Host</div>
      <div class="pm-canvas-security"><div id="inside" class="target">Email</div></div>
      <div class="pm-canvas-other"><div id="other" class="target">Other editor</div></div>`);
    const { css } = scopeDocumentCss([{ css: `${selector} { color:rgb(255, 0, 0) }` }], {
      scope: "pm-canvas-security",
    });
    await page.addStyleTag({ content: css });
    await expect(page.locator("#inside"), selector).toHaveCSS("color", "rgb(255, 0, 0)");
    await expect(page.locator("#host"), selector).toHaveCSS("color", "rgb(0, 0, 0)");
    await expect(page.locator("#other"), selector).toHaveCSS("color", "rgb(0, 0, 0)");
  }
});
