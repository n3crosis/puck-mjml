import type { EmailBlock, EmailDocument, EmailSettings } from "../types";

/** Static assets mirrored from the React Email demo deployment. */
export const ASSETS = "https://demo.react.email/static";

export const block = (
  type: string,
  id: string,
  props: Record<string, unknown> = {},
): EmailBlock => ({ type, props: { id, ...props } });

/** Wrap plain sentences in a paragraph; pass through HTML fragments such as lists. */
export const text = (id: string, content: string, props: Record<string, unknown> = {}) =>
  block("Text", id, {
    content: /^\s*</.test(content) ? content : `<p>${content}</p>`,
    ...props,
  });

export const image = (id: string, src: string, props: Record<string, unknown> = {}) =>
  block("Image", id, {
    src: /^https?:\/\//.test(src) ? src : `${ASSETS}/${src.replace(/^\//, "")}`,
    alt: "",
    width: 600,
    align: "center",
    padding: "0px",
    ...props,
  });

export const button = (id: string, label: string, props: Record<string, unknown> = {}) =>
  block("Button", id, { label, href: "https://example.com/", ...props });

export const section = (id: string, padding: string, column: EmailBlock[], props = {}) =>
  block("Section1", id, {
    backgroundColor: "#ffffff",
    padding,
    border: "",
    borderRadius: "0px",
    cssClass: "",
    column,
    ...props,
  });

export const columns = (id: string, cols: EmailBlock[], props = {}) =>
  block("Section", id, { backgroundColor: "#ffffff", padding: "0px", columns: cols, ...props });

export const column = (id: string, width: number, content: EmailBlock[], props = {}) =>
  block("Column", id, { width, padding: "0px", verticalAlign: "top", content, ...props });

export const group = (id: string, cols: EmailBlock[], props = {}) =>
  block("Group", id, { width: 100, columns: cols, ...props });

export const wrapper = (id: string, sections: EmailBlock[], props = {}) =>
  block("Wrapper", id, { backgroundColor: "#ffffff", padding: "0px", sections, ...props });

export const spacer = (id: string, height: number, props = {}) =>
  block("Spacer", id, { height, ...props });

export const divider = (id: string, props = {}) =>
  block("Divider", id, { color: "#d1d5db", width: 100, thickness: 1, padding: "0px", ...props });

const SOCIAL_ICON_FILES: Record<string, string> = {
  x: "x",
  linkedin: "in",
  youtube: "yt",
  github: "gh",
};

/** Footer social icon row matching the shared react-email demo artwork. */
export const socialRow = (
  id: string,
  href: string,
  networks: string[],
  props: Record<string, unknown> = {},
) =>
  block("Social", id, {
    align: "left",
    padding: "32px 0px 0px",
    iconSize: 20,
    iconPadding: "0px",
    borderRadius: "0px",
    links: networks.map((name, index) => ({
      name,
      href,
      label: "",
      src: `${ASSETS}/shared/social-${SOCIAL_ICON_FILES[name] ?? name}-black.png`,
      alt: name[0].toUpperCase() + name.slice(1),
      backgroundColor: "transparent",
      padding: index === networks.length - 1 ? "0px" : "0px 32px 0px 0px",
    })),
    ...props,
  });

/** Build a complete document, filling editor-required settings with defaults. */
export const email = (settings: Partial<EmailSettings>): EmailDocument => ({
  root: {
    props: {
      subject: "",
      previewText: "",
      lang: "en",
      dir: "ltr",
      owa: "none",
      width: 600,
      backgroundColor: "#f5f5f5",
      fontFamily: "Arial, Helvetica, sans-serif",
      breakpoint: 480,
      fontImports: [],
      headStyles: [],
      htmlAttributes: [],
      rawHead: "",
      rawFileStart: "",
      bodyAttributes: [],
      bodyMjClass: "",
      attributeDefaults: [],
      componentDefaults: [],
      mjmlClasses: [],
      ...settings,
      sections: settings.sections ?? [],
    },
  },
  content: [],
});
