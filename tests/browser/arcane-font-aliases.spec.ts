import { expect, test, type Locator } from "@playwright/test";
import { sourceTemplateRepresentations } from "./source-template-representations";
import { readVisibleTextFragments, visibleTextLineBounds } from "./text-line-geometry";

test.describe.configure({ timeout: 120_000 });
async function typography(locator: Locator) {
  const metrics = await locator.evaluate(async (element) => {
    const document = element.ownerDocument;
    await document.fonts.ready;
    const style = document.defaultView!.getComputedStyle(element);
    const family = style.fontFamily.split(",")[0].replace(/["']/g, "").trim();
    const box = element.getBoundingClientRect();
    const registrations: string[] = [];
    const collect = (rules: CSSRuleList) => {
      for (const rule of Array.from(rules)) {
        if (rule instanceof document.defaultView!.CSSFontFaceRule)
          registrations.push(
            rule.style.getPropertyValue("font-family").replace(/["']/g, "").trim(),
          );
        else if ("cssRules" in rule) collect((rule as CSSGroupingRule).cssRules);
      }
    };
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        collect(sheet.cssRules);
      } catch {
        /* Cross-origin stylesheet CSSOM is not readable. */
      }
    }
    return {
      family,
      stack: style.fontFamily.split(",").map((name) => name.replace(/["']/g, "").trim()),
      width: box.width,
      height: box.height,
      fontSize: style.fontSize,
      weight: style.fontWeight,
      registrations,
      faces: Array.from(document.fonts)
        .filter((face) => face.family.replace(/["']/g, "").trim() === family)
        .map(({ status, weight }) => ({ status, weight })),
    };
  });
  return {
    ...metrics,
    lines: visibleTextLineBounds(await locator.evaluate(readVisibleTextFragments)),
  };
}
for (const width of [800, 390]) {
  for (const [name, heading] of [
    ["activation", "Almost there"],
    ["newsletter", "Tips and resources"],
  ]) {
    test(`Arcane ${name} uses Instrument Serif glyphs and source line geometry at ${width}px`, async ({
      page,
    }, testInfo) => {
      const { reference, compiled, canvas } = await sourceTemplateRepresentations(
        page,
        "04-Arcane",
        name,
        width,
        heading,
      );
      try {
        const original = await typography(reference.getByText(heading, { exact: true }));
        const exported = await typography(compiled.getByText(heading, { exact: true }));
        const native = await typography(canvas.getByText(heading, { exact: true }));
        await testInfo.attach("arcane-font-geometry.json", {
          body: JSON.stringify({ width, name, original, exported, native }, null, 2),
          contentType: "application/json",
        });
        expect(original.family).toBe("Instrument Serif");
        expect(exported.family).toBe("Instrument Serif");
        expect(native.family).toMatch(/^InstrumentSerif-pm-canvas-/);
        expect(native.registrations).toContain(native.family);
        // The activation source has a 560px box; MJML intentionally narrows it
        // to 480px on desktop. Glyphs still agree across all three versions.
        expect.soft(Math.abs(native.width - exported.width)).toBeLessThanOrEqual(1 / 64);
        for (const actual of [original, exported, native]) {
          expect(actual.stack.slice(1)).toEqual(["Georgia", "Times New Roman", "serif"]);
          expect(actual.faces).toContainEqual({ status: "loaded", weight: "400" });
          expect(actual.fontSize).toBe("72px");
          expect(actual.weight).toBe("400");
          expect.soft(Math.abs(actual.height - original.height)).toBeLessThanOrEqual(1 / 64);
          expect.soft(actual.lines).toHaveLength(original.lines.length);
          for (const [index, line] of actual.lines.entries()) {
            if (!original.lines[index]) continue;
            for (const edge of ["left", "right", "top", "bottom"] as const)
              expect
                .soft(Math.abs(line[edge] - original.lines[index][edge]))
                .toBeLessThanOrEqual(1 / 64);
          }
        }
      } finally {
        await reference.close();
        await compiled.close();
      }
    });
  }
}
