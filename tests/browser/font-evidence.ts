import type { Frame, Locator, Page, Request } from "@playwright/test";
import { load } from "cheerio";
import { createFontAliases, familyKey } from "../../src/canvas-css";
import { mjmlDefaultFonts } from "../../src/canvas-font-resolver";
import { inspectCanvasFontInputs } from "../../src/canvas-font-inputs";

export type DeclaredFont = { family: string; stylesheetUrl: string };
export type ExpectedCanvasFont = DeclaredFont & { alias: string };
export type FontFaceEvidence = {
  family: string;
  weight: string;
  style: string;
  status: FontFace["status"];
};
export type CanvasFontCssEvidence = {
  scope: string;
  status: string | null;
  css: string;
  errors: string | null;
  missingAliases?: string[];
  inputsCurrent?: boolean;
};
export type ResourcePageRole = "editor" | "react-email" | "mjml" | "unspecified";
type TimelineStamp = { timelineSequence: number; elapsedMs: number };
export type FrameObservation = {
  frameId: number;
  parentFrameId: number | null;
  name: string | null;
  url: string | null;
  detached: boolean | null;
  // This counts observed navigation/harness boundaries, not verified document
  // replacements. Same-document navigation can advance it too.
  observedEpoch: number;
};
export type RequestStartEvidence = {
  observed: boolean;
  timelineSequence: number | null;
  elapsedMs: number | null;
  url: string | null;
  frame: FrameObservation | null;
  ownership: "frame-observed" | "frame-unavailable" | "start-unobserved";
};
type FrameLifecycleEvent = TimelineStamp & {
  event: "observed" | "attached" | "navigated" | "detached" | "harness-boundary";
  frame: FrameObservation;
  boundary?: string;
};
type ResourceLifecycleSnapshot = {
  // Optional for compatibility with older artifacts and synthetic snapshots.
  pageRole?: ResourcePageRole;
  lifecycleNote?: string;
  frameLifecycle?: FrameLifecycleEvent[];
  harnessPhases?: (TimelineStamp & { phase: string; frame: FrameObservation | null })[];
};
export type ResourceOwnership = {
  requestId?: number;
  frameId?: number | null;
  requestUrls?: string[];
  sequence?: number;
  timelineSequence?: number;
  requestStart?: RequestStartEvidence;
  terminalFrame?: FrameObservation | null;
  redirectedFrom?: { requestId: number | null; requestStart: RequestStartEvidence } | null;
};

/** Static head faces must not satisfy readiness for a pending imported face. */
export async function waitForImportedFontCss(
  expected: ExpectedCanvasFont[],
  readStyles: () => Promise<CanvasFontCssEvidence[]>,
  timeoutMs = 20_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const styles = await readStyles();
    const failed = styles.filter(
      ({ status, inputsCurrent }) => status === "error" && inputsCurrent !== false,
    );
    if (failed.length) {
      throw new Error(
        `Canvas font CSS failed: ${failed.map(({ scope, errors }) => `${scope}: ${errors ?? "unknown import failure"}`).join("; ")}`,
      );
    }
    const missing = expected.filter(
      ({ alias }) =>
        !styles.some(
          ({ scope, status, css }) =>
            alias.endsWith(`-${scope}`) &&
            status === "ready" &&
            new RegExp(`font-family\\s*:\\s*["']${alias}["']`).test(css),
        ),
    );
    const unregistered = styles.flatMap(({ missingAliases }) => missingAliases ?? []);
    if (
      styles.length &&
      styles.every(
        ({ status, inputsCurrent }) =>
          inputsCurrent !== false && (status === "ready" || status === "idle"),
      ) &&
      !missing.length &&
      !unregistered.length
    )
      return;
    if (Date.now() >= deadline) {
      throw new Error(
        `Canvas imported font CSS did not settle${styles.some(({ inputsCurrent }) => inputsCurrent === false) ? "; current inline font families have not been observed" : ""}${missing.length ? `: ${missing.map(({ family, stylesheetUrl }) => `${family} (${stylesheetUrl})`).join(", ")}` : ""}${unregistered.length ? `; unregistered imported aliases: ${unregistered.join(", ")}` : ""}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, Math.min(50, deadline - Date.now())));
  }
}

/** Use on the live canvas or a containing locator, before document.fonts.ready. */
export async function waitForCanvasFontCss(
  root: Locator,
  expected: ExpectedCanvasFont[] = [],
  timeoutMs = 20_000,
): Promise<void> {
  await waitForImportedFontCss(
    expected,
    () => root.evaluate(inspectCanvasFontInputs, true),
    timeoutMs,
  );
}

/** Read the checked-in MJML, not a reconstructed canvas or compiled stylesheet. */
export function declaredMjmlFonts(source: string): DeclaredFont[] {
  const $ = load(source, { xml: true });
  return $("mj-head > mj-font")
    .map((_index, node) => ({
      family: ($(node).attr("name") ?? "").trim(),
      stylesheetUrl: $(node).attr("href") ?? "",
    }))
    .get();
}

export function expectedCanvasFonts(fonts: DeclaredFont[], scope: string): ExpectedCanvasFont[] {
  const aliases = createFontAliases(
    fonts.map(({ family }) => family),
    scope,
  );
  return fonts.map((font) => ({ ...font, alias: aliases[familyKey(font.family)] ?? font.family }));
}

export function missingFontRegistrations(
  expected: ExpectedCanvasFont[],
  faces: FontFaceEvidence[],
): ExpectedCanvasFont[] {
  const registered = new Set(
    faces.map(({ family }) => familyKey(family.replace(/^(['"])(.*)\1$/, "$2"))),
  );
  // An unused/unloaded face is registered and valid. Only document.fonts.ready
  // and the error-state check determine whether fonts actually used have loaded.
  return expected.filter(({ alias }) => !registered.has(familyKey(alias)));
}

/** document.fonts.ready alone can resolve before useCanvasFonts fetches its CSS. */
export async function waitForFontRegistrations(
  expected: ExpectedCanvasFont[],
  readFaces: () => Promise<FontFaceEvidence[]>,
  timeoutMs = 20_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const missing = missingFontRegistrations(expected, await readFaces());
    if (!missing.length) return;
    if (Date.now() >= deadline) {
      throw new Error(
        `Canvas font CSS did not register the declared families: ${missing
          .map(({ family, alias, stylesheetUrl }) => `${family} as ${alias} (${stylesheetUrl})`)
          .join(", ")}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, Math.min(50, deadline - Date.now())));
  }
}

/** Install before navigation/setContent: canvas warnings are deduplicated globally. */
export function observeResources(
  page: Page,
  fonts: DeclaredFont[],
  pageRole: ResourcePageRole = "unspecified",
) {
  const started = Date.now();
  const frames = new WeakMap<Frame, { id: number; epoch: number; detached: boolean | null }>();
  const requests = new WeakMap<Request, { id?: number; start?: RequestStartEvidence }>();
  const frameLifecycle: FrameLifecycleEvent[] = [];
  const harnessPhases: NonNullable<ResourceLifecycleSnapshot["harnessPhases"]> = [];
  let nextFrame = 0;
  let nextRequest = 0;
  let timelineSequence = 0;
  // Preserve the existing terminal-resource event sequence independently of
  // the additive lifecycle timeline used by starts, frames and harness phases.
  let sequence = 0;
  const elapsedMs = () => Date.now() - started;
  const stamp = (): TimelineStamp => ({
    timelineSequence: ++timelineSequence,
    elapsedMs: elapsedMs(),
  });
  const read = <T>(value: () => T): T | null => {
    try {
      return value();
    } catch {
      return null;
    }
  };
  const frameObservation = (frame: Frame): FrameObservation => {
    const state = registerFrame(frame);
    const parent = read(() => frame.parentFrame());
    return Object.freeze({
      frameId: state.id,
      parentFrameId: parent ? registerFrame(parent).id : null,
      name: read(() => frame.name()),
      url: read(() => frame.url()),
      detached: state.detached ?? read(() => frame.isDetached()),
      observedEpoch: state.epoch,
    });
  };
  function registerFrame(frame: Frame, event: "observed" | "attached" = "observed") {
    const known = frames.get(frame);
    if (known) return known;
    const state = {
      id: ++nextFrame,
      epoch: 0,
      detached: event === "attached" ? false : (null as boolean | null),
    };
    frames.set(frame, state);
    const observation = frameObservation(frame);
    frameLifecycle.push({ ...stamp(), event, frame: observation });
    return state;
  }
  const frameId = (frame: Frame | null) => (frame ? registerFrame(frame).id : null);
  const observeBoundary = (
    frame: Frame,
    event: "navigated" | "harness-boundary",
    boundary?: string,
  ) => {
    registerFrame(frame).epoch += 1;
    frameLifecycle.push({
      ...stamp(),
      event,
      frame: frameObservation(frame),
      ...(boundary ? { boundary } : {}),
    });
  };
  const markPhase = (phase: string, frame: Frame | null = null) => {
    const observation = frame ? frameObservation(frame) : null;
    harnessPhases.push({ ...stamp(), phase, frame: observation });
  };
  const markDocumentBoundary = (frame: Frame, boundary: string) =>
    observeBoundary(frame, "harness-boundary", boundary);
  const requestRecord = (request: Request) => {
    let record = requests.get(request);
    if (!record) {
      record = {};
      requests.set(request, record);
    }
    return record;
  };
  const unknownStart: RequestStartEvidence = Object.freeze({
    observed: false,
    timelineSequence: null,
    elapsedMs: null,
    url: null,
    frame: null,
    ownership: "start-unobserved",
  });
  const observeStart = (request: Request) => {
    const record = requestRecord(request);
    if (record.start) return;
    const owner = read(() => request.frame());
    const frame = owner ? frameObservation(owner) : null;
    record.start = Object.freeze({
      ...stamp(),
      observed: true,
      url: request.url(),
      frame,
      ownership: frame ? "frame-observed" : "frame-unavailable",
    });
  };
  const ownership = (request: Request): ResourceOwnership => {
    const record = requestRecord(request);
    // Keep legacy request IDs assigned at their first terminal observation.
    record.id ??= ++nextRequest;
    const requestUrls: string[] = [];
    for (let current: Request | null = request; current; current = current.redirectedFrom())
      requestUrls.push(current.url());
    const owner = read(() => request.frame());
    const terminalFrame = owner ? frameObservation(owner) : null;
    const parent = request.redirectedFrom();
    const parentRecord = parent ? requestRecord(parent) : null;
    return {
      requestId: record.id,
      // Keep terminal ownership as before; never replace missing start evidence
      // with it or with a redirect parent's possibly different frame.
      frameId: terminalFrame?.frameId ?? null,
      requestUrls,
      sequence: ++sequence,
      timelineSequence: stamp().timelineSequence,
      requestStart: record.start ?? unknownStart,
      terminalFrame,
      redirectedFrom: parentRecord
        ? { requestId: parentRecord.id ?? null, requestStart: parentRecord.start ?? unknownStart }
        : null,
    };
  };
  const fontStylesheets = new Set(fonts.map(({ stylesheetUrl }) => new URL(stylesheetUrl).href));
  const implicitStylesheets = new Set(mjmlDefaultFonts.map(({ href }) => new URL(href).href));
  const warnings: { text: string; url: string; line: number; type: string; elapsedMs: number }[] =
    [];
  const failedRequests: (ResourceOwnership & {
    url: string;
    resourceType: string;
    declaredFontStylesheet: boolean;
    implicitFontStylesheet?: boolean;
    error: string | null;
    elapsedMs: number;
  })[] = [];
  type ResourceResponse = ResourceOwnership & {
    url: string;
    resourceType: string;
    declaredFontStylesheet: boolean;
    implicitFontStylesheet?: boolean;
    status: number;
    ok: boolean;
    elapsedMs: number;
  };
  const fontAndStylesheetResponses: ResourceResponse[] = [];
  const imageResponses: ResourceResponse[] = [];
  const isFontStylesheet = (request: Request, urls = fontStylesheets): boolean => {
    for (let current: Request | null = request; current; current = current.redirectedFrom()) {
      if (urls.has(current.url())) return true;
    }
    return false;
  };
  page.on("request", observeStart);
  page.on("frameattached", (frame) => {
    if (!frames.has(frame)) registerFrame(frame, "attached");
    else {
      registerFrame(frame).detached = false;
      frameLifecycle.push({ ...stamp(), event: "attached", frame: frameObservation(frame) });
    }
  });
  page.on("framenavigated", (frame) => observeBoundary(frame, "navigated"));
  page.on("framedetached", (frame) => {
    registerFrame(frame).detached = true;
    frameLifecycle.push({ ...stamp(), event: "detached", frame: frameObservation(frame) });
  });
  // Existing frames are observations, not invented attachment/navigation events.
  for (const frame of page.frames()) registerFrame(frame);
  page.on("console", (message) => {
    if (!["warning", "error"].includes(message.type())) return;
    warnings.push({
      text: message.text(),
      type: message.type(),
      url: message.location().url,
      line: message.location().lineNumber,
      elapsedMs: elapsedMs(),
    });
  });
  page.on("requestfailed", (request) => {
    failedRequests.push({
      ...ownership(request),
      url: request.url(),
      resourceType: request.resourceType(),
      declaredFontStylesheet: isFontStylesheet(request),
      implicitFontStylesheet:
        isFontStylesheet(request, implicitStylesheets) && !isFontStylesheet(request),
      error: request.failure()?.errorText ?? null,
      elapsedMs: elapsedMs(),
    });
  });
  page.on("response", (response) => {
    const request = response.request();
    const declaredFontStylesheet = isFontStylesheet(request);
    const implicitFontStylesheet =
      isFontStylesheet(request, implicitStylesheets) && !declaredFontStylesheet;
    const resourceType = request.resourceType();
    const evidence = {
      ...ownership(request),
      url: response.url(),
      resourceType,
      declaredFontStylesheet,
      implicitFontStylesheet,
      status: response.status(),
      ok: response.ok(),
      elapsedMs: elapsedMs(),
    };
    if (
      ["font", "stylesheet"].includes(resourceType) ||
      declaredFontStylesheet ||
      implicitFontStylesheet
    ) {
      fontAndStylesheetResponses.push(evidence);
    }
    // CSS background images do not appear in the document's <img> collection.
    // Keep their HTTP status evidence separate from font/stylesheet failures.
    if (resourceType === "image") imageResponses.push(evidence);
  });
  return Object.assign(
    () => ({
      observedThroughMs: elapsedMs(),
      warnings: [...warnings],
      failedRequests: [...failedRequests],
      fontAndStylesheetResponses: [...fontAndStylesheetResponses],
      imageResponses: [...imageResponses],
      ...({
        pageRole,
        lifecycleNote:
          "Observed frame epochs and harness phases are diagnostic events, not proof of document replacement, resource retirement or effective font usage.",
        frameLifecycle: [...frameLifecycle],
        harnessPhases: [...harnessPhases],
      } satisfies ResourceLifecycleSnapshot as ResourceLifecycleSnapshot),
    }),
    { frameId, markPhase, markDocumentBoundary },
  );
}

export type ResourceSnapshot = ReturnType<ReturnType<typeof observeResources>>;

export function imageFailures(resources: ReturnType<ReturnType<typeof observeResources>>) {
  return {
    failedRequests: resources.failedRequests.filter(({ resourceType }) => resourceType === "image"),
    httpErrors: resources.imageResponses.filter(({ status }) => status >= 400),
  };
}

/** Preserve transport failures separately from absent registrations or failed faces. */
export function fontFailures(
  expected: ExpectedCanvasFont[],
  faces: FontFaceEvidence[],
  resources: ReturnType<ReturnType<typeof observeResources>>,
) {
  const stylesheet = (request: {
    resourceType: string;
    declaredFontStylesheet: boolean;
    implicitFontStylesheet?: boolean;
  }) =>
    request.resourceType === "stylesheet" ||
    request.declaredFontStylesheet ||
    request.implicitFontStylesheet;
  return {
    missingRegistrations: missingFontRegistrations(expected, faces),
    failedFaces: faces.filter(({ status }) => status === "error"),
    stylesheetTransport: {
      failedRequests: resources.failedRequests.filter(stylesheet),
      httpErrors: resources.fontAndStylesheetResponses.filter(
        (response) => stylesheet(response) && response.status >= 400,
      ),
    },
  };
}

/** Called after bounded font readiness, never from a pre-load resource snapshot. */
export function assertReferenceFont404s(
  failedFaces: { family: string; weight: string }[],
  known: { family: string; weight: string; url: string }[],
  responses: { url: string; status: number }[],
): void {
  for (const face of failedFaces) {
    const source = known.find(
      ({ family, weight }) => face.family.replace(/["']/g, "") === family && face.weight === weight,
    );
    if (!source || !responses.some(({ url, status }) => url === source.url && status === 404))
      throw new Error(
        `Font failed without verified original HTTP 404: ${face.family} ${face.weight}`,
      );
  }
}
