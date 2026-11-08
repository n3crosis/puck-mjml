# Puck MJML

A visual drag and drop editor for responsive email, built with [Puck](https://github.com/puckeditor/puck) and [MJML](https://github.com/mjmlio/mjml). Edit a host-controlled JSON document, import supported MJML, and export MJML or email HTML.

- Build layouts with sections, columns, groups, wrappers, and heroes.
- Edit text, images, buttons, tables, social links, navigation, accordions, and carousels.
- Preview desktop and mobile email, with native MJML attributes, classes, custom CSS, and web fonts.
- Review HTML or MJML source and download either from the built-in Export dialog.
- Inspect the current email in the Compatibility sidebar tab beside Blocks and Outline, with local Can I email support data and client-specific caveats.
- Keep persistence, image uploads, and publishing in your host application.

## Run the demo

[Open the live demo](https://n3crosis.github.io/puck-mjml/). GitHub Actions checks and builds the project before publishing it to GitHub Pages. Drafts stay in the browser session and are not saved.

Use the Bun version specified in `package.json`:

```sh
bun install
bun run dev
```

Open the Vite URL. The demo starts with the Collage product update, adapted from React Email's Matte template. The template picker includes a blank email and all 62 React Email examples: Barebone, Matte, Protocol, Arcane, Studio, and Community. Each example is a standalone, editable `.mjml` source in [`templates/`](templates/README.md), not a TypeScript email component. Click Import to paste and edit MJML, choose a local `.mjml` file, or drop source text or a file into the dialog. Choosing or dropping a file imports it immediately; pasted source stays editable until you click Import text. Successful imports close the dialog; errors remain available for correction. Files take precedence when a drag contains both. Download MJML or HTML to keep your work; drafts are not saved. The demo warns before replacing edited content or leaving the page. Imported documents are checked before replacement and rejected if they need trusted HTML or cannot be safely exported. All import notes remain accessible. Example images and web fonts require network access.

## Use in a host app

Once the package is published to your registry, install it and its peer dependencies:

```sh
bun add puck-mjml @puckeditor/core react react-dom
```

For TypeScript hosts, also install `typescript`, `@types/react`, `@types/react-dom`, and `@types/node`. Puck 0.24's editor declarations reference Node types even in browser projects; include `node` if your `tsconfig.json` restricts `compilerOptions.types` and checks dependency declarations. The conversion-only `puck-mjml/core` declarations do not require React, Puck, or browser types.

For local package development and build outputs, see [Development](docs/DEVELOPMENT.md).

Import the bundled CSS once and pass a document and update callback:

```tsx
"use client"; // Required when using a React Server Components framework.

import { useState } from "react";
import { EmailEditor, createEmptyDocument, type EmailDocument } from "puck-mjml";
import "puck-mjml/style.css";

export function MyEmailEditor() {
  const [document, setDocument] = useState<EmailDocument>(() => createEmptyDocument());

  return <EmailEditor value={document} onChange={setDocument} />;
}
```

The host owns persistence. Replacing `value` with a different document resets undo history; ordinary `onChange` echoes preserve it. Layouts live in `root.props.sections`, and the top-level `content` array stays empty.

### Editor props

| Prop                  | Purpose                                                                                      |
| --------------------- | -------------------------------------------------------------------------------------------- |
| `value`               | Current `EmailDocument` (required).                                                          |
| `onChange(document)`  | Receives document edits (required).                                                          |
| `onPublish(document)` | Optional host publishing callback; may return a promise.                                     |
| `onUploadImage(file)` | Host-owned upload callback; resolves to a public HTTP(S) image URL.                          |
| `headerTitle`         | Header branding; defaults to `"Puck MJML"`.                                                  |
| `headerActions`       | Host controls beside preview and history controls.                                           |
| `plugins`             | Public Puck plugin additions and overrides by name; keep array and render identities stable. |
| `allowLocalImages`    | Opt-in for bounded embedded raster images; off by default.                                   |
| `allowRawHtml`        | Enables trusted HTML and template source controls.                                           |
| `tailwindRuntime`     | Host opt-in: `true` for the pinned runtime or a trusted HTTP(S) script URL.                  |
| `className`           | Additional editor wrapper class.                                                             |

See [Image uploads](docs/IMAGE_UPLOADS.md) for provider-independent host wiring, validation, and the demo’s local-only embedded images. Local demo assets are not hosted; many email clients block them.

### Custom Puck hosts and native layout

`EmailEditor` automatically uses MJML's inline alignment for native columns. Read-only `<Render config={createEmailConfig()} ... />` also uses inline layout without extra setup.

A custom editable `<Puck>` host keeps the previous flex-column preview unless it opts into the public drag-preview bridge. Puck 0.24's insertion markers understand flex/grid geometry, so the bridge temporarily uses flex during a drag and restores inline layout when Puck finishes the drop or cancellation. Mixed vertical alignments may shift during the drag preview; final document geometry is unchanged. Active Section hit areas extend 8px around their content so a parent insertion edge remains reachable beside a nested Group. Equal padding and negative margins preserve the content width and surrounding layout; Group rows and read-only previews do not receive this hit area. The bridge is per editor and does not use global iframe queries or bypass drag permissions.

```tsx
import { useEffect, useMemo } from "react";
import { Puck } from "@puckeditor/core";
import { createEmailConfig, createNativeDragPreview, NativeDragPreviewProvider } from "puck-mjml";

function CustomEditor({ document, onChange }) {
  const config = useMemo(() => createEmailConfig(), []);
  const bridge = useMemo(createNativeDragPreview, []);
  useEffect(() => () => bridge.reset(), [bridge]);
  return (
    <NativeDragPreviewProvider bridge={bridge}>
      <Puck config={config} data={document} onChange={onChange} onAction={bridge.onAction} />
    </NativeDragPreviewProvider>
  );
}
```

Keep one bridge per editor. If a host already handles `onAction`, call `bridge.onAction(action, newState)` synchronously from that callback. Call `bridge.reset()` before replacing the editor instance/source during a drag. Row orientation is sampled at drag start; changing the viewport or column widths during an active drag is not supported. Bridge state is isolated, but it does not fix Puck 0.24's upstream global pointer/iframe lookup limitations when multiple editors share a page. Mounted read-only Render previews remain inline even inside the provider. The bridge belongs to the browser package entry; `puck-mjml/core` remains independent of React and Puck.

### Import and export

Every `EmailEditor` includes **Export** beside **Preview**. Switch between read-only HTML and MJML source, then download `email.html` or `email.mjml`. HTML uses the actual MJML compiler, with loading, validation warnings, and retryable compilation errors; MJML can be downloaded while HTML compiles. Export runs locally, uses the editor's trust options, and does not publish, save, or change your document or undo history. Host `headerActions` remain available for other controls.

```ts
import { compileEmail, fromMjml, toMjml } from "puck-mjml/core";

const { document, warnings } = fromMjml(source);
const mjml = toMjml(document);
const { html, errors } = await compileEmail(document);
```

`puck-mjml/core` contains conversion functions, document factories, and types without loading the editor, Puck runtime, or CSS. Use it in Node or React Server Components; the package root remains the browser editor API.

`source` is an MJML string supplied by the host. Check import `warnings` for content the model cannot represent and compilation `errors` for MJML validation warnings. Export rejects invalid nesting, malformed settings, and invalid URLs. Import covers modeled standard components; arbitrary MJML is not guaranteed to round-trip without loss.

`createEmptyDocument()` and `createExampleDocument()` return fresh documents. `emailTemplates` exposes the demo registry; each entry has `id`, `group`, `label`, and a `create()` factory. Migrated examples also expose their canonical `source`, `sourcePath`, and pinned `upstreamUrl`. Public TypeScript types are exported from the package root.

Trusted raw HTML and template attributes require `allowRawHtml` on the editor and `{ allowRawHtml: true }` on each export call. See the [trusted HTML guide](docs/EDITOR_GUIDE.md#trusted-raw-html) before using this mode.

## Documentation

- [Editor guide](docs/EDITOR_GUIDE.md): documents, controls, import, tables, CSS, fonts, Tailwind, and trusted HTML.
- [Native attribute reference](docs/NATIVE_ATTRIBUTES.md): schemas, inheritance, precedence, templates, and examples.
- [MJML compatibility](docs/MJML_COMPATIBILITY.md): supported components, canvas behavior, and limitations.
- [Email client compatibility](docs/EMAIL_CLIENT_COMPATIBILITY.md): Can I email checks, support data, and limits of static analysis.
- [Development](docs/DEVELOPMENT.md): checks, builds, source map, and compiler maintenance.
- [MJML example suite](templates/README.md): all 62 canonical sources, upstream provenance, and validation.

See [the project review](docs/PROJECT_REVIEW.md) for findings, verification scope, and remaining limitations. See [deployment](docs/DEVELOPMENT.md#github-actions-and-pages) for the demo publishing workflow.

## License

[MIT](LICENSE). See [third-party notices](THIRD_PARTY_NOTICES.md) for bundled dependencies and React Email template attribution.
