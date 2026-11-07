# Editor guide

See the [README](../README.md) for installation and the public API, the [native attribute reference](NATIVE_ATTRIBUTES.md) for attribute schemas, and the [compatibility matrix](MJML_COMPATIBILITY.md) for supported MJML components.

## Documents and host integration

The host application owns the document and any persistence. Changing `value` to a different document loads it into the editor and resets undo history. Ordinary `onChange` echoes preserve Puck's undo history. The editor does not save drafts.

The document is Puck JSON. Email sections and wrappers live in `root.props.sections`; the top-level `content` array stays empty. Wrappers hold sections, and content blocks live in each section's column slots. Use `createEmptyDocument()` as the starting shape when constructing a document programmatically.

Use `headerTitle` for branding and `headerActions` for host controls such as export buttons. These appear in Puck's existing header alongside undo/redo and preview. The editor does not display a subject field or use email metadata as its header title. Existing subject metadata is still accepted on export.

`onPublish` is an optional host callback. Supply `onUploadImage(file)` to show an upload control; it must return a public HTTP or HTTPS image URL.

## Blocks and editing controls

The editor includes fixed one-, two-, and three-column sections, flexible sections with grouped columns, wrappers, heroes, and text, image, button, spacer, divider, social link, navigation link, table, accordion, and carousel blocks. Text and button labels are edited directly on the canvas; the sidebar holds their style and link controls.

Blocks appear in a compact two-column palette with [Phosphor icons](https://phosphoricons.com/). The sidebar groups controls into Content, Layout, Spacing, Typography, Appearance, and Advanced, omitting empty groups. Groups start open and can be collapsed. Advanced contains native attributes, classes, and document source settings. Color fields include a native picker beside editable text, including table cells and native MJML colors.

Selected and hovered blocks show green padding and amber margins with side measurements, including their owned inner layout boxes. Selection tools prefer space above or below the content; tall selections keep controls within the visible preview. These editing aids are excluded from exported email.

At tablet widths, opening Blocks/Outline or Fields closes the other sidebar to preserve canvas space. The native header toggles still control each panel. Custom header actions expand into a separate row instead of covering canvas controls.

Root settings include email language/direction, legacy Outlook web layout, mobile breakpoint, hosted web fonts, custom CSS, and generated HTML attributes. The preview compiles the current document with MJML. Responsive mode fits the available space up to 800px; Mobile caps it at 390px. Both shrink on narrower screens, so use a wider screen to inspect desktop email layout.

## Importing MJML

`fromMjml(source)` parses an MJML document into `{ document, warnings }`, where `document` is an editable `EmailDocument` and `warnings` lists anything the document model cannot represent.

The importer covers the standard components the editor models: wrappers, sections, columns, groups, heroes, text, images, buttons, spacers, dividers, social rows, navigation bars, tables, accordions, and carousels, plus head settings (title, preview, breakpoint, web fonts, custom CSS, attribute defaults, MJML classes, and generated HTML attributes). Attributes the visual fields cannot express — for example pixel column widths or `background-url` — are preserved as native MJML attributes and survive re-export. Sections with a single plain column become one-column sections; anything else becomes a flexible section with explicit columns. `mj-raw` content imports as raw HTML blocks, which require `allowRawHtml: true` when compiling. `mj-include` and custom `.mjmlconfig` components are not supported; the demo's Import MJML button reads a local `.mjml` file.

## Tables

Tables accept `headerRows`, `bodyRows`, and `footerRows`. Each row has a `cells` array; cell text is edited inline. Use the sidebar cell grids to add, remove, or reorder rows and columns, select a cell to edit its content and styles, and use `colSpan`/`rowSpan` for merged cells. Select a table and drag a column boundary on the canvas to resize; focused boundaries also support left/right arrow keys. A drag commits one undoable change on release. Column operations apply across header, body, and footer together; resizing and ambiguous structural edits on merged or uneven rows are disabled while cell properties stay editable. Headers support HTML `scope`; tables support captions, width, typography, layout, borders, cell spacing, and per-cell styles.

```ts
const table = {
  type: "Table",
  props: {
    id: "invoice",
    caption: "Order summary",
    headerRows: [
      {
        cells: [
          { content: "<p>Product</p>", header: true, scope: "col" },
          { content: "<p>Quantity</p>", header: true, scope: "col" },
          { content: "<p>Amount</p>", header: true, scope: "col" },
        ],
      },
    ],
    bodyRows: [
      {
        cells: [
          { content: "<p><strong>Starter plan</strong></p>" },
          { content: "<p>1</p>" },
          { content: "<p>$10</p>", align: "right" },
        ],
      },
    ],
    footerRows: [
      {
        cells: [
          { content: "<p>Total</p>", colSpan: 2, header: true, scope: "row" },
          { content: "<p>$10</p>", align: "right" },
        ],
      },
    ],
  },
};
```

Older tables using `firstHeading`, `secondHeading`, and `rows: [{ first, second }]` still export and migrate automatically when opened. Their text remains literal. Supplying any modern row group, including an empty array, selects the new structure.

## Native attributes and MJML classes

Every block has native MJML attribute controls, including nested social/navigation links, carousel images, accordion parts, and fixed-section columns. `props.mjmlAttributes` overrides generated visual attributes; `inherit: true` on an entry removes the local attribute so MJML classes/defaults can supply it. `props.mjClass` assigns named classes. Document settings expose global defaults, component defaults, class definitions, and body attributes. Export and canvas share attribute resolution; the canvas renders native typography, spacing, borders, backgrounds, dimensions, full-width layout, scoped custom CSS, web fonts, and nested element styles while retaining inline editing. MJML's compiled preview remains the reference for email layout and client-specific behavior. See the [native attribute API](NATIVE_ATTRIBUTES.md) for schemas, precedence, and examples.

Attribute controls keep inherited values and template options out of the way until needed, preserving their saved settings. Native section gutters follow the document breakpoint: stacked columns use vertical spacing and grouped columns keep horizontal spacing. Hero inner styles, group vertical alignment, social icon borders, and carousel hover previews also render on the canvas.

Native enum and boolean attributes offer catalog-based value choices; flexible values and templates remain text inputs. The canvas also follows section alignment, automatic column widths, button inner alignment, and image width limits through nested layouts. Images keep their desktop size when columns stack unless `fluid-on-mobile` enables expansion.

Set `template: true` on an attribute to preserve a host-trusted template expression when exporting MJML. This requires `allowRawHtml: true`. The canvas uses concrete visual fallbacks; resolve layout-dependent expressions before compiling HTML.

## Custom CSS, web fonts, and Tailwind

Document `headStyles` and `fontImports` apply to the compiled email and, scoped per editor instance, to the editing canvas: `html`/`body`/`:root` map to the canvas root, web fonts register under per-instance aliases, and `@keyframes`/`@font-face` are namespaced so concurrent editors never collide.

Set `root.props.tailwind` to render Tailwind utility classes from `css-class` values on the canvas. The canvas loads the Tailwind v4 browser runtime (pinned to the installed `@tailwindcss/browser` version from jsDelivr; enabled by the host with `tailwindRuntime={true}`, or a trusted HTTP(S) script URL supplied through that editor prop) and compiles utilities live, with preflight excluded. This is an editing preview: for the compiled email, include your generated Tailwind CSS in `headStyles` — pasted build output also renders on the canvas through the same scoping.

CSS source is formatted for reading and can be explicitly reformatted without rewriting HTML source. Source fields use monospace code blocks with tab-to-indent. For CSS scoping and font limitations, see [canvas behavior](MJML_COMPATIBILITY.md#custom-css-and-web-fonts).

## Trusted raw HTML

Set `allowRawHtml` on `EmailEditor` to enable Raw blocks, raw list entries, and native HTML source controls. Pass `{ allowRawHtml: true }` to `toMjml` or `compileEmail` when exporting the same document:

```tsx
<EmailEditor value={document} onChange={setDocument} allowRawHtml />;
const result = await compileEmail(document, { allowRawHtml: true });
```

Raw source is passed through without HTML sanitization, including template tokens and conditional comments. Enable it only for source your host trusts. The canvas shows source text; the rendered preview uses a sandboxed iframe. Raw blocks work in body, wrapper, flexible section, group, hero, and column slots. Social, Navbar, and Accordion lists accept ordered raw entries. Accordion elements also support ordered title/text/raw children when source order cannot be represented by the ordinary named title/answer pair. See [ordered accordion children](NATIVE_ATTRIBUTES.md#ordered-accordion-children-and-trusted-raw-entries). `root.props.rawHead` supplies raw head HTML. `root.props.rawFileStart` emits trusted content before the HTML doctype, using native `mj-raw position="file-start"`; it uses the same host opt-in. MJML closing tags that could escape the enclosing document structure are rejected. With the option disabled, documents containing raw source cannot be exported.

Text, Button, Table, nested link labels, accordion content, and the document title/preview also have optional native HTML source fields. These preserve content outside the rich-text editor's supported markup. See the [native HTML content API](NATIVE_ATTRIBUTES.md#native-html-content).

### Tailwind trust and browser behavior

Tailwind needs both the document toggle and the host's `EmailEditor` `tailwindRuntime` opt-in. The deprecated document `tailwindScriptUrl` is ignored: imported or persisted document data cannot select executable code. Each canvas uses a hidden compiler frame for lifecycle and stylesheet isolation. This is not a security sandbox for untrusted host code; a custom runtime URL must be code the host trusts. Tailwind remains a canvas aid, not an email CSS compiler. Include the actual utility CSS in exported `headStyles` when required.

### Import safety and round trips

Treat imports as a conversion with diagnostics, not a lossless source editor. Review all warnings and compare important output with the original MJML. Rich HTML outside supported rich-text markup may need trusted source mode. The public demo deliberately rejects documents needing trusted source before replacing the current email; it never enables trust based on file content. Hosts should validate export before committing an imported document and keep a copy of the original source.
