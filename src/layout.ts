export function normalizeEmailBreakpoint(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(200, Math.min(1000, value))
    : 480;
}

export function normalizeEmailWidth(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(320, Math.min(1000, value))
    : 600;
}
