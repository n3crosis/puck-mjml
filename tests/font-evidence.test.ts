import { EventEmitter } from "node:events";
import type { Page } from "@playwright/test";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertReferenceFont404s,
  declaredMjmlFonts,
  expectedCanvasFonts,
  fontFailures,
  imageFailures,
  missingFontRegistrations,
  observeResources,
  waitForFontRegistrations,
  waitForImportedFontCss,
  type CanvasFontCssEvidence,
  type FontFaceEvidence,
} from "./browser/font-evidence";

const declared = [
  { family: "Inter", stylesheetUrl: "https://fonts.example/inter.css" },
  { family: "Instrument Serif", stylesheetUrl: "https://fonts.example/serif.css" },
];
const expected = expectedCanvasFonts(declared, "pm-canvas-test");
const face = (family: string, status: FontFaceEvidence["status"] = "unloaded") => ({
  family,
  status,
  weight: "100 900",
  style: "normal",
});

afterEach(() => vi.useRealTimers());

describe("browser font-readiness evidence", () => {
  it("reads declared families and decoded stylesheet URLs without changing the source", () => {
    const source = `<mjml><mj-head><mj-font name=" Instrument Serif " href="https://fonts.example/css?family=Instrument+Serif&amp;display=swap" /></mj-head><mj-body><mj-font name="Not head metadata" href="other" /></mj-body></mjml>`;
    expect(declaredMjmlFonts(source)).toEqual([
      {
        family: "Instrument Serif",
        stylesheetUrl: "https://fonts.example/css?family=Instrument+Serif&display=swap",
      },
    ]);
  });

  it("uses the live canvas scope for each expected alias", () => {
    expect(expected).toEqual([
      { ...declared[0], alias: "Inter-pm-canvas-test" },
      { ...declared[1], alias: "InstrumentSerif-pm-canvas-test" },
    ]);
  });

  it("requires registrations even when fonts.ready would report an empty font set ready", () => {
    expect(missingFontRegistrations(expected, [])).toEqual(expected);
    expect(missingFontRegistrations(expected, [face("Inter-other-canvas", "loaded")])).toEqual(
      expected,
    );
  });

  it("does not treat registered unused faces as failures and tolerates browser quoting", () => {
    expect(
      missingFontRegistrations(expected, [
        face('"inter-pm-canvas-test"'),
        face("'InstrumentSerif-pm-canvas-test'", "loaded"),
      ]),
    ).toEqual([]);
  });

  it("waits for delayed CSS registration instead of accepting the initial empty set", async () => {
    vi.useFakeTimers();
    let faces: FontFaceEvidence[] = [];
    const read = vi.fn(async () => faces);
    let settled = false;
    const waiting = waitForFontRegistrations(expected, read, 1000).then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(150);
    expect(settled).toBe(false);
    faces = expected.map(({ alias }) => face(alias));
    await vi.advanceTimersByTimeAsync(50);
    await waiting;
    expect(settled).toBe(true);
    expect(read.mock.calls.length).toBeGreaterThan(1);
  });

  it("waits for delayed imported CSS even when matching static faces are already registered", async () => {
    vi.useFakeTimers();
    const registered = expected.map(({ alias }) => face(alias, "loaded"));
    expect(missingFontRegistrations(expected, registered)).toEqual([]);
    let state: CanvasFontCssEvidence[] = [
      { scope: "pm-canvas-test", status: "loading", css: "", errors: null },
    ];
    let settled = false;
    const pending = waitForImportedFontCss(expected, async () => state, 1000).then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(150);
    expect(settled).toBe(false);
    state = [
      {
        scope: "pm-canvas-test",
        status: "ready",
        css: expected
          .map(({ alias }) => `@font-face{font-family:"${alias}";font-weight:100 900}`)
          .join(""),
        errors: null,
      },
    ];
    await vi.advanceTimersByTimeAsync(50);
    await pending;
    expect(settled).toBe(true);
  });

  it("rejects a different editor's CSS and waits for implicit-only discovery", async () => {
    await expect(
      waitForImportedFontCss(
        expected,
        async () => [
          {
            scope: "pm-canvas-other",
            status: "ready",
            css: expected.map(({ alias }) => `font-family:"${alias}"`).join(""),
            errors: null,
          },
        ],
        0,
      ),
    ).rejects.toThrow("did not settle");
    await expect(
      waitForImportedFontCss(
        [],
        async () => [{ scope: "pm-canvas-test", status: "loading", css: "", errors: null }],
        0,
      ),
    ).rejects.toThrow("did not settle");
    await expect(
      waitForImportedFontCss(
        [],
        async () => [{ scope: "pm-canvas-test", status: "idle", css: "", errors: null }],
        0,
      ),
    ).resolves.toBeUndefined();
  });

  it("requires implicit imported aliases to register even without explicit mj-font expectations", async () => {
    await expect(
      waitForImportedFontCss(
        [],
        async () => [
          {
            scope: "pm-canvas-test",
            status: "ready",
            css: '@font-face{font-family:"Roboto-pm-canvas-test"}',
            errors: null,
            missingAliases: ["Roboto-pm-canvas-test"],
          },
        ],
        0,
      ),
    ).rejects.toThrow("unregistered imported aliases: Roboto-pm-canvas-test");
  });

  it("does not accept a stale idle marker or report a stale error before current inputs are observed", async () => {
    for (const status of ["idle", "error"]) {
      await expect(
        waitForImportedFontCss(
          [],
          async () => [
            { scope: "pm-canvas-test", status, css: "", errors: "old error", inputsCurrent: false },
          ],
          0,
        ),
      ).rejects.toThrow("current inline font families have not been observed");
    }
  });

  it("reports settled import errors immediately instead of accepting head faces or timing out", async () => {
    const read = vi.fn(async () => [
      { scope: "pm-canvas-test", status: "error", css: "", errors: "HTTP 503 for Inter" },
    ]);
    await expect(waitForImportedFontCss(expected, read)).rejects.toThrow("HTTP 503 for Inter");
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("records implicit default stylesheet fetch and failure evidence, including redirects", () => {
    const page = new EventEmitter();
    const snapshot = observeResources(page as unknown as Page, []);
    const original = {
      url: () => "https://fonts.googleapis.com/css?family=Roboto:300,400,500,700",
      redirectedFrom: () => null,
    };
    const request = {
      url: () => "https://cdn.example/roboto.css",
      resourceType: () => "fetch",
      redirectedFrom: () => original,
      failure: () => ({ errorText: "net::ERR_FAILED" }),
    };
    page.emit("response", {
      url: request.url,
      request: () => request,
      status: () => 503,
      ok: () => false,
    });
    page.emit("requestfailed", request);
    const result = snapshot();
    expect(result.fontAndStylesheetResponses[0]).toMatchObject({
      implicitFontStylesheet: true,
      declaredFontStylesheet: false,
      status: 503,
    });
    const failures = fontFailures([], [], result);
    expect(failures.stylesheetTransport.httpErrors).toHaveLength(1);
    expect(failures.stylesheetTransport.failedRequests).toHaveLength(1);
  });

  it("reports the family, alias, and stylesheet when CSS never registers", async () => {
    await expect(waitForFontRegistrations(expected, async () => [], 0)).rejects.toThrow(
      "Inter as Inter-pm-canvas-test (https://fonts.example/inter.css)",
    );
  });

  it("distinguishes missing registrations, failed faces, and failed stylesheet transport", () => {
    const failures = fontFailures(expected, [face(expected[0].alias, "error")], {
      observedThroughMs: 0,
      warnings: [],
      failedRequests: [],
      imageResponses: [],
      fontAndStylesheetResponses: [
        {
          url: declared[1].stylesheetUrl,
          resourceType: "fetch",
          declaredFontStylesheet: true,
          status: 503,
          ok: false,
          elapsedMs: 0,
        },
        {
          url: declared[0].stylesheetUrl,
          resourceType: "fetch",
          declaredFontStylesheet: true,
          status: 302,
          ok: false,
          elapsedMs: 0,
        },
      ],
    });
    expect(failures.missingRegistrations).toEqual([expected[1]]);
    expect(failures.failedFaces).toEqual([face(expected[0].alias, "error")]);
    expect(failures.stylesheetTransport.httpErrors.map(({ status }) => status)).toEqual([503]);
  });

  it("tracks stylesheet fetches across redirects without classifying redirects as failures", () => {
    const page = new EventEmitter();
    const snapshot = observeResources(page as unknown as Page, declared);
    const request = {
      url: () => "https://cdn.example/redirected.css",
      resourceType: () => "fetch",
      redirectedFrom: () => ({ url: () => declared[0].stylesheetUrl, redirectedFrom: () => null }),
    };
    page.emit("response", {
      url: request.url,
      request: () => request,
      status: () => 200,
      ok: () => true,
    });
    expect(snapshot().fontAndStylesheetResponses[0]).toMatchObject({
      url: "https://cdn.example/redirected.css",
      declaredFontStylesheet: true,
      status: 200,
    });
  });

  it("captures early warnings, failed requests, and HTTP failures for fetch-based stylesheets", () => {
    const page = new EventEmitter();
    const snapshot = observeResources(page as unknown as Page, declared);
    page.emit("console", {
      type: () => "warning",
      text: () => '[puck-mjml] Web font CSS for "Inter" could not be loaded (HTTP 503)',
      location: () => ({ url: "http://localhost/src/canvas-css.ts", lineNumber: 1 }),
    });
    page.emit("requestfailed", {
      url: () => "https://fonts.example/inter.woff2",
      resourceType: () => "font",
      redirectedFrom: () => null,
      failure: () => ({ errorText: "net::ERR_FAILED" }),
    });
    for (const [url, resourceType, status] of [
      [declared[0].stylesheetUrl, "fetch", 503],
      ["https://fonts.example/inter.woff2", "font", 404],
      ["https://fonts.example/site.css", "stylesheet", 200],
      ["https://fonts.example/unrelated.json", "fetch", 200],
    ] as const) {
      page.emit("response", {
        url: () => url,
        request: () => ({
          resourceType: () => resourceType,
          url: () => url,
          redirectedFrom: () => null,
        }),
        status: () => status,
        ok: () => status === 200,
      });
    }
    const result = snapshot();
    expect(result.warnings).toHaveLength(1);
    expect(result.failedRequests[0].error).toBe("net::ERR_FAILED");
    expect(result.fontAndStylesheetResponses.map(({ status }) => status)).toEqual([503, 404, 200]);
    page.emit("console", {
      type: () => "error",
      text: () => "A later error",
      location: () => ({ url: "", lineNumber: 0 }),
    });
    expect(result.warnings).toHaveLength(1);
    expect(snapshot().warnings).toHaveLength(2);
  });

  it("records CSS background image HTTP responses separately from font and stylesheet responses", () => {
    const page = new EventEmitter();
    const snapshot = observeResources(page as unknown as Page, declared);
    for (const [url, resourceType, status] of [
      ["https://demo.react.email/static/raycast-bg.png", "image", 200],
      ["https://demo.react.email/static/missing-bg.png", "image", 404],
      ["https://demo.react.email/static/redirect.png", "image", 302],
      [declared[0].stylesheetUrl, "fetch", 503],
      ["https://fonts.example/inter.woff2", "font", 404],
    ] as const) {
      page.emit("response", {
        url: () => url,
        request: () => ({
          resourceType: () => resourceType,
          url: () => url,
          redirectedFrom: () => null,
        }),
        status: () => status,
        ok: () => status === 200,
      });
    }
    const result = snapshot();
    expect(result.imageResponses.map(({ status }) => status)).toEqual([200, 404, 302]);
    expect(result.imageResponses[0]).toMatchObject({
      url: "https://demo.react.email/static/raycast-bg.png",
      resourceType: "image",
      status: 200,
      ok: true,
      declaredFontStylesheet: false,
    });
    expect(result.fontAndStylesheetResponses.map(({ status }) => status)).toEqual([503, 404]);
    expect(imageFailures(result).httpErrors.map(({ url }) => url)).toEqual([
      "https://demo.react.email/static/missing-bg.png",
    ]);
    expect(
      fontFailures(expected, [], result).stylesheetTransport.httpErrors.map(({ url }) => url),
    ).toEqual([declared[0].stylesheetUrl]);
    page.emit("response", {
      url: () => "https://demo.react.email/static/later.png",
      request: () => ({
        resourceType: () => "image",
        url: () => "https://demo.react.email/static/later.png",
        redirectedFrom: () => null,
      }),
      status: () => 500,
      ok: () => false,
    });
    expect(result.imageResponses).toHaveLength(3);
    expect(snapshot().imageResponses).toHaveLength(4);
  });

  it("does not mix failed image requests with font or stylesheet transport failures", () => {
    const page = new EventEmitter();
    const snapshot = observeResources(page as unknown as Page, declared);
    for (const [url, resourceType] of [
      ["https://demo.react.email/static/raycast-bg.png", "image"],
      ["https://fonts.example/inter.woff2", "font"],
      [declared[0].stylesheetUrl, "fetch"],
    ]) {
      page.emit("requestfailed", {
        url: () => url,
        resourceType: () => resourceType,
        redirectedFrom: () => null,
        failure: () => ({ errorText: "net::ERR_FAILED" }),
      });
    }
    const result = snapshot();
    expect(imageFailures(result)).toMatchObject({
      failedRequests: [{ url: "https://demo.react.email/static/raycast-bg.png" }],
      httpErrors: [],
    });
    expect(
      fontFailures(expected, [], result).stylesheetTransport.failedRequests.map(({ url }) => url),
    ).toEqual([declared[0].stylesheetUrl]);
    expect(
      result.failedRequests.filter(({ resourceType }) => resourceType === "font"),
    ).toHaveLength(1);
  });
});

describe("immutable reference font 404 evidence", () => {
  const failed = [{ family: "Inter", weight: "400" }];
  const known = [{ ...failed[0], url: "https://fonts.example/pinned.woff2" }];

  it("checks the settled response snapshot rather than a pre-readiness snapshot", async () => {
    const responses: { url: string; status: number }[] = [];
    const earlySnapshot = [...responses];
    await Promise.resolve().then(() => responses.push({ url: known[0].url, status: 404 }));
    expect(() => assertReferenceFont404s(failed, known, earlySnapshot)).toThrow("HTTP 404");
    expect(() => assertReferenceFont404s(failed, known, responses)).not.toThrow();
  });

  it.each([
    { responses: [] },
    { responses: [{ url: known[0].url, status: 200 }] },
    { responses: [{ url: known[0].url, status: 500 }] },
    { responses: [{ url: "https://fonts.example/other.woff2", status: 404 }] },
  ])("rejects missing, non-404, or unrelated response evidence: %j", ({ responses }) => {
    expect(() => assertReferenceFont404s(failed, known, responses)).toThrow("Inter 400");
  });

  it("rejects unknown faces or weights even with a known URL 404", () => {
    const responses = [{ url: known[0].url, status: 404 }];
    for (const face of [
      { family: "Heading", weight: "400" },
      { family: "Inter", weight: "600" },
    ])
      expect(() => assertReferenceFont404s([face], known, responses)).toThrow("HTTP 404");
  });
});
