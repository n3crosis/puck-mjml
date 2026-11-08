import { expect, test, type Locator, type Page } from "@playwright/test";
import type { EmailBlock, EmailDocument } from "../../src/types";
import {
  intrinsicImage24,
  intrinsicImage96,
  intrinsicImageUrl,
  intrinsicLargeImageUrl,
  intrinsicModes,
  intrinsicReplacementUrl,
} from "./fixtures/intrinsic-layout-data";
import { chooseImportFile } from "./import-email";

// Chromium lays out at 1/64 CSS px. Evidence is never rounded, offset-fitted,
// clipped, or modified to make this comparison pass.
const layoutQuantum = 1 / 64;
const fixture = "/tests/browser/fixtures/intrinsic-layout.html";

async function routeImages(page: Page) {
  for (const [url, base64] of [
    [intrinsicImageUrl, intrinsicImage24],
    [intrinsicReplacementUrl, intrinsicImage24],
    [intrinsicLargeImageUrl, intrinsicImage96],
  ]) {
    await page.route(url, (route) =>
      route.fulfill({ contentType: "image/png", body: Buffer.from(base64, "base64") }),
    );
  }
}

const probes = [
  ...intrinsicModes.flatMap((mode) => [
    `.mode-${mode}`,
    ...["a", "b", "c", "d", "nested", "icon-cell", "label-cell"].map((part) => `.${mode}-${part}`),
    `.${mode}-icon img`,
    `.${mode}-auto-image img`,
    `.${mode}-short p`,
    `.${mode}-long p`,
    `.${mode}-label p`,
  ]),
  ".width-requested",
  ".requested-cell",
  ".requested-image img",
  ".width-omitted",
  ".omitted-cell",
  ".omitted-image img",
  ".narrow-host",
  ".width-constrained",
  ".constrained-cell",
  ".constrained-image img",
];

async function geometry(origin: Locator) {
  return origin.evaluate((element, selectors) => {
    const doc = element.ownerDocument;
    const root = element.getBoundingClientRect();
    return {
      origin: { x: root.x, y: root.y, width: root.width, height: root.height },
      viewport: doc.defaultView!.innerWidth,
      document: {
        clientWidth: doc.documentElement.clientWidth,
        scrollWidth: doc.documentElement.scrollWidth,
      },
      boxes: Object.fromEntries(
        selectors.map((selector) => {
          const node = doc.querySelector<HTMLElement>(selector);
          if (!node) throw new Error(`Missing intrinsic layout probe: ${selector}`);
          const bounds = node.getBoundingClientRect(),
            css = getComputedStyle(node);
          return [
            selector,
            {
              x: bounds.x - root.x,
              y: bounds.y - root.y,
              width: bounds.width,
              height: bounds.height,
              absoluteX: bounds.x,
              absoluteY: bounds.y,
              clientWidth: node.clientWidth,
              scrollWidth: node.scrollWidth,
              overflowX: css.overflowX,
              overflowY: css.overflowY,
              display: css.display,
              tagName: node.tagName,
            },
          ];
        }),
      ),
    };
  }, probes);
}

type Geometry = Awaited<ReturnType<typeof geometry>>;

function compareGeometry(actual: Geometry, expected: Geometry, label: string) {
  for (const selector of probes)
    for (const axis of ["x", "y", "width", "height"] as const)
      expect(
        Math.abs(actual.boxes[selector][axis] - expected.boxes[selector][axis]),
        `${label}: ${selector} ${axis}`,
      ).toBeLessThanOrEqual(layoutQuantum);
}

function assertLayoutContract(value: Geometry, width: number, label: string) {
  expect(value.origin.width, `${label}: email width`).toBe(
    Math.min(600, value.document.clientWidth),
  );
  expect(value.document.scrollWidth, `${label}: document containment`).toBeLessThanOrEqual(
    value.document.clientWidth,
  );
  for (const mode of intrinsicModes) {
    const row = value.boxes[`.mode-${mode}`];
    const cells = ["a", "b", "c", "d"].map((part) => value.boxes[`.${mode}-${part}`]);
    for (const cell of cells) {
      expect(cell.x, `${label}: ${mode} cell left`).toBeGreaterThanOrEqual(row.x - layoutQuantum);
      expect(cell.x + cell.width, `${label}: ${mode} cell right`).toBeLessThanOrEqual(
        row.x + row.width + layoutQuantum,
      );
    }
    if (width >= 560 || mode === "keep") {
      for (const cell of cells)
        expect(Math.abs(cell.y - cells[0].y), `${label}: ${mode} same row`).toBeLessThanOrEqual(
          layoutQuantum,
        );
      const widths = cells.map((cell) => cell.width);
      // The actual fixture has unequal preferred content widths. This detects
      // accidental equal-column allocation even if both renderers copied it.
      expect(
        Math.max(...widths) - Math.min(...widths),
        `${label}: content-driven widths`,
      ).toBeGreaterThan(16);
    } else if (mode === "stack") {
      for (const [index, cell] of cells.entries()) {
        expect(
          Math.abs(cell.width - row.width),
          `${label}: full-width mobile cell`,
        ).toBeLessThanOrEqual(layoutQuantum);
        if (index)
          expect(cell.y, `${label}: stack source order`).toBeGreaterThanOrEqual(
            cells[index - 1].y + cells[index - 1].height - layoutQuantum,
          );
      }
    } else {
      for (const cell of cells)
        expect(
          Math.abs(cell.width - row.width / 2),
          `${label}: two-column width`,
        ).toBeLessThanOrEqual(layoutQuantum);
      expect(cells[1].x, `${label}: second mobile cell`).toBeGreaterThan(cells[0].x);
      expect(
        Math.abs(cells[2].x - cells[0].x),
        `${label}: third mobile cell wraps`,
      ).toBeLessThanOrEqual(layoutQuantum);
      expect(cells[2].y, `${label}: second mobile row`).toBeGreaterThan(cells[0].y);
    }
    const icon = value.boxes[`.${mode}-icon img`];
    const iconCell = value.boxes[`.${mode}-icon-cell`];
    const labelCell = value.boxes[`.${mode}-label-cell`];
    expect(icon.width, `${label}: requested 16px nested icon`).toBe(16);
    expect(iconCell.width, `${label}: icon plus authored right padding`).toBe(24);
    expect(
      Math.abs(labelCell.x - iconCell.x - iconCell.width),
      `${label}: nested label placement`,
    ).toBeLessThanOrEqual(layoutQuantum);
    expect(
      Math.abs(iconCell.y - labelCell.y),
      `${label}: nested keep remains a row`,
    ).toBeLessThanOrEqual(layoutQuantum);
    const image = value.boxes[`.${mode}-auto-image img`];
    expect(image.x + image.width, `${label}: omitted image fits cell`).toBeLessThanOrEqual(
      cells[3].x + cells[3].width - 8 + layoutQuantum,
    );
  }
  expect(
    value.boxes[".requested-image img"].width,
    `${label}: natural24 enlarges to requested64`,
  ).toBe(64);
  expect(
    value.boxes[".omitted-image img"].width,
    `${label}: auto table uses natural24 contribution`,
  ).toBe(24);
  expect(value.boxes[".narrow-host"].width, `${label}: authored narrow allocation`).toBe(32);
  expect(
    value.boxes[".constrained-cell"].width,
    `${label}: table must not expand narrow allocation`,
  ).toBe(32);
  expect(value.boxes[".constrained-image img"].width, `${label}: requested64 constrains to32`).toBe(
    32,
  );
  for (const [selector, box] of Object.entries(value.boxes)) {
    expect(box.overflowX, `${label}: ${selector} does not hide overflow`).not.toMatch(
      /hidden|clip/,
    );
    expect(box.overflowY, `${label}: ${selector} does not hide overflow`).not.toMatch(
      /hidden|clip/,
    );
    // scrollWidth/clientWidth are integer CSSOM measures, unlike raw boxes.
    expect(
      box.scrollWidth - box.clientWidth,
      `${label}: ${selector} scroll containment`,
    ).toBeLessThanOrEqual(1);
  }
}

async function readyImages(root: Locator) {
  await expect(root.locator("img")).toHaveCount(9);
  for (const image of await root.locator("img").all()) {
    await expect
      .poll(() =>
        image.evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth > 0),
      )
      .toBe(true);
  }
}

for (const width of [800, 520, 390])
  for (const editing of [false, true]) {
    test(`editable intrinsic rows match independent tables at ${width}px, editing=${editing}`, async ({
      page,
    }, testInfo) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await routeImages(page);
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(`${fixture}${editing ? "?editing" : ""}`);
      await expect(page.getByLabel("Compilation status")).toHaveText("ready");
      const canvas = page.getByRole("region", { name: "Canvas" });
      const compiled = page.frameLocator("#compiled"),
        oracle = page.frameLocator("#oracle");
      if (editing) {
        const editors = canvas.getByRole("textbox");
        await expect(editors).toHaveCount(9);
        for (const editor of await editors.all())
          await expect(editor).toHaveAttribute("contenteditable", "true");
      }
      await readyImages(canvas);
      await readyImages(compiled.locator("body"));
      await readyImages(oracle.locator("body"));
      const actual = await geometry(canvas.locator(".main-section"));
      const exported = await geometry(compiled.locator(".main-section"));
      const expected = await geometry(oracle.locator(".email"));
      // Attach all three raw captures before any geometry assertion, including
      // when the independent oracle itself fails the narrow-image contract.
      await testInfo.attach("intrinsic-layout-geometry.json", {
        body: JSON.stringify(
          { width, editing, layoutQuantum, actual, exported, expected },
          null,
          2,
        ),
        contentType: "application/json",
      });
      assertLayoutContract(expected, width, "plain table oracle");
      assertLayoutContract(exported, width, "compiled MJML");
      assertLayoutContract(actual, width, "Puck canvas");
      compareGeometry(exported, expected, "compiled versus independent oracle");
      compareGeometry(actual, expected, "canvas versus independent oracle");
      // The editable CSS table must remain valid div structure. Real table
      // tags containing Puck's slot divs would be browser-repaired/fostered.
      const structure = await canvas
        .locator(".pm-intrinsic-table, .pm-intrinsic-cell")
        .evaluateAll((nodes) =>
          nodes.map((node) => ({ tag: node.tagName, parentTable: Boolean(node.closest("table")) })),
        );
      expect(structure.length).toBeGreaterThan(0);
      for (const node of structure) expect(node).toEqual({ tag: "DIV", parentTable: false });
      for (const root of [canvas, compiled.locator("body"), oracle.locator("body")]) {
        await expect(root.locator(".requested-image img")).toHaveAttribute("width", "64");
        await expect(root.locator(".constrained-image img")).toHaveAttribute("width", "64");
        await expect(root.locator(".omitted-image img")).not.toHaveAttribute("width");
        await expect
          .poll(() =>
            root
              .locator(".requested-image img")
              .evaluate((node: HTMLImageElement) => node.naturalWidth),
          )
          .toBe(24);
      }
      expect(errors).toEqual([]);
    });
  }

async function openEditor(page: Page) {
  await routeImages(page);
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto(`${fixture}?editor`);
  await expect(page.getByLabel("Compilation status")).toHaveText("ready");
  const frame = page.frameLocator("#preview-frame");
  await expect(frame.locator(".stack-short").getByRole("textbox")).toHaveAttribute(
    "contenteditable",
    "true",
  );
  return frame;
}

const historyIndex = async (page: Page) =>
  Number(await page.getByLabel("History index").textContent());

test("intrinsic text and image use real Puck controls and preserve undo/redo", async ({ page }) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const frame = await openEditor(page);
  const text = frame.locator(".stack-short").getByRole("textbox");
  const original = await page.getByLabel("Exported MJML").textContent();
  const beforeText = await historyIndex(page);
  await text.click();
  await text.press("ControlOrMeta+A");
  await page.keyboard.insertText("Edited intrinsic copy");
  await text.press("Tab");
  await expect(page.getByLabel("Host document")).toContainText("Edited intrinsic copy");
  await expect.poll(() => historyIndex(page)).toBeGreaterThan(beforeText);
  await page.getByRole("button", { name: /^undo$/i }).click();
  await expect(text).toHaveText("Short");
  await expect(page.getByLabel("Exported MJML")).toHaveText(original!);
  await page.getByRole("button", { name: /^redo$/i }).click();
  await expect(text).toHaveText("Edited intrinsic copy");
  await expect(page.getByLabel("Compilation status")).toHaveText("ready");

  const image = frame.locator(".stack-auto-image img");
  await image.click();
  await expect(page.getByLabel("Selected block type")).toHaveText("Image");
  const source = page.getByRole("textbox", { name: "Image URL", exact: true });
  await expect(source).toHaveValue(intrinsicLargeImageUrl);
  const beforeImage = await historyIndex(page);
  const typingInput = await source.elementHandle();
  if (!typingInput) throw new Error("Missing visible Image URL input");
  await source.click();
  await source.press("ControlOrMeta+A");
  await source.pressSequentially(intrinsicImageUrl);
  await expect(source).toHaveValue(intrinsicImageUrl);
  await expect(source).toBeFocused();
  expect(
    await typingInput.evaluate(
      (node) => node.isConnected && node === node.ownerDocument.activeElement,
    ),
  ).toBe(true);
  await source.press("Tab");
  await expect(image).toHaveAttribute("src", intrinsicImageUrl);
  await expect(image).not.toHaveAttribute("width");
  await expect.poll(() => historyIndex(page)).toBeGreaterThan(beforeImage);
  await page.getByRole("button", { name: /^undo$/i }).click();
  await expect(image).toHaveAttribute("src", intrinsicLargeImageUrl);
  await expect(text).toHaveText("Edited intrinsic copy");
  await page.getByRole("button", { name: /^redo$/i }).click();
  await expect(image).toHaveAttribute("src", intrinsicImageUrl);
  await expect(text).toHaveText("Edited intrinsic copy");

  // An unfinished native class name is an ordinary invalid head draft. Keep
  // the selected field mounted while reporting it, including across a public
  // host root replacement, correction, and both Undo transitions.
  const headInput = await source.elementHandle();
  if (!headInput) throw new Error("Missing native-head-check Image URL input");
  const field = source.locator("..");
  const beforeInvalidHead = await historyIndex(page);
  await page.getByRole("button", { name: "Set invalid native head", exact: true }).click();
  await expect.poll(() => historyIndex(page)).toBeGreaterThan(beforeInvalidHead);
  await expect(page.getByLabel("Selected block ID")).toHaveText("stack-auto-image");
  await expect(source).toBeVisible();
  await expect(source).toHaveValue(intrinsicImageUrl);
  await expect(field.getByRole("alert")).toHaveText(
    "MJML class definitions need one nonempty name",
  );
  await expect(page.getByLabel("Export error")).toContainText(
    "MJML class definitions need one nonempty name",
  );
  expect(await headInput.evaluate((node) => node.isConnected)).toBe(true);
  const beforeHeadCorrection = await historyIndex(page);
  await page.getByRole("button", { name: "Correct native head", exact: true }).click();
  await expect.poll(() => historyIndex(page)).toBeGreaterThan(beforeHeadCorrection);
  await expect(field.getByRole("alert")).toHaveCount(0);
  await expect(page.getByLabel("Export error")).toBeEmpty();
  await expect(image).toHaveAttribute("src", intrinsicImageUrl);
  expect(await headInput.evaluate((node) => node.isConnected)).toBe(true);
  await page.getByRole("button", { name: /^undo$/i }).click();
  await expect(field.getByRole("alert")).toHaveText(
    "MJML class definitions need one nonempty name",
  );
  expect(await headInput.evaluate((node) => node.isConnected)).toBe(true);
  await page.getByRole("button", { name: /^undo$/i }).click();
  await expect(field.getByRole("alert")).toHaveCount(0);
  await expect(page.getByLabel("Export error")).toBeEmpty();
  await expect(page.getByLabel("Selected block ID")).toHaveText("stack-auto-image");
  await expect(image).toHaveAttribute("src", intrinsicImageUrl);
  expect(await headInput.evaluate((node) => node.isConnected)).toBe(true);

  // Exercise the native file chooser and the ordinary host-owned upload API
  // from inside a cell, rather than replacing data through a test-only action.
  await image.click();
  const upload = page.locator(".pm-upload").filter({ visible: true });
  await expect(upload).toHaveCount(1);
  const pendingInput = await source.elementHandle();
  if (!pendingInput) throw new Error("Missing pending-upload Image URL input");
  const chooser = page.waitForEvent("filechooser");
  await upload.click();
  const png = Buffer.from(intrinsicImage24, "base64");
  await (await chooser).setFiles({ name: "intrinsic.png", mimeType: "image/png", buffer: png });
  await expect(page.getByLabel("Uploaded file")).toHaveText(`intrinsic.png:${png.length}`);
  await expect(field).toHaveAttribute("aria-busy", "true");
  await expect(field.getByRole("status")).toHaveText("Uploading image…");
  await expect(image).toHaveAttribute("src", intrinsicImageUrl);
  const beforeSibling = await historyIndex(page);
  await page.getByRole("button", { name: "Update sibling text", exact: true }).click();
  await expect(frame.locator(".stack-long").getByRole("textbox")).toHaveText(
    "Sibling changed while upload was pending",
  );
  await expect(page.getByLabel("Selected block ID")).toHaveText("stack-auto-image");
  await expect.poll(() => historyIndex(page)).toBeGreaterThan(beforeSibling);
  await expect(field).toHaveAttribute("aria-busy", "true");
  expect(await pendingInput.evaluate((node) => node.isConnected)).toBe(true);
  const beforeCompletion = await historyIndex(page);
  await page.getByRole("button", { name: "Complete pending upload", exact: true }).click();
  await expect(image).toHaveAttribute("src", intrinsicReplacementUrl);
  await expect(image).not.toHaveAttribute("width");
  await expect(field).toHaveAttribute("aria-busy", "false");
  expect(await pendingInput.evaluate((node) => node.isConnected)).toBe(true);
  await expect.poll(() => historyIndex(page)).toBeGreaterThan(beforeCompletion);
  await page.getByRole("button", { name: /^undo$/i }).click();
  await expect(image).toHaveAttribute("src", intrinsicImageUrl);
  await expect(frame.locator(".stack-long").getByRole("textbox")).toHaveText(
    "Sibling changed while upload was pending",
  );
  await page.getByRole("button", { name: /^redo$/i }).click();
  await expect(image).toHaveAttribute("src", intrinsicReplacementUrl);

  // Start with a valid row, then exceed the ordinary Text budget while the
  // host upload is pending. Completion must validate the latest owning row,
  // not its original valid snapshot, and leave the Image source untouched.
  await page.getByRole("button", { name: /^undo$/i }).click();
  await expect(image).toHaveAttribute("src", intrinsicImageUrl);
  await image.click();
  const rejectedInput = await source.elementHandle();
  if (!rejectedInput) throw new Error("Missing budget-check Image URL input");
  const rejectedChooser = page.waitForEvent("filechooser");
  await upload.click();
  await (
    await rejectedChooser
  ).setFiles({ name: "overbudget.png", mimeType: "image/png", buffer: png });
  await expect(page.getByLabel("Uploaded file")).toHaveText(`overbudget.png:${png.length}`);
  await expect(field).toHaveAttribute("aria-busy", "true");
  const beforeBudgetEdit = await historyIndex(page);
  await page.getByRole("button", { name: "Exceed sibling text budget", exact: true }).click();
  await expect(page.getByLabel("Export error")).toContainText("64 KiB");
  await expect(page.getByLabel("Selected block ID")).toHaveText("stack-auto-image");
  await expect.poll(() => historyIndex(page)).toBeGreaterThan(beforeBudgetEdit);
  await expect(field).toHaveAttribute("aria-busy", "true");
  expect(await rejectedInput.evaluate((node) => node.isConnected)).toBe(true);
  const beforeRejection = await historyIndex(page);
  await page.getByRole("button", { name: "Complete pending upload", exact: true }).click();
  await expect(field.getByRole("alert")).toContainText("64 KiB");
  await expect(field).toHaveAttribute("aria-busy", "false");
  await expect(source).toHaveValue(intrinsicImageUrl);
  const rejectedDocument = JSON.parse(
    (await page.getByLabel("Host document").textContent())!,
  ) as EmailDocument;
  expect(findBlock(rejectedDocument, "stack-auto-image")!.props.src).toBe(intrinsicImageUrl);
  expect(String(findBlock(rejectedDocument, "stack-long")!.props.content).length).toBeGreaterThan(
    64 * 1024,
  );
  expect(await historyIndex(page)).toBe(beforeRejection);
  await page.getByRole("button", { name: /^undo$/i }).click();
  await expect(page.getByLabel("Export error")).toBeEmpty();
  await expect(image).toHaveAttribute("src", intrinsicImageUrl);
  await expect(frame.locator(".stack-long").getByRole("textbox")).toHaveText(
    "Sibling changed while upload was pending",
  );
  expect(errors).toEqual([]);
});

function findBlock(document: EmailDocument, id: string): EmailBlock | undefined {
  const visit = (blocks: EmailBlock[]): EmailBlock | undefined => {
    for (const block of blocks) {
      if (block.props.id === id) return block;
      for (const slot of ["sections", "columns", "column", "content", "cells"]) {
        const children = block.props[slot];
        if (Array.isArray(children)) {
          const match = visit(children as EmailBlock[]);
          if (match) return match;
        }
      }
    }
  };
  return visit(document.root.props?.sections ?? []);
}

test("intrinsic cell selection and pointer reorder retain identity and undo/redo", async ({
  page,
}) => {
  const frame = await openEditor(page);
  const row = frame.locator(".mode-stack");
  const cells = row.locator(".stack-a, .stack-b, .stack-c, .stack-d");
  const originalOrder = ["stack-a", "stack-b", "stack-c", "stack-d"];
  const order = () =>
    cells.evaluateAll((nodes) =>
      nodes.map((node) => [...node.classList].find((name) => /^stack-[abcd]$/.test(name))),
    );
  const modelOrder = async () => {
    const document = JSON.parse(
      (await page.getByLabel("Host document").textContent())!,
    ) as EmailDocument;
    return (findBlock(document, "mode-stack")!.props.cells as EmailBlock[]).map(
      (cell) => cell.props.id,
    );
  };
  await expect.poll(order).toEqual(originalOrder);
  const sourceCell = frame.locator(".stack-a");
  // Authored8px padding is a real cell hit target, outside its nested Text.
  await sourceCell.click({ position: { x: 2, y: 2 } });
  await expect(page.getByLabel("Selected block type")).toHaveText("IntrinsicCell");
  const handle = frame.getByRole("button", { name: "Drag to reorder", exact: true });
  await expect(handle).toBeVisible();
  const start = await handle.boundingBox(),
    end = await frame.locator(".stack-b").boundingBox();
  if (!start || !end) throw new Error("Missing intrinsic cell drag bounds");
  const before = await historyIndex(page);
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(start.x + start.width / 2 + 12, start.y + start.height / 2 + 4, {
    steps: 5,
  });
  await expect(page.getByLabel("Drag state")).toHaveText("true");
  await page.mouse.move(end.x + end.width - 2, end.y + end.height / 2, { steps: 30 });
  // Wait for the cells slot itself, not a nested content slot, to accept the
  // insertion. No dispatch/reorder shortcut substitutes for the pointer path.
  await expect(
    frame.locator('[data-puck-dropzone="mode-stack:cells"] > [data-puck-line-placeholder]'),
  ).toBeVisible();
  await page.mouse.up();
  const reordered = ["stack-b", "stack-a", "stack-c", "stack-d"];
  await expect.poll(order).toEqual(reordered);
  await expect.poll(modelOrder).toEqual(reordered);
  await expect.poll(() => historyIndex(page)).toBeGreaterThan(before);
  await page.getByRole("button", { name: /^undo$/i }).click();
  await expect.poll(order).toEqual(originalOrder);
  await expect.poll(modelOrder).toEqual(originalOrder);
  await page.getByRole("button", { name: /^redo$/i }).click();
  await expect.poll(order).toEqual(reordered);
  await expect.poll(modelOrder).toEqual(reordered);
  await expect(frame.locator(".stack-c .stack-icon img")).toHaveAttribute("width", "16");
});

test("visible intrinsic MJML imports, exports, compiles, and reimports as editable blocks", async ({
  page,
}) => {
  await routeImages(page);
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto(fixture);
  await expect(page.getByLabel("Compilation status")).toHaveText("ready");
  const source = (await page.getByLabel("Exported MJML").textContent())!;
  expect(source).toContain('data-pm-layout="1"');
  expect(source).not.toContain("<mj-raw");
  await page.goto("/");
  await chooseImportFile(page, {
    name: "intrinsic.mjml",
    mimeType: "application/xml",
    buffer: Buffer.from(source),
  });
  await expect(page.getByRole("combobox", { name: "Email template" })).toHaveValue("imported");
  const frame = page.frameLocator("#preview-frame");
  const text = frame.locator(".stack-short").getByRole("textbox");
  await expect(text).toHaveAttribute("contenteditable", "true");
  await text.click();
  await text.press("ControlOrMeta+A");
  await page.keyboard.insertText("Round trip editable copy");
  await text.press("Tab");
  await page.getByRole("button", { name: "Export email", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Export email", exact: true });
  await dialog.getByRole("button", { name: "MJML", exact: true }).click();
  const exported = await dialog.getByRole("textbox", { name: "MJML source" }).inputValue();
  expect(exported).toContain("Round trip editable copy");
  expect(exported).toContain('data-pm-row="two"');
  expect(exported).not.toContain("<mj-raw");
  await dialog.getByRole("button", { name: "Close export", exact: true }).click();
  await page.getByRole("button", { name: "Preview email", exact: true }).click();
  const preview = page.frameLocator('iframe[title="Rendered email"]');
  await expect(preview.locator(".stack-short")).toContainText("Round trip editable copy");
  await expect(preview.locator(".omitted-image img")).not.toHaveAttribute("width");
  await page.getByRole("button", { name: "Close preview", exact: true }).click();
  page.once("dialog", (confirmation) => confirmation.accept());
  await chooseImportFile(page, {
    name: "roundtrip.mjml",
    mimeType: "application/xml",
    buffer: Buffer.from(exported),
  });
  await expect(text).toHaveText("Round trip editable copy");
  await expect(text).toHaveAttribute("contenteditable", "true");
  await frame.locator(".requested-image img").click();
  await expect(page.getByRole("textbox", { name: "Image URL", exact: true })).toHaveValue(
    intrinsicImageUrl,
  );
  await expect(page.getByRole("spinbutton", { name: "Width (px)", exact: true })).toHaveValue("64");
  await expect(frame.locator(".omitted-image img")).not.toHaveAttribute("width");
});
