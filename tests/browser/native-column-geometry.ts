export type Bounds = { x: number; y: number; width: number; height: number };
const dimensions = ["x", "y", "width", "height"] as const;
export const tolerance = 1 / 64;
type Geometry = { bounds: Record<string, Bounds[]>; probeCounts: Record<string, number> };

export function compareGeometry(
  actual: Geometry,
  expected: Geometry,
  required: readonly string[] = [],
): string[] {
  const failures: string[] = [];
  // Bounds are keyed by class, so missing probes on both sides or duplicate
  // classes can otherwise disappear from the geometric comparison entirely.
  for (const [label, snapshot] of [
    ["canvas", actual],
    ["compiled", expected],
  ] as const)
    for (const name of required) {
      if (snapshot.probeCounts[name] !== 1)
        failures.push(
          `${label} ${name}: expected one probe, found ${snapshot.probeCounts[name] ?? 0}`,
        );
      if (name.endsWith("-copy") && !snapshot.bounds[`${name}:text`]?.length)
        failures.push(`${label} ${name}: no visible text lines`);
    }
  const names = new Set([...Object.keys(actual.bounds), ...Object.keys(expected.bounds)]);
  for (const name of names) {
    const a = actual.bounds[name],
      b = expected.bounds[name];
    if (!a || !b) {
      failures.push(`${name}: missing ${a ? "compiled" : "canvas"} probe`);
      continue;
    }
    if (a.length !== b.length)
      failures.push(`${name}: count canvas=${a.length}, compiled=${b.length}`);
    for (let index = 0; index < Math.min(a.length, b.length); index++)
      for (const dimension of dimensions) {
        const delta = Math.abs(a[index][dimension] - b[index][dimension]);
        if (!Number.isFinite(delta) || delta > tolerance)
          failures.push(
            `${name}[${index}].${dimension}: canvas=${a[index][dimension]}, compiled=${b[index][dimension]}, delta=${delta}`,
          );
      }
  }
  return failures;
}
