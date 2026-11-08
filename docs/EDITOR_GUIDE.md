# Editor guide

See the [README](../README.md) for installation and the public API, the [native attribute reference](NATIVE_ATTRIBUTES.md) for attribute schemas, and the [compatibility matrix](MJML_COMPATIBILITY.md) for supported MJML components.

## Documents and host integration

The host application owns the document and any persistence. Changing `value` to a different document loads it into the editor and resets undo history. Ordinary `onChange` echoes preserve Puck's undo history. The editor does not save drafts.

The document is Puck JSON. Email sections and wrappers live in `root.props.sections`; the top-level `content` array stays empty. Wrappers hold sections, and content blocks live in each section's column slots. Use `createEmptyDocument()` as the starting shape when constructing a document programmatically.

Use `headerTitle` for branding and `headerActions` for host controls such as importing or selecting templates. These appear in Puck's existing header alongside undo/redo, Preview, and Export. The editor does not display a subject field or use email metadata as its header title. Existing subject metadata is still accepted on export.

`onPublish` is an optional host callback. Supply `onUploadImage(file)` to show an upload control beside Image URL; it must return a public HTTP or HTTPS image URL. The field provides progress, errors, validation, and stale-result protection. See [Image uploads](IMAGE_UPLOADS.md) for host integration and the separately opted-in local demo mode, which embeds raster assets without hosting them.

## Blocks and editing controls

The editor includes fixed one-, two-, and three-column sections, flexible sections with grouped columns, wrappers, heroes, and text, image, button, spacer, divider, social link, navigation link, table, accordion, and carousel blocks. Text and button labels are edited directly on the canvas; the sidebar holds their style and link controls.

Blocks appear in a compact two-column palette with [Phosphor icons](https://phosphoricons.com/). The sidebar groups controls into Content, Layout, Spacing, Typography, Appearance, and Advanced, omitting empty groups. Groups start open and can be collapsed. Advanced contains native attributes, classes, and document source settings. Color fields include a native picker beside editable text, including table cells and native MJML colors.

For a non-drag workflow, open **Add or move blocks** at the top of Blocks. Choose a destination and an allowed block, then activate **Add block** to append it to that slot. To reorder, select a block in Outline or on the canvas, return to Blocks, and use **Move earlier** or **Move later**. These controls move one position within the current slot, retain keyboard focus at the first/last position, and use the editor's normal undo/redo history. A status message confirms each action. Moving between slots still requires a pointer.

The form respects allowed child types, Raw HTML opt-in, permissions, and read-only owner/ancestor/subtree locks. Protected or unsupported destinations are omitted, and stale choices are not silently redirected. These controls belong to `EmailEditor`; custom Puck hosts retain their own UI and policies. They are an alternative to dragging, not keyboard drag-and-drop: Puck 0.24's announced Space/arrow drag instructions do not provide working keyboard dragging in this editor.

The form cannot insert or move Table blocks, or move a block whose subtree contains a Table, because Table uses a dynamic data resolver (`resolveData`). Use the ordinary palette and pointer controls for those operations; their existing behavior is unchanged.

Selected and hovered blocks show green padding and amber margins with side measurements, including their owned inner layout boxes. Selection tools prefer space above or below the content; tall selections keep controls within the visible preview. These editing aids are excluded from exported email.

The selection toolbar includes Puck's drag handle for moving nested blocks without grabbing their editable content. It respects the block's drag permission and retains Puck's normal undo/redo behavior.

At tablet widths, opening Blocks/Outline or Fields closes the other sidebar to preserve canvas space. The native header toggles still control each panel. Custom header actions expand into a separate row instead of covering canvas controls.

Root settings include email language/direction, legacy Outlook web layout, mobile breakpoint, hosted web fonts, custom CSS, and generated HTML attributes. The preview compiles the current document with MJML. Responsive mode fits the available space up to 800px; Mobile caps it at 390px. Both shrink on narrower screens, so use a wider screen to inspect desktop email layout.

The rendered preview remains in an opaque-origin, script-disabled iframe. Pointer interaction and mouse/touch scrolling are available, while keyboard focus stays on the preview controls so Escape can close it. Keyboard navigation inside the rendered email is not available in this modal; download HTML from Export for standalone keyboard inspection.

## Importing MJML

`fromMjml(source)` parses an MJML document into `{ document, warnings }`, where `document` is an editable `EmailDocument` and `warnings` lists anything the document model cannot represent.

The importer covers the standard components the editor models: wrappers, sections, columns, groups, heroes, text, images, buttons, spacers, dividers, social rows, navigation bars, tables, accordions, and carousels, plus head settings (title, preview, breakpoint, web fonts, custom CSS, attribute defaults, MJML classes, and generated HTML attributes). Attributes the visual fields cannot express — for example pixel column widths or `background-url` — are preserved as native MJML attributes and survive re-export. Sections with a single plain column become one-column sections; anything else becomes a flexible section with explicit columns. `mj-raw` content imports as raw HTML blocks, which require `allowRawHtml: true` when compiling. `mj-include` and custom `.mjmlconfig` components are not supported; the demo's Import MJML button reads a local `.mjml` file.

## Exporting an email

Choose **Export** beside **Preview**, select **HTML** or **MJML**, then choose **Download HTML** or **Download MJML**. The read-only source field supports selecting and copying text; it never executes the generated markup. Downloads contain the exact displayed output as UTF-8: `email.html` (`text/html`) or `email.mjml` (`application/xml`). Keep MJML to import and continue editing later. HTML is compiled email output, not the editor canvas markup.

MJML is available while HTML compiles. Validation warnings remain available in the dialog; a compilation failure disables only the HTML download and offers a retry. Invalid documents that cannot serialize disable both downloads. A new host document or changed trust option replaces the output and discards stale pending results. Closing and reopening exports the latest document. Escape, Close, or the backdrop dismisses the native modal and returns focus to Export.

Export uses the editor's `allowRawHtml` and `allowLocalImages` settings. Embedded local demo images display a warning because many email clients do not display data URLs reliably. Use publicly hosted HTTPS images before sending a production email. Export does not upload files, call `onPublish`, modify content/history, or provide draft persistence; publishing and storage remain host-owned.

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

Custom CSS uses CodeMirror with CSS highlighting, line numbers, autocomplete, bracket matching, local undo/redo, and Format/Expand controls. Tab and Shift+Tab indent selected lines; press Escape, then Tab to move focus out of the editor. Read-only fields cannot change the document, but both CSS and HTML source remain focusable for keyboard selection and copying. Ordinary controlled updates preserve the cursor and local undo; replacing the source externally starts a fresh local history. Initial display formatting does not change stored CSS. HTML source remains a plain monospace field: Tab inserts two spaces, Escape then Tab moves forward, and Shift+Tab moves back. For CSS scoping and font limitations, see [canvas behavior](MJML_COMPATIBILITY.md#custom-css-and-web-fonts).

When the native canvas cannot parse or fully reproduce Custom CSS, a **preview notes** disclosure below the field lists the affected rules or parsing issue. These notes describe native preview limitations, not a complete CSS validation; valid browser CSS can also trigger them. The notes leave source CSS and export unchanged. Open **Preview** to compare against the compiled email.

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

## Advanced Puck hosts and read-only fields

`EmailEditor` includes the field permissions integration. For a custom Puck shell, import both supported helpers from the client entry and preserve the field overrides:

```tsx
import { Puck } from "@puckeditor/core";
import { createEmailConfig, emailFieldTypes } from "puck-mjml";

<Puck
  config={createEmailConfig()}
  data={document}
  overrides={{ fieldTypes: emailFieldTypes }}
  onChange={setDocument}
/>;
```

These helpers belong to the client/root entry, not `puck-mjml/core`. Hosts replacing the field overrides are responsible for equivalent read-only enforcement. Locked ancestor arrays also lock their nested fields and inline content. At the same leaf depth, an exact `false` exception can override a wildcard lock in sidebar controls. Puck still keeps an inline rich-text field static when its wildcard is locked even if an exact `false` exception permits the sidebar edit. Use that sidebar field for this narrow exception.
