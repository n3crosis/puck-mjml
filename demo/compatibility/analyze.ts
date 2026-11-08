import { load } from "cheerio";
import postcss from "postcss";
import snapshot from "./caniemail-data.json";

export type Support = "unsupported" | "partial" | "unknown" | "supported";
export type RecordedTest = { version: string; code: string };
export type Feature = {
  slug: string;
  title: string;
  description: string;
  lastTestDate: string;
  notes: string;
  notesByNumber: Partial<Record<string, string>>;
  stats: Partial<Record<string, RecordedTest>>;
};
export const compatibilityData = snapshot as {
  repository: string;
  revision: string;
  license: string;
  clients: { id: string; label: string }[];
  features: Feature[];
};
const featureIds = new Set(compatibilityData.features.map((feature) => feature.slug));
export const supportLabel: Record<Support, string> = {
  unsupported: "Not supported",
  partial: "Partial support",
  unknown: "Unknown",
  supported: "Supported",
};
export function supportFor(code?: string): Support {
  switch (code?.trim().split(/\s+/)[0]) {
    case "y":
      return "supported";
    case "a":
      return "partial";
    case "n":
      return "unsupported";
    default:
      return "unknown";
  }
}
export function supportNotes(feature: Feature, code: string): string[] {
  return [...new Set(code.match(/#\d+/g) ?? [])].map(
    (reference) => feature.notesByNumber[reference.slice(1)] ?? `See upstream note ${reference}.`,
  );
}
export function clientResults(feature: Feature, clientId: string) {
  const clients = compatibilityData.clients.filter((client) => !clientId || client.id === clientId);
  return clients.map((client) => ({
    ...client,
    test: feature.stats[client.id],
    support: supportFor(feature.stats[client.id]?.code),
  }));
}
export function needsReview(feature: Feature, clientId: string): boolean {
  return (
    Boolean(feature.notes) ||
    clientResults(feature, clientId).some(
      ({ support, test }) => support !== "supported" || /#|\bx\b/.test(test?.code ?? ""),
    )
  );
}
export function featureUrl(slug: string) {
  return `https://www.caniemail.com/features/${slug}/`;
}

export type Detection = { slug: string; evidence: string[]; occurrences: number };
export type CompatibilityAnalysis = {
  detected: Detection[];
  cssParseErrors: number;
  externalStylesheets: number;
  hasOutlookFallback: boolean;
};

/** Static inspection only. Never render HTML or fetch styles, fonts, images or URLs. */
export function analyzeEmailHtml(html: string): CompatibilityAnalysis {
  const found = new Map<string, Detection>();
  const add = (slug: string, evidence: string) => {
    if (!featureIds.has(slug)) return;
    const entry = found.get(slug) ?? { slug, evidence: [], occurrences: 0 };
    entry.occurrences += 1;
    const bounded = evidence.replace(/\s+/g, " ").slice(0, 160);
    if (entry.evidence.length < 3 && !entry.evidence.includes(bounded))
      entry.evidence.push(bounded);
    found.set(slug, entry);
  };
  let cssParseErrors = 0;
  let externalStylesheets = 0;
  const image = (source: string, location: string) => {
    if (/^data:image\//i.test(source)) add("image-base64", `${location}: embedded image`);
    else {
      const extension = /\.([a-z]+)(?:[?#]|$)/i.exec(source)?.[1]?.toLowerCase();
      if (extension) add(`image-${extension}`, `${location}: .${extension} image`);
    }
  };
  const inspectCss = (css: string, location: string) => {
    try {
      const tree = postcss.parse(css, { from: undefined });
      tree.walkAtRules((rule) => {
        const name = rule.name.toLowerCase();
        add(`css-at-${name}`, `${location}: @${name} ${rule.params}`);
        if (name === "media" && /prefers-color-scheme\s*:/i.test(rule.params)) {
          add("css-at-media-prefers-color-scheme", `${location}: @media ${rule.params}`);
        }
      });
      tree.walkRules((rule) => {
        if (/:hover\b/i.test(rule.selector))
          add("css-pseudo-class-hover", `${location}: ${rule.selector}`);
      });
      tree.walkDecls((declaration) => {
        const prop = declaration.prop.toLowerCase();
        const value = declaration.value.toLowerCase();
        // Do not flag absent decorative effects just because MJML emits resets.
        if (
          /^(?:none|initial|unset|inherit)$/.test(value) &&
          /^(?:background-image|box-shadow|text-shadow|transform|float)$/.test(prop)
        )
          return;
        if (prop === "border-radius" && /^(?:0(?:px|%)?\s*)+$/.test(value)) return;
        const evidence = `${location}: ${prop}: ${declaration.value}`;
        add(`css-${prop}`, evidence);
        if (/^(margin|padding)(?:-(?:top|right|bottom|left))$/.test(prop)) {
          add(`css-${prop.split("-")[0]}`, evidence);
        }
        if (/^border-(?:top|bottom)-(?:left|right)-radius$/.test(prop))
          add("css-border-radius", evidence);
        if (/^grid-template(?:-|$)/.test(prop)) add("css-grid-template", evidence);
        if (prop === "row-gap" || prop === "column-gap") add("css-gap", evidence);
        if (prop.startsWith("--") || /\bvar\s*\(/.test(value)) add("css-variables", evidence);
        if (prop === "display") {
          if (/^(?:inline-)?flex$/.test(value)) add("css-display-flex", evidence);
          if (/^(?:inline-)?grid$/.test(value)) add("css-display-grid", evidence);
          if (value === "none") add("css-display-none", evidence);
        }
        if (/\b(?:repeating-)?linear-gradient\s*\(/.test(value))
          add("css-linear-gradient", evidence);
        if (/\bcalc\s*\(/.test(value)) add("css-unit-calc", evidence);
        for (const unit of ["rem", "vh", "vw"]) {
          if (new RegExp(`(?:\\d|\\.)${unit}\\b`).test(value)) add(`css-unit-${unit}`, evidence);
        }
        if (prop === "background" && /\burl\s*\(/.test(value))
          add("css-background-image", evidence);
        // Only inspect CSS image declarations, not arbitrary string content.
        if (/^(?:background(?:-image)?|list-style-image|content)$/.test(prop)) {
          for (const match of declaration.value.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi))
            image(match[1]!.trim(), `${location}: ${prop}`);
        }
      });
    } catch {
      cssParseErrors += 1;
    }
  };
  const $ = load(html);
  $("style").each((index, element) => {
    add("html-style", `<style> block ${index + 1}`);
    inspectCss($(element).text(), `<style> ${index + 1}`);
  });
  $("*").each((_, element) => {
    if (!("tagName" in element)) return;
    const tag = element.tagName;
    const attrs = element.attribs;
    // Describe the element, never expose the whole message, URLs or data images.
    const location = `<${tag}>`;
    if (attrs.style) inspectCss(`x{${attrs.style}}`, location);
    if (["form", "svg", "video"].includes(tag)) add(`html-${tag}`, location);
    if (attrs.background) {
      add("html-background", location);
      image(attrs.background, location);
    }
    if (attrs.srcset) add("html-srcset", location);
    if (tag === "a" && /^#.+/.test(attrs.href ?? ""))
      add("html-anchor-links", "<a> in-email anchor link");
    if (tag === "img" && attrs.src) image(attrs.src, location);
    if (tag === "link" && /(?:^|\s)stylesheet(?:\s|$)/i.test(attrs.rel ?? "")) {
      add("html-link", '<link rel="stylesheet">');
      externalStylesheets += 1;
    }
  });
  return {
    detected: [...found.values()],
    cssParseErrors,
    externalStylesheets,
    hasOutlookFallback: /<!--\s*\[if[^\]\r\n]{0,128}\bmso\b|<v:(?:rect|roundrect|fill)\b/i.test(
      html,
    ),
  };
}
