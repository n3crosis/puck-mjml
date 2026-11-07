import { describe, expect, it } from "vitest";
import { createFontAliases } from "./canvas-css";
import { loadFontCss, transformFontCss, type FontCssResponse } from "./canvas-fonts";

const googleLike = `
@font-face {
  font-family: 'Inter';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url(inter-400.woff2) format('woff2');
  unicode-range: U+0000-00FF;
}
@font-face {
  font-family: 'Inter';
  font-style: normal;
  font-weight: 700;
  src: url(inter-700.woff2) format('woff2');
}
@font-face {
  font-family: 'Other Font';
  src: url(other.woff2);
}
h1 { color: red; }
@media screen and (-webkit-min-device-pixel-ratio: 2) {
  @font-face {
    font-family: 'Inter';
    font-weight: 300;
    src: url(inter-300.woff2) format('woff2');
  }
}
@media print {
  @font-face {
    font-family: 'Print Font';
    src: url(print.woff2);
  }
}
@import url(more.css);
`;

describe("web font stylesheet transformation", () => {
  it("keeps only the declared family and registers it under the alias", () => {
    const result = transformFontCss(googleLike, {
      family: "Inter",
      alias: "Inter-pm-canvas-test",
      baseUrl: "https://fonts.example.com/css/inter.css",
    });
    expect(result.css).toContain('font-family: "Inter-pm-canvas-test"');
    expect(result.css).not.toContain("Other Font");
    expect(result.css).not.toContain("Print Font");
    expect(result.css.match(/@font-face/g)).toHaveLength(3);
    expect(result.css).toContain("font-display: swap");
    expect(result.css).toContain("unicode-range: U+0000-00FF");
    expect(result.notes).toEqual([
      'Web font CSS for "Inter" contains element rules, which are not applied on the canvas.',
      'Web font CSS for "Inter" contains an @import rule, which is not applied on the canvas.',
    ]);
  });

  it("resolves relative font URLs against the stylesheet URL", () => {
    const result = transformFontCss(
      "@font-face { font-family: X; src: url(a/b.woff2) format('woff2'), url('c.woff2'); }",
      {
        family: "X",
        alias: "X-alias",
        baseUrl: "https://cdn.example.com/fonts/x.css",
      },
    );
    expect(result.css).toContain('url("https://cdn.example.com/fonts/a/b.woff2")');
    expect(result.css).toContain('url("https://cdn.example.com/fonts/c.woff2")');
  });

  it("keeps data URLs and absolute URLs intact", () => {
    const result = transformFontCss(
      "@font-face { font-family: X; src: url(data:font/woff2;base64,AAA) format('woff2'), url(https://other.example.com/x.woff2); }",
      { family: "X", alias: "X-alias", baseUrl: "https://cdn.example.com/x.css" },
    );
    expect(result.css).toContain("url(data:font/woff2;base64,AAA)");
    expect(result.css).toContain('url("https://other.example.com/x.woff2")');
  });

  it("reports when the family is not declared in the stylesheet", () => {
    const result = transformFontCss("@font-face { font-family: Y; src: url(y.woff2); }", {
      family: "X",
      alias: "X-alias",
      baseUrl: "https://cdn.example.com/x.css",
    });
    expect(result.css).toBe("");
    expect(result.notes).toEqual(['Web font CSS for "X" declares no @font-face for that family.']);
  });

  it("reports stylesheets that cannot be parsed", () => {
    const result = transformFontCss("@font-face {", {
      family: "X",
      alias: "X-alias",
      baseUrl: "https://cdn.example.com/x.css",
    });
    expect(result.css).toBe("");
    expect(result.notes).toEqual(['Web font CSS for "X" could not be parsed and was not applied.']);
  });
});

const response = (css: string, ok = true, status = 200): FontCssResponse => ({
  ok,
  status,
  text: () => Promise.resolve(css),
});

describe("web font loading", () => {
  const aliases = createFontAliases(["Inter", "Corp Sans"], "pm-canvas-test");

  it("loads and transforms each declared font in order", async () => {
    const fetches: string[] = [];
    const result = await loadFontCss(
      [
        { name: "Inter", href: "https://fonts.example.com/inter.css" },
        { name: "Corp Sans", href: "https://cdn.example.org/corp.css" },
      ],
      aliases,
      {
        fetcher: async (url) => {
          fetches.push(url);
          return response(
            url.endsWith("inter.css")
              ? "@font-face { font-family: Inter; src: url(i.woff2); }"
              : "@font-face { font-family: 'Corp Sans'; src: url(c.woff2); }",
          );
        },
      },
    );
    expect(fetches).toEqual([
      "https://fonts.example.com/inter.css",
      "https://cdn.example.org/corp.css",
    ]);
    expect(result.css).toContain('font-family: "Inter-pm-canvas-test"');
    expect(result.css).toContain('font-family: "CorpSans-pm-canvas-test"');
    expect(result.notes).toEqual([]);
  });

  it("skips incomplete or unsafe entries with a note", async () => {
    const result = await loadFontCss(
      [
        { name: "", href: "https://fonts.example.com/inter.css" },
        { name: "X", href: "javascript:alert(1)" },
        42,
      ],
      aliases,
      { fetcher: async () => response("") },
    );
    expect(result.css).toBe("");
    expect(result.notes).toHaveLength(3);
    expect(result.notes[0]).toContain("incomplete");
  });

  it("falls back with a note when the stylesheet cannot be fetched", async () => {
    let attempts = 0;
    const failingThenWorking = async (): Promise<FontCssResponse> => {
      attempts += 1;
      return attempts === 1
        ? response("gone", false, 404)
        : response("@font-face { font-family: Inter; src: url(i.woff2); }");
    };
    const failed = await loadFontCss(
      [{ name: "Inter", href: "https://fonts.example.com/retry.css" }],
      aliases,
      {
        fetcher: failingThenWorking,
      },
    );
    expect(failed.css).toBe("");
    expect(failed.notes).toEqual([
      'Web font CSS for "Inter" could not be loaded (HTTP 404); the canvas falls back to the remaining font stack.',
    ]);
    // Failed fetches are not cached, so a later canvas can retry successfully.
    const retried = await loadFontCss(
      [{ name: "Inter", href: "https://fonts.example.com/retry.css" }],
      aliases,
      {
        fetcher: failingThenWorking,
      },
    );
    expect(retried.css).toContain("Inter-pm-canvas-test");
    expect(retried.notes).toEqual([]);
  });

  it("fetches each stylesheet once and shares it across canvases", async () => {
    let fetches = 0;
    const fetcher = async () => {
      fetches += 1;
      return response("@font-face { font-family: Inter; src: url(i.woff2); }");
    };
    const first = await loadFontCss(
      [{ name: "Inter", href: "https://fonts.example.com/shared.css" }],
      aliases,
      {
        fetcher,
      },
    );
    const second = await loadFontCss(
      [{ name: "Inter", href: "https://fonts.example.com/shared.css" }],
      aliases,
      {
        fetcher,
      },
    );
    expect(fetches).toBe(1);
    expect(first.css).toContain("Inter-pm-canvas-test");
    expect(second.css).toContain("Inter-pm-canvas-test");
  });
});
