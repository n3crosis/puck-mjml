import type { Page, Request } from "@playwright/test";
import { load } from "cheerio";
import { createFontAliases, familyKey } from "../../src/canvas-css";

export type DeclaredFont = { family: string; stylesheetUrl: string };
export type ExpectedCanvasFont = DeclaredFont & { alias: string };
export type FontFaceEvidence = {
  family: string;
  weight: string;
  style: string;
  status: FontFace["status"];
};

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
  const fontStylesheets = new Set(fonts.map(({ stylesheetUrl }) => new URL(stylesheetUrl).href));
  const warnings: { text: string; url: string; line: number; type: string; elapsedMs: number }[] =
    [];
  const failedRequests: {
    url: string;
    resourceType: string;
    declaredFontStylesheet: boolean;
    error: string | null;
    elapsedMs: number;
  }[] = [];
  const fontAndStylesheetResponses: {
    url: string;
    resourceType: string;
    declaredFontStylesheet: boolean;
    status: number;
    ok: boolean;
    elapsedMs: number;
  }[] = [];
  const elapsedMs = () => Date.now() - started;
  const isFontStylesheet = (request: Request): boolean => {
    for (let current: Request | null = request; current; current = current.redirectedFrom()) {
      if (fontStylesheets.has(current.url())) return true;
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
      url: request.url(),
      resourceType: request.resourceType(),
      declaredFontStylesheet: isFontStylesheet(request),
      error: request.failure()?.errorText ?? null,
      elapsedMs: elapsedMs(),
    });
  });
  page.on("response", (response) => {
    const request = response.request();
    const declaredFontStylesheet = isFontStylesheet(request);
    if (!["font", "stylesheet"].includes(request.resourceType()) && !declaredFontStylesheet) return;
    fontAndStylesheetResponses.push({
      url: response.url(),
      resourceType: request.resourceType(),
      declaredFontStylesheet,
      status: response.status(),
      ok: response.ok(),
      elapsedMs: elapsedMs(),
    });
  });
  return () => ({
    observedThroughMs: elapsedMs(),
    warnings: [...warnings],
    failedRequests: [...failedRequests],
    fontAndStylesheetResponses: [...fontAndStylesheetResponses],
  });
}

/** Preserve transport failures separately from absent registrations or failed faces. */
export function fontFailures(
  expected: ExpectedCanvasFont[],
  faces: FontFaceEvidence[],
  resources: ReturnType<ReturnType<typeof observeResources>>,
) {
  const stylesheet = (request: { resourceType: string; declaredFontStylesheet: boolean }) =>
    request.resourceType === "stylesheet" || request.declaredFontStylesheet;
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
