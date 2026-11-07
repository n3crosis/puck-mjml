import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import postcss from "postcss";

const source = readFileSync(new URL("./attribute-editor.css", import.meta.url), "utf8");

function foreground(selector: string) {
  let color = "";
  postcss.parse(source).walkRules((rule) => {
    if (rule.selectors.includes(selector)) {
      rule.walkDecls("color", (declaration) => {
        color = declaration.value;
      });
    }
  });
  expect(color, selector).toMatch(/^#[\da-f]{6}$/i);
  return color;
}
function whiteContrast(color: string) {
  const linear = [1, 3, 5].map((offset) => {
    const value = Number.parseInt(color.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const luminance = linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  return 1.05 / (luminance + 0.05);
}

describe("native attribute control contrast on the white inspector", () => {
  it.each([".pm-attribute-count", ".pm-attribute-empty"])(
    "keeps small secondary text readable: %s",
    (selector) => {
      expect(whiteContrast(foreground(selector))).toBeGreaterThanOrEqual(4.5);
    },
  );
  it.each([".pm-attribute-grip", ".pm-attribute-menu > summary"])(
    "keeps enabled icon-only controls visible: %s",
    (selector) => {
      expect(whiteContrast(foreground(selector))).toBeGreaterThanOrEqual(3);
    },
  );
});
