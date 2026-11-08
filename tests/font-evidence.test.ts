import { EventEmitter } from "node:events";
import type { Frame, Page, Request } from "@playwright/test";
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
import { attributeCaptureResources } from "./browser/capture-resource-attribution";

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

function resourcePage(frames: Frame[] = []) {
  return Object.assign(new EventEmitter(), { frames: () => frames });
}

function observedFrame(url: string, parent: Frame | null = null) {
  const state = { url, detached: false };
  const frame = {
    url: () => state.url,
    name: () => "",
    parentFrame: () => parent,
    isDetached: () => state.detached,
  } as unknown as Frame;
  return { frame, state };
}

function resourceRequest(
  url: string,
  owner: Frame | null,
  parent: Request | null = null,
  type = "font",
) {
  return {
    url: () => url,
    resourceType: () => type,
    redirectedFrom: () => parent,
    frame: () => {
      if (!owner) throw new Error("Request frame unavailable");
      return owner;
    },
    failure: () => ({ errorText: "net::ERR_ABORTED" }),
  } as unknown as Request;
}

function respond(page: ReturnType<typeof resourcePage>, request: Request, status = 200) {
  page.emit("response", {
    request: () => request,
    url: () => request.url(),
    status: () => status,
    ok: () => status >= 200 && status < 300,
  });
}

describe("additive resource lifecycle evidence", () => {
  it("retains immutable start ownership when the frame navigates and detaches before failure", () => {
    const owner = observedFrame("https://capture.example/first");
    const page = resourcePage([owner.frame]);
    const snapshot = observeResources(page as unknown as Page, [], "editor");
    expect(snapshot().frameLifecycle?.map(({ event }) => event)).toEqual(["observed"]);
    page.emit("framenavigated", owner.frame);
    const request = resourceRequest("https://fonts.example/face.woff2", owner.frame);
    page.emit("request", request);
    respond(page, request);
    const earlier = snapshot();
    const before = structuredClone(earlier);
    owner.state.url = "https://capture.example/second";
    page.emit("framenavigated", owner.frame);
    owner.state.detached = true;
    page.emit("framedetached", owner.frame);
    // A duplicate request notification must not recapture ownership.
    page.emit("request", request);
    page.emit("requestfailed", request);
    snapshot.markPhase("capture:start");
    const result = snapshot();
    const failed = result.failedRequests[0];
    expect(failed).toMatchObject({ requestId: 1, frameId: 1, sequence: 2 });
    expect(failed.requestStart).toMatchObject({
      observed: true,
      ownership: "frame-observed",
      frame: {
        frameId: 1,
        url: "https://capture.example/first",
        detached: false,
        observedEpoch: 1,
      },
    });
    expect(failed.terminalFrame).toMatchObject({
      frameId: 1,
      url: "https://capture.example/second",
      detached: true,
      observedEpoch: 2,
    });
    expect(failed.requestStart?.timelineSequence).toBeLessThan(failed.timelineSequence!);
    expect(Object.isFrozen(failed.requestStart)).toBe(true);
    expect(Object.isFrozen(failed.requestStart?.frame)).toBe(true);
    expect(result.frameLifecycle?.map(({ event }) => event)).toEqual([
      "observed",
      "navigated",
      "navigated",
      "detached",
    ]);
    expect(earlier).toEqual(before);
  });

  it("records same-URL navigation epochs and explicit content boundaries without asserting replacement", () => {
    const owner = observedFrame("about:blank");
    const page = resourcePage([owner.frame]);
    const snapshot = observeResources(page as unknown as Page, [], "mjml");
    page.emit("framenavigated", owner.frame);
    page.emit("framenavigated", owner.frame);
    snapshot.markDocumentBoundary(owner.frame, "set-content:start");
    snapshot.markPhase("set-content:complete", owner.frame);
    const result = snapshot();
    expect(
      result.frameLifecycle?.map(({ event, frame }) => [event, frame.observedEpoch, frame.url]),
    ).toEqual([
      ["observed", 0, "about:blank"],
      ["navigated", 1, "about:blank"],
      ["navigated", 2, "about:blank"],
      ["harness-boundary", 3, "about:blank"],
    ]);
    expect(result.frameLifecycle?.at(-1)?.boundary).toBe("set-content:start");
    expect(result.harnessPhases?.[0]).toMatchObject({
      phase: "set-content:complete",
      frame: { observedEpoch: 3 },
    });
    expect(result.lifecycleNote).toContain("not proof of document replacement");
    expect(result.failedRequests).toEqual([]);
  });

  it("records redirect parent and child starts independently across frames", () => {
    const parentFrame = observedFrame("https://capture.example/editor");
    const childFrame = observedFrame("about:srcdoc", parentFrame.frame);
    const page = resourcePage([parentFrame.frame]);
    const snapshot = observeResources(page as unknown as Page, []);
    page.emit("frameattached", childFrame.frame);
    const parent = resourceRequest("https://fonts.example/start.woff2", parentFrame.frame);
    const child = resourceRequest("https://cdn.example/end.woff2", childFrame.frame, parent);
    page.emit("request", parent);
    respond(page, parent, 302);
    page.emit("request", child);
    page.emit("requestfailed", child);
    const failed = snapshot().failedRequests[0];
    expect(failed).toMatchObject({
      requestId: 2,
      frameId: 2,
      requestUrls: [child.url(), parent.url()],
    });
    expect(failed.requestStart?.frame).toMatchObject({ frameId: 2, parentFrameId: 1 });
    expect(failed.redirectedFrom).toMatchObject({
      requestId: 1,
      requestStart: { observed: true, frame: { frameId: 1, parentFrameId: null } },
    });
    expect(snapshot().frameLifecycle?.map(({ event }) => event)).toEqual(["observed", "attached"]);
  });

  it.each(["parent", "child"])(
    "keeps a missing redirect %s start explicitly unknown",
    (missing) => {
      const owner = observedFrame("about:srcdoc");
      const page = resourcePage([owner.frame]);
      const snapshot = observeResources(page as unknown as Page, []);
      const parent = resourceRequest("https://fonts.example/start.woff2", owner.frame);
      const child = resourceRequest("https://cdn.example/end.woff2", owner.frame, parent);
      if (missing !== "parent") page.emit("request", parent);
      respond(page, parent, 302);
      if (missing !== "child") page.emit("request", child);
      page.emit("requestfailed", child);
      const failed = snapshot().failedRequests[0];
      const start =
        missing === "parent" ? failed.redirectedFrom?.requestStart : failed.requestStart;
      expect(start).toEqual({
        observed: false,
        timelineSequence: null,
        elapsedMs: null,
        url: null,
        frame: null,
        ownership: "start-unobserved",
      });
      expect(failed.frameId).toBe(1);
      expect(failed.redirectedFrom?.requestStart.observed).toBe(missing !== "parent");
      expect(failed.requestStart?.observed).toBe(missing !== "child");
    },
  );

  it("does not invent a redirect parent terminal ID from its observed start", () => {
    const owner = observedFrame("about:srcdoc");
    const page = resourcePage([owner.frame]);
    const snapshot = observeResources(page as unknown as Page, []);
    const parent = resourceRequest("https://fonts.example/start.woff2", owner.frame);
    const child = resourceRequest("https://cdn.example/end.woff2", owner.frame, parent);
    page.emit("request", parent);
    page.emit("request", child);
    page.emit("requestfailed", child);
    const earlier = snapshot();
    expect(earlier.failedRequests[0].redirectedFrom).toMatchObject({
      requestId: null,
      requestStart: { observed: true },
    });
    respond(page, parent, 302);
    expect(snapshot().fontAndStylesheetResponses[0].requestId).toBe(2);
    expect(earlier.failedRequests[0].redirectedFrom?.requestId).toBeNull();
  });

  it("keeps service-worker or unavailable-frame starts unknown even if terminal ownership becomes visible", () => {
    const owner = observedFrame("about:srcdoc");
    const page = resourcePage([owner.frame]);
    const snapshot = observeResources(page as unknown as Page, []);
    let available = false;
    const request = {
      ...resourceRequest("https://fonts.example/face.woff2", null),
      frame: () => {
        if (!available) throw new Error("Service-worker request has no frame");
        return owner.frame;
      },
    } as Request;
    page.emit("request", request);
    available = true;
    page.emit("requestfailed", request);
    const failed = snapshot().failedRequests[0];
    expect(failed.requestStart).toMatchObject({
      observed: true,
      frame: null,
      ownership: "frame-unavailable",
    });
    expect(failed.frameId).toBe(1);
    expect(failed.terminalFrame?.frameId).toBe(1);
  });

  it("keeps page roles and their local frame IDs separate without pooling observations", () => {
    const observers = (["editor", "react-email", "mjml"] as const).map((role) => {
      const owner = observedFrame("about:blank");
      const page = resourcePage([owner.frame]);
      return { role, page, owner, snapshot: observeResources(page as unknown as Page, [], role) };
    });
    const first = observers[0];
    const request = resourceRequest("https://fonts.example/shared.woff2", first.owner.frame);
    first.page.emit("request", request);
    first.page.emit("requestfailed", request);
    expect(observers.map(({ snapshot }) => snapshot().pageRole)).toEqual([
      "editor",
      "react-email",
      "mjml",
    ]);
    expect(observers.map(({ snapshot }) => snapshot().failedRequests.length)).toEqual([1, 0, 0]);
    expect(observers.map(({ snapshot }) => snapshot().frameLifecycle?.[0].frame.frameId)).toEqual([
      1, 1, 1,
    ]);
  });

  it("does not clear detached-frame or parent-mediated failures from additive lifecycle evidence", () => {
    const parent = observedFrame("https://capture.example/editor");
    const canvas = observedFrame("about:srcdoc", parent.frame);
    const page = resourcePage([parent.frame]);
    const snapshot = observeResources(page as unknown as Page, declared, "editor");
    page.emit("frameattached", canvas.frame);
    const font = resourceRequest("https://fonts.example/old.woff2", parent.frame);
    const css = resourceRequest(declared[0].stylesheetUrl, parent.frame, null, "fetch");
    page.emit("request", font);
    page.emit("request", css);
    page.emit("framedetached", parent.frame);
    page.emit("requestfailed", font);
    page.emit("requestfailed", css);
    const raw = snapshot();
    const report = attributeCaptureResources(
      raw,
      {
        inspectedKinds: ["font", "stylesheet"],
        resources: [],
        uncertainty: { image: [], font: ["Unreadable current stylesheet"], stylesheet: [] },
      },
      snapshot.frameId(canvas.frame),
    );
    expect(report.decisions.map(({ kind, disposition }) => [kind, disposition])).toEqual([
      ["font", "ambiguous"],
      ["stylesheet", "ambiguous"],
    ]);
    expect(report.unresolved).toHaveLength(2);
    expect(raw.failedRequests).toHaveLength(2);
    expect(fontFailures([], [], raw).stylesheetTransport.failedRequests).toEqual([
      raw.failedRequests[1],
    ]);
  });
});

describe("browser font-readiness evidence", () => {
  it("retains request, frame, redirect and event-order ownership without resetting raw history", () => {
    const page = resourcePage();
    const snapshot = observeResources(page as unknown as Page, []);
    const frame = {} as ReturnType<Page["mainFrame"]>;
    const redirected = {
      url: () => "https://assets.example/original.png",
      redirectedFrom: () => null,
    };
    const request = {
      url: () => "https://cdn.example/final.png",
      resourceType: () => "image",
      redirectedFrom: () => redirected,
      frame: () => frame,
      failure: () => ({ errorText: "net::ERR_ABORTED" }),
    };
    page.emit("response", {
      url: request.url,
      request: () => request,
      status: () => 200,
      ok: () => true,
    });
    page.emit("requestfailed", request);
    const result = snapshot();
    expect(result.imageResponses[0]).toMatchObject({
      requestId: 1,
      frameId: snapshot.frameId(frame),
      sequence: 1,
      requestUrls: [request.url(), redirected.url()],
    });
    expect(result.failedRequests[0]).toMatchObject({
      requestId: 1,
      frameId: snapshot.frameId(frame),
      sequence: 2,
    });
    page.emit("requestfailed", {
      ...request,
      frame: () => {
        throw new Error("No frame available");
      },
    });
    expect(snapshot().failedRequests[1]).toMatchObject({
      requestId: 2,
      frameId: null,
      sequence: 3,
    });
    expect(result.failedRequests).toHaveLength(1);
    expect(snapshot().failedRequests).toHaveLength(2);
  });

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
    const page = resourcePage();
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
    const page = resourcePage();
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
    const page = resourcePage();
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
    const page = resourcePage();
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
    const page = resourcePage();
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
