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

Native columns and groups use MJML's inline formatting model for vertical alignment, including the distinction between an omitted group alignment and explicit top alignment. The renderer preserves the compiled first-content-row baseline, fractional percentage widths, and the compiler's integer pixel sizing rules. `EmailEditor` and read-only Puck rendering use this layout automatically. Custom editable Puck hosts keep the earlier flex preview unless they opt into the [native drag-preview bridge](../README.md#custom-puck-hosts-and-native-layout).

Puck 0.24's insertion markers require flex/grid geometry. During a drag, the bridge temporarily switches only its registered editable rows to flex and restores inline layout when the drag finishes or is cancelled. Mixed vertical alignments can shift in this temporary preview. This does not change exported data, permission checks, or history. It is not a workaround for upstream Puck's global iframe lookups in multiple-editor pointer interactions; see the integration notes before enabling that setup.

Native section `gutter` values apply to fixed and flexible columns on the canvas, including class/default inheritance, pixel/percentage units, RTL edges, and MJML's pixel rounding. Gutters sit outside each column's own background, border, and padding. Stacked columns switch to vertical spacing at the document breakpoint; grouped columns retain horizontal spacing. A nested section resets its wrapper's gutter, as the compiler does. Live Puck data supplies sibling order for insertion, removal, and reordering.

Heroes apply separate inner backgrounds and padding. Fixed hero height acts as a minimum including outer padding, allowing long content to grow. Groups honor vertical alignment alongside adjacent columns. Social borders apply to icon images with parent/child attribute precedence. Carousel thumbnails preview images and links on hover, returning to the selected slide on leave.

Sections position partial-width column rows using native `text-align`, including RTL direction. Columns and groups whose width is inherited use the compiler's equal share of non-raw siblings. The canvas tracks the desktop content width through wrappers, sections, groups, columns, and heroes: native images are clamped to that width, including padding/borders, and retain their desktop size when columns stack unless `fluid-on-mobile` or the bounded custom-CSS image expansion described below applies. The canvas uses the full selected viewport width without an extra horizontal editor gutter; explicitly authored body padding still applies. Native table wrappers inherit the resolved MJML `align` value, while explicit cell alignment and browser header-cell defaults remain intact. Button text alignment is independent from outer placement, and native height/vertical alignment uses a minimum-height content box. Accordion title/answer classes can override their inherited separators and icon settings. Disabling and re-enabling hamburger navigation resets it closed.

Text and Button expose font family, size, weight, line-height multipliers, and letter spacing. Inline rich-text paragraph and heading styles match canvas defaults. The Collage example exercises these attributes with custom social icons and responsive CSS.

## Custom CSS and web fonts

Document custom CSS and web fonts apply to both the compiled email and the editing canvas, subject to the boundaries below. The compiled email preview remains the rendering reference; arbitrary generated-table CSS parity is not implied.

Root selectors are rewritten onto the canvas root. A single leading `html`, `body`, or `:root` compound retains its original specificity plus the same scope class added to ordinary selectors. Bare `html body`, `html > body`, `:root body`, and `:root > body` prefixes also retain their specificity; suffixes on the final body compound are preserved. This keeps a `:root div` max-width override above the native desktop class cap, without making ordinary type or universal selectors stronger than that cap. Qualified ancestor chains such as `html.theme body .intro` retain the earlier collapsed mapping, which can lose predicates and specificity, and produce a console note. Root selectors hidden inside functions, such as `:is(:root, body)`, and forms not already recognized by the root mapper are not reinterpreted. Check these unsupported root forms in both representations.

### CSS scope and registrations

Each canvas instance scopes custom CSS under its own root class. `html`, `body`, and `:root` map to the canvas root; other rules become canvas descendants. Selectors that could match host-page siblings of the canvas, such as `body + .promo`, are dropped with a console note.

Nested CSS is supported conservatively. Implicit descendants, leading child combinators, a single leading `&`, and descendants of that `&` remain supported, including qualifiers and pseudo-elements. For example, `.title`, `> .title`, `&:hover`, `& > .title`, and `& .first + .peer` stay nested under their scoped parent. Parent-sibling selectors (`& + .host`, `~ .host`), embedded or repeated `&`, embedded selector comments/escapes, column combinators, and malformed or unsupported selector lists cause the **whole nested rule** to be omitted with a console note. This includes some valid but more complex nesting. The same check runs through supported conditional groups and unwrapped layers; unsupported wrappers such as `@scope` and `@starting-style` remain omitted. Keyframe steps and font-face declarations are handled separately.

These selectors isolate sibling editors and host-page targets. They do not create a boundary around a second canvas nested inside the first canvas's DOM: an outer descendant selector can still match that inner canvas's elements, and its cascade can affect them. Keep independently styled editors as siblings rather than nesting their canvases. This is CSS scoping, not a sandbox for arbitrary untrusted CSS.

- `@media`, `@supports`, and `@container` groups are preserved.
- Supported `@keyframes` and custom-document `@font-face` registrations are namespaced per editor instance. Unsupported registrations are omitted with a console note, never retained as a global fallback.
- Keyframe registration supports plain, unescaped identifier names. Quoted names, escapes, CSS-wide keywords, other unsupported names, and rules without a keyframe block are omitted, even when some of those forms are valid browser CSS. Matching remains case-sensitive. Literal `animation-name` references include keyword-like names such as `linear`; timing, direction, fill, and other shorthand keywords are not rewritten as names. Use `animation-name` for those ambiguous names.
- Custom-document font faces accept literal quoted family names without escapes and unquoted identifier sequences. Duplicate supported `font-family` descriptors use only the last family, including differently cased descriptor names. Earlier families do not get aliases. A face with any unsupported or invalid family descriptor, `!important` family descriptor, embedded value comment, escaped or hack-prefixed descriptor name, or noncanonical whitespace in a quoted family is omitted in full, rather than guessing which fallback descriptor the browser would use. Unquoted multiword families may contain generic or system words after an ordinary first identifier, such as `Instrument Serif`. A leading generic or system keyword, and any unquoted CSS-wide or `default` token, stay outside the supported subset; quote those family names instead. This is intentionally narrower than browser CSS.
- `@layer` rules are applied without layer semantics. Direct declarations inside nested layers still receive the same literal font and animation aliases as other declarations.
- `@import` and other global at-rules are not applied on the canvas and are reported once per note in the console.

Only registrations in retained canvas CSS contribute aliases. Definitions beneath an omitted wrapper or rejected selector do not redirect surviving rules to missing aliases; explicitly supplied imported-font aliases are kept. Supported conditional groups still contribute aliases without evaluating their media/support/container conditions on the server. Unsupported `@scope` remains omitted in full, including its otherwise browser-valid global definitions.

Literal `font-family` declarations in direct keyframe steps use the same per-instance aliases as ordinary declarations. Step selectors, timing functions, custom properties, `var()` values/fallbacks, font shorthand, escaped/commented font values, invalid empty-item font lists, and invalid `!important` declarations are left unchanged. Keyframe steps are not treated as nested selectors, and arbitrary nested content inside keyframes is not promoted into supported CSS.

### Web fonts

Web font stylesheets are fetched on the client after mount. The canvas keeps only the `@font-face` rules of the declared families, resolves relative font URLs, and registers per-instance aliases so concurrent editors cannot override each other's fonts. Until a stylesheet loads, or if it fails because of network or CORS restrictions, the canvas renders with the remaining font stack.

The same alias map covers native typography and custom head-only `@font-face` registrations. Imported font CSS is inserted before document CSS, so later static faces retain their original precedence even when an imported stylesheet arrives asynchronously. Replacing a font import clears stale CSS immediately; an old request cannot overwrite the new document.

The canvas also resolves MJML 5.4.1's five built-in font families: Open Sans, Droid Sans, Lato, Roboto, and Ubuntu. It requests only families used in this canvas's rendered inline font stacks or inline `mj-style` declarations. Explicit `mj-font` entries take precedence, including differently cased names. Ordinary head-only CSS does not trigger an implicit import. Matching uses complete family names rather than copying the compiler's unused substring matches, such as loading Roboto for Roboto Slab.

The `font` shorthand is not rewritten to per-instance font aliases; use `font-family` declarations when aliases are needed. CSS custom-property values, references inside `var()` (including fallbacks), and quoted/escaped animation references are not token-decoded or rewritten. Unknown references remain unchanged and can resolve to host-page registrations; this is not a CSS sandbox. Exported MJML and its original CSS are unchanged by canvas omission or aliasing. Safe rich-text HTML does not preserve arbitrary inline font-family styles; use the native typography controls or scoped document CSS. Trusted HTML continues to use a source placeholder on the canvas rather than executing imported markup.

### Generated-table selector adapters

The native canvas uses editable HTML rather than reproducing every table in MJML's compiled output. Two bounded adapters support common template rules while preserving the original scoped rule, specificity, conditional groups, importance, and authored-table matches:

- **Padding:** physical `padding` declarations and their four longhands from the exact selector shape `.intro > table > tbody > tr > td`, with one plain class name. Renderer-owned markers identify the equivalent padding box for ordinary sections/wrappers and columns with resolved padding, including inherited zero. Gutter columns target their inner box, not the gutter. Non-full-width background sections/wrappers use a distinct marker and the exact extra-div shape `.intro > div > table > tbody > tr > td`. The ordinary chain does not target a background box, and the background chain does not target ordinary layouts. Full-width variants, columns without resolved padding, compound/pseudo/attribute selectors, nested rules, and rules containing `all` are excluded.
- **Image expansion:** literal `width: 100% !important` declarations from the exact selector `.image table`, with one plain class name. The rule targets only renderer-marked native image sizing anchors beneath that class. Non-important widths are left unadapted rather than raised above the native anchor's inline width. Other width values, resets, maximum widths, and arbitrary generated-table selectors are not adapted. Rules containing another width declaration, nesting, or `all` are excluded.

## Tailwind utilities

`root.props.tailwind` (boolean, or the sidebar radio's `"true"`) opts a document into Tailwind utility rendering while editing: the canvas loads the Tailwind v4 browser runtime (pinned to the installed `@tailwindcss/browser` version from jsDelivr; enabled by the host with `tailwindRuntime={true}`, or a trusted HTTP(S) script URL supplied through that editor prop) and compiles the utility classes found in `css-class` values live. Tailwind preflight is excluded so the runtime cannot reset canvas styles, and generated styles are removed when the canvas stops using Tailwind. This is an editing preview: the compiled email still needs the utility CSS itself. Because custom CSS is scoped onto the canvas, pasting a generated Tailwind build into Custom CSS renders the same classes on both the canvas and in the exported email.

## Attributes and trusted source

Native attribute controls expose all 390 declared body attributes across the installed compiler's 23 body components, plus shared class attributes. Compiler checks cover each attribute and full-attribute fixtures for every body component. Export and canvas share concrete attribute generation and class/default resolution. Canvas renderers apply native typography, spacing, borders, backgrounds, dimensions, column layouts, and nested element styles while preserving inline editing. See the [native attribute API](NATIVE_ATTRIBUTES.md). The exporter validates links, escapes plain text, and sanitizes rich text. For complete MJML syntax today, use MJML directly outside the visual editor.

Native HTML source controls cover content-bearing ending tags, including Text, Button, Table, social/navigation labels, accordion titles/answers, and document title/preview. These require the host's trusted HTML opt-in and show source placeholders on the editing canvas.

Trusted template expressions in native attributes are preserved with `template: true` and the host's `allowRawHtml: true` opt-in. No template language is evaluated. The canvas uses concrete visual fallbacks; expressions that affect MJML layout calculations must be resolved by the host before HTML compilation, as with native MJML.

## Limitations

Remaining compatibility work includes canvas fidelity for specialized native behavior (including client-specific fallbacks such as Outlook/VML output, which depends on the compiled email and real client validation) and filesystem includes/custom components through a host compiler. The presence of each standard tag does not imply full value or rendering parity: untrusted inputs are still subject to URL/CSS validation, and the HTML editor is not a general-purpose MJML source editor. Raw HTML is intentionally passed through when the host enables it.

Generated HTML selectors support child combinators and quoted attribute values. The installed MJML compiler matches selectors against HTML with entities still encoded: an exact selector for an href containing an ampersand may need `&amp;` in the selector value. Imports preserve eligible unchanged entity spellings using validated provenance, without rewriting selectors; edited or normalization-changing values fall back to ordinary escaping. Combining generated HTML attributes or inline CSS with XML-like template syntax can reparse that syntax; apply such templates after compilation when needed.

Ambiguous legacy HTML entities in plain titles (for example `&notit;`) can decode differently in native title text and its generated accessible label. Import keeps the safe displayed text and reports that the accessible label will normalize to it on export. Standard named and numeric entities do not need trusted-source mode.

### Tailwind trust and browser behavior

Tailwind needs both the document toggle and the host's `EmailEditor` `tailwindRuntime` opt-in. The deprecated document `tailwindScriptUrl` is ignored: imported or persisted document data cannot select executable code. Each canvas uses a hidden compiler frame for lifecycle and stylesheet isolation. This is not a security sandbox for untrusted host code; a custom runtime URL must be code the host trusts. Tailwind remains a canvas aid, not an email CSS compiler. Include the actual utility CSS in exported `headStyles` when required.

### Import safety and round trips

Treat imports as a conversion with diagnostics, not a lossless source editor. Review all warnings and compare important output with the original MJML. Rich HTML outside supported rich-text markup may need trusted source mode. The public demo deliberately rejects documents needing trusted source before replacing the current email; it never enables trust based on file content. Hosts should validate export before committing an imported document and keep a copy of the original source.

### Imported attribute provenance

Imported native local attributes and root font rules retain static provenance and the original visual-control baseline. A preserved native value is suppressed only when its corresponding visual control changes. Explicit native edits remove that ownership, and undo restores the earlier data and behavior. This is not an on-change reconciliation pass that repeatedly rewrites the imported document.

Unchanged imported attributes also retain safe entity spellings, such as `&copy;` or `&#169;`, so generated HTML selectors continue matching the compiler's encoded output. This applies to local, global, component, class, and nested class defaults without changing decoded canvas values or selector text. Source metadata is advisory: export revalidates both interpretations and uses ordinary escaping after a value changes, validation normalizes the value, or the source fails validation or exceeds 16 KiB. Literal double quotes, markup boundaries, and control characters cannot enter a quoted attribute through this path. Navbar icon text retains its separate one-layer decoding.

Ending-tag HTML is scanned with quote and comment awareness so ordinary HTML void tags do not consume later MJML components. Unsafe embedded MJML boundary literals are retained with explicit cannot-export warnings rather than silently deleted or reported as a successful round trip. Review these diagnostics before committing an import; the demo's export preflight rejects such documents without replacing the previous email.

### Safe imported content

Safe imported text and accordion answers keep their original markup while unchanged, and retain native typography and paragraph/heading spacing through rich-text edits and undo. Imported tables keep sanitized source structure while unchanged; modeled cell edits preserve the absence of unwanted default alignment, borders, and scope. Structural edits rebuild the modeled table. Unsupported inline anchor or table-cell CSS still needs scoped head CSS or the host's explicit trusted-source mode. These preservation fields are always sanitized, including when supplied by a persisted or constructed document.

The bundled [62-template MJML suite](../templates/README.md) is validated directly and through safe editor import/export. It is a concrete regression corpus, not evidence that arbitrary MJML or every email client behaves identically.
