import type { Field } from "@puckeditor/core";
import { Bold } from "@tiptap/extension-bold";
import { Link } from "@tiptap/extension-link";

/**
 * Browsers render an unstyled strong as `bolder`, which only reaches 400 inside
 * light (300) copy. New bold commands need an actual bold weight in the canvas
 * and exported email. Parsed source marks keep their original relative weight.
 */
export const EmailBold = Bold.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      explicitWeight: {
        default: true,
        parseHTML: (element) => /^(bold|700)$/.test(element.style.fontWeight),
        renderHTML: (attributes) =>
          attributes.explicitWeight ? { style: "font-weight: bold" } : {},
      },
    };
  },
});

/**
 * Email sources also use anchors as styled labels without a destination. Keep
 * those labels in the existing link mark, so adding/removing a real destination
 * uses the normal controls and never creates nested anchors.
 */
export const EmailLink = Link.extend({
  addAttributes() {
    let boundary = 0;
    return {
      ...this.parent?.(),
      // Equal destinations do not make authored anchor boxes interchangeable:
      // margins and nth-of-type styles still depend on their boundaries. Keep
      // each parsed anchor distinct, without emitting bookkeeping into HTML.
      anchorBoundary: {
        default: null,
        rendered: false,
        parseHTML: () => ++boundary,
      },
    };
  },
  parseHTML() {
    return [...(this.parent?.() ?? []), { tag: "a:not([href])" }];
  },
  renderHTML(props) {
    // No href, target, role or tabindex: this remains a non-navigating label.
    if (!props.HTMLAttributes.href) return ["a", {}, 0];
    // Retain Link's URI checks and normal rendering for actual destinations.
    return this.parent!(props);
  },
});

type RichTextField = Extract<Field, { type: "richtext" }>;

export const emailRichTextConfig = {
  options: { bold: false, link: false },
  tiptap: { extensions: [EmailBold, EmailLink] },
} satisfies Pick<RichTextField, "options" | "tiptap">;
