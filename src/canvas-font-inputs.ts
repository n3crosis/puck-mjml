export interface CanvasFontInputs {
  scope: string;
  families: string[];
  fingerprint: string;
  inputsCurrent: boolean;
  status: string | null;
  css: string;
  errors: string | null;
  missingAliases: string[];
}

/**
 * Self-contained so the same function can run in a browser locator.evaluate.
 * A fingerprint is the sorted set of this canvas's current inline font stacks.
 * It excludes nested canvases and unrelated host content, and distinguishes an
 * unobserved DOM commit from a fully observed empty set. CSS/font evidence is
 * optional to keep the runtime observer's ordinary scans inexpensive.
 */
export function inspectCanvasFontInputs(element: Element, includeCss = false): CanvasFontInputs[] {
  const enclosing = element.closest<HTMLElement>(".pm-canvas");
  const canvases = enclosing
    ? [enclosing]
    : Array.from(element.querySelectorAll<HTMLElement>(".pm-canvas"));
  return canvases.map((canvas) => {
    const scope = Array.from(canvas.classList).find((name) => name.startsWith("pm-canvas-")) ?? "";
    const families = [
      ...new Set(
        [canvas, ...canvas.querySelectorAll<HTMLElement>("[style]")]
          .filter((node) => node.closest(".pm-canvas") === canvas)
          .map((node) => node.style.fontFamily)
          .filter(Boolean),
      ),
    ].sort();
    const fingerprint = JSON.stringify(families);
    const normalize = (name: string) =>
      name
        .replace(/^(['"])(.*)\1$/, "$2")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
    const registered = includeCss
      ? new Set(Array.from(canvas.ownerDocument.fonts ?? [], ({ family }) => normalize(family)))
      : new Set<string>();
    const imported = includeCss
      ? (JSON.parse(canvas.getAttribute("data-pm-canvas-font-families") ?? "[]") as string[])
      : [];
    return {
      scope,
      families,
      fingerprint,
      inputsCurrent: canvas.getAttribute("data-pm-canvas-font-inputs") === fingerprint,
      status: canvas.getAttribute("data-pm-canvas-font-status"),
      css: includeCss
        ? (canvas.querySelector(`style[data-pm-canvas-fonts="${scope}"]`)?.textContent ?? "")
        : "",
      errors: includeCss ? canvas.getAttribute("data-pm-canvas-font-errors") : null,
      missingAliases: imported.filter((family) => !registered.has(normalize(family))),
    };
  });
}
