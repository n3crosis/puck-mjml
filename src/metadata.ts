/** Keep document metadata safe for both HTML attributes and the canvas. */
export function normalizeEmailLanguage(value: unknown): string {
  if (typeof value !== "string") return "und";
  const language = value.trim();
  return language.length <= 100 && /^[a-zA-Z]{1,8}(?:-[a-zA-Z0-9]{1,8})*$/.test(language)
    ? language
    : "und";
}

export function normalizeEmailDirection(value: unknown): "auto" | "ltr" | "rtl" {
  return value === "ltr" || value === "rtl" ? value : "auto";
}

export function normalizeOutlookWeb(value: unknown): "none" | "desktop" {
  return value === "desktop" ? "desktop" : "none";
}
