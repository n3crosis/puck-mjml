import { expect, test, type Locator } from "@playwright/test";
import { alignmentCases, type AlignmentCase } from "./fixtures/native-column-alignment-source";
import { visibleTextLineBounds, type TextFragment } from "./text-line-geometry";

type Bounds = { x: number; y: number; width: number; height: number };
const dimensions = ["x", "y", "width", "height"] as const;
const tolerance = 1 / 64;

/** Compare local coordinates so canvas chrome and earlier cases cannot mask drift.
 * Preserve whole-node ranges, but compare word-range unions: pre-wrap hanging
 * spaces have range width without a visible glyph. mixed-media explicitly wraps;
 * the 80px/68px and fractional-group probes can wrap the short shared copy too. */
async function geometry(row: Locator, id: string) {
  const snapshot = await row.evaluate((element, id) => {
    const document = element.ownerDocument;
    const origin = element.getBoundingClientRect();
    const rect = (r: DOMRect) => ({
      x: r.x - origin.x,
      y: r.y - origin.y,
      width: r.width,
      height: r.height,
    });
    const boxes = [...element.querySelectorAll("[class]")].filter((node) =>
      [...node.classList].some((name) => name.startsWith(id + "-")),
    );
    const bounds: Record<string, Bounds[]> = {};
    const probeCounts: Record<string, number> = {};
    const text: Record<
      string,
      {
        fragments: TextFragment[];
        nodes: {
          value: string;
          rawRanges: Bounds[];
          whiteSpace: string;
          font: string;
          lineHeight: string;
          letterSpacing: string;
          wordSpacing: string;
        }[];
      }
    > = {};
    for (const box of boxes) {
      const name = [...box.classList].find((name) => name.startsWith(id + "-"))!;
      probeCounts[name] = (probeCounts[name] ?? 0) + 1;
      if (name.endsWith("-copy")) {
        const walker = document.createTreeWalker(box, 4 /* NodeFilter.SHOW_TEXT */);
        const range = document.createRange();
        const evidence: (typeof text)[string] = { fragments: [], nodes: [] };
        while (walker.nextNode()) {
          const node = walker.currentNode;
          const value = node.textContent ?? "";
          range.selectNodeContents(node);
          const style = document.defaultView!.getComputedStyle(node.parentElement!);
          evidence.nodes.push({
            value,
            rawRanges: [...range.getClientRects()].map(rect),
            whiteSpace: style.whiteSpace,
            font: style.font,
            lineHeight: style.lineHeight,
            letterSpacing: style.letterSpacing,
            wordSpacing: style.wordSpacing,
          });
          // Same word-range collection as readVisibleTextFragments, kept inside
          // this self-contained evaluate to collect the entire row atomically.
          for (const match of value.matchAll(/\S+/gu)) {
            range.setStart(node, match.index);
            range.setEnd(node, match.index + match[0].length);
            for (const r of range.getClientRects()) {
              if (r.width <= 0 || r.height <= 0) continue;
              evidence.fragments.push({
                left: r.left - origin.left,
                right: r.right - origin.left,
                top: r.top - origin.top,
                bottom: r.bottom - origin.top,
              });
            }
          }
        }
        text[`${name}:text`] = evidence;
      } else if (!/-(image|spacer)$/.test(name)) {
        bounds[name] = [rect(box.getBoundingClientRect())];
      }
    }
    const images = [...element.querySelectorAll("img")];
    if (images.length) bounds.image = images.map((image) => rect(image.getBoundingClientRect()));
    bounds.row = [{ x: 0, y: 0, width: origin.width, height: origin.height }];
    return { bounds, probeCounts, text };
  }, id);
  for (const [name, evidence] of Object.entries(snapshot.text)) {
    snapshot.bounds[name] = visibleTextLineBounds(evidence.fragments).map((line) => ({
      x: line.left,
      y: line.top,
      width: line.right - line.left,
      height: line.bottom - line.top,
    }));
  }
  return snapshot;
}
type Geometry = Awaited<ReturnType<typeof geometry>>;

function compareGeometry(actual: Geometry, expected: Geometry): string[] {
  const failures: string[] = [];
  const names = new Set([...Object.keys(actual.bounds), ...Object.keys(expected.bounds)]);
  for (const name of names) {
    const a = actual.bounds[name],
      b = expected.bounds[name];
    if (!a || !b) {
      failures.push(`${name}: missing ${a ? "compiled" : "canvas"} probe`);
      continue;
    }
    if (a.length !== b.length)
      failures.push(`${name}: count canvas=${a.length}, compiled=${b.length}`);
    for (let index = 0; index < Math.min(a.length, b.length); index++)
      for (const dimension of dimensions) {
        const delta = Math.abs(a[index][dimension] - b[index][dimension]);
        if (!Number.isFinite(delta) || delta > tolerance)
          failures.push(
            `${name}[${index}].${dimension}: canvas=${a[index][dimension]}, compiled=${b[index][dimension]}, delta=${delta}`,
          );
      }
  }
  return failures;
}
async function measureCase(entry: AlignmentCase, canvas: Locator, compiled: Locator) {
  const failures: string[] = [];
  const required = [...entry.mjml.matchAll(/css-class="([^"]*)"/g)]
    .flatMap((match) => match[1].split(/\s+/))
    .filter((name) => name.startsWith(entry.id + "-") && !/-(image|spacer)$/.test(name));
  const imageCount = [...entry.mjml.matchAll(/<mj-image(?:\s|>)/g)].length;
  async function read(label: string, row: Locator): Promise<Geometry | null> {
    const count = await row.count();
    if (count !== 1) {
      failures.push(`${label}: expected one row, found ${count}`);
      return null;
    }
    try {
      const measurement = await geometry(row, entry.id);
      for (const name of required) {
        if (measurement.probeCounts[name] !== 1)
          failures.push(
            `${label} ${name}: expected one probe, found ${measurement.probeCounts[name] ?? 0}`,
          );
        if (name.endsWith("-copy") && !measurement.bounds[`${name}:text`]?.length)
          failures.push(`${label} ${name}: no visible text lines`);
      }
      if ((measurement.bounds.image?.length ?? 0) !== imageCount)
        failures.push(
          `${label}: expected ${imageCount} images, found ${measurement.bounds.image?.length ?? 0}`,
        );
      return measurement;
    } catch (error) {
      failures.push(`${label}: measurement failed: ${String(error)}`);
      return null;
    }
  }
  const actual = await read("canvas", canvas),
    expected = await read("compiled", compiled);
  if (actual && expected) failures.push(...compareGeometry(actual, expected));
  return { id: entry.id, source: entry.mjml, actual, expected, failures };
}

for (const width of [390, 600, 601, 800]) {
  test(`native inline columns match compiler geometry at ${width}px`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height: 900 });
    await page.route("https://example.com/alignment.svg", (route) =>
      route.fulfill({
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect width="120" height="80" fill="navy"/></svg>',
      }),
    );
    await page.goto("/tests/browser/fixtures/native-column-alignment.html");
    const preflightFailures: string[] = [];
    try {
      await expect(page.getByLabel("Compilation status")).toHaveText("ready");
    } catch (error) {
      preflightFailures.push(`Compilation did not become ready: ${String(error)}`);
    }
    const canvas = page.getByRole("region", { name: "Canvas" });
    const compiled = page.frameLocator("#compiled");
    for (const [label, images] of [
      ["canvas", canvas.locator("img")],
      ["compiled", compiled.locator("img")],
    ] as const) {
      try {
        await expect
          .poll(() =>
            images.evaluateAll((elements) =>
              elements.every(
                (element) =>
                  (element as HTMLImageElement).complete &&
                  (element as HTMLImageElement).naturalWidth > 0,
              ),
            ),
          )
          .toBe(true);
      } catch (error) {
        preflightFailures.push(`${label} images failed loading: ${String(error)}`);
      }
    }
    // Collect every case before asserting, including downstream geometry after a
    // mismatch. The artifacts retain raw ranges alongside visible-line bounds.
    const cases = [];
    for (const entry of alignmentCases())
      cases.push(
        await measureCase(
          entry,
          canvas.locator(`.${entry.id}`),
          compiled.locator(`div.${entry.id}`),
        ),
      );
    const capChecks = [];
    for (const [label, root] of [
      ["canvas", canvas],
      ["compiled", compiled],
    ] as const) {
      for (const [name, property, expected] of [
        ["desktop-cap-column-default-a", "max-width", width >= 601 ? "200px" : "none"],
        ["desktop-cap-column-default-a", "width", width >= 601 ? "200px" : "250px"],
        ["desktop-cap-column-override-a", "max-width", "260px"],
        ["desktop-cap-column-override-a", "width", "250px"],
      ]) {
        const probe = root.locator(`.${name}`);
        const actual =
          (await probe.count()) === 1
            ? await probe.evaluate(
                (element, property) =>
                  element.ownerDocument
                    .defaultView!.getComputedStyle(element)
                    .getPropertyValue(property),
                property,
              )
            : null;
        capChecks.push({ label, name, property, actual, expected, passed: actual === expected });
      }
    }
    const failedCases = cases.filter((entry) => entry.failures.length);
    const failedCaps = capChecks.filter((check) => !check.passed);
    await testInfo.attach(`native-column-matrix-${width}.json`, {
      contentType: "application/json",
      body: JSON.stringify({ width, tolerance, preflightFailures, capChecks, cases }, null, 2),
    });
    await testInfo.attach(`native-column-failures-${width}.json`, {
      contentType: "application/json",
      body: JSON.stringify(
        { width, tolerance, preflightFailures, capChecks: failedCaps, cases: failedCases },
        null,
        2,
      ),
    });
    const summary = [
      ...preflightFailures,
      ...failedCaps.map((check) => JSON.stringify(check)),
      ...failedCases.flatMap((entry) => entry.failures.map((failure) => `${entry.id}: ${failure}`)),
    ];
    expect(
      summary.length,
      `${summary.length} failures; full measurements attached.\n${summary.slice(0, 12).join("\n")}`,
    ).toBe(0);
  });
}

for (const width of [390, 600, 601, 800])
  for (const padding of [8, 16]) {
    test(`body inset ${padding}px keeps RTL viewport breakpoint at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(
        `/tests/browser/fixtures/native-column-alignment.html?boundary=1&padding=${padding}&dir=rtl`,
      );
      await expect(page.getByLabel("Compilation status")).toHaveText("ready");
      for (const entry of alignmentCases().filter((entry) =>
        /^pair-(ltr|rtl)-(group|section)-normal-top-middle$/.test(entry.id),
      )) {
        const actual = await geometry(
          page.getByRole("region", { name: "Canvas" }).locator(`.${entry.id}`),
          entry.id,
        );
        const expected = await geometry(
          page.frameLocator("#compiled").locator(`div.${entry.id}`),
          entry.id,
        );
        expect(compareGeometry(actual, expected), entry.id).toEqual([]);
      }
    });
  }

test("inline layout retains mounted refs, alignment edits, text editing, history, and source replacement", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/tests/browser/fixtures/native-column-edit.html");
  const frame = page.frameLocator("#preview-frame");
  const target = frame.locator(".editable-group");
  const check = async (alignment: string) => {
    await expect(page.getByLabel("Compilation status")).toHaveText("ready");
    await expect(target).toHaveCSS("vertical-align", alignment);
    const actual = await geometry(frame.locator(".editable"), "editable");
    const expected = await geometry(
      page.frameLocator("#compiled").locator("div.editable"),
      "editable",
    );
    for (const name of ["editable-solo", "editable-group", "editable-inner"]) {
      for (const dimension of ["x", "y", "width", "height"] as const)
        expect(
          Math.abs(actual.bounds[name][0][dimension] - expected.bounds[name][0][dimension]),
          `${name}.${dimension}`,
        ).toBeLessThanOrEqual(1 / 64);
    }
  };
  await expect
    .poll(() =>
      frame.locator("html").evaluate((element) => element.ownerDocument.defaultView!.innerWidth),
    )
    .toBe(800);
  await expect
    .poll(() =>
      page
        .frameLocator("#compiled")
        .locator("html")
        .evaluate((element) => element.ownerDocument.defaultView!.innerWidth),
    )
    .toBe(800);
  await check("top");
  await target.evaluate((element) => element.setAttribute("data-mounted", "yes"));
  for (const alignment of ["middle", "bottom", "default"]) {
    const previous = Number(await page.getByLabel("History index").textContent());
    await page.getByRole("button", { name: `Align ${alignment}`, exact: true }).click();
    await check(alignment === "default" ? "baseline" : alignment);
    await expect
      .poll(async () => Number(await page.getByLabel("History index").textContent()))
      .toBeGreaterThan(previous);
    await expect(target).toHaveAttribute("data-mounted", "yes");
  }
  await page.getByRole("button", { name: /^undo$/i }).click();
  await check("bottom");
  await page.getByRole("button", { name: /^redo$/i }).click();
  await check("baseline");
  const copy = frame.locator(".editable-copy");
  await copy.getByText("First editable line", { exact: false }).dblclick();
  const editor = copy.locator('[contenteditable="true"]');
  await expect(editor).toBeVisible();
  const beforeText = Number(await page.getByLabel("History index").textContent());
  await editor.press("ControlOrMeta+End");
  await editor.press("Shift+Enter");
  await page.keyboard.insertText("Another editable line");
  await expect(copy).toContainText("Another editable line");
  await expect
    .poll(async () => Number(await page.getByLabel("History index").textContent()))
    .toBeGreaterThan(beforeText);
  await check("baseline");
  await page.getByRole("button", { name: /^undo$/i }).click();
  await expect(copy).not.toContainText("Another editable line");
  await check("baseline");
  await page.getByRole("button", { name: "Replace source", exact: true }).click();
  await check("bottom");
  await expect(page.getByRole("button", { name: /^undo$/i })).toBeDisabled();
  // These are intentionally non-executing editor placeholders, not an oracle for
  // raw HTML dimensions. A zero-font line must not hide their controls or labels.
  await expect(frame.locator(".editor-affordances .pm-raw").first()).toHaveCSS("font-size", "12px");
  await expect(frame.locator(".pm-image-empty")).toHaveCSS("font-size", "12px");
  expect(
    await frame
      .locator(".empty-column [data-puck-dropzone]")
      .evaluate((element) => element.getBoundingClientRect().height),
  ).toBeGreaterThanOrEqual(80);
  await copy.click();
  await expect(frame.getByRole("button", { name: "Drag to reorder", exact: true })).toBeVisible();
  for (const viewport of ["Desktop", "Mobile"]) {
    if (viewport === "Mobile")
      await page.getByRole("button", { name: "Switch to Mobile viewport" }).click();
    await page.getByRole("button", { name: "Select first column", exact: true }).click();
    const handle = frame.getByRole("button", { name: "Drag to reorder", exact: true });
    await expect(handle).toBeVisible();
    const columns = frame.locator(
      ".editable > .pm-native-inline-section > [data-puck-dropzone] > [data-puck-component]",
    );
    const order = () =>
      columns.evaluateAll((elements) =>
        elements.map((element) => (element.classList.contains("editable-solo") ? "solo" : "group")),
      );
    await expect.poll(order).toEqual(["solo", "group"]);
    const before = Number(await page.getByLabel("History index").textContent());
    const start = await handle.boundingBox(),
      end = await target.boundingBox();
    if (!start || !end) throw new Error("Missing column drag bounds");
    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
    await page.mouse.down();
    await page.mouse.move(start.x + start.width / 2 + 12, start.y + start.height / 2 + 4, {
      steps: 5,
    });
    await page.mouse.move(end.x + end.width / 2, end.y + end.height - 2, { steps: 30 });
    await expect(
      frame.locator(
        ".editable > .pm-native-inline-section > [data-puck-dropzone] > [data-puck-line-placeholder]",
      ),
    ).toBeVisible();
    await page.mouse.up();
    await expect.poll(order).toEqual(["group", "solo"]);
    await expect
      .poll(async () => Number(await page.getByLabel("History index").textContent()))
      .toBeGreaterThan(before);
    await page.getByRole("button", { name: /^undo$/i }).click();
    await expect.poll(order).toEqual(["solo", "group"]);
  }
});
