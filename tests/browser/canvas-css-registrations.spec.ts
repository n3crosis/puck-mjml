import { expect, test, type Locator } from "@playwright/test";

async function textWidth(locator: Locator) {
  return locator.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    return range.getBoundingClientRect().width;
  });
}

async function scopeOf(locator: Locator) {
  return locator.locator("style[data-pm-canvas-css]").getAttribute("data-pm-canvas-css");
}

test("browser parsing confirms valid quoted/escaped names and duplicate descriptor fallback", async ({
  page,
}) => {
  await page.goto("/tests/browser/fixtures/canvas-css-registrations.html");
  // A detached sheet verifies browser grammar without registering probe globals.
  const parsed = await page.evaluate(() => {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(String.raw`
      @keyframes "quoted"{to{opacity:1}}
      @keyframes f\61 de{to{opacity:1}}
      @font-face{font-family:First;font-family:Second;src:url(unused.woff)}
      @font-face{font-family:First;font-family:12;src:url(unused.woff)}
      @font-face{font-family:First;font-family:Second!important;src:url(unused.woff)}
      @font-face{font-family:First;_font-family:Ghost;src:url(unused.woff)}
      @font-face{font-family:First;*font-family:Ghost;src:url(unused.woff)}
      @font-face{font-family:First;font-\66 amily:Second;src:url(unused.woff)}
    `);
    return Array.from(sheet.cssRules, (rule) => {
      if (rule instanceof CSSKeyframesRule) return rule.name;
      if (rule instanceof CSSFontFaceRule)
        return rule.style.getPropertyValue("font-family").replace(/^"|"$/g, "");
      return rule.cssText;
    });
  });
  expect(parsed).toEqual([
    "quoted",
    "fade",
    "Second",
    "First",
    "First",
    "First",
    "First",
    "Second",
  ]);
});

test("canvas registrations preserve host and sibling animations and font metrics", async ({
  page,
}, testInfo) => {
  const warnings: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "warning") warnings.push(message.text());
  });
  await page.goto("/tests/browser/fixtures/canvas-css-registrations.html");
  const first = page.getByRole("region", { name: "first canvas" });
  const sibling = page.getByRole("region", { name: "sibling canvas" });
  await expect(first.locator(".layer")).toHaveCSS("animation-play-state", "paused");
  await expect(sibling.locator(".layer")).toHaveCSS("animation-play-state", "paused");
  const firstScope = await scopeOf(first);
  const siblingScope = await scopeOf(sibling);
  expect(firstScope).toMatch(/^pm-canvas-/);
  expect(siblingScope).toMatch(/^pm-canvas-/);
  expect(firstScope).not.toBe(siblingScope);
  await page.evaluate(() => document.fonts.ready);

  const expectations = [
    { target: "#host-before", opacity: "0.2", width: 70, name: "pulse", family: "Final" },
    { target: "#host-after", opacity: "0.2", width: 70, name: "pulse", family: "Final" },
    { target: "#host-quoted", opacity: "0.3", width: 70, name: "quoted", family: "Final" },
    { target: "#host-escaped", opacity: "0.4", width: 70, name: "fade", family: "Escaped" },
    {
      target: `.${firstScope} .layer`,
      opacity: "0.7",
      width: 56,
      name: `${firstScope}-pulse`,
      family: `Final-${firstScope}`,
    },
    {
      target: `.${siblingScope} .layer`,
      opacity: "0.8",
      width: 112,
      name: `${siblingScope}-pulse`,
      family: `Final-${siblingScope}`,
    },
  ];
  // Collect every target before assertions so failures retain both editors and hosts.
  const evidence = await Promise.all(
    expectations.map(async (entry) => ({
      ...entry,
      actual: await page.locator(entry.target).evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          opacity: style.opacity,
          name: style.animationName,
          family: style.fontFamily.replace(/"/g, ""),
          timing: style.animationTimingFunction,
        };
      }),
      actualWidth: await textWidth(page.locator(entry.target)),
    })),
  );
  await testInfo.attach("registration-targets", {
    body: JSON.stringify(evidence, null, 2),
    contentType: "application/json",
  });
  for (const entry of evidence) {
    expect.soft(entry.actual.opacity, entry.target).toBe(entry.opacity);
    expect.soft(entry.actual.name, entry.target).toBe(entry.name);
    expect.soft(entry.actual.family.split(",")[0], entry.target).toBe(entry.family);
    expect.soft(entry.actual.timing, entry.target).toBe("linear");
    expect
      .soft(Math.abs(entry.actualWidth - entry.width), entry.target)
      .toBeLessThanOrEqual(1 / 64);
  }
  for (const [region, scope] of [
    [first, firstScope],
    [sibling, siblingScope],
  ] as const) {
    await expect(region.locator(".keyword")).toHaveCSS("animation-name", `${scope}-linear`);
    await expect(region.locator(".keyword")).toHaveCSS("opacity", "0.6");
  }
  expect(
    warnings.filter((message) => message.includes("plain-name subset")).length,
  ).toBeGreaterThanOrEqual(2);
  expect(warnings.some((message) => message.includes("whole face is not applied"))).toBe(true);
});

test("only supported canvas aliases enter the browser registration tables", async ({ page }) => {
  await page.goto("/tests/browser/fixtures/canvas-css-registrations.html");
  const first = page.getByRole("region", { name: "first canvas" });
  const sibling = page.getByRole("region", { name: "sibling canvas" });
  await expect(first.locator(".layer")).toBeVisible();
  const scopes = [await scopeOf(first), await scopeOf(sibling)];
  const registered = await page.evaluate(() => {
    const sheets = Array.from(
      document.querySelectorAll<HTMLStyleElement>("style[data-pm-canvas-css]"),
    );
    return sheets.map((element) => ({
      scope: element.dataset.pmCanvasCss,
      keyframes: Array.from(element.sheet!.cssRules)
        .filter((rule): rule is CSSKeyframesRule => rule instanceof CSSKeyframesRule)
        .map((rule) => rule.name),
      families: Array.from(element.sheet!.cssRules)
        .filter((rule): rule is CSSFontFaceRule => rule instanceof CSSFontFaceRule)
        .map((rule) => rule.style.getPropertyValue("font-family").replace(/"/g, "")),
    }));
  });
  expect(registered).toHaveLength(2);
  for (const [index, entry] of registered.entries()) {
    expect(entry.scope).toBe(scopes[index]);
    expect(entry.keyframes).toEqual([`${entry.scope}-pulse`, `${entry.scope}-linear`]);
    expect(entry.families).toEqual([`Final-${entry.scope}`]);
  }
  await page.evaluate(() => document.fonts.ready);
  const faces = await page.evaluate(() =>
    Array.from(document.fonts, (face) => ({
      family: face.family.replace(/"/g, ""),
      status: face.status,
    })),
  );
  expect(faces.map((face) => face.family).sort()).toEqual(
    ["Final", "Escaped", ...scopes.map((scope) => `Final-${scope}`)].sort(),
  );
  expect(faces.every((face) => face.status === "loaded")).toBe(true);
});
