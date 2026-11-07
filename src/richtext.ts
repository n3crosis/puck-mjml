import sanitizeHtml from "sanitize-html";

const alignedTags = ["p", "h1", "h2", "h3", "h4", "h5", "h6"];

export function safeRichTextUrl(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    Array.from(value).some(
      (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    )
  ) {
    return "";
  }
  try {
    const url = new URL(value.trim());
    if (
      !["http:", "https:", "mailto:", "tel:"].includes(url.protocol) ||
      url.username ||
      url.password
    ) {
      return "";
    }
    if ((url.protocol === "http:" || url.protocol === "https:") && !url.hostname) return "";
    if ((url.protocol === "mailto:" || url.protocol === "tel:") && !url.pathname) return "";
    return url.href;
  } catch {
    return "";
  }
}

/** Preserve Puck's built-in rich text while removing active HTML and unrelated styles. */
function richTextOptions(): sanitizeHtml.IOptions {
  return {
    allowedTags: [
      ...alignedTags,
      "br",
      "strong",
      "b",
      "em",
      "i",
      "u",
      "s",
      "a",
      "ul",
      "ol",
      "li",
      "blockquote",
      "code",
      "pre",
      "hr",
    ],
    allowedAttributes: {
      ...Object.fromEntries(alignedTags.map((tag) => [tag, ["style"]])),
      a: ["href", "target", "rel", "title"],
      ol: ["start", "type"],
      code: ["class"],
    },
    allowedClasses: { code: [/^language-[a-zA-Z0-9_-]+$/] },
    allowedStyles: Object.fromEntries(
      alignedTags.map((tag) => [tag, { "text-align": [/^(?:left|center|right|justify)$/] }]),
    ),
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowProtocolRelative: false,
    transformTags: {
      a: (_tag, attrs) => {
        const href = safeRichTextUrl(attrs.href);
        const attribs: Record<string, string> = {};
        if (href) {
          attribs.href = href;
          if (attrs.target === "_blank") {
            attribs.target = "_blank";
            attribs.rel = "noopener noreferrer";
          }
          if (attrs.title) attribs.title = attrs.title;
        }
        return { tagName: "a", attribs };
      },
      ol: (_tag, attrs) => {
        const attribs: Record<string, string> = {};
        if (/^-?\d+$/.test(attrs.start ?? "") && Number.isSafeInteger(Number(attrs.start))) {
          attribs.start = String(Number(attrs.start));
        }
        if (/^[1aAiI]$/.test(attrs.type ?? "")) attribs.type = attrs.type;
        return { tagName: "ol", attribs };
      },
    },
  };
}

export function sanitizeEmailRichText(value: unknown): string {
  return sanitizeHtml(typeof value === "string" ? value : "", richTextOptions());
}

/** Safe native table structure uses the same inline-content rules as rich text. */
export function sanitizeEmailTableContent(value: unknown): string {
  const options = richTextOptions();
  const cellStyles = {
    "text-align": [/^(?:left|center|right|justify)$/],
    "vertical-align": [/^(?:top|middle|bottom)$/],
    width: [/^(?:auto|\d+(?:\.\d+)?(?:px|%))$/],
    padding: [/^(?:0|\d+(?:\.\d+)?(?:px|%)(?:\s+\d+(?:\.\d+)?(?:px|%)){0,3})$/],
    "background-color": [/^#(?:[\da-f]{3}|[\da-f]{6})$/i],
    color: [/^#(?:[\da-f]{3}|[\da-f]{6})$/i],
    border: [
      /^(?:none|0|0px|\d+(?:\.\d+)?px\s+(?:solid|dashed|dotted|double|groove|ridge|inset|outset)\s+(?:#[\da-f]{3}(?:[\da-f]{3})?|transparent))$/i,
    ],
  };
  return sanitizeHtml(typeof value === "string" ? value : "", {
    ...options,
    allowedTags: [
      ...(options.allowedTags as string[]),
      "caption",
      "thead",
      "tbody",
      "tfoot",
      "tr",
      "th",
      "td",
    ],
    allowedAttributes: {
      ...options.allowedAttributes,
      th: ["scope", "colspan", "rowspan", "style"],
      td: ["scope", "colspan", "rowspan", "style"],
    },
    allowedStyles: { ...options.allowedStyles, th: cellStyles, td: cellStyles },
  });
}
