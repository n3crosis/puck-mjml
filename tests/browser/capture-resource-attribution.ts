import type { ExpectedCanvasFont, ResourceSnapshot } from "./font-evidence";

export type ResourceKind = "image" | "font" | "stylesheet";
export type CaptureResource = {
  kind: ResourceKind;
  url: string;
  source: string;
  required: boolean;
  ready: boolean;
};
export type CaptureResourceInventory = {
  inspectedKinds: ResourceKind[];
  resources: CaptureResource[];
  uncertainty: Record<ResourceKind, string[]>;
};
type AttributionDecision = {
  type: "requestfailed" | "http-error";
  kind: ResourceKind;
  observation:
    | ResourceSnapshot["failedRequests"][number]
    | ResourceSnapshot["imageResponses"][number];
  disposition: "unused" | "ambiguous" | "resolved" | "unresolved";
  reason: string;
  proof: { requirements: CaptureResource[]; uncertainty: string[] };
  success?: ResourceSnapshot["imageResponses"][number];
};

function resourceKind(event: {
  resourceType: string;
  declaredFontStylesheet: boolean;
  implicitFontStylesheet?: boolean;
}): ResourceKind | null {
  return event.resourceType === "image"
    ? "image"
    : event.resourceType === "font"
      ? "font"
      : event.resourceType === "stylesheet" ||
          event.declaredFontStylesheet ||
          event.implicitFontStylesheet
        ? "stylesheet"
        : null;
}

function transportFailures(snapshot: ResourceSnapshot) {
  return [
    ...snapshot.failedRequests.map((observation) => ({
      type: "requestfailed" as const,
      observation,
    })),
    ...[...snapshot.imageResponses, ...snapshot.fontAndStylesheetResponses]
      .filter(({ status }) => status >= 400)
      .map((observation) => ({ type: "http-error" as const, observation })),
  ].filter(({ observation }) => resourceKind(observation) !== null);
}

/** Fast path costs only a pass over the retained transport snapshot. Readiness,
 * faces and image checks are independent and must still run in the caller.
 * On the failure path, take another snapshot after the scoped inventory so
 * failures arriving during inspection are classified conservatively as well.
 */
export async function collectResourceAttribution(
  observe: () => ResourceSnapshot,
  inspect: (
    kinds: ResourceKind[],
  ) => Promise<{ inventory: CaptureResourceInventory; frameId: number | null }>,
) {
  const before = observe();
  const kinds = [
    ...new Set(transportFailures(before).map(({ observation }) => resourceKind(observation)!)),
  ];
  if (!kinds.length) {
    return {
      resources: before,
      resourceAttribution: {
        inspection: {
          status: "skipped" as const,
          kinds,
          reason:
            "No image, font or stylesheet transport failures in this snapshot; dependency inspection is unnecessary",
        },
        frameId: null,
        inventory: null,
        decisions: [] as AttributionDecision[],
        unresolved: [] as AttributionDecision[],
      },
    };
  }
  const { inventory, frameId } = await inspect(kinds);
  const resources = observe();
  return {
    resources,
    resourceAttribution: {
      inspection: {
        status: "performed" as const,
        kinds,
        reason: "Historical transport failures require current dependency evidence",
      },
      ...attributeCaptureResources(
        resources,
        {
          ...inventory,
          inspectedKinds: inventory.inspectedKinds.filter((kind) => kinds.includes(kind)),
        },
        frameId,
      ),
    },
  };
}

/** Self-contained browser callback. Read the final document, not a template allowlist.
 * Unknown CSS/embedded content must prevent claims that a failed URL is unused.
 * CSS artwork has no DOM decode proof, so a 200 alone never resolves its failure.
 */
export async function inspectCaptureResources(
  root: HTMLElement,
  {
    kinds = ["image", "font", "stylesheet"],
    expectedFonts = [],
  }: {
    kinds?: ResourceKind[];
    expectedFonts?: ExpectedCanvasFont[];
  } = {},
): Promise<CaptureResourceInventory> {
  const document = root.ownerDocument;
  const view = document.defaultView!;
  const resources: CaptureResource[] = [];
  const inspectImages = kinds.includes("image");
  const inspectFonts = kinds.includes("font");
  const inspectStylesheets = inspectFonts || kinds.includes("stylesheet");
  const uncertainty: CaptureResourceInventory["uncertainty"] = {
    image: [],
    font: [],
    stylesheet: [],
  };
  const uncertain = (kind: ResourceKind, reason: string) => {
    if (!uncertainty[kind].includes(reason)) uncertainty[kind].push(reason);
  };
  const absolute = (url: string, base = document.baseURI) => {
    try {
      return new URL(url, base).href;
    } catch {
      return null;
    }
  };
  const urls = (value: string, kind: ResourceKind, base = document.baseURI) => {
    if (!/(?:url|image-set|image|var)\(/i.test(value)) return [];
    const found: string[] = [];
    const pattern = /url\(\s*(?:"([^"\\]*)"|'([^'\\]*)'|([^\s)'"\\]+))\s*\)/gi;
    for (const match of value.matchAll(pattern)) {
      const url = absolute(match[1] ?? match[2] ?? match[3], base);
      if (url) found.push(url);
      else uncertain(kind, `Unresolved URL: ${match[0]}`);
    }
    // Escapes, string-form image-set and other unsupported resource expressions
    // cannot justify removing an otherwise unexplained transport failure.
    if (/url\(/i.test(value.replace(pattern, "")) || /(?:image-set|image|var)\(/i.test(value))
      uncertain(kind, `Unresolved CSS resource expression: ${value}`);
    return found;
  };
  const family = (value: string) =>
    value
      .replace(/^(['"])(.*)\1$/, "$2")
      .trim()
      .toLowerCase();
  const usedFamilies = new Set<string>();
  const elements =
    inspectImages || inspectFonts ? [root, ...Array.from(root.querySelectorAll("*"))] : [];
  const styleElements = [...elements];
  if (elements.length)
    for (let parent = root.parentElement; parent; parent = parent.parentElement)
      styleElements.push(parent);
  for (const element of styleElements) {
    const elementCss = view.getComputedStyle(element);
    const pseudos = [null, "::before", "::after"];
    if (!element.closest("script,style,noscript,template") && element.textContent?.trim())
      pseudos.push("::first-line", "::first-letter");
    if (elementCss.display === "list-item") pseudos.push("::marker");
    for (const pseudo of pseudos) {
      const css = pseudo ? view.getComputedStyle(element, pseudo) : elementCss;
      if (
        ["::before", "::after"].includes(pseudo ?? "") &&
        ["none", "normal", ""].includes(css.content)
      )
        continue;
      // Scan every computed property, including masks, borders, generated
      // content and cursors, instead of assuming all artwork is an <img>.
      for (let i = 0; inspectImages && i < css.length; i++) {
        const property = css.item(i);
        for (const url of urls(css.getPropertyValue(property), "image"))
          resources.push({
            kind: "image",
            url,
            source: `${pseudo ?? "element"} ${property}`,
            required: true,
            ready: false,
          });
      }
      if (
        inspectFonts &&
        !element.closest("script,style,noscript,template") &&
        (["::before", "::after"].includes(pseudo ?? "") ||
          Array.from(element.childNodes).some(
            (node) => node.nodeType === 3 && node.textContent?.trim(),
          ))
      ) {
        if (css.fontFamily.includes("\\")) uncertain("font", "Escaped computed font family");
        for (const name of css.fontFamily.match(/(?:[^,"']|"[^"]*"|'[^']*')+/g) ?? [])
          usedFamilies.add(family(name.trim()));
      }
    }
  }
  if (
    root.querySelector("canvas,object,embed,iframe") ||
    elements.some((element) => element.shadowRoot)
  ) {
    uncertain("image", "Embedded artwork cannot be attributed from this document");
    uncertain("font", "Embedded text cannot be attributed from this document");
  }
  if (inspectImages) {
    for (const element of root.querySelectorAll(
      "svg use,svg image,video[poster],input[type=image]",
    )) {
      const value =
        element.getAttribute("href") ??
        element.getAttribute("xlink:href") ??
        element.getAttribute("poster") ??
        element.getAttribute("src");
      const url = value && absolute(value);
      if (url)
        resources.push({
          kind: "image",
          url,
          source: element.tagName,
          required: true,
          ready: false,
        });
      if (element.tagName.toLowerCase() === "use" && value && !value.startsWith("#"))
        uncertain("image", "External SVG dependencies are not inspectable");
    }
    await Promise.all(
      Array.from(root.querySelectorAll("img"), async (image) => {
        const url = image.currentSrc || image.src;
        if (!url) {
          if (image.hasAttribute("src") || image.hasAttribute("srcset"))
            uncertain("image", "Image has no resolved current source");
          return;
        }
        if (image.hasAttribute("srcset") && !image.currentSrc)
          uncertain("image", "Responsive image selection is unresolved");
        let ready = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([
            image.decode(),
            new Promise<never>((_resolve, reject) => {
              timer = setTimeout(() => reject(new Error("decode pending")), 1000);
            }),
          ]);
          ready =
            image.complete && image.naturalWidth > 0 && (image.currentSrc || image.src) === url;
        } catch {
          // Failed/pending decode stays a required unresolved resource.
        } finally {
          clearTimeout(timer);
        }
        resources.push({ kind: "image", url, source: "img currentSrc", required: true, ready });
      }),
    );
  }

  if (inspectStylesheets) {
    const faces = Array.from(document.fonts ?? []);
    const faceKey = (name: string, weight: string, style: string) =>
      [family(name), weight || "normal", style || "normal"].join("|");
    const knownFaces = new Set<string>();
    const visited = new Set<CSSStyleSheet>();
    const readSheet = (sheet: CSSStyleSheet | null, href?: string) => {
      const url = (href || sheet?.href) && absolute(href || sheet!.href!);
      const dependency: CaptureResource | null = url
        ? { kind: "stylesheet", url, source: "current stylesheet", required: true, ready: false }
        : null;
      if (dependency) resources.push(dependency);
      if (sheet && visited.has(sheet)) return;
      if (sheet) visited.add(sheet);
      try {
        if (!sheet) throw new Error("Stylesheet has no CSSOM");
        const readRules = (rules: CSSRuleList) => {
          for (const rule of Array.from(rules)) {
            if (rule.type === 3) {
              const imported = rule as CSSImportRule;
              readSheet(imported.styleSheet, imported.href);
            } else if (rule.type === 5) {
              const css = (rule as CSSFontFaceRule).style;
              const name = css.getPropertyValue("font-family");
              const weight = css.getPropertyValue("font-weight") || "normal";
              const style = css.getPropertyValue("font-style") || "normal";
              const key = faceKey(name, weight, style);
              knownFaces.add(key);
              const matching = faces.filter(
                (face) => faceKey(face.family, face.weight, face.style) === key,
              );
              for (const source of urls(
                css.getPropertyValue("src"),
                "font",
                sheet.href || document.baseURI,
              ))
                resources.push({
                  kind: "font",
                  url: source,
                  source: `${name} ${weight} ${style}`,
                  // A loading/loaded/error face may be used by generated text or
                  // a font-changing pseudo-element not represented by text nodes.
                  required:
                    usedFamilies.has(family(name)) ||
                    matching.some(({ status }) => status !== "unloaded"),
                  ready: matching.length > 0 && matching.every(({ status }) => status === "loaded"),
                });
            } else if ("cssRules" in rule) readRules((rule as CSSGroupingRule).cssRules);
          }
        };
        readRules(sheet.cssRules);
        if (dependency) dependency.ready = true;
      } catch {
        uncertain("font", `Unreadable stylesheet: ${url || "inline"}`);
        uncertain("stylesheet", `Unreadable stylesheet: ${url || "inline"}`);
      }
    };
    for (const sheet of [
      ...Array.from(document.styleSheets),
      ...Array.from(document.adoptedStyleSheets ?? []),
    ])
      readSheet(sheet);
    for (const link of document.querySelectorAll<HTMLLinkElement>('link[rel~="stylesheet"]'))
      if (!link.sheet) readSheet(null, link.href);
    if (faces.some((face) => !knownFaces.has(faceKey(face.family, face.weight, face.style))))
      uncertain("font", "FontFaceSet contains faces without inspectable CSS sources");
    for (const font of expectedFonts) {
      const matching = faces.filter((face) => family(face.family) === family(font.alias));
      resources.push({
        kind: "stylesheet",
        url: font.stylesheetUrl,
        source: `declared canvas import ${font.alias}`,
        required: true,
        ready: matching.length > 0 && matching.every(({ status }) => status === "loaded"),
      });
    }
  }

  return { inspectedKinds: [...kinds], resources, uncertainty };
}

/** Raw observations stay untouched. Only this separately recorded attribution
 * determines whether historical transport failures affect the current capture.
 */
export function attributeCaptureResources(
  snapshot: ResourceSnapshot,
  inventory: CaptureResourceInventory,
  frameId: number | null,
) {
  const responses = [...snapshot.imageResponses, ...snapshot.fontAndStylesheetResponses];
  const failures = transportFailures(snapshot);
  const decisions = failures.flatMap<AttributionDecision>(({ type, observation }) => {
    const kind = resourceKind(observation)!;
    const eventUrls = observation.requestUrls ?? [observation.url];
    const matching = inventory.resources.filter(
      (resource) => resource.kind === kind && eventUrls.includes(resource.url),
    );
    const required = matching.filter(({ required }) => required);
    const uncertainty = inventory.inspectedKinds.includes(kind)
      ? inventory.uncertainty[kind]
      : [
          ...inventory.uncertainty[kind],
          "This resource kind was not inspected for the captured snapshot",
        ];
    const proof = { requirements: matching, uncertainty };
    const base = { type, kind, observation, proof };
    if (!inventory.inspectedKinds.includes(kind))
      return [
        {
          ...base,
          disposition: "ambiguous",
          reason: "This resource kind was not inspected for the captured snapshot",
        },
      ];
    if (!required.length && !uncertainty.length && kind !== "stylesheet")
      return [
        {
          ...base,
          disposition: "unused" as const,
          reason: "No dependency in the complete current resource inventory",
        },
      ];
    if (!required.length)
      return [
        {
          ...base,
          disposition: "ambiguous" as const,
          reason:
            kind === "stylesheet"
              ? "Absent stylesheet may have supplied injected CSS; provenance is unresolved"
              : "Incomplete dependency ownership cannot establish absence",
        },
      ];
    const success = responses.find((response) => {
      const later =
        response.sequence !== undefined && observation.sequence !== undefined
          ? response.sequence > observation.sequence
          : response.elapsedMs > observation.elapsedMs;
      return (
        resourceKind(response) === kind &&
        response.ok &&
        later &&
        (response.requestUrls ?? [response.url]).some((url) => eventUrls.includes(url)) &&
        // Parent-mediated stylesheet fetches may feed the canvas. Never discard
        // them as unrelated, or use a different frame's image/font as recovery.
        (kind === "stylesheet" || (frameId !== null && response.frameId === frameId))
      );
    });
    if (required.every(({ ready }) => ready) && success && !uncertainty.length)
      return [
        {
          ...base,
          disposition: "resolved" as const,
          reason: "Later successful transport and final ready dependencies",
          success,
        },
      ];
    return [
      {
        ...base,
        disposition: "unresolved" as const,
        reason: "Required resource lacks conclusive current recovery",
      },
    ];
  });
  return {
    frameId,
    inventory,
    decisions,
    unresolved: decisions.filter(
      ({ disposition }) => disposition === "unresolved" || disposition === "ambiguous",
    ),
  };
}
