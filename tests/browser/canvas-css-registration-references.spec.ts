import { expect, test } from "@playwright/test";

test("browser grammar retains scoped global definitions and font-family keyframe steps", async ({
  page,
}) => {
  await page.goto("/tests/browser/fixtures/canvas-css-registration-references.html");
  const parsed = await page.evaluate(() => {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(
      "@scope (.inside){@font-face{font-family:Ghost;src:url(unused.woff)}@keyframes ghost{from,to{opacity:0.9}}}@keyframes swap{from,to{font-family:Local}}@keyframes invalid{from,to{font-family:Local,,serif;opacity:0.5}}",
    );
    const scope = sheet.cssRules[0] as CSSGroupingRule;
    const font = scope.cssRules[0] as CSSFontFaceRule;
    const ghost = scope.cssRules[1] as CSSKeyframesRule;
    const swap = sheet.cssRules[1] as CSSKeyframesRule;
    const invalid = sheet.cssRules[2] as CSSKeyframesRule;
    return {
      scopeRules: scope.cssRules.length,
      family: font.style.getPropertyValue("font-family").replace(/"/g, ""),
      animation: ghost.name,
      stepFamily: (swap.cssRules[0] as CSSKeyframeRule).style.getPropertyValue("font-family"),
      invalidFamily: (invalid.cssRules[0] as CSSKeyframeRule).style.getPropertyValue("font-family"),
    };
  });
  expect(parsed).toEqual({
    scopeRules: 2,
    family: "Ghost",
    animation: "ghost",
    stepFamily: "Local",
    invalidFamily: "",
  });
});

test("keyframe fonts and omitted ancestors preserve host and sibling registration behavior", async ({
  page,
}, testInfo) => {
  const warnings: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "warning") warnings.push(message.text());
  });
  await page.goto("/tests/browser/fixtures/canvas-css-registration-references.html");
  const first = page.getByRole("region", { name: "first canvas" });
  const sibling = page.getByRole("region", { name: "sibling canvas" });
  await expect(first.locator(".animated")).toHaveCSS("animation-play-state", "paused");
  await expect(sibling.locator(".animated")).toHaveCSS("animation-play-state", "paused");
  const scopes = await Promise.all(
    [first, sibling].map((region) =>
      region.locator("style[data-pm-canvas-css]").getAttribute("data-pm-canvas-css"),
    ),
  );
  for (const scope of scopes) expect(scope).toMatch(/^pm-canvas-/);
  expect(scopes[0]).not.toBe(scopes[1]);
  await page.evaluate(() => document.fonts.ready);

  const expected = [
    { selector: "#host-before", family: "Local", width: 70, opacity: "1", animation: "none" },
    { selector: "#host-after", family: "Local", width: 70, opacity: "1", animation: "none" },
    {
      selector: "#host-ghost-before",
      family: "Ghost",
      width: 70,
      opacity: "0.2",
      animation: "ghost",
    },
    {
      selector: "#host-ghost-after",
      family: "Ghost",
      width: 70,
      opacity: "0.2",
      animation: "ghost",
    },
    {
      selector: `.${scopes[0]} .animated`,
      family: `Local-${scopes[0]}`,
      width: 56,
      opacity: "0.7",
      animation: `${scopes[0]}-swap`,
    },
    {
      selector: `.${scopes[1]} .animated`,
      family: `Local-${scopes[1]}`,
      width: 112,
      opacity: "0.8",
      animation: `${scopes[1]}-swap`,
    },
    {
      selector: `.${scopes[0]} .ghost`,
      family: "Ghost",
      width: 70,
      opacity: "0.2",
      animation: "ghost",
    },
    {
      selector: `.${scopes[1]} .ghost`,
      family: "Ghost",
      width: 70,
      opacity: "0.2",
      animation: "ghost",
    },
  ];
  expected.push(
    ...scopes.map((scope) => ({
      selector: `.${scope} .invalid-list`,
      family: "Ghost",
      width: 70,
      opacity: "0.5",
      animation: `${scope}-invalid`,
    })),
  );
  const targets = await Promise.all(
    expected.map(async (entry) => ({
      ...entry,
      actual: await page.locator(entry.selector).evaluate((element) => {
        const range = document.createRange();
        range.selectNodeContents(element);
        const style = getComputedStyle(element);
        return {
          family: style.fontFamily.replace(/"/g, "").split(",")[0],
          width: range.getBoundingClientRect().width,
          opacity: style.opacity,
          animation: style.animationName,
        };
      }),
    })),
  );
  const registrations = await page.evaluate(() =>
    Array.from(
      document.querySelectorAll<HTMLStyleElement>("style[data-pm-canvas-css]"),
      (element) => ({
        scope: element.dataset.pmCanvasCss,
        fonts: Array.from(element.sheet!.cssRules)
          .filter((rule): rule is CSSFontFaceRule => rule instanceof CSSFontFaceRule)
          .map((rule) => rule.style.getPropertyValue("font-family").replace(/"/g, "")),
        animations: Array.from(element.sheet!.cssRules)
          .filter((rule): rule is CSSKeyframesRule => rule instanceof CSSKeyframesRule)
          .map((rule) => ({
            name: rule.name,
            family: (rule.cssRules[0] as CSSKeyframeRule).style
              .getPropertyValue("font-family")
              .replace(/"/g, ""),
          })),
        source: element.textContent,
      }),
    ),
  );
  const faces = await page.evaluate(() =>
    Array.from(document.fonts, (face) => ({
      family: face.family.replace(/"/g, ""),
      status: face.status,
    })),
  );
  // Preserve all canvas/host, CSSOM and loaded-font evidence before comparing it.
  await testInfo.attach("registration-reference-evidence", {
    body: JSON.stringify({ targets, registrations, faces, warnings }, null, 2),
    contentType: "application/json",
  });
  for (const entry of targets) {
    expect.soft(entry.actual.family, entry.selector).toBe(entry.family);
    expect
      .soft(Math.abs(entry.actual.width - entry.width), entry.selector)
      .toBeLessThanOrEqual(1 / 64);
    expect.soft(entry.actual.opacity, entry.selector).toBe(entry.opacity);
    expect.soft(entry.actual.animation, entry.selector).toBe(entry.animation);
  }
  expect(registrations).toHaveLength(2);
  for (const entry of registrations) {
    expect(entry.fonts).toEqual([`Local-${entry.scope}`]);
    expect(entry.animations).toEqual([
      { name: `${entry.scope}-swap`, family: `Local-${entry.scope}` },
      { name: `${entry.scope}-invalid`, family: "" },
    ]);
    expect(entry.source).toContain("font-family:Local,,serif");
    expect(entry.source).not.toContain("@scope");
    expect(entry.source).not.toContain("Ghost-pm-canvas");
  }
  expect(faces.map((face) => face.family).sort()).toEqual(
    ["Local", "Ghost", ...scopes.map((scope) => `Local-${scope}`)].sort(),
  );
  expect(faces.every((face) => face.status === "loaded")).toBe(true);
  expect(warnings.filter((message) => message.includes("unsupported @scope"))).toHaveLength(1);
});
