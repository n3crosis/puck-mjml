import type { Field } from "@puckeditor/core";
import { Link } from "@tiptap/extension-link";

/**
 * Email sources also use anchors as styled labels without a destination. Keep
 * those labels in the existing link mark, so adding/removing a real destination
 * uses the normal controls and never creates nested anchors.
 */
export const EmailLink = Link.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      // Adjacent labels may have different nth-of-type styles. Preserve their
      // boundaries in the editor schema, without adding attributes to email HTML.
      anchorBoundary: { default: null, rendered: false },
    };
  },
  parseHTML() {
    let boundary = 0;
    return [
      ...(this.parent?.() ?? []),
      { tag: "a:not([href])", getAttrs: () => ({ anchorBoundary: ++boundary }) },
    ];
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
  options: { link: false },
  tiptap: { extensions: [EmailLink] },
} satisfies Pick<RichTextField, "options" | "tiptap">;
