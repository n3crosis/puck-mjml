# MJML compatibility

The editor exports a constrained Puck document to MJML. `fromMjml` imports the standard components represented by that model and reports unsupported content; it is not a lossless importer for arbitrary MJML. The browser compiler renders exported MJML to HTML. Full value, rendering, and email-client parity has not been established.

See the [editor guide](EDITOR_GUIDE.md) for usage and the [native attribute reference](NATIVE_ATTRIBUTES.md) for schemas and precedence.

## Component coverage

| MJML component                                                                    | Editor support           | Notes                                                                                                                     |
| --------------------------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `mjml`, `mj-head`, `mj-body`                                                      | Generated                | Root settings include language, direction, legacy Outlook web mode, title, preview, width, background, and font.          |
| `mj-title`, `mj-preview`, `mj-attributes`, `mj-all`, `mj-class`                   | Generated                | Global/component defaults and named classes, including nested per-component class defaults.                               |
| `mj-section`, `mj-column`                                                         | Visual blocks            | Fixed or flexible columns; borders, radii, classes, percentage widths, and vertical alignment.                            |
| `mj-text`, `mj-image`, `mj-button`, `mj-spacer`                                   | Visual blocks            | Rich text, typography, button inner padding/radius, and linked rounded images.                                            |
| `mj-divider`                                                                      | Visual block             | Color, width, thickness, and padding.                                                                                     |
| `mj-social`, `mj-social-element`                                                  | Visual block             | Network presets, custom icon sources, labels/alt text, links, icon sizing/padding/radius.                                 |
| `mj-navbar`, `mj-navbar-link`                                                     | Visual block             | Labels, native base URL, and safe absolute or relative links through native controls.                                     |
| `mj-table`                                                                        | Visual block             | Arbitrary rich-text cells, header/body/footer rows, captions, spans, and native table styling.                            |
| `mj-wrapper`                                                                      | Visual block             | Groups sections and heroes; background, padding, border, radius, and CSS classes.                                         |
| `mj-hero`                                                                         | Visual block             | Fluid or fixed height, optional background image, and supported content blocks.                                           |
| `mj-accordion`, `mj-accordion-element`, `mj-accordion-title`, `mj-accordion-text` | Visual block             | Editable titles and sanitized rich text answers.                                                                          |
| `mj-group`                                                                        | Visual block             | Groups flexible-section columns so they stay side by side on mobile.                                                      |
| `mj-carousel`, `mj-carousel-image`                                                | Visual block             | Editable images, links, alt text, alignment, and thumbnails.                                                              |
| `mj-breakpoint`, `mj-font`, `mj-style`                                            | Root settings            | Native breakpoint width override, hosted CSS fonts, and head or inline custom CSS.                                        |
| `mj-raw`                                                                          | Host opt-in              | Trusted pre-doctype, head, body, wrapper, section, group, hero, column, social-list, navigation-list, and accordion HTML. |
| `mj-html-attributes`, `mj-selector`, `mj-html-attribute`                          | Root settings            | HTML/XML attributes and unrestricted selector length; active attributes require the trusted HTML opt-in.                  |
| `mj-include`, custom `.mjmlconfig` components                                     | Outside browser compiler | These require host-side compilation.                                                                                      |

## Canvas layout

Canvas breakpoints and email widths use the same normalization as the exporter. The canvas uses its viewport for column stacking; grouped columns remain side by side. `lang`, `dir`, and `owa` map to native MJML document settings.

Native section `gutter` values apply to fixed and flexible columns on the canvas, including class/default inheritance, pixel/percentage units, RTL edges, and MJML's pixel rounding. Gutters sit outside each column's own background, border, and padding. Stacked columns switch to vertical spacing at the document breakpoint; grouped columns retain horizontal spacing. A nested section resets its wrapper's gutter, as the compiler does. Live Puck data supplies sibling order for insertion, removal, and reordering.

Heroes apply separate inner backgrounds and padding. Fixed hero height acts as a minimum including outer padding, allowing long content to grow. Groups honor vertical alignment alongside adjacent columns. Social borders apply to icon images with parent/child attribute precedence. Carousel thumbnails preview images and links on hover, returning to the selected slide on leave.

Sections position partial-width column rows using native `text-align`, including RTL direction. Columns and groups whose width is inherited use the compiler's equal share of non-raw siblings. The canvas tracks the desktop content width through wrappers, sections, groups, columns, and heroes: native images are clamped to that width, including padding/borders, and retain their desktop size when columns stack unless `fluid-on-mobile` is enabled. Button text alignment is independent from outer placement, and native height/vertical alignment uses a minimum-height content box. Accordion title/answer classes can override their inherited separators and icon settings. Disabling and re-enabling hamburger navigation resets it closed.

Text and Button expose font family, size, weight, line-height multipliers, and letter spacing. Inline rich-text paragraph and heading styles match canvas defaults. The Collage example exercises these attributes with custom social icons and responsive CSS.

## Custom CSS and web fonts

Document custom CSS and web fonts apply to both the compiled email and the editing canvas. Each canvas instance scopes custom CSS under its own root class: `html`, `body`, and `:root` map to the canvas root, other rules become canvas descendants, and selectors that could match host-page siblings of the canvas (for example `body + .promo`) are dropped with a console note. `@media`, `@supports`, and `@container` groups are preserved, `@keyframes` and `@font-face` registrations are namespaced per editor instance, and `@layer` rules are applied without layer semantics. `@import` and other global at-rules are not applied on the canvas and are reported once per note in the console. Web font stylesheets are fetched on the client after mount, keep only the `@font-face` rules of the declared families (resolving relative font URLs), and register them under per-instance aliases so concurrent editors cannot override each other's fonts; until a stylesheet loads, or if it fails because of network or CORS restrictions, the canvas renders with the remaining font stack. The `font` shorthand is not rewritten to per-instance font aliases; use `font-family` declarations when aliases are needed. Selectors written for the compiled email's table structure (for example `.intro > table > tbody > tr > td`) do not match the canvas's div structure; the compiled email preview remains the rendering reference.

## Tailwind utilities

`root.props.tailwind` (boolean, or the sidebar radio's `"true"`) opts a document into Tailwind utility rendering while editing: the canvas loads the Tailwind v4 browser runtime (pinned to the installed `@tailwindcss/browser` version from jsDelivr; enabled by the host with `tailwindRuntime={true}`, or a trusted HTTP(S) script URL supplied through that editor prop) and compiles the utility classes found in `css-class` values live. Tailwind preflight is excluded so the runtime cannot reset canvas styles, and generated styles are removed when the canvas stops using Tailwind. This is an editing preview: the compiled email still needs the utility CSS itself. Because custom CSS is scoped onto the canvas, pasting a generated Tailwind build into Custom CSS renders the same classes on both the canvas and in the exported email.

## Attributes and trusted source

Native attribute controls expose all 390 declared body attributes across the installed compiler's 23 body components, plus shared class attributes. Compiler checks cover each attribute and full-attribute fixtures for every body component. Export and canvas share concrete attribute generation and class/default resolution. Canvas renderers apply native typography, spacing, borders, backgrounds, dimensions, column layouts, and nested element styles while preserving inline editing. See the [native attribute API](NATIVE_ATTRIBUTES.md). The exporter validates links, escapes plain text, and sanitizes rich text. For complete MJML syntax today, use MJML directly outside the visual editor.

Native HTML source controls cover content-bearing ending tags, including Text, Button, Table, social/navigation labels, accordion titles/answers, and document title/preview. These require the host's trusted HTML opt-in and show source placeholders on the editing canvas.

Trusted template expressions in native attributes are preserved with `template: true` and the host's `allowRawHtml: true` opt-in. No template language is evaluated. The canvas uses concrete visual fallbacks; expressions that affect MJML layout calculations must be resolved by the host before HTML compilation, as with native MJML.

## Limitations

Remaining compatibility work includes canvas fidelity for specialized native behavior (including client-specific fallbacks such as Outlook/VML output, which depends on the compiled email and real client validation) and filesystem includes/custom components through a host compiler. The presence of each standard tag does not imply full value or rendering parity: untrusted inputs are still subject to URL/CSS validation, and the HTML editor is not a general-purpose MJML source editor. Raw HTML is intentionally passed through when the host enables it.

Generated HTML selectors support child combinators and quoted attribute values. The installed MJML compiler matches selectors against HTML with entities still encoded: an exact selector for an href containing an ampersand may need `&amp;` in the selector value. Combining generated HTML attributes or inline CSS with XML-like template syntax can reparse that syntax; apply such templates after compilation when needed.

Ambiguous legacy HTML entities in plain titles (for example `&notit;`) can decode differently in native title text and its generated accessible label. Import keeps the safe displayed text and reports that the accessible label will normalize to it on export. Standard named and numeric entities do not need trusted-source mode.

### Tailwind trust and browser behavior

Tailwind needs both the document toggle and the host's `EmailEditor` `tailwindRuntime` opt-in. The deprecated document `tailwindScriptUrl` is ignored: imported or persisted document data cannot select executable code. Each canvas uses a hidden compiler frame for lifecycle and stylesheet isolation. This is not a security sandbox for untrusted host code; a custom runtime URL must be code the host trusts. Tailwind remains a canvas aid, not an email CSS compiler. Include the actual utility CSS in exported `headStyles` when required.

### Import safety and round trips

Treat imports as a conversion with diagnostics, not a lossless source editor. Review all warnings and compare important output with the original MJML. Rich HTML outside supported rich-text markup may need trusted source mode. The public demo deliberately rejects documents needing trusted source before replacing the current email; it never enables trust based on file content. Hosts should validate export before committing an imported document and keep a copy of the original source.

### Imported attribute provenance

Imported native local attributes and root font rules retain static provenance and the original visual-control baseline. A preserved native value is suppressed only when its corresponding visual control changes. Explicit native edits remove that ownership, and undo restores the earlier data and behavior. This is not an on-change reconciliation pass that repeatedly rewrites the imported document.

Ending-tag HTML is scanned with quote and comment awareness so ordinary HTML void tags do not consume later MJML components. Unsafe embedded MJML boundary literals are retained with explicit cannot-export warnings rather than silently deleted or reported as a successful round trip. Review these diagnostics before committing an import; the demo's export preflight rejects such documents without replacing the previous email.

### Safe imported content

Safe imported text and accordion answers keep their original markup while unchanged, and retain native typography and paragraph/heading spacing through rich-text edits and undo. Imported tables keep sanitized source structure while unchanged; modeled cell edits preserve the absence of unwanted default alignment, borders, and scope. Structural edits rebuild the modeled table. Unsupported inline anchor or table-cell CSS still needs scoped head CSS or the host's explicit trusted-source mode. These preservation fields are always sanitized, including when supplied by a persisted or constructed document.

The bundled [62-template MJML suite](../templates/README.md) is validated directly and through safe editor import/export. It is a concrete regression corpus, not evidence that arbitrary MJML or every email client behaves identically.
