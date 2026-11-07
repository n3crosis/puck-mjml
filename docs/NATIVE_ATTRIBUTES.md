# Native MJML attributes

See the [editor guide](EDITOR_GUIDE.md) for general usage and the [compatibility matrix](MJML_COMPATIBILITY.md) for component coverage and canvas limitations.

Every visual block exposes **MJML classes** and **Element attributes**. Attribute-name dropdowns come from the installed MJML 5.4 compiler's catalog, including attributes without dedicated visual controls. Choices are grouped by content/links, layout/spacing, typography, appearance, component options, and identifiers. The same controls are available on social/navigation links, carousel images, accordion elements and their title/text nodes, and the implicit columns in fixed sections.

The catalog is generated from the installed compiler with `bun run catalog` and pinned to [MJML source commit `1c434fc`](https://github.com/mjmlio/mjml/tree/1c434fcbfd042ddfcb9fa4e0496f7eedf1d90bc7/packages). It records 31 compiler components and 394 declared attributes, plus the global `mj-class` and `css-class` attributes. Head components continue to use the document settings described below and in the compatibility matrix.

Native attributes and classes are applied in the compiled preview and exports. The editing canvas uses the same attribute defaults, class inheritance, and visual-field normalization for typography, spacing, borders, backgrounds, dimensions, fixed/flexible columns, full-width viewport layout, scoped custom CSS, web fonts, and nested social/navigation/accordion/carousel content. Inline text editing remains available. Email-client fallbacks such as Outlook/VML output still require the compiled MJML preview for an accurate result.

## Element attributes

Each block's `props` accepts `mjClass` and `mjmlAttributes`:

In the sidebar's **Advanced** section, each entry uses a compact property/value row. The row menu contains inheritance, template mode (when the host enables trusted HTML), move up/down, and removal. Entries can also be dragged to reorder; their order determines precedence for duplicate names. Inherited entries show **Inherited** in place of the value while retaining the saved value and template setting for switching back. This applies to block attributes, nested element attributes, and document defaults/classes.

Attributes with a fixed set of values use a dropdown from the installed compiler's catalog, including boolean attributes stored as `"true"`/`"false"` strings. Units, colors, free-form strings, and template expressions stay editable as text. Changing an attribute or component never silently replaces its current value: blank or unsupported values remain visible until changed. Global/class defaults use combined choices only when all applicable component descriptors have finite choices.

Catalog-declared color values also have a color-picker swatch. The adjacent text input retains values such as named colors, `transparent`, and `rgba(...)`; opening the editor does not normalize the saved value. Picking a color writes the chosen hex value. Inherited and template entries keep their respective modes without a picker, and border shorthands remain plain text.

```ts
{
  type: "Text",
  props: {
    id: "announcement",
    content: "<p>Product news</p>",
    mjClass: "brand heading",
    mjmlAttributes: [
      { name: "font-size", value: "84px" },
      { name: "line-height", value: "120%" },
      { name: "letter-spacing", value: "-0.05em" },
      { name: "color", inherit: true },
    ],
  },
}
```

Native entries override attributes generated from the visual controls. `inherit: true` omits a local attribute, allowing MJML defaults or classes to supply it. Use this for properties such as color and font size that otherwise have local visual defaults. The original visual field value stays in the document and is restored when its native override is removed.

An explicit empty `value` is preserved where MJML accepts it. An absent `mjClass` inherits the ancestor's class context; an explicitly empty `mjClass: ""` resets that context. Newly inserted blocks leave `mjClass` absent.

Attributes use native units and ranges rather than visual-control limits. Ordinary values are validated against the catalog and URL/CSS safety rules. Safe relative clickable links are supported, including `mj-navbar`'s `base-url`; asset URLs remain absolute HTTP(S). Arbitrary event attributes and active URL/CSS content are rejected. Trusted template values use the explicit mode below.

## Template attribute values

With the host's `allowRawHtml: true` opt-in, set `template: true` on a native attribute entry to preserve its original value instead of validating it as a concrete URL, color, size, or other native value. The **Template value** checkbox is available in the row's options menu when the host enables this option and the entry does not inherit.

```ts
import { toMjml, type EmailDocument } from "puck-mjml";

const document: EmailDocument = {
  root: {
    props: {
      sections: [
        {
          type: "Section1",
          props: {
            column: [
              {
                type: "Button",
                props: {
                  label: "View your order",
                  href: "https://example.com/orders", // Concrete editing-canvas fallback.
                  mjmlAttributes: [
                    { name: "href", value: "{{ customer.order_url }}", template: true },
                  ],
                },
              },
            ],
          },
        },
      ],
    },
  },
  content: [],
};

const source = toMjml(document, { allowRawHtml: true });
// The MJML contains href="{{ customer.order_url }}".
```

The same entry shape works in global and component defaults, MJML class definitions, body attributes, implicit columns, and nested elements. Attribute names remain restricted to the native catalog. XML attribute escaping still applies, so quotes, ampersands, and angle brackets cannot break out of the attribute. The host document and its original expression remain unchanged. This mode requires an exact boolean `allowRawHtml: true` on export as well as the editor; enabling the editor controls does not change export options.

Neither the editor nor the export APIs evaluate a template language. `toMjml` preserves the source; `compileEmail` passes it to the installed MJML compiler. String attributes such as URLs can survive compilation as template tokens. Layout-dependent values, such as widths and font sizes, must be resolved by the host before HTML compilation: unresolved expressions can produce native validation errors or unusable computed dimensions. Check the returned `errors`; preserved MJML does not guarantee valid compiled HTML. Use your host's template engine at the appropriate stage and provide values suitable for their eventual HTML/CSS context.

The editing canvas ignores template-marked attribute entries and uses concrete visual fields and applicable concrete defaults for its preview. Keep those fields populated when a useful editing preview is needed; it is not a rendered preview of evaluated template data. Template source is never executed or inserted into the canvas DOM.

`inherit: true` takes precedence over `template: true`: the entry removes the local attribute and ignores its stored value, while retaining both settings in the document. Duplicate entries apply in order, with the last applicable entry determining the result. A concrete replacement still undergoes normal validation, and marking one attribute as a template does not relax validation for other attributes. Omitting `template`, or setting it to `false`, retains the ordinary concrete-value behavior.

## Native HTML content

With the host's `allowRawHtml: true` opt-in, ending-tag source fields preserve HTML that the visual rich-text editor cannot represent, such as nested tables, images, legacy font elements, conditional comments, and template expressions. The editing canvas displays this source as code; the compiled preview renders it.

| Element                    | Source field                               |
| -------------------------- | ------------------------------------------ |
| Text, Button, Table        | `props.htmlContent`                        |
| Social and Navbar items    | `links[].htmlContent`                      |
| Accordion title            | `items[].titleHtmlContent`                 |
| Accordion answer           | `items[].htmlContent`                      |
| Document title and preview | `subjectHtmlContent`, `previewHtmlContent` |

An absent source field uses the existing visual content. An explicitly empty string produces empty content. Turning the source control off restores the visual content. Source fields require the host opt-in even when empty. MJML closing tags that could change the enclosing document structure are rejected; ordinary HTML is passed through unchanged.

Social and Navbar lists also accept ordered raw entries:

```ts
links: [
  { name: "web", label: "Home", href: "https://example.com" },
  { kind: "raw", html: "<!-- custom markup between links -->" },
  { kind: "link", name: "web", label: "Help", href: "https://example.com/help" },
];
```

Raw entries use the same host opt-in and `mjClass`/`mjmlAttributes` fields as Raw blocks.

## Native head settings

`root.props.breakpointWidth` accepts the native pixel width, such as `"1440px"`, without the numeric visual control's range limits. It overrides `breakpoint` in both export and canvas. Omit it to use the numeric setting.

Generated HTML attributes in `root.props.htmlAttributes` support HTML/XML attribute names, including `class`, `align`, `width`, and namespace prefixes. Selectors have no artificial length limit. URL and style values are validated; active attributes such as event handlers and `srcdoc` require `allowRawHtml: true`, just like the equivalent trusted HTML source. Attribute names remain structurally validated and values escaped even with that opt-in.

Font imports accept longer names and native punctuation where compatible with MJML's font matching. Names containing regular-expression syntax are rejected because the installed compiler interpolates them into regular expressions. CSS URLs use absolute HTTP(S) and are encoded for the compiler's CSS URL context.

## Document defaults and classes

The following settings live in `root.props`:

| Setting                                            | Native output                                                               |
| -------------------------------------------------- | --------------------------------------------------------------------------- |
| `attributeDefaults: MjmlAttribute[]`               | `mj-all` inside `mj-attributes`                                             |
| `componentDefaults: { tag, attributes }[]`         | Per-component defaults inside `mj-attributes`                               |
| `mjmlClasses: { name, attributes, components? }[]` | Named `mj-class` definitions, optionally with nested per-component defaults |
| `bodyAttributes: MjmlAttribute[]`                  | Attributes on `mj-body`                                                     |
| `bodyMjClass: string`                              | Classes on `mj-body`                                                        |

```ts
{
  attributeDefaults: [{ name: "font-family", value: "Arial, sans-serif" }],
  componentDefaults: [
    { tag: "mj-text", attributes: [{ name: "font-size", value: "18px" }] },
  ],
  mjmlClasses: [
    {
      name: "brand",
      attributes: [{ name: "color", value: "#103B05" }],
      components: [
        { tag: "mj-text", attributes: [{ name: "font-style", value: "italic" }] },
      ],
    },
  ],
}
```

Class names are applied in order. MJML's precedence is component defaults, global defaults, per-component document defaults, directly assigned classes, the ancestor class's nested component defaults, then local element attributes. Multiple assigned classes concatenate their `css-class` values. Explicit local `css-class` overrides that inherited value; the editor also keeps an internal class for rich-text paragraph/heading styling.

## Nested elements

- Social and Navbar `links`, and Carousel `images`, accept `mjClass` and `mjmlAttributes` on each item.
- Accordion `items` accept those fields for `mj-accordion-element`, plus `titleMjClass`/`titleAttributes` and `textMjClass`/`textAttributes`.
- Section1 accepts `columnMjClass`/`columnAttributes`.
- Section2 accepts `leftMjClass`/`leftAttributes` and `rightMjClass`/`rightAttributes`.
- Section3 also accepts `middleMjClass`/`middleAttributes`.

Native attributes on Raw blocks do not bypass the existing `allowRawHtml` opt-in.

## Ordered accordion children and trusted raw entries

Ordinary Accordion items keep the familiar `title`, `content`, `titleHtmlContent`, `htmlContent`, `titleMjClass`, `titleAttributes`, `textMjClass`, and `textAttributes` fields. Existing documents need no migration.

An Accordion `items` entry may instead be `{ kind: "raw", html, mjClass?, mjmlAttributes? }`. Ordinary elements may explicitly use `kind: "element"` and provide an ordered `children` array. Each child is either:

- `{ kind: "title", content, htmlContent?, mjClass?, mjmlAttributes? }`
- `{ kind: "text", content, htmlContent?, mjClass?, mjmlAttributes? }`
- `{ kind: "raw", html, mjClass?, mjmlAttributes? }`

Omitting `children` uses the familiar named title/answer pair. An empty array emits no authored children (the native compiler may supply defaults). Ordered arrays preserve repeated, omitted, and reordered title/text entries and raw interleaving. Import uses this shape only when the source needs it. The optional ordered-children controls replace the named pair fields, and unusual canvas arrangements stay expanded rather than implying exact native accordion behavior.

Raw entries require the editor's trusted HTML mode and `{ allowRawHtml: true }` for export. HTML source and template attributes retain the same trust requirements as other components.
