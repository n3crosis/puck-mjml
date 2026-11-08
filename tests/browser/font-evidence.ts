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
export type ResourceOwnership = {
  requestId?: number;
  frameId?: number | null;
  requestUrls?: string[];
  sequence?: number;
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
export function observeResources(page: Page, fonts: DeclaredFont[]) {
  const started = Date.now();
  const frames = new WeakMap<Frame, number>();
  const requests = new WeakMap<Request, number>();
  let nextFrame = 0;
  let nextRequest = 0;
  let sequence = 0;
  const frameId = (frame: Frame | null) => {
    if (!frame) return null;
    if (!frames.has(frame)) frames.set(frame, ++nextFrame);
    return frames.get(frame)!;
  };
  const ownership = (request: Request): ResourceOwnership => {
    if (!requests.has(request)) requests.set(request, ++nextRequest);
    const requestUrls: string[] = [];
    for (let current: Request | null = request; current; current = current.redirectedFrom())
      requestUrls.push(current.url());
    let owner: Frame | null = null;
    // Service-worker requests (and detached frames) may have no available frame.
    try {
      owner = request.frame();
    } catch {
      // Unknown ownership is evidence, not a reason to discard a failure.
    }
    return {
      requestId: requests.get(request),
      frameId: frameId(owner),
      requestUrls,
      sequence: ++sequence,
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
  const elapsedMs = () => Date.now() - started;
  const isFontStylesheet = (request: Request, urls = fontStylesheets): boolean => {
    for (let current: Request | null = request; current; current = current.redirectedFrom()) {
      if (urls.has(current.url())) return true;
    }
    return false;
  };
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
    }),
    { frameId },
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
