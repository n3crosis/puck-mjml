# Puck MJML

A visual drag and drop editor for responsive email, built with [Puck](https://github.com/puckeditor/puck) and [MJML](https://github.com/mjmlio/mjml). Edit a host-controlled JSON document, import supported MJML, and export MJML or email HTML.

- Build layouts with sections, columns, groups, wrappers, and heroes.
- Edit text, images, buttons, tables, social links, navigation, accordions, and carousels.
- Preview desktop and mobile email, with native MJML attributes, classes, custom CSS, and web fonts.
- Keep persistence, image uploads, and publishing in your host application.

## Run the demo

Use the Bun version specified in `package.json`:

```sh
bun install
bun run dev
```

Open the Vite URL. The demo starts with the Collage product update, adapted from React Email's Matte template. The template picker includes a blank email and the Matte and Protocol families. You can import a local `.mjml` file and download MJML or HTML. Drafts are not saved; example images and web fonts require network access.

## Use in a host app

Once the package is published to your registry, install it and its peer dependencies:

```sh
bun add puck-mjml @puckeditor/core react react-dom
```

For local package development and build outputs, see [Development](docs/DEVELOPMENT.md).

Import the bundled CSS once and pass a document and update callback:

```tsx
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

| Prop                  | Purpose                                                      |
| --------------------- | ------------------------------------------------------------ |
| `value`               | Current `EmailDocument` (required).                          |
| `onChange(document)`  | Receives document edits (required).                          |
| `onPublish(document)` | Optional host publishing callback; may return a promise.     |
| `onUploadImage(file)` | Enables uploads; must resolve to a public HTTP(S) image URL. |
| `headerTitle`         | Header branding; defaults to `"Puck MJML"`.                  |
| `headerActions`       | Host controls beside preview and history controls.           |
| `allowRawHtml`        | Enables trusted HTML and template source controls.           |
| `className`           | Additional editor wrapper class.                             |

### Import and export

```ts
import { compileEmail, fromMjml, toMjml } from "puck-mjml";

const { document, warnings } = fromMjml(source);
const mjml = toMjml(document);
const { html, errors } = await compileEmail(document);
```

`source` is an MJML string supplied by the host. Check import `warnings` for content the model cannot represent and compilation `errors` for MJML validation warnings. Export rejects invalid nesting, malformed settings, and invalid URLs. Import covers modeled standard components; arbitrary MJML is not guaranteed to round-trip without loss.

`createEmptyDocument()` and `createExampleDocument()` return fresh documents. `emailTemplates` exposes the demo registry; each entry has `id`, `group`, `label`, and a `create()` factory. Public TypeScript types are exported from the package root.

Trusted raw HTML and template attributes require `allowRawHtml` on the editor and `{ allowRawHtml: true }` on each export call. See the [trusted HTML guide](docs/EDITOR_GUIDE.md#trusted-raw-html) before using this mode.

## Documentation

- [Editor guide](docs/EDITOR_GUIDE.md): documents, controls, import, tables, CSS, fonts, Tailwind, and trusted HTML.
- [Native attribute reference](docs/NATIVE_ATTRIBUTES.md): schemas, inheritance, precedence, templates, and examples.
- [MJML compatibility](docs/MJML_COMPATIBILITY.md): supported components, canvas behavior, and limitations.
- [Development](docs/DEVELOPMENT.md): checks, builds, source map, and compiler maintenance.

## License

[MIT](LICENSE). See [third-party notices](THIRD_PARTY_NOTICES.md) for bundled dependencies and React Email template attribution.
