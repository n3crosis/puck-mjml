import { describe, expect, it, vi } from "vitest";
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

  it("uses case-insensitive descriptors and the last declared family", () => {
    const css = "@FONT-FACE { FONT-FAMILY: Other; font-family: Inter; SRC: url(inter.woff2); }";
    const options = { alias: "CanvasFont", baseUrl: "https://cdn.example.com/fonts/x.css" };
    expect(transformFontCss(css, { ...options, family: "Inter" }).css).toContain(
      'SRC: url("https://cdn.example.com/fonts/inter.woff2")',
    );
    expect(transformFontCss(css, { ...options, family: "Other" }).css).toBe("");
    expect(
      transformFontCss("@font-face { FONT-FAMILY: Inter; SRC: url(inter.woff2); }", {
        ...options,
        family: "Inter",
      }).notes,
    ).toEqual([]);
  });

  it("resolves quoted URL punctuation without rewriting local font names", () => {
    const result = transformFontCss(
      `@font-face { font-family: Inter; src: local("url(local)"), url("inter).woff2"), url('inter".woff2'); }`,
      { family: "Inter", alias: "CanvasFont", baseUrl: "https://cdn.example.com/fonts/x.css" },
    );
    expect(result.css).toContain('local("url(local)")');
    expect(result.css).toContain('url("https://cdn.example.com/fonts/inter).woff2")');
    expect(result.css).toContain('url("https://cdn.example.com/fonts/inter%22.woff2")');
  });

  it("keeps data URLs and absolute URLs intact", () => {
    const result = transformFontCss(
      "@font-face { font-family: X; src: url(data:font/woff2;base64,AAA) format('woff2'), url(https://other.example.com/x.woff2); }",
      { family: "X", alias: "X-alias", baseUrl: "https://cdn.example.com/x.css" },
    );
    expect(result.css).toContain("url(data:font/woff2;base64,AAA)");
    expect(result.css).toContain('url("https://other.example.com/x.woff2")');
  });

  it("rejects source-less faces instead of treating invalid CSS as a registered import", () => {
    const result = transformFontCss("@font-face {font-family: X; font-weight: 100 900;}", {
      family: "X",
      alias: "X-alias",
      baseUrl: "https://fonts.example/x.css",
    });
    expect(result.css).toBe("");
    expect(result.notes).toHaveLength(1);
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

  it("loads the last declaration of each font without retaining superseded faces", async () => {
    const fetches: string[] = [];
    const result = await loadFontCss(
      [
        { name: "Inter", href: "https://fonts.example.com/old-inter.css" },
        { name: "Corp Sans", href: "https://cdn.example.org/corp.css" },
        { name: "Inter", href: "https://fonts.example.com/inter.css" },
      ],
      aliases,
      {
        fetcher: async (url) => {
          fetches.push(url);
          return response(
            url.endsWith("old-inter.css")
              ? "@font-face { font-family: Inter; font-weight:700; src:url(old.woff2); }"
              : url.endsWith("inter.css")
                ? "@font-face { font-family: Inter; src: url(i.woff2); }"
                : "@font-face { font-family: 'Corp Sans'; src: url(c.woff2); }",
          );
        },
      },
    );
    expect(result.css).not.toContain("old.woff2");
    expect(fetches).toEqual([
      "https://fonts.example.com/inter.css",
      "https://cdn.example.org/corp.css",
    ]);
    expect(result.css).toContain('font-family: "Inter-pm-canvas-test"');
    expect(result.css).toContain('font-family: "CorpSans-pm-canvas-test"');
    expect(result.notes).toEqual([]);
  });

  it("resolves font sources against the final stylesheet URL after redirects", async () => {
    const result = await loadFontCss(
      [{ name: "Inter", href: "https://fonts.example.com/latest.css" }],
      aliases,
      {
        fetcher: async () => ({
          ...response("@font-face { font-family: Inter; src: url(../inter.woff2); }"),
          url: "https://cdn.example.com/v2/css/inter.css",
        }),
      },
    );
    expect(result.css).toContain('url("https://cdn.example.com/v2/inter.woff2")');
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

describe("web font resource bounds", () => {
  it("bounds streamed bytes before parsing and permits retry after rejection", async () => {
    const entry = [{ name: "X", href: "https://review.example/large.css" }];
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(600_000));
      },
      cancel,
    });
    const result = await loadFontCss(
      entry,
      {},
      {
        fetcher: async () => ({
          ok: true,
          status: 200,
          body: stream,
          text: async () => {
            throw Error("must stream");
          },
        }),
      },
    );
    expect(result.failures?.[0]).toContain("exceeds 1 MiB");
    expect(cancel).toHaveBeenCalledOnce();
    const retry = await loadFontCss(
      entry,
      {},
      { fetcher: async () => response("@font-face {font-family:X;src:url(x.woff2)}") },
    );
    expect(retry.css).toContain("@font-face");
  });

  it("aborts stalled requests, then loads the remaining fonts", async () => {
    vi.useFakeTimers();
    try {
      let signal: AbortSignal | null | undefined;
      const pending = loadFontCss(
        [
          { name: "X", href: "https://review.example/stalled.css" },
          { name: "Y", href: "https://review.example/ready.css" },
        ],
        {},
        {
          fetcher: async (url, options) => {
            if (url.endsWith("stalled.css")) {
              signal = options?.signal;
              return new Promise(() => {});
            }
            return response("@font-face {font-family:Y;src:url(y.woff2)}");
          },
        },
      );
      await vi.advanceTimersByTimeAsync(10_000);
      const result = await pending;
      expect(signal?.aborted).toBe(true);
      expect(result.failures?.[0]).toContain("timed out");
      expect(result.css).toContain("@font-face");
    } finally {
      vi.useRealTimers();
    }
  });

  it("evicts old stylesheets rather than retaining every visited document", async () => {
    const fetcher = vi.fn(async () => response("@font-face {font-family:X;src:url(x.woff2)}"));
    const entries = Array.from({ length: 17 }, (_, index) => ({
      name: "X",
      href: `https://review.example/cache-${index}.css`,
    }));
    for (const entry of entries) await loadFontCss([entry], {}, { fetcher });
    await loadFontCss([entries[16]], {}, { fetcher });
    expect(fetcher).toHaveBeenCalledTimes(17);
    await loadFontCss([entries[0]], {}, { fetcher });
    expect(fetcher).toHaveBeenCalledTimes(18);
  });
});
