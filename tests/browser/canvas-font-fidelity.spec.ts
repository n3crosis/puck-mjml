import { expect, test, type Locator } from "@playwright/test";
import { fontFailures, observeResources, waitForCanvasFontCss } from "./font-evidence";

async function textWidth(locator: Locator) {
  return locator.evaluate((element) => {
    const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      if (node.textContent === "Hamburg") {
        const range = element.ownerDocument.createRange();
        range.selectNodeContents(node);
        return range.getBoundingClientRect().width;
      }
    }
    throw new Error("Typography probe text is missing");
  });
}

for (const viewport of [800, 390]) {
  test(`delayed imports preserve static and variable typography across editors at ${viewport}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: viewport, height: 1000 });
    const resources = observeResources(page, [
      { family: "Probe", stylesheetUrl: "https://fonts.example.test/variable.css" },
    ]);
    let release!: () => void;
    const delayed = new Promise<void>((resolve) => {
      release = resolve;
    });
    const source = (name: string) =>
      `http://127.0.0.1:4173/tests/browser/fixtures/fonts/${name}.woff`;
    await page.route("https://fonts.example.test/variable.css", async (route) => {
      await delayed;
      await route.fulfill({
        contentType: "text/css",
        headers: { "access-control-allow-origin": "*" },
        body: `@font-face{font-family:Probe;font-style:normal;font-weight:100 900;src:url('${source("variable")}') format('woff');}`,
      });
    });
    await page.route("https://fonts.googleapis.com/**", (route) =>
      route.fulfill({
        contentType: "text/css",
        headers: { "access-control-allow-origin": "*" },
        body: `@font-face{font-family:Roboto;font-style:normal;font-weight:100 900;src:url('${source("static-400")}') format('woff');}`,
      }),
    );
    await page.goto("/tests/browser/fixtures/canvas-font-fidelity.html", {
      waitUntil: "domcontentloaded",
    });
    const first = page.getByRole("region", { name: "first canvas" });
    const other = page.getByRole("region", { name: "other canvas" });
    const head = page.getByRole("region", { name: "head canvas" });
    const implicit = page.getByRole("region", { name: "implicit canvas" });
    await expect(first.locator(".pm-canvas")).toHaveAttribute(
      "data-pm-canvas-font-status",
      "loading",
    );
    await expect.poll(() => textWidth(first.locator(".weight-400"))).toBeCloseTo(56, 1);
    // The static 400/600 faces are already usable, but variable CSS is still absent.
    const waiting = waitForCanvasFontCss(first);
    expect(
      await Promise.race([
        waiting.then(() => "early"),
        new Promise((resolve) => setTimeout(() => resolve("pending"), 100)),
      ]),
    ).toBe("pending");
    release();
    await waiting;
    for (const root of [other, head, implicit]) await waitForCanvasFontCss(root);
    await page.evaluate(() => document.fonts.ready);
    const compiled = page.frameLocator("#compiled");
    await expect(compiled.locator(".weight-400")).toBeAttached();
    await compiled.locator("body").evaluate((element) => element.ownerDocument.fonts.ready);
    for (const [weight, width] of [
      [400, 56],
      [420, 106.4],
      [450, 108.5],
      [600, 70],
    ]) {
      expect(await textWidth(first.locator(`.weight-${weight}`))).toBeCloseTo(width, 1);
      expect(await textWidth(compiled.locator(`.weight-${weight}`))).toBeCloseTo(width, 1);
    }
    expect(await textWidth(other.locator(".weight-400"))).toBeCloseTo(112, 1);
    expect(await textWidth(head.locator(".weight-400"))).toBeCloseTo(56, 1);
    expect(await textWidth(implicit.locator(".weight-400"))).toBeCloseTo(56, 1);
    const faces = await page.evaluate(() =>
      Array.from(document.fonts, ({ family, weight, style, status }) => ({
        family,
        weight,
        style,
        status,
      })),
    );
    expect(
      faces.some(
        ({ family, status }) => family.startsWith("Roboto-pm-canvas-") && status === "loaded",
      ),
    ).toBe(true);
    expect(
      faces.some(
        ({ family, weight, status }) =>
          family.startsWith("Probe-pm-canvas-") && weight === "100 900" && status === "loaded",
      ),
    ).toBe(true);
    expect(
      faces.some(
        ({ family, status }) => family.startsWith("HeadOnly-pm-canvas-") && status === "loaded",
      ),
    ).toBe(true);
    const evidence = resources();
    expect(
      evidence.fontAndStylesheetResponses.some(
        ({ implicitFontStylesheet, ok }) => implicitFontStylesheet && ok,
      ),
    ).toBe(true);
    expect(fontFailures([], faces, evidence)).toEqual({
      missingRegistrations: [],
      failedFaces: [],
      stylesheetTransport: { failedRequests: [], httpErrors: [] },
    });
  });
}

test("a failed implicit CSS request is captured separately and rejects readiness", async ({
  page,
}) => {
  const resources = observeResources(page, []);
  await page.route("https://fonts.example.test/variable.css", (route) =>
    route.fulfill({
      contentType: "text/css",
      body: "@font-face{font-family:Probe;src:local('invalid probe font');}",
    }),
  );
  await page.route("https://fonts.googleapis.com/**", (route) =>
    route.fulfill({ status: 503, contentType: "text/css", body: "unavailable" }),
  );
  await page.goto("/tests/browser/fixtures/canvas-font-fidelity.html", {
    waitUntil: "domcontentloaded",
  });
  const implicit = page.getByRole("region", { name: "implicit canvas" });
  await expect(implicit.locator(".pm-canvas")).toHaveAttribute(
    "data-pm-canvas-font-status",
    "error",
  );
  await expect(waitForCanvasFontCss(implicit)).rejects.toThrow(/HTTP 503/);
  expect(
    fontFailures([], [], resources()).stylesheetTransport.httpErrors.some(
      ({ implicitFontStylesheet, status }) => implicitFontStylesheet && status === 503,
    ),
  ).toBe(true);
});
