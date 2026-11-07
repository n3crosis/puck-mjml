import { expect, test } from "@playwright/test";
import { waitForCanvasFontCss } from "./font-evidence";

const normalize = (name: string) => name.replace(/["']/g, "").trim();
test("browser grammar distinguishes later generic words, generic prefixes, and quoted faces", async ({
  page,
}) => {
  await page.goto("/tests/browser/fixtures/multiword-font-families.html");
  const result = await page.evaluate(() => {
    const names = [
      "Instrument Serif",
      "Source Sans-Serif",
      "serif Instrument",
      "-webkit-body Serif",
      "-webkit-body",
      "serif",
      '"serif"',
      '"serif Instrument"',
    ];
    return names.map((name) => {
      const style = document.createElement("div").style;
      style.fontFamily = name;
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(`@font-face{font-family:${name};src:url(unused.woff)}`);
      return {
        name,
        reference: style.fontFamily,
        descriptor: (sheet.cssRules[0] as CSSFontFaceRule).style.getPropertyValue("font-family"),
      };
    });
  });
  expect(result.map(({ reference }) => normalize(reference))).toEqual([
    "Instrument Serif",
    "Source Sans-Serif",
    "",
    "",
    "-webkit-body",
    "serif",
    "serif",
    "serif Instrument",
  ]);
  expect(result.map(({ descriptor }) => normalize(descriptor))).toEqual([
    "Instrument Serif",
    "Source Sans-Serif",
    "",
    "",
    "",
    "",
    "serif",
    "serif Instrument",
  ]);
});

test("native imported and custom multiword aliases select actual isolated glyphs", async ({
  page,
}, testInfo) => {
  for (const [name, font] of [
    ["first", "static-400"],
    ["second", "other-400"],
  ]) {
    await page.route(`https://fonts.example.test/${name}.css`, (route) =>
      route.fulfill({
        contentType: "text/css",
        headers: { "access-control-allow-origin": "*" },
        body: `@font-face{font-family:Imported Serif;font-weight:400;src:url('http://127.0.0.1:4173/tests/browser/fixtures/fonts/${font}.woff') format('woff')}`,
      }),
    );
  }
  await page.goto("/tests/browser/fixtures/multiword-font-families.html");
  const regions = [
    page.getByRole("region", { name: "first canvas" }),
    page.getByRole("region", { name: "second canvas" }),
  ];
  for (const region of regions) await waitForCanvasFontCss(region);
  await page.evaluate(() => document.fonts.ready);
  const evidence = await page.evaluate(() => {
    const measure = (element: Element) => {
      const range = document.createRange();
      // Outer native text wrappers contain a full-width block. Only a text
      // node range measures the glyph advance rather than that block box.
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      let text: Node | null;
      while ((text = walker.nextNode()) && text.textContent !== "Hamburg") {}
      if (!text) throw new Error("Typography probe text is missing");
      range.selectNodeContents(text);
      const style = getComputedStyle(element);
      return { family: style.fontFamily, width: range.getBoundingClientRect().width };
    };
    return {
      host: measure(document.querySelector("#host-imported")!),
      generic: measure(document.querySelector("#host-generic")!),
      canvases: [...document.querySelectorAll(".pm-canvas")].map((canvas) => ({
        scope: canvas.querySelector("[data-pm-canvas-fonts]")!.getAttribute("data-pm-canvas-fonts"),
        registrations: [...canvas.querySelectorAll("style")].flatMap((element) =>
          [...element.sheet!.cssRules]
            .filter((rule): rule is CSSFontFaceRule => rule instanceof CSSFontFaceRule)
            .map((rule) => rule.style.getPropertyValue("font-family")),
        ),
        targets: ["imported", "local", "quoted", "generic"].map((name) => ({
          name,
          ...measure(canvas.querySelector(`.${name}`)!),
        })),
      })),
      faces: Array.from(document.fonts, ({ family, status }) => ({
        family: family.replace(/["']/g, "").trim(),
        status,
      })),
    };
  });
  await testInfo.attach("multiword-font-evidence.json", {
    body: JSON.stringify(evidence, null, 2),
    contentType: "application/json",
  });
  expect(evidence.canvases).toHaveLength(2);
  expect(evidence.canvases[0].scope).not.toBe(evidence.canvases[1].scope);
  expect(Math.abs(evidence.host.width - 70)).toBeLessThanOrEqual(1 / 64);
  for (const [index, canvas] of evidence.canvases.entries()) {
    const aliases = [
      `ImportedSerif-${canvas.scope}`,
      `LocalSerif-${canvas.scope}`,
      `serif-${canvas.scope}`,
    ];
    expect(canvas.registrations.map(normalize).sort()).toEqual([...aliases].sort());
    for (const [targetIndex, target] of canvas.targets.entries()) {
      const family = target.family.split(",").map(normalize);
      if (target.name === "generic") {
        expect(family).toEqual(["serif"]);
        expect(Math.abs(target.width - evidence.generic.width)).toBeLessThanOrEqual(1 / 64);
      } else {
        const alias = aliases[targetIndex];
        expect(family).toEqual([alias, "monospace"]);
        expect(evidence.faces).toContainEqual({ family: alias, status: "loaded" });
        expect(Math.abs(target.width - (index === 0 ? 56 : 112))).toBeLessThanOrEqual(1 / 64);
      }
    }
  }
});
