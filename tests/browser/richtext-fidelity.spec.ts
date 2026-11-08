import { expect, test, type FrameLocator, type Locator, type Page } from "@playwright/test";
import { importedRichContentSource } from "./fixtures/imported-rich-content-source";
async function importFixture(page: Page) {
  await page.getByLabel("Import MJML", { exact: true }).setInputFiles({
    name: "rich-content.mjml",
    mimeType: "application/xml",
    buffer: Buffer.from(importedRichContentSource),
  });
}

async function exportedMjml(page: Page) {
  await page.getByRole("button", { name: "Export email", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Export email", exact: true });
  await dialog.getByRole("button", { name: "MJML", exact: true }).click();
  const source = await dialog.getByRole("textbox", { name: "MJML source" }).inputValue();
  await dialog.getByRole("button", { name: "Close export" }).click();
  return source;
}

async function expectFrameViewport(frame: FrameLocator, viewport: "Desktop" | "Mobile") {
  const width = viewport === "Mobile" ? 390 : 800;
  // The preview iframe animates its width. Selected controls and an unchanged
  // anchor count do not prove that its responsive stylesheet has switched yet.
  await expect
    .poll(() =>
      frame.locator("html").evaluate((element, expectedWidth) => {
        const view = element.ownerDocument.defaultView!;
        return {
          width: view.innerWidth,
          mediaMatches: view.matchMedia(`(width: ${expectedWidth}px)`).matches,
        };
      }, width),
    )
    .toEqual({ width, mediaMatches: true });
}

async function selectCanvasViewport(page: Page, viewport: "Desktop" | "Mobile") {
  const button = page.getByRole("button", { name: `Switch to ${viewport} viewport` });
  if (await button.isEnabled()) await button.click();
  await expect(button).toBeDisabled();
  await expectFrameViewport(page.frameLocator("#preview-frame"), viewport);
}

async function selectPreviewViewport(page: Page, viewport: "Desktop" | "Mobile") {
  const preview = page.getByRole("dialog", { name: "Email preview" });
  const button = preview.getByRole("button", {
    name: viewport === "Mobile" ? "Mobile" : "Responsive",
    exact: true,
  });
  if ((await button.getAttribute("aria-pressed")) !== "true") await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
  await expectFrameViewport(page.frameLocator('iframe[title="Rendered email"]'), viewport);
}

async function labelStyles(anchors: Locator) {
  return anchors.evaluateAll((nodes) =>
    nodes.map((node) => {
      const style = node.ownerDocument.defaultView!.getComputedStyle(node);
      return {
        text: node.textContent!.replace(/\s+/g, " ").trim(),
        color: style.color,
        decoration: style.textDecorationLine,
      };
    }),
  );
}

for (const viewport of ["Desktop", "Mobile"] as const) {
  {
    const count = 2;
    test(`imported text preserves ${count} non-navigating labels on the ${viewport} canvas`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1600, height: 1000 });
      await page.goto("/");
      await importFixture(page);
      await selectCanvasViewport(page, viewport);
      const canvas = page.frameLocator("#preview-frame");
      const labels = canvas.locator(".pm-text a:not([href])");
      await expect(labels).toHaveCount(count);
      const source = await exportedMjml(page);
      await page.getByRole("button", { name: "Preview email", exact: true }).click();
      const preview = page.getByRole("dialog", { name: "Email preview" });
      await selectPreviewViewport(page, viewport);
      const compiledLabels = page
        .frameLocator('iframe[title="Rendered email"]')
        .locator("a:not([href])")
        .filter({ hasText: /\S/ });
      await expect(compiledLabels).toHaveCount(count);
      const expected = await labelStyles(compiledLabels);
      await preview.getByRole("button", { name: "Close preview", exact: true }).click();
      await selectCanvasViewport(page, viewport);
      expect(await labelStyles(labels)).toEqual(expected);
      expect(
        await labels.evaluateAll((nodes) =>
          nodes.every(
            (node) =>
              !node.hasAttribute("role") &&
              !node.hasAttribute("tabindex") &&
              !node.hasAttribute("target"),
          ),
        ),
      ).toBe(true);
      expect(await exportedMjml(page)).toBe(source);
    });
  }

  test(`Imported text retains anchor styling through ${viewport} inline edit and undo`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto("/");
    await importFixture(page);
    await selectCanvasViewport(page, viewport);
    const canvas = page.frameLocator("#preview-frame");
    const labels = canvas.locator(".pm-text a:not([href])");
    await expect(labels).toHaveCount(2);
    const originalLabels = await labelStyles(labels);
    const originalSource = await exportedMjml(page);
    const block = canvas.locator(".pm-text").filter({ hasText: "Primary label" });
    await block.locator("a:not([href])").first().dblclick();
    const editor = block.getByRole("textbox");
    await expect(editor).toBeVisible();
    await editor.click();
    await expect(editor).toBeFocused();
    await editor.press("ControlOrMeta+End");
    await page.keyboard.insertText(" Edited.");
    await expect(block).toContainText("Edited.");
    await expect(labels).toHaveCount(2);
    await expect.poll(() => exportedMjml(page)).toContain("Edited.");
    await page.getByRole("button", { name: /^undo$/i }).click();
    await expect.poll(() => exportedMjml(page)).toBe(originalSource);
    // Native undo includes viewport UI, so verify and restore the requested
    // width before comparing the responsive anchor styling.
    await expect
      .poll(() =>
        canvas.locator("html").evaluate((element) => element.ownerDocument.defaultView!.innerWidth),
      )
      .toBe(800);
    await selectCanvasViewport(page, viewport);
    await expect(labels).toHaveCount(2);
    expect(await labelStyles(labels)).toEqual(originalLabels);
    expect(await exportedMjml(page)).toBe(originalSource);
  });

  test(`Table labels stay 10px and values 12px through ${viewport} inline edit and undo`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto("/");
    await importFixture(page);
    await selectCanvasViewport(page, viewport);
    const canvas = page.frameLocator("#preview-frame");
    const cells = canvas.locator(".details td");
    const labels = cells.locator("p:first-child");
    const values = cells.locator("p:not(:first-child)");
    const checkType = async (invoiceDate = "Sample date") => {
      const paragraphs = [
        ["REFERENCE", "First value", "Second value"],
        ["DATE", invoiceDate],
      ];
      await expect(cells).toHaveCount(2);
      await expect(labels).toHaveText(paragraphs.map(([label]) => label));
      // Preserve separate value paragraphs, rather than folding them into line breaks.
      await expect(values).toHaveCount(3);
      for (const [index, expected] of paragraphs.entries()) {
        await expect(cells.nth(index).locator("p")).toHaveText(expected);
      }
      for (const label of await labels.all()) {
        await expect(label).toHaveCSS("font-size", "10px");
        await expect(label).toHaveCSS("color", "rgb(102, 102, 102)");
      }
      for (const value of await values.all()) {
        await expect(value).toHaveCSS("font-size", "12px");
        // Chromium can report logical start after inheriting a native table
        // alignment hint. Check both its direction and physical text position,
        // rather than imposing an inline CSS value that changes TH defaults.
        await expect(value).toHaveCSS("text-align", /^(left|start)$/);
        await expect(value).toHaveCSS("direction", "ltr");
        await expect
          .poll(() =>
            value.evaluate((paragraph) => {
              const range = paragraph.ownerDocument.createRange();
              range.selectNodeContents(paragraph);
              const first = Array.from(range.getClientRects()).find(
                (rect) => rect.width > 0 && rect.height > 0,
              );
              if (!first) return Number.POSITIVE_INFINITY;
              const style = paragraph.ownerDocument.defaultView!.getComputedStyle(paragraph);
              const left =
                paragraph.getBoundingClientRect().left +
                Number.parseFloat(style.borderLeftWidth) +
                Number.parseFloat(style.paddingLeft);
              return Math.abs(first.left - left);
            }),
          )
          .toBeLessThanOrEqual(1);
      }
      await expect(canvas.locator(".details a:not([href])")).toHaveCount(0);
    };
    await checkType();
    const initial = await exportedMjml(page);
    const cell = canvas.locator(".details td").filter({ hasText: "DATE" });
    await cell.getByText("Sample date", { exact: true }).dblclick();
    const editor = cell.getByRole("textbox");
    await expect(editor).toBeVisible();
    await editor.click();
    await expect(editor).toBeFocused();
    await editor.press("ControlOrMeta+End");
    await page.keyboard.insertText(" Edited.");
    await expect(cell).toContainText("Sample date Edited.");
    await expect(page.getByRole("button", { name: /^undo$/i })).toBeEnabled();
    await expect.poll(() => exportedMjml(page)).toContain("Sample date Edited.");
    await checkType("Sample date Edited.");
    await page.getByRole("button", { name: /^undo$/i }).click();
    await expect.poll(() => exportedMjml(page)).toBe(initial);
    await expect
      .poll(() =>
        canvas.locator("html").evaluate((element) => element.ownerDocument.defaultView!.innerWidth),
      )
      .toBe(800);
    await selectCanvasViewport(page, viewport);
    await checkType();
    expect(await exportedMjml(page)).toBe(initial);
    const path = testInfo.outputPath(`table-richtext-${viewport.toLowerCase()}.png`);
    await canvas.locator(".details").screenshot({ path });
    await testInfo.attach(`Table after edit and undo (${viewport})`, {
      path,
      contentType: "image/png",
    });
  });

  test(`authored paragraph resets match compiled ${viewport} layout through edit and undo`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto("/");
    await page.getByLabel("Import MJML", { exact: true }).setInputFiles({
      name: "paragraph-cascade.mjml",
      mimeType: "application/xml",
      buffer: Buffer.from(`<mjml><mj-head>
        <mj-attributes><mj-all font-family="Arial" font-size="14px" line-height="28px" />
          <mj-text padding="0px" /><mj-table padding="0px" cellpadding="0" cellspacing="0" />
        </mj-attributes><mj-style>
          p { margin:0; font-size:14px; font-weight:500; line-height:28px; }
          h2 { margin:0; font-size:21px; font-weight:400; line-height:26px; }
          p + p { margin-top:12px; }
          .paragraph-details p + p { line-height:20px; }
          .paragraph-details td { width:50%; vertical-align:top; }
          @media (max-width:479px) {
            .paragraph-details td { display:block; width:auto; }
          }
        </mj-style></mj-head><mj-body width="600px"><mj-section padding="0px"><mj-column>
          <mj-text css-class="paragraph-copy"><h2>Authored heading</h2><p>Text label</p><p>Text value</p></mj-text>
          <mj-table css-class="paragraph-details"><tr>
            <td><p>First label</p><p>First value</p></td>
            <td><p>Second label</p><p>Second value</p></td>
          </tr></mj-table>
          <mj-text css-class="paragraph-after">Following content</mj-text>
        </mj-column></mj-section></mj-body></mjml>`),
    });
    await selectCanvasViewport(page, viewport);
    const canvas = page.frameLocator("#preview-frame");
    await expect(canvas.locator(".paragraph-details p")).toHaveCount(4);
    const original = await exportedMjml(page);

    const measure = (frame: FrameLocator) =>
      frame.locator(".paragraph-copy").evaluate((copy) => {
        const document = copy.ownerDocument;
        const view = document.defaultView!;
        const origin = copy.getBoundingClientRect();
        const geometry = (element: Element) => {
          const box = element.getBoundingClientRect();
          return {
            x: box.x - origin.x,
            y: box.y - origin.y,
            width: box.width,
            height: box.height,
          };
        };
        return {
          blocks: [".paragraph-copy", ".paragraph-details", ".paragraph-after"].map((selector) =>
            geometry(document.querySelector(selector)!),
          ),
          paragraphs: Array.from(
            document.querySelectorAll(
              ".paragraph-copy h2, .paragraph-copy p, .paragraph-details p",
            ),
            (paragraph) => {
              const style = view.getComputedStyle(paragraph);
              return {
                box: geometry(paragraph),
                marginTop: style.marginTop,
                marginBottom: style.marginBottom,
                fontSize: style.fontSize,
                fontWeight: style.fontWeight,
                lineHeight: style.lineHeight,
              };
            },
          ),
        };
      });

    await page.getByRole("button", { name: "Preview email", exact: true }).click();
    await selectPreviewViewport(page, viewport);
    const compiled = page.frameLocator('iframe[title="Rendered email"]');
    await expect(compiled.locator(".paragraph-details p")).toHaveCount(4);
    const expected = await measure(compiled);
    expect(expected.blocks[1].height).toBe(viewport === "Mobile" ? 120 : 60);
    await page.getByRole("button", { name: "Close preview", exact: true }).click();
    await selectCanvasViewport(page, viewport);
    await expect.poll(() => measure(canvas)).toEqual(expected);

    const cell = canvas.locator(".paragraph-details td").filter({ hasText: "Second label" });
    await cell.getByText("Second value", { exact: true }).dblclick();
    const editor = cell.getByRole("textbox");
    await expect(editor).toBeVisible();
    const separator = canvas.getByRole("separator", {
      name: "Resize columns 1 and 2",
      exact: true,
    });
    const selectedTable = canvas
      .locator(".pm-selection-actions")
      .getByText("Table", { exact: true });
    await expect(selectedTable).toBeVisible();
    await expect(separator).toHaveCount(viewport === "Mobile" ? 0 : 1);
    // Puck's viewport buttons clear component selection. Reopen the same cell
    // normally at each width: stacked cells must not expose a column handle,
    // while the restored horizontal grid must offer one again.
    for (const mode of [viewport === "Mobile" ? "Desktop" : "Mobile", viewport] as const) {
      await test.step(`Switch to ${mode} and reselect the table`, async () => {
        await selectCanvasViewport(page, mode);
        await expect(selectedTable).toHaveCount(0);
        await expect(separator).toHaveCount(0);
        await cell.getByText("Second value", { exact: true }).dblclick();
        await expect(editor).toBeVisible();
        await expect(editor).toBeFocused();
        await expect(selectedTable).toBeVisible();
        await expect(separator).toHaveCount(mode === "Mobile" ? 0 : 1);
      });
    }
    await expect.poll(() => measure(canvas)).toEqual(expected);
    await editor.click();
    await expect(editor).toBeFocused();
    await editor.press("ControlOrMeta+End");
    await page.keyboard.insertText(" Edited.");
    await expect(cell).toContainText("Second value Edited.");
    await expect.poll(() => exportedMjml(page)).toContain("Second value Edited.");
    await expect.poll(() => measure(canvas)).toEqual(expected);
    await page.getByRole("button", { name: /^undo$/i }).click();
    await expect.poll(() => exportedMjml(page)).toBe(original);
    await expect
      .poll(() =>
        canvas.locator("html").evaluate((element) => element.ownerDocument.defaultView!.innerWidth),
      )
      .toBe(800);
    await selectCanvasViewport(page, viewport);
    await expect.poll(() => measure(canvas)).toEqual(expected);
  });
}

test("imported native defaults resist host tag resets without adding synthetic paragraph margins", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Import MJML", { exact: true }).setInputFiles({
    name: "native-typography.mjml",
    mimeType: "application/xml",
    buffer: Buffer.from(`<mjml><mj-head><mj-attributes>
      <mj-text font-family="Arial" font-size="14px" line-height="28px" />
    </mj-attributes></mj-head><mj-body><mj-section><mj-column>
      <mj-text css-class="native-defaults"><p>First</p><h2>Heading</h2><p>Middle</p><p>Last</p></mj-text>
      <mj-text css-class="synthetic-paragraph">Plain source</mj-text>
    </mj-column></mj-section></mj-body></mjml>`),
  });
  const canvas = page.frameLocator("#preview-frame");
  const middle = canvas.locator(".native-defaults p").filter({ hasText: "Middle" });
  const heading = canvas.locator(".native-defaults h2");
  await expect(middle).toBeVisible();
  await canvas.locator("html").evaluate((element) => {
    const style = element.ownerDocument.createElement("style");
    style.textContent =
      "p, h1, h2, h3, h4, h5, h6 { margin:37px; font-size:38px; font-weight:100; line-height:9px; }";
    element.ownerDocument.head.append(style);
  });
  await expect(middle).toHaveCSS("margin-top", "14px");
  await expect(middle).toHaveCSS("margin-bottom", "14px");
  await expect(middle).toHaveCSS("font-size", "14px");
  await expect(middle).toHaveCSS("font-weight", "400");
  await expect(middle).toHaveCSS("line-height", "28px");
  await expect(heading).toHaveCSS("font-size", "21px");
  await expect(heading).toHaveCSS("font-weight", "700");
  await expect(heading).toHaveCSS("line-height", "28px");
  const synthetic = canvas.locator(".synthetic-paragraph");
  await synthetic.getByText("Plain source", { exact: true }).dblclick();
  const editor = synthetic.getByRole("textbox");
  await expect(editor).toBeVisible();
  await editor.click();
  await expect(editor).toBeFocused();
  await expect(synthetic.locator("p")).toHaveCSS("margin", "0px");
  await expect(synthetic.locator("p")).toHaveCSS("font-size", "14px");
  await expect(synthetic.locator("p")).toHaveCSS("line-height", "28px");
});
