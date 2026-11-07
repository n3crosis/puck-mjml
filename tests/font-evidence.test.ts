import { EventEmitter } from "node:events";
import type { Page } from "@playwright/test";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  declaredMjmlFonts,
  expectedCanvasFonts,
  fontFailures,
  missingFontRegistrations,
  observeResources,
  waitForFontRegistrations,
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
});
