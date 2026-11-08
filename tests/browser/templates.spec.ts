import {
  expect,
  test,
  type FrameLocator,
  type Locator,
  type Page,
  type TestInfo,
} from "@playwright/test";
import {
  templateInventory,
  templateSource,
  referenceHtml,
  referenceManifest,
  referenceDirectory,
  inventoryFiles,
} from "../template-inventory";
import {
  inspectSemantics,
  compareInventoryCaptures,
  type ComparisonCapture,
} from "./semantic-comparison";
import { inspectArtwork } from "./artwork-evidence";
import {
  collectResourceAttribution,
  inspectCaptureResources,
} from "./capture-resource-attribution";
import { inspectContrast } from "./contrast-evidence";
import {
  canvasOverflowFailures,
  canvasScreenshotBounds,
  measureCanvasGeometry,
  type HorizontalBox,
  type CanvasGeometry,
} from "./template-overflow";
import { writeFileSync } from "node:fs";
import {
  declaredMjmlFonts,
  expectedCanvasFonts,
  fontFailures,
  imageFailures,
  observeResources,
  waitForFontRegistrations,
  waitForCanvasFontCss,
  type DeclaredFont,
  type ExpectedCanvasFont,
} from "./font-evidence";
import { loadReactEmailReference, reactEmailReferenceUrl } from "./reference-document";

const normalize = (value: string) => value.replace(/\s+/g, " ").trim().toLowerCase();
const expectAudit = expect.configure({ soft: true });

async function measureVisuals(root: Locator) {
  const metrics = await root.evaluate((element) => {
    const document = element.ownerDocument;
    const view = document.defaultView!;
    const rectangle = (node: Element) => {
      const bounds = node.getBoundingClientRect();
      return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
    };
    const typography = (node: Element) => {
      const style = view.getComputedStyle(node);
      return {
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        lineHeight: style.lineHeight,
        fontWeight: style.fontWeight,
        color: style.color,
        textAlign: style.textAlign,
        whiteSpace: style.whiteSpace,
      };
    };
    const text = (node: Element) =>
      (node as HTMLElement).innerText?.replace(/\s+/g, " ").trim() ?? "";
    return {
      document: { url: document.URL, baseURI: document.baseURI, origin: view.location.origin },
      viewport: view.innerWidth,
      ...rectangle(element),
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      documentOverflow: document.documentElement.scrollWidth - view.innerWidth,
      text: text(element),
      backgrounds: [element, ...Array.from(element.querySelectorAll("*"))]
        .map((node) => ({
          tagName: node.tagName,
          backgroundImage: view.getComputedStyle(node).backgroundImage,
          ...rectangle(node),
        }))
        .filter(({ backgroundImage }) => backgroundImage.includes("url(")),
      textBlocks: Array.from(element.querySelectorAll("p,h1,h2,h3,li,div"))
        .filter((node) => !node.querySelector("p,h1,h2,h3,li,div,table"))
        .filter((node) => text(node) && node.getBoundingClientRect().height > 1)
        .map((node) => ({ text: text(node), ...typography(node), ...rectangle(node) })),
      links: Array.from(element.querySelectorAll("a"), (node) => ({
        href: node.getAttribute("href"),
        text: text(node),
        ...typography(node),
        ...rectangle(node),
      })),
    };
  });
  return {
    ...metrics,
    semantics: await root.evaluate(inspectSemantics),
    contrast: await root.evaluate(inspectContrast),
    ...(await root.evaluate(inspectArtwork)),
  };
}

type Capture = {
  representation: "react-email" | "mjml" | "canvas";
  mode: "desktop" | "mobile";
  screenshot: string;
  screenshotBounds?: HorizontalBox;
  canvasGeometry?: CanvasGeometry;
  resourceError: string | null;
  fonts: Awaited<ReturnType<typeof fontEvidence>>;
  artworkTransport: ReturnType<typeof imageFailures>;
  resources: ReturnType<ReturnType<typeof observeResources>>;
  resourceAttribution: Awaited<
    ReturnType<typeof collectResourceAttribution>
  >["resourceAttribution"];
  metrics: Awaited<ReturnType<typeof measureVisuals>>;
};

async function fontFaces(root: Locator) {
  return root.evaluate((element) =>
    Array.from(element.ownerDocument.fonts, ({ family, weight, style, status }) => ({
      family,
      weight,
      style,
      status,
    })),
  );
}

async function fontEvidence(
  root: Locator,
  resources: ReturnType<ReturnType<typeof observeResources>>,
  expected: ExpectedCanvasFont[] = [],
) {
  const faces = await fontFaces(root);
  return {
    expectedCanvasImports: expected,
    failures: fontFailures(expected, faces, resources),
    faces,
    ...(await root.evaluate((element) => ({
      status: element.ownerDocument.fonts.status,
      stylesheetLinks: Array.from(
        element.ownerDocument.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'),
        (link) => link.href,
      ),
      canvasFontCss: Array.from(element.ownerDocument.querySelectorAll(".pm-canvas"), (canvas) => ({
        scope: Array.from(canvas.classList).find((name) => name.startsWith("pm-canvas-")),
        status: canvas.getAttribute("data-pm-canvas-font-status"),
        errors: canvas.getAttribute("data-pm-canvas-font-errors"),
        importedCssBytes:
          canvas.querySelector("style[data-pm-canvas-fonts]")?.textContent?.length ?? 0,
      })),
    }))),
  };
}

async function captureResourceEvidence(
  root: Locator,
  observe: ReturnType<typeof observeResources>,
  expected: ExpectedCanvasFont[] = [],
) {
  const evidence = await collectResourceAttribution(observe, async (kinds) => {
    const handle = await root.elementHandle();
    const owner = (await handle?.ownerFrame()) ?? null;
    const frameId = observe.frameId(owner);
    observe.markPhase("capture-frame-observed", owner);
    await handle?.dispose();
    const inventory = await root.evaluate(inspectCaptureResources, {
      kinds,
      expectedFonts: expected,
    });
    return { inventory, frameId };
  });
  const { resources } = evidence;
  return {
    ...evidence,
    fonts: await fontEvidence(root, resources, expected),
    artworkTransport: imageFailures(resources),
  };
}

async function waitForArtwork(page: Page | FrameLocator) {
  await page.locator("body").evaluate(inspectArtwork, { decode: true });
}

async function checkArtwork(
  page: Page | FrameLocator,
  label: string,
  assertComplete = true,
  expected: ExpectedCanvasFont[] = [],
) {
  const errors: string[] = [];
  try {
    const body = page.locator("body");
    if (await body.locator(".pm-canvas").count()) await waitForCanvasFontCss(body, expected);
    await waitForFontRegistrations(expected, () => fontFaces(body));
  } catch (failure) {
    errors.push(failure instanceof Error ? failure.message : String(failure));
  }
  try {
    await waitForArtwork(page);
  } catch (failure) {
    errors.push(failure instanceof Error ? failure.message : String(failure));
  }
  const error = errors.length ? errors.join("\n") : null;
  // Resource failures still fail the test, but retain evidence for the audit.
  if (assertComplete) expect.soft(error, `${label} fonts and artwork`).toBeNull();
  return error;
}

async function captureCompleteEmail(
  page: Page,
  html: string,
  representation: "react-email" | "mjml",
  fonts: DeclaredFont[],
  testInfo: TestInfo,
): Promise<Capture[]> {
  const email = await page.context().newPage();
  const resources = observeResources(email, fonts, representation);
  const captures: Capture[] = [];
  try {
    await email.setViewportSize({ width: 800, height: 900 });
    if (representation === "react-email") {
      resources.markPhase("reference-navigation:start", email.mainFrame());
      await loadReactEmailReference(email, html);
      resources.markPhase("reference-navigation:complete", email.mainFrame());
    } else {
      resources.markDocumentBoundary(email.mainFrame(), "set-content:start");
      await email.setContent(html, { waitUntil: "load", timeout: 30_000 });
      resources.markPhase("set-content:complete", email.mainFrame());
    }
    // Load each document once, then resize sequentially. MJML comes from the
    // actual demo preview; React Email is the verified, unmodified renderer output.
    for (const [mode, width] of [
      ["desktop", 800],
      ["mobile", 390],
    ] as const) {
      resources.markPhase(`capture:${mode}:start`, email.mainFrame());
      await email.setViewportSize({ width, height: 900 });
      const resourceError = await checkArtwork(email, representation, representation === "mjml");
      const screenshot = `${representation}-${mode}-${width}px.png`;
      await email.screenshot({ path: testInfo.outputPath(screenshot), fullPage: true });
      const metrics = await measureVisuals(email.locator("body"));
      if (representation === "react-email") {
        expect(metrics.document).toEqual({
          url: reactEmailReferenceUrl,
          baseURI: reactEmailReferenceUrl,
          origin: new URL(reactEmailReferenceUrl).origin,
        });
      }
      captures.push({
        representation,
        mode,
        screenshot,
        resourceError,
        ...(await captureResourceEvidence(email.locator("body"), resources)),
        metrics,
      });
      // Some originals have fixed-width tables. Record their native overflow;
      // do not silently change the reference or mistake it for a port regression.
      if (representation === "mjml") {
        expect
          .soft(metrics.documentOverflow, `${mode} compiled email overflow`)
          .toBeLessThanOrEqual(1);
      }
    }
  } finally {
    await email.close();
  }
  return captures;
}

async function captureEditorCanvas(
  page: Page,
  fonts: DeclaredFont[],
  resources: ReturnType<typeof observeResources>,
  testInfo: TestInfo,
): Promise<Capture[]> {
  const frame = page.frameLocator("#preview-frame");
  const email = frame.locator(".pm-email");
  const captures: Capture[] = [];
  await expect(email).toBeVisible();
  for (const [mode, width] of [
    ["desktop", 800],
    ["mobile", 390],
  ] as const) {
    resources.markPhase(`canvas-capture:${mode}:start`);
    const label = mode === "desktop" ? "Desktop" : "Mobile";
    const control = page.getByRole("button", { name: `Switch to ${label} viewport` });
    if (!(await control.isDisabled())) await control.click();
    await expect(control).toBeDisabled();
    await expect
      .poll(() =>
        frame.locator("html").evaluate((element) => element.ownerDocument.defaultView!.innerWidth),
      )
      .toBe(width);
    const scope = await email.evaluate((element) =>
      Array.from(element.closest(".pm-canvas")!.classList).find((name) =>
        name.startsWith("pm-canvas-"),
      ),
    );
    expect(scope, "Live canvas font scope").toBeTruthy();
    const expected = expectedCanvasFonts(fonts, scope!);
    const resourceError = await checkArtwork(frame, `canvas ${mode}`, true, expected);
    // Capture-only geometry: keep the real 800/390px Puck iframe, but expand the
    // outer editor height to expose the whole email rather than clipping it to
    // the normal scroll area. Never reconstruct the canvas from compiled HTML.
    // Keep the original email-box metrics, independently of the screenshot crop.
    const height = await email.evaluate((element) =>
      Math.ceil(element.getBoundingClientRect().height),
    );
    await page.setViewportSize({ width: 1600, height: Math.max(1000, height + 300) });
    await page.mouse.move(0, 0);
    const screenshot = `canvas-${mode}-${width}px.png`;
    const canvasGeometry = await email.evaluate(measureCanvasGeometry);
    const screenshotBounds = canvasScreenshotBounds(canvasGeometry);
    const frameOrigin = await page.locator("#preview-frame").evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return { x: bounds.x + element.clientLeft, y: bounds.y + element.clientTop };
    });
    // Include renderer-owned full-width backgrounds, but no editor chrome. The
    // recorded iframe-relative bounds make equal-scale artifact placement exact.
    await page.screenshot({
      path: testInfo.outputPath(screenshot),
      clip: {
        ...screenshotBounds,
        x: frameOrigin.x + screenshotBounds.x,
        y: frameOrigin.y + screenshotBounds.y,
      },
    });
    const metrics = await measureVisuals(email);
    captures.push({
      representation: "canvas",
      mode,
      screenshot,
      screenshotBounds,
      canvasGeometry,
      resourceError,
      ...(await captureResourceEvidence(email, resources, expected)),
      metrics,
    });
    expect
      .soft(canvasOverflowFailures(canvasGeometry), `${mode} editor canvas overflow`)
      .toEqual([]);
  }
  return captures;
}

test("generic semantic extraction retains viewport insets and excludes unpainted text", async ({
  page,
}) => {
  await page.setViewportSize({ width: 800, height: 900 });
  const content = `<span>Hello</span> <a href="/target" style="text-decoration:underline"><span>link</span></a>
    <div style="opacity:0"><span style="opacity:1">Transparent</span></div>
    <div style="height:0;overflow:hidden">Clipped</div>
    <span style="display:none">Absent</span>`;
  await page.setContent(`<body style="margin:8px;font:16px/20px Arial">${content}</body>`);
  const margin = await page.locator("body").evaluate(inspectSemantics);
  expect(margin.words.map((word) => word.text)).toEqual(["Hello", "link"]);
  expect(margin.words[1]!.style.textDecoration).toContain("underline");
  expect(margin.words[0]!.boxes[0]!.x).toBe(8);
  expect(margin.words[0]!.boxes[0]!.y).toBeGreaterThanOrEqual(8);
  await page.setContent(
    `<body style="margin:0;padding:8px;font:16px/20px Arial">${content}</body>`,
  );
  const padding = await page.locator("body").evaluate(inspectSemantics);
  expect(padding.words).toEqual(margin.words);
});

test("canvas overflow audit permits background bleed but rejects real text and image overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 800, height: 900 });
  await page.setContent(`
    <style>
      body { margin: 0; }
      .pm-canvas { width: 800px; container-type: inline-size; }
      .pm-email { width: 648px; margin: auto; }
      .pm-native-layout-content { width: 648px; margin: auto; }
    </style>
    <div class="pm-canvas"><div class="pm-email">
      <div class="pm-section pm-native-full-width" style="width:100cqw;margin-inline:calc((100% - 100cqw)/2);background:#191919">
        <div class="pm-native-layout-content"><p>Full-width background, bounded email content.</p></div>
      </div>
    </div></div>`);
  const email = page.locator(".pm-email");
  let geometry = await email.evaluate(measureCanvasGeometry);
  expect(canvasOverflowFailures(geometry)).toEqual([]);
  expect(canvasScreenshotBounds(geometry).width).toBe(800);
  expect(geometry.email.width).toBe(648);
  await email.locator("p").evaluate((element) => {
    element.style.whiteSpace = "nowrap";
    element.textContent = "Unbreakable".repeat(100);
  });
  geometry = await email.evaluate(measureCanvasGeometry);
  expect(
    canvasOverflowFailures(geometry).some((failure) => failure.startsWith("text outside email:")),
  ).toBe(true);
  await email.locator("p").evaluate((element) => {
    element.textContent = "Bounded text again.";
    const image = element.ownerDocument.createElement("img");
    image.width = 700;
    image.height = 20;
    image.src =
      "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='700' height='20'/%3E";
    element.append(image);
  });
  geometry = await email.evaluate(measureCanvasGeometry);
  expect(canvasOverflowFailures(geometry)).toContain("img. outside email");
});

test("original references cover the canonical inventory with pinned byte hashes", () => {
  expect(inventoryFiles(referenceDirectory, ".html")).toEqual(
    templateInventory.map(({ reference }) => reference.html).sort(),
  );
  for (const entry of templateInventory) referenceHtml(entry);
});

test("template picker lists the complete canonical inventory and one blank document", async ({
  page,
}) => {
  await page.goto("/");
  const picker = page.getByRole("combobox", { name: "Email template" });
  await expect(picker).toBeVisible();
  const values = await picker
    .locator("option")
    .evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value));
  expect(values.sort()).toEqual(["blank", ...templateInventory.map(({ id }) => id)].sort());
});

for (const fixture of templateInventory) {
  test(`${fixture.id} loads canonical content and responsive previews`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    const fonts = declaredMjmlFonts(templateSource(fixture));
    const resources = observeResources(page, fonts, "editor");
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width: 1600, height: 1000 });
    resources.markPhase("editor-navigation:start", page.mainFrame());
    await page.goto("/");
    resources.markPhase("editor-navigation:complete", page.mainFrame());
    const picker = page.getByRole("combobox", { name: "Email template" });
    resources.markPhase("template-selection:start");
    await picker.selectOption(fixture.id);
    await expect(picker).toHaveValue(fixture.id);
    resources.markPhase("template-selection:complete");
    resources.markPhase("preview-open:start");
    await page.getByRole("button", { name: "Preview email" }).click();
    const dialog = page.getByRole("dialog", { name: "Email preview" });
    await expect(dialog).toBeVisible();
    resources.markPhase("preview-open:complete");
    const frame = page.frameLocator('iframe[title="Rendered email"]');
    const expectedContent = fixture.content.content.map(normalize).filter(Boolean);
    await expectAudit
      .poll(
        async () => {
          const actualContent = normalize(await frame.locator("body").innerText());
          return expectedContent.filter((content) => !actualContent.includes(content));
        },
        { message: `${fixture.file} preserves all upstream content` },
      )
      .toEqual([]);
    await expect(dialog.locator('[role="alert"]')).toHaveCount(0);
    for (const mode of ["Responsive", "Mobile"]) {
      await dialog.getByRole("button", { name: mode, exact: true }).click();
      await expectAudit
        .poll(
          async () =>
            frame
              .locator("html")
              .evaluate((html) => html.scrollWidth - html.ownerDocument.defaultView!.innerWidth),
          { message: `${fixture.file} ${mode} overflow` },
        )
        .toBeLessThanOrEqual(1);
    }
    const html = await page
      .locator('iframe[title="Rendered email"]')
      .evaluate((iframe: HTMLIFrameElement) => iframe.srcdoc);
    const originalHtml = referenceHtml(fixture);
    writeFileSync(testInfo.outputPath("react-email.html"), originalHtml);
    writeFileSync(testInfo.outputPath("mjml.html"), html);
    // Each PNG is saved once. The upload artifact contains these named files and
    // comparison.json; attaching each PNG would create a second copy on disk.
    const captures: Capture[] = [];
    const compareSemantics = () =>
      compareInventoryCaptures(
        captures.map((capture): ComparisonCapture => {
          const issues: ComparisonCapture["issues"] = [];
          if (capture.resourceError)
            issues.push({ kind: "resource-readiness", evidence: capture.resourceError });
          for (const [kind, evidence] of Object.entries(capture.fonts.failures)) {
            // Raw stylesheet failures remain recorded, but only their current
            // dependency attribution may make this capture inconclusive.
            if (kind === "stylesheetTransport") continue;
            if (
              Array.isArray(evidence)
                ? evidence.length
                : Object.values(evidence).some((value) => value.length)
            )
              issues.push({ kind: `font-${kind}`, evidence });
          }
          if (capture.resourceAttribution.unresolved.length)
            issues.push({
              kind: "resource-transport",
              evidence: capture.resourceAttribution.unresolved,
            });
          const failedImages = capture.metrics.semantics.images.filter((image) => !image.loaded);
          if (failedImages.length) issues.push({ kind: "unloaded-images", evidence: failedImages });
          if (capture.metrics.documentOverflow > 1)
            issues.push({ kind: "document-overflow", evidence: capture.metrics.documentOverflow });
          if (capture.canvasGeometry) {
            const overflow = canvasOverflowFailures(capture.canvasGeometry);
            if (overflow.length) issues.push({ kind: "canvas-overflow", evidence: overflow });
          }
          return {
            representation: capture.representation,
            mode: capture.mode,
            semantics: capture.metrics.semantics,
            rootBox: {
              x: capture.metrics.x,
              y: capture.metrics.y,
              width: capture.metrics.width,
              height: capture.metrics.height,
            },
            issues,
            aliases: capture.fonts.expectedCanvasImports,
          };
        }),
      );
    const compareContent = () =>
      captures.map(({ representation, mode, metrics }) => ({
        representation,
        mode,
        missingContent: expectedContent.filter(
          (content) => !normalize(metrics.text).includes(content),
        ),
      }));
    try {
      captures.push(
        ...(await captureCompleteEmail(page, originalHtml, "react-email", fonts, testInfo)),
      );
      captures.push(...(await captureCompleteEmail(page, html, "mjml", fonts, testInfo)));
      resources.markPhase("preview-close:start");
      await dialog.getByRole("button", { name: "Close preview" }).click();
      await expect(dialog).toBeHidden();
      resources.markPhase("preview-close:complete");
      captures.push(...(await captureEditorCanvas(page, fonts, resources, testInfo)));
    } finally {
      writeFileSync(
        testInfo.outputPath("comparison.json"),
        JSON.stringify(
          {
            template: fixture.file,
            ref: referenceManifest.ref,
            declaredMjmlFonts: fonts,
            editorResources: resources(),
            html: { original: "react-email.html", compiled: "mjml.html" },
            note: "Original HTML is fulfilled unchanged at an exact synthetic document URL on https://demo.react.email so relative assets retain their source origin. Original mobile overflow and resource failures are recorded as reference behavior, not repaired. Canvas captures use the live editable DOM with its existing gutter, at 800/390px iframe widths; only the outer editor height is extended. Pixel equality is not asserted. Canvas font CSS must register every declared family before fonts.ready is awaited; registered unused faces may remain unloaded. Resource events are collected before navigation, including the editor preview iframe; each capture contains a cumulative snapshot for its page. Image HTTP failures (including CSS backgrounds) are recorded separately from font and stylesheet failures, alongside computed background URLs and each document's baseURI. Raw cumulative observations remain intact; resourceAttribution separately records current dependencies, uncertainty and each historical failure's disposition. Dependency inspection is skipped when the captured snapshot has no relevant transport failure; otherwise only failed resource kinds are inspected, and late failures of uninspected kinds remain ambiguous. Only unresolved or ambiguous transport affects semantic readiness. Current decoded artwork/loaded faces plus later successful owned transport may supersede earlier failures. Backgrounds without decode proof and unknown stylesheet provenance remain unresolved.",
            contentComparison: compareContent(),
            semanticComparison: compareSemantics(),
            captures,
          },
          null,
          2,
        ),
      );
    }
    const contentComparison = compareContent();
    for (const comparison of contentComparison) {
      expect
        .soft(
          comparison.missingContent,
          `${fixture.file} ${comparison.representation} ${comparison.mode} upstream content`,
        )
        .toEqual([]);
    }
    expect(errors).toEqual([]);
  });
}
