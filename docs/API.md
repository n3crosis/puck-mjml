# API reference

The package has two entry points. Every signature below is taken from the source in `src/`; the conversion examples are exercised by the unit tests.

| Entry            | Use it for                                                                                   | Loads                            |
| ---------------- | -------------------------------------------------------------------------------------------- | -------------------------------- |
| `puck-mjml`      | The browser editor, custom Puck hosts, the template registry, and all conversion APIs.       | React, Puck, and bundled CSS.    |
| `puck-mjml/core` | Conversion, preprocessing, document factories, and types in Node or React Server Components. | No editor, Puck runtime, or CSS. |

Import the stylesheet once from a client entry: `import "puck-mjml/style.css";`.

## Exports

| Export                                                                                                                                                                                                                     | `puck-mjml` | `puck-mjml/core` | Source                                                                                                                                                                           |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------: | :--------------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EmailEditor`, `EmailEditorProps`                                                                                                                                                                                          |     Yes     |        No        | [EmailEditor.tsx](https://github.com/n3crosis/puck-mjml/blob/main/src/EmailEditor.tsx), [editor-types.ts](https://github.com/n3crosis/puck-mjml/blob/main/src/editor-types.ts)   |
| `createEmailConfig`, `emailFieldTypes`                                                                                                                                                                                     |     Yes     |        No        | [config.tsx](https://github.com/n3crosis/puck-mjml/blob/main/src/config.tsx), [editor-field-types.ts](https://github.com/n3crosis/puck-mjml/blob/main/src/editor-field-types.ts) |
| `createNativeDragPreview`, `NativeDragPreviewProvider`, `NativeDragPreview`                                                                                                                                                |     Yes     |        No        | [native-drag-preview.tsx](https://github.com/n3crosis/puck-mjml/blob/main/src/native-drag-preview.tsx)                                                                           |
| `emailTemplates`, `EmailTemplateDefinition`                                                                                                                                                                                |     Yes     |        No        | [templates/registry.ts](https://github.com/n3crosis/puck-mjml/blob/main/src/templates/registry.ts)                                                                               |
| `createEmptyDocument`, `createExampleDocument`                                                                                                                                                                             |     Yes     |       Yes        | [document.ts](https://github.com/n3crosis/puck-mjml/blob/main/src/document.ts)                                                                                                   |
| `fromMjml`, `ImportedEmail`, `ImportOptions`                                                                                                                                                                               |     Yes     |       Yes        | [import.ts](https://github.com/n3crosis/puck-mjml/blob/main/src/import.ts)                                                                                                       |
| `toMjml`, `compileEmail`                                                                                                                                                                                                   |     Yes     |       Yes        | [export.ts](https://github.com/n3crosis/puck-mjml/blob/main/src/export.ts)                                                                                                       |
| `resolveMjmlIncludes`                                                                                                                                                                                                      |     Yes     |       Yes        | [includes.ts](https://github.com/n3crosis/puck-mjml/blob/main/src/includes.ts)                                                                                                   |
| `expandMjmlComponents`, `MjmlComponentAdapter`                                                                                                                                                                             |     Yes     |       Yes        | [custom-components.ts](https://github.com/n3crosis/puck-mjml/blob/main/src/custom-components.ts)                                                                                 |
| Model types (`EmailDocument`, `EmailBlock`, `EmailSettings`, `ExportOptions`, `CompiledEmail`, `CompileError`, `MjmlAttribute`, `MjmlElementOptions`, `MjmlEndingContent`, `MjmlComponentDefaults`, `MjmlClassDefinition`) |     Yes     |       Yes        | [types.ts](https://github.com/n3crosis/puck-mjml/blob/main/src/types.ts)                                                                                                         |

## Editor

### `EmailEditor(props: EmailEditorProps)`

A controlled Puck editor. See the [README](../README.md#editor-props) for the prop table and the [editor guide](EDITOR_GUIDE.md) for behavior.

```ts
interface EmailEditorProps {
  value: EmailDocument;
  onChange: (value: EmailDocument) => void;
  onPublish?: (value: EmailDocument) => void | Promise<void>;
  onUploadImage?: (file: File) => Promise<string>;
  allowLocalImages?: boolean;
  allowRawHtml?: boolean;
  tailwindRuntime?: true | string;
  headerTitle?: string;
  headerActions?: ReactNode;
  plugins?: Plugin[]; // from @puckeditor/core
  className?: string;
}
```

### `createEmailConfig(onUploadImage?, allowRawHtml = false, allowLocalImages = false): Config`

Returns the Puck `Config` with every email block. Use it with `<Puck>` or read-only `<Render>` in a custom host, together with `overrides={{ fieldTypes: emailFieldTypes }}` to keep read-only field enforcement. See [Advanced Puck hosts](EDITOR_GUIDE.md#advanced-puck-hosts-and-read-only-fields) and the native-layout example in the README.

### `createNativeDragPreview()` and `NativeDragPreviewProvider`

An optional bridge that gives inline native rows flex geometry during pointer drags in a custom `<Puck>` host. Create one per editor, pass `bridge.onAction` to Puck's `onAction`, and call `bridge.reset()` before replacing or unmounting the editor. See the README's [custom hosts section](../README.md#custom-puck-hosts-and-native-layout).

### `emailTemplates: readonly EmailTemplateDefinition[]`

The demo registry: a blank email followed by the 62 canonical MJML templates. Each entry has `id`, `group`, `label`, and `create(): EmailDocument`. Template entries also have `source`, `sourcePath`, and `upstreamUrl`; the blank entry does not.

## Documents

An `EmailDocument` is Puck JSON. Top-level sections and wrappers live in `root.props.sections`; the top-level `content` array must stay empty. `createEmptyDocument()` returns a fresh blank document; `createExampleDocument()` returns a sample product-update document.

## Conversion

### `fromMjml(source: string, options?: ImportOptions): ImportedEmail`

Parses MJML into `{ document, warnings }`. `warnings` lists content the model cannot represent. Throws when the source has no `<mjml>` root or no `<mj-body>`. Markup nested more than 512 elements deep, including HTML inside ending tags, also throws instead of exhausting the call stack. `ImportOptions.allowLocalImages` keeps bounded raster data URLs in `mj-image src`; it is off by default.

### `toMjml(document: EmailDocument, options?: ExportOptions): string`

Serializes a document to MJML. `ExportOptions` has two opt-ins, both off by default:

- `allowRawHtml`: required to export Raw blocks, trusted ending-tag HTML, raw head, and file-start content.
- `allowLocalImages`: allows bounded PNG/JPEG/GIF/WebP data URLs in image sources.

It throws descriptive errors instead of emitting invalid MJML, for example:

| Input                                    | Error message                                      |
| ---------------------------------------- | -------------------------------------------------- |
| `content` is present but is not an array | `Email document content must be an array`          |
| Blocks in the top-level `content` array  | `Email blocks must be placed in the sections slot` |
| A Raw block without `allowRawHtml: true` | `Raw HTML requires allowRawHtml: true`             |
| A content block directly in `sections`   | `Top-level blocks must be Sections; received …`    |

A missing `content` property counts as an empty array.

### `compileEmail(document: EmailDocument, options?: ExportOptions): Promise<CompiledEmail>`

Runs `toMjml` and compiles the result with `mjml-browser` at soft validation. Resolves to `{ mjml, html, errors }`; each `CompileError` has `message` and optional `line` and `tagName`. Serialization errors from `toMjml` reject the promise.

```ts
import { compileEmail, fromMjml, toMjml } from "puck-mjml/core";

const { document, warnings } = fromMjml(
  "<mjml><mj-body><mj-section><mj-column><mj-text>Hello</mj-text></mj-column></mj-section></mj-body></mjml>",
);
const mjml = toMjml(document);
const { html, errors } = await compileEmail(document);
```

## Preprocessing

Both functions return MJML source for `fromMjml`. Neither reads files or URLs, and the normal import and export safety rules still apply to their output. Full limits are in [MJML compatibility](MJML_COMPATIBILITY.md#includes-supplied-by-the-host).

### `resolveMjmlIncludes(source, files, sourcePath = "index.mjml"): string`

Expands `<mj-include>` from an explicit map of relative POSIX paths to file contents. MJML fragments are inserted in place; included heads and `type="css"` files go into the root `mj-head`; `type="html"` files become `mj-raw`, which still needs `allowRawHtml` to export. Missing files, duplicate paths, cycles, paths that escape the map, URLs, and unknown types throw. CSS and HTML files that contain any MJML closing tag, such as `</mj-head>` or `</mj-column>`, also throw, so a file cannot add MJML structure outside its `mj-style` or `mj-raw` wrapper.

Includes inside comments or inside the content of any compiler ending tag (`mj-text`, `mj-button`, `mj-table`, `mj-raw`, `mj-carousel-image`, and the others marked `endingTag` in [the native catalog](https://github.com/n3crosis/puck-mjml/blob/main/src/native-catalog.json)) are left as written, as MJML's own parser does.

```ts
import { fromMjml, resolveMjmlIncludes } from "puck-mjml/core";

const source = resolveMjmlIncludes(
  '<mjml><mj-body><mj-include path="partials/footer.mjml"/><mj-include path="styles/email.css" type="css"/></mj-body></mjml>',
  {
    "partials/footer.mjml":
      "<mj-section><mj-column><mj-text>Footer</mj-text></mj-column></mj-section>",
    "styles/email.css": ".footer { color: #666; }",
  },
);
const { document } = fromMjml(source);
```

### `expandMjmlComponents(source, adapters): string`

Replaces registered custom tags with the standard MJML returned by host adapters. An adapter receives `{ attributes, content }` and must return a string. Names must be lowercase and hyphenated, and cannot be standard MJML tags; otherwise it throws `Invalid custom MJML component`. Custom tags inside `mj-attributes` are rejected, and unknown tags are left for `fromMjml` to report.

```ts
import { expandMjmlComponents, fromMjml } from "puck-mjml/core";

const expanded = expandMjmlComponents(source, {
  "brand-spacer": () => '<mj-spacer height="24px" />',
});
const { document, warnings } = fromMjml(expanded);
```

## Blocks and their MJML output

Block `type` names as they appear in the document and in `createEmailConfig()`, with the tags `toMjml` writes for them. Allowed parents come from the slot `allow` lists in `config.tsx`; `toMjml` rejects other placements. `sections` means `root.props.sections`.

| Block type                         | Palette group     | MJML output                                                                            | Allowed parent                                                    |
| ---------------------------------- | ----------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `Section1`, `Section2`, `Section3` | Layout            | `mj-section` with 1, 2, or 3 `mj-column` slots                                         | `sections`, `Wrapper`                                             |
| `Section`                          | Layout            | `mj-section` holding `Column`, `Group`, or `Raw` children                              | `sections`, `Wrapper`                                             |
| `Column`                           | Layout            | `mj-column`                                                                            | `Section`, `Group`                                                |
| `Group`                            | Layout            | `mj-group`                                                                             | `Section`                                                         |
| `Wrapper`                          | Layout            | `mj-wrapper`                                                                           | `sections`                                                        |
| `Hero`                             | Layout            | `mj-hero`                                                                              | `sections`, `Wrapper`                                             |
| `IntrinsicRow`, `IntrinsicCell`    | Layout            | Content-sized rows inside an `mj-table`; see [intrinsic layouts](INTRINSIC_LAYOUTS.md) | Row: column or hero content, or a cell. Cell: a row               |
| `Text`                             | Content           | `mj-text`                                                                              | Column or hero content                                            |
| `Image`                            | Content           | `mj-image`                                                                             | Column or hero content                                            |
| `Button`                           | Content           | `mj-button`                                                                            | Column or hero content                                            |
| `Spacer`                           | Content           | `mj-spacer`                                                                            | Column or hero content                                            |
| `Divider`                          | Content           | `mj-divider`                                                                           | Column or hero content                                            |
| `Social`                           | Content           | `mj-social` with `mj-social-element` links                                             | Column or hero content                                            |
| `Navbar`                           | Content           | `mj-navbar` with `mj-navbar-link` links                                                | Column or hero content                                            |
| `Table`                            | Content           | `mj-table`                                                                             | Column or hero content                                            |
| `Accordion`                        | Content           | `mj-accordion` with `mj-accordion-element`, `-title`, and `-text`                      | Column or hero content                                            |
| `Carousel`                         | Content           | `mj-carousel` with `mj-carousel-image`                                                 | Column or hero content                                            |
| `Raw`                              | Advanced (opt-in) | `mj-raw`; needs `allowRawHtml` in the editor and on export                             | `sections`, `Wrapper`, `Section`, `Group`, column or hero content |

Supported attributes and canvas behavior per tag are in [MJML compatibility](MJML_COMPATIBILITY.md) and the [native attribute reference](NATIVE_ATTRIBUTES.md).
