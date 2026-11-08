// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  attributeCaptureResources,
  collectResourceAttribution,
  inspectCaptureResources,
  type CaptureResourceInventory,
} from "./browser/capture-resource-attribution";
import { fontFailures, type ResourceSnapshot } from "./browser/font-evidence";

const url = "https://assets.example/current.png";
const empty = (): ResourceSnapshot => ({
  observedThroughMs: 30,
  warnings: [],
  failedRequests: [],
  imageResponses: [],
  fontAndStylesheetResponses: [],
});
const inventory = (): CaptureResourceInventory => ({
  inspectedKinds: ["image", "font", "stylesheet"],
  resources: [],
  uncertainty: { image: [], font: [], stylesheet: [] },
});
const failure = (resourceType = "image", failedUrl = url) => ({
  url: failedUrl,
  resourceType,
  declaredFontStylesheet: false,
  error: "net::ERR_ABORTED",
  elapsedMs: 10,
  sequence: 1,
  frameId: 1,
  requestId: 1,
  requestUrls: [failedUrl],
});
const success = (resourceType = "image", successfulUrl = url) => ({
  url: successfulUrl,
  resourceType,
  declaredFontStylesheet: false,
  status: 200,
  ok: true,
  elapsedMs: 20,
  sequence: 2,
  frameId: 1,
  requestId: 2,
  requestUrls: [successfulUrl],
});
const required = (ready = true): CaptureResourceInventory => ({
  ...inventory(),
  resources: [{ kind: "image", url, source: "img currentSrc", required: true, ready }],
});

describe("transport-first inspection", () => {
  it("skips DOM/CSS inspection when no relevant failure exists and preserves the raw snapshot", async () => {
    const snapshot = empty();
    snapshot.imageResponses.push(success(), { ...success(), status: 302, ok: false });
    snapshot.fontAndStylesheetResponses.push(success("font"));
    snapshot.failedRequests.push(failure("fetch", "https://api.example/unrelated"));
    const before = structuredClone(snapshot);
    const observe = vi.fn(() => snapshot);
    const inspect = vi.fn(async () => ({ inventory: inventory(), frameId: 1 }));
    const report = await collectResourceAttribution(observe, inspect);
    expect(inspect).not.toHaveBeenCalled();
    expect(observe).toHaveBeenCalledTimes(1);
    expect(report.resources).toBe(snapshot);
    expect(snapshot).toEqual(before);
    expect(report.resourceAttribution).toMatchObject({
      inspection: {
        status: "skipped",
        kinds: [],
        reason: expect.stringContaining("inspection is unnecessary"),
      },
      inventory: null,
      decisions: [],
      unresolved: [],
    });
  });

  it.each(["image", "font", "stylesheet", "declared-fetch", "implicit-fetch", "http-error"])(
    "does inspect relevant %s failures",
    async (kind) => {
      const snapshot = empty();
      if (kind === "http-error")
        snapshot.imageResponses.push({ ...success(), status: 404, ok: false });
      else
        snapshot.failedRequests.push({
          ...failure(kind.endsWith("fetch") ? "fetch" : kind),
          declaredFontStylesheet: kind === "declared-fetch",
          implicitFontStylesheet: kind === "implicit-fetch",
        });
      const expectedKind = kind.endsWith("fetch")
        ? "stylesheet"
        : kind === "http-error"
          ? "image"
          : kind;
      const inspect = vi.fn(async () => ({ inventory: inventory(), frameId: 1 }));
      const report = await collectResourceAttribution(() => snapshot, inspect);
      expect(inspect).toHaveBeenCalledOnce();
      expect(inspect).toHaveBeenCalledWith([expectedKind]);
      expect(report.resourceAttribution.inspection).toMatchObject({
        status: "performed",
        kinds: [expectedKind],
      });
      expect(report.resourceAttribution.inventory?.inspectedKinds).toEqual([expectedKind]);
    },
  );

  it("retains late failures of uninspected kinds as ambiguous without rescanning indefinitely", async () => {
    const before = empty();
    before.failedRequests.push(failure());
    const after = structuredClone(before);
    after.failedRequests.push(failure("font", "https://fonts.example/late.woff2"));
    const observe = vi.fn().mockReturnValueOnce(before).mockReturnValueOnce(after);
    const inspect = vi.fn(async () => ({ inventory: inventory(), frameId: 1 }));
    const report = await collectResourceAttribution(observe, inspect);
    expect(observe).toHaveBeenCalledTimes(2);
    expect(inspect).toHaveBeenCalledOnce();
    expect(report.resources).toBe(after);
    expect(report.resourceAttribution.inventory?.inspectedKinds).toEqual(["image"]);
    expect(report.resourceAttribution.unresolved).toEqual([
      expect.objectContaining({
        kind: "font",
        disposition: "ambiguous",
        proof: { requirements: [], uncertainty: [expect.stringContaining("not inspected")] },
      }),
    ]);
  });

  it("does not mistake incidental dependencies for a complete inspection of a late resource kind", async () => {
    const before = empty();
    before.failedRequests.push(failure("stylesheet"));
    const after = structuredClone(before);
    after.failedRequests.push(failure("font"));
    const current = inventory();
    current.resources.push({
      kind: "font",
      url,
      source: "incidental font rule",
      required: true,
      ready: true,
    });
    const observe = vi.fn().mockReturnValueOnce(before).mockReturnValueOnce(after);
    const report = await collectResourceAttribution(observe, async () => ({
      inventory: current,
      frameId: 1,
    }));
    expect(report.resourceAttribution.decisions.find(({ kind }) => kind === "font")).toMatchObject({
      disposition: "ambiguous",
    });
  });
});

describe("current-capture transport attribution", () => {
  it("retains stale aborts as raw evidence without poisoning a complete unrelated capture", () => {
    const snapshot = empty();
    snapshot.failedRequests.push(failure());
    const before = structuredClone(snapshot);
    const report = attributeCaptureResources(snapshot, inventory(), 1);
    expect(report.decisions[0].disposition).toBe("unused");
    expect(report.decisions[0].observation).toBe(snapshot.failedRequests[0]);
    expect(report.unresolved).toEqual([]);
    expect(snapshot).toEqual(before);
  });

  it("keeps a required unresolved failure even when its error is only an abort", () => {
    const snapshot = empty();
    snapshot.failedRequests.push(failure());
    const report = attributeCaptureResources(snapshot, required(false), 1);
    expect(report.unresolved).toHaveLength(1);
    expect(report.unresolved[0].disposition).toBe("unresolved");
  });

  it("resolves earlier failure only with later same-frame success and every current image decoded", () => {
    const snapshot = empty();
    snapshot.failedRequests.push(failure());
    snapshot.imageResponses.push(success());
    expect(attributeCaptureResources(snapshot, required(), 1).decisions[0].disposition).toBe(
      "resolved",
    );
    const mixed = required();
    mixed.resources.push({ ...mixed.resources[0], ready: false });
    expect(attributeCaptureResources(snapshot, mixed, 1).unresolved).toHaveLength(1);
  });

  it.each(["earlier success", "other frame", "unknown frame", "not decoded"])(
    "does not use %s as current recovery",
    (condition) => {
      const snapshot = empty();
      snapshot.failedRequests.push(failure());
      snapshot.imageResponses.push(success());
      if (condition === "earlier success") snapshot.imageResponses[0].sequence = 0;
      if (condition === "other frame") snapshot.imageResponses[0].frameId = 2;
      if (condition === "unknown frame") snapshot.imageResponses[0].frameId = null;
      expect(
        attributeCaptureResources(snapshot, required(condition !== "not decoded"), 1).unresolved,
      ).toHaveLength(1);
    },
  );

  it("keeps required CSS background failures unresolved after a 200 without decode proof", () => {
    const snapshot = empty();
    snapshot.failedRequests.push(failure());
    snapshot.imageResponses.push(success());
    const current = required(false);
    current.resources[0].source = "element background-image";
    expect(
      attributeCaptureResources(snapshot, current, 1).unresolved[0].proof.requirements,
    ).toEqual(current.resources);
  });

  it("discards an unused font only when current font ownership is complete", () => {
    const snapshot = empty();
    snapshot.failedRequests.push(failure("font"));
    const current = inventory();
    current.resources.push({
      kind: "font",
      url,
      source: "Unused family",
      required: false,
      ready: false,
    });
    expect(attributeCaptureResources(snapshot, current, 1).unresolved).toEqual([]);
    current.uncertainty.font.push("Unreadable stylesheet");
    expect(attributeCaptureResources(snapshot, current, 1).unresolved[0].disposition).toBe(
      "ambiguous",
    );
  });

  it("keeps current missing fonts unresolved and resolves only loaded current faces", () => {
    const snapshot = empty();
    snapshot.failedRequests.push(failure("font"));
    snapshot.fontAndStylesheetResponses.push(success("font"));
    const current = inventory();
    current.resources.push({
      kind: "font",
      url,
      source: "Required family",
      required: true,
      ready: false,
    });
    expect(attributeCaptureResources(snapshot, current, 1).unresolved).toHaveLength(1);
    current.resources[0].ready = true;
    expect(attributeCaptureResources(snapshot, current, 1).decisions[0].disposition).toBe(
      "resolved",
    );
  });

  it("retains failures whose absent URL has ambiguous image ownership", () => {
    const snapshot = empty();
    snapshot.failedRequests.push(failure());
    const current = inventory();
    current.uncertainty.image.push("External SVG dependencies are not inspectable");
    expect(attributeCaptureResources(snapshot, current, 1).unresolved[0].disposition).toBe(
      "ambiguous",
    );
  });

  it("does not ignore parent-mediated or unknown stylesheet imports", () => {
    const snapshot = empty();
    snapshot.failedRequests.push({ ...failure("fetch"), declaredFontStylesheet: true, frameId: 2 });
    const current = inventory();
    expect(attributeCaptureResources(snapshot, current, 1).unresolved).toHaveLength(1);
    current.resources.push({
      kind: "stylesheet",
      url,
      source: "declared canvas import",
      required: true,
      ready: false,
    });
    expect(attributeCaptureResources(snapshot, current, 1).unresolved[0].disposition).toBe(
      "unresolved",
    );
  });

  it("preserves required redirected HTTP failures until the final dependency is ready", () => {
    const snapshot = empty();
    snapshot.imageResponses.push({
      ...success(),
      url: "https://cdn.example/redirected.png",
      requestUrls: ["https://cdn.example/redirected.png", url],
      status: 404,
      ok: false,
    });
    const report = attributeCaptureResources(snapshot, required(false), 1);
    expect(report.unresolved[0].type).toBe("http-error");
    expect(report.unresolved[0].proof.requirements).toHaveLength(1);
  });
});

const originalFonts = Object.getOwnPropertyDescriptor(document, "fonts");
afterEach(() => {
  document.body.innerHTML = "";
  document.head.innerHTML = "";
  vi.restoreAllMocks();
  if (originalFonts) Object.defineProperty(document, "fonts", originalFonts);
  else Reflect.deleteProperty(document, "fonts");
});
function fonts(faces: { family: string; weight: string; style: string; status: string }[] = []) {
  Object.defineProperty(document, "fonts", { configurable: true, value: new Set(faces) });
}

describe("final resource inventory", () => {
  it("does not enumerate computed image properties or decode images for font-only failures", async () => {
    fonts([{ family: "Remote", weight: "400", style: "normal", status: "unloaded" }]);
    document.head.innerHTML =
      '<style>@font-face{font-family:Remote;font-weight:400;font-style:normal;src:url("https://fonts.example/remote.woff2")}</style>';
    document.body.innerHTML = `<p style="font-family:Remote">Text</p><img src="${url}">`;
    const image = document.querySelector("img")!;
    image.decode = vi.fn();
    const readStyle = window.getComputedStyle.bind(window);
    vi.spyOn(window, "getComputedStyle").mockImplementation(
      (element, pseudo) =>
        new Proxy(readStyle(element, pseudo), {
          get(target, property) {
            if (property === "length" || property === "item")
              throw new Error("Computed image-property enumeration is not needed for fonts");
            const value = Reflect.get(target, property, target);
            return typeof value === "function" ? value.bind(target) : value;
          },
        }),
    );
    const result = await inspectCaptureResources(document.body, { kinds: ["font"] });
    expect(result.inspectedKinds).toEqual(["font"]);
    expect(result.resources.some(({ kind }) => kind === "image")).toBe(false);
    expect(result.resources).toContainEqual(
      expect.objectContaining({ kind: "font", required: true, ready: false }),
    );
    expect(image.decode).not.toHaveBeenCalled();
  });

  it("does not read computed styles for stylesheet-only failures and retains opaque ownership", async () => {
    fonts();
    document.head.innerHTML = '<link rel="stylesheet">';
    Object.defineProperty(document.querySelector("link"), "href", {
      value: "https://fonts.example/blocked.css",
    });
    const computed = vi.spyOn(window, "getComputedStyle");
    const result = await inspectCaptureResources(document.body, { kinds: ["stylesheet"] });
    expect(computed).not.toHaveBeenCalled();
    expect(result.inspectedKinds).toEqual(["stylesheet"]);
    expect(result.uncertainty.stylesheet).toContain(
      "Unreadable stylesheet: https://fonts.example/blocked.css",
    );
  });

  it("does not read FontFaceSet for image-only failures", async () => {
    Object.defineProperty(document, "fonts", {
      configurable: true,
      get() {
        throw new Error("Font inspection is not needed for images");
      },
    });
    document.body.innerHTML = `<div style='background-image:url("${url}")'>Content</div>`;
    const result = await inspectCaptureResources(document.body, { kinds: ["image"] });
    expect(result.inspectedKinds).toEqual(["image"]);
    expect(result.resources).toContainEqual(
      expect.objectContaining({ kind: "image", url, required: true, ready: false }),
    );
  });

  it("collects CSS backgrounds without claiming they decoded", async () => {
    fonts();
    document.body.innerHTML = `<div style='background-image:url("${url}")'>Content</div>`;
    const result = await inspectCaptureResources(document.body);
    expect(result.resources).toContainEqual(
      expect.objectContaining({ kind: "image", url, required: true, ready: false }),
    );
  });

  it("records decode proof for the selected image URL, not an unselected src", async () => {
    fonts();
    document.body.innerHTML =
      '<img src="https://assets.example/fallback.png" srcset="https://assets.example/current.png 2x">';
    const image = document.querySelector("img")!;
    Object.defineProperties(image, {
      currentSrc: { value: url },
      complete: { value: true },
      naturalWidth: { value: 100 },
    });
    image.decode = vi.fn().mockResolvedValue(undefined);
    const result = await inspectCaptureResources(document.body);
    expect(result.resources.filter(({ source }) => source === "img currentSrc")).toEqual([
      { kind: "image", url, source: "img currentSrc", required: true, ready: true },
    ]);
  });

  it("does not certify a failed decode or unresolved responsive selection", async () => {
    fonts();
    document.body.innerHTML = `<img src="${url}" srcset="https://assets.example/other.png 2x">`;
    const image = document.querySelector("img")!;
    Object.defineProperty(image, "currentSrc", { value: "" });
    image.decode = vi.fn().mockRejectedValue(new Error("broken"));
    const result = await inspectCaptureResources(document.body);
    expect(result.resources).toContainEqual(
      expect.objectContaining({ url, required: true, ready: false }),
    );
    expect(result.uncertainty.image).toContain("Responsive image selection is unresolved");
  });

  it("keeps inaccessible font ownership explicit", async () => {
    fonts();
    document.head.innerHTML = '<link rel="stylesheet">';
    Object.defineProperty(document.querySelector("link"), "href", {
      value: "https://fonts.example/blocked.css",
    });
    const result = await inspectCaptureResources(document.body);
    expect(result.uncertainty.font).toContain(
      "Unreadable stylesheet: https://fonts.example/blocked.css",
    );
    expect(result.resources).toContainEqual(
      expect.objectContaining({ kind: "stylesheet", required: true, ready: false }),
    );
  });

  it("distinguishes unused registered faces from currently used fonts without a system-font allowlist", async () => {
    fonts([{ family: "Remote", weight: "400", style: "normal", status: "unloaded" }]);
    document.head.innerHTML = `<style>@font-face{font-family:Remote;font-weight:400;font-style:normal;src:url("https://fonts.example/remote.woff2")}</style>`;
    document.body.innerHTML = '<p style="font-family:serif">Text</p>';
    let result = await inspectCaptureResources(document.body);
    expect(result.resources).toContainEqual(
      expect.objectContaining({ kind: "font", required: false, ready: false }),
    );
    document.querySelector("p")!.style.fontFamily = "Remote, serif";
    result = await inspectCaptureResources(document.body);
    expect(result.resources).toContainEqual(
      expect.objectContaining({ kind: "font", required: true, ready: false }),
    );
  });

  it("keeps programmatic FontFace and embedded-content ownership uncertain", async () => {
    fonts([{ family: "Dynamic", weight: "400", style: "normal", status: "loaded" }]);
    document.body.innerHTML = "<canvas></canvas>";
    const result = await inspectCaptureResources(document.body);
    expect(result.uncertainty.font).toContain(
      "FontFaceSet contains faces without inspectable CSS sources",
    );
    expect(result.uncertainty.image).toContain(
      "Embedded artwork cannot be attributed from this document",
    );
  });

  it.each(["error", "loaded", "unloaded"] as const)(
    "keeps a same-descriptor programmatic face ambiguous when its status is %s",
    async (status) => {
      const face = { family: "Shared", weight: "400", style: "normal" };
      const registered = [
        { ...face, status: "loaded" as const },
        { ...face, status },
      ];
      fonts(registered);
      document.head.innerHTML =
        '<style>@font-face{font-family:Shared;font-weight:400;font-style:normal;src:url("https://fonts.example/css-face.woff2")}</style>';
      document.body.innerHTML = '<p style="font-family:Shared">Current text</p>';
      const snapshot = empty();
      snapshot.failedRequests.push(
        failure("font", "https://fonts.example/programmatic-face.woff2"),
      );
      const before = structuredClone(snapshot);
      const current = await inspectCaptureResources(document.body, { kinds: ["font"] });
      expect(current.uncertainty.font).toContain(
        "Indistinguishable font sources for shared|400|normal: 1 CSS declarations, 2 registered faces",
      );
      const report = attributeCaptureResources(snapshot, current, 1);
      expect(report.unresolved[0].disposition).toBe("ambiguous");
      expect(snapshot).toEqual(before);
      expect(fontFailures([], registered, snapshot).failedFaces).toEqual(
        registered.filter(({ status }) => status === "error"),
      );
    },
  );

  it("does not infer unique font-source ownership from equal duplicate counts", async () => {
    fonts([
      { family: "Shared", weight: "400", style: "normal", status: "loaded" },
      { family: "Shared", weight: "400", style: "normal", status: "loaded" },
    ]);
    document.head.innerHTML = `<style>${["first", "second"].map((name) => `@font-face{font-family:Shared;font-weight:400;font-style:normal;src:url("https://fonts.example/${name}.woff2")}`).join("")}</style>`;
    const current = await inspectCaptureResources(document.body, { kinds: ["font"] });
    expect(current.uncertainty.font).toContain(
      "Indistinguishable font sources for shared|400|normal: 2 CSS declarations, 2 registered faces",
    );
    const snapshot = empty();
    snapshot.failedRequests.push(failure("font", "https://fonts.example/unknown.woff2"));
    expect(attributeCaptureResources(snapshot, current, 1).unresolved[0].disposition).toBe(
      "ambiguous",
    );
  });

  it("does not use an inactive CSS declaration to identify a same-descriptor programmatic face", async () => {
    const registered = [
      { family: "Shared", weight: "400", style: "normal", status: "loaded" as const },
    ];
    fonts(registered);
    document.head.innerHTML =
      '<style>@media not all {@font-face{font-family:Shared;font-weight:400;font-style:normal;src:url("https://fonts.example/inactive.woff2")}}</style>';
    document.body.innerHTML = '<p style="font-family:Shared">Current text</p>';
    expect(window.matchMedia("not all").matches).toBe(false);
    const current = await inspectCaptureResources(document.body, { kinds: ["font"] });
    expect(current.uncertainty.font).toContain(
      "Font source under unevaluated CSS conditions: shared|400|normal",
    );
    expect(current.resources).toContainEqual(
      expect.objectContaining({
        kind: "font",
        url: "https://fonts.example/inactive.woff2",
        ready: false,
      }),
    );
    const snapshot = empty();
    snapshot.failedRequests.push(failure("font", "https://fonts.example/programmatic-face.woff2"));
    const before = structuredClone(snapshot);
    expect(attributeCaptureResources(snapshot, current, 1).unresolved[0].disposition).toBe(
      "ambiguous",
    );
    expect(snapshot).toEqual(before);
    expect(fontFailures([], registered, snapshot).failedFaces).toEqual([]);
  });
});
