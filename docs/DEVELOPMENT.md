# Development

## Setup and commands

Use Bun, with the version specified by `packageManager` in [package.json](../package.json). Install from the checked-in lockfile:

```sh
bun install --frozen-lockfile
bun run dev
```

| Command              | Purpose                                                                   |
| -------------------- | ------------------------------------------------------------------------- |
| `bun run dev`        | Start the Vite demo.                                                      |
| `bun run check`      | Check formatting, lint, types, and run the test suite.                    |
| `bun run format`     | Format the project with oxfmt.                                            |
| `bun run build`      | Build library JavaScript, CSS, and TypeScript declarations into `dist/`.  |
| `bun run build:demo` | Build the standalone demo into `demo-dist/`.                              |
| `bun run catalog`    | Regenerate the native attribute catalog from the installed MJML compiler. |

`node_modules/`, `dist/`, and `demo-dist/` are ignored by Git. Library output includes ESM (`dist/index.js`), CommonJS (`dist/index.cjs`), declarations (`dist/index.d.ts`), and `dist/style.css`. The package includes the built library, documentation, license, and third-party notices; build before packaging.

To try the package in another local project, run `bun run build` and `bun pm pack` here, then install the resulting tarball in the host application. The host must also supply the peer dependencies listed in `package.json`.

## Source map

| Path                                                                                       | Responsibility                                                  |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| [src/index.ts](../src/index.ts)                                                            | Public exports.                                                 |
| [src/types.ts](../src/types.ts)                                                            | Document model, editor props, and API types.                    |
| [src/EmailEditor.tsx](../src/EmailEditor.tsx)                                              | Controlled Puck editor and host callbacks.                      |
| [src/EmailCanvas.tsx](../src/EmailCanvas.tsx)                                              | Editing canvas, scoped styles, fonts, and Tailwind integration. |
| [src/config.tsx](../src/config.tsx)                                                        | Visual blocks and field definitions.                            |
| [src/export.ts](../src/export.ts)                                                          | MJML serialization and browser compilation.                     |
| [src/import.ts](../src/import.ts)                                                          | MJML import and unsupported-content warnings.                   |
| [src/native-catalog.json](../src/native-catalog.json)                                      | Generated compiler attributes, defaults, and provenance.        |
| [src/canvas-css.ts](../src/canvas-css.ts), [src/canvas-fonts.tsx](../src/canvas-fonts.tsx) | Per-editor CSS scoping and web font aliases.                    |
| [src/templates/registry.ts](../src/templates/registry.ts)                                  | Demo template registry and remaining template-family TODOs.     |
| [demo/main.tsx](../demo/main.tsx)                                                          | Demo template picker, file import, and downloads.               |

## Validation

Run these before publishing or changing compiler behavior:

```sh
bun run check
bun run build
bun run build:demo
```

Tests cover compilation, server rendering, and detached DOM interactions. Keep controlled-editor focus/caret continuity, undo/redo, read-only fields, table structure/resizing (including RTL), and overlay placement covered when changing those interactions. A stable Puck plugin list prevents controlled updates from remounting inline editors.

For API or bundling changes, also smoke-test the packaged ESM and CommonJS exports. Browser testing has not been part of the existing verification workflow; Tailwind runtime behavior and real email-client rendering require separate validation. Prior passing test counts are not a guarantee for the current checkout.

## Updating MJML

The current catalog records `mjml-browser` 5.4.1: 31 components, including 23 body components, with 394 declared attributes (390 on body components). Shared `mj-class` and `css-class` attributes are additional. Catalog provenance is recorded in `src/native-catalog.json`.

When updating the compiler:

1. Update the dependency and Bun lockfile. `cheerio` is a direct dependency because the MJML 5 browser bundle requires it externally.
2. Run `bun run catalog`. The script extracts component statics and checks `mj-wrapper`'s composed attribute set by compiling candidates. Review component kinds, allowed children, and color keywords manually if the registered component set changes.
3. Review the generated diff and update pinned expectations in `src/native-attributes.test.ts` and `src/native-coverage.test.ts`.
4. Update [compatibility](MJML_COMPATIBILITY.md), the [attribute reference](NATIVE_ATTRIBUTES.md), and any affected [third-party notices](../THIRD_PARTY_NOTICES.md).
5. Run the validation commands and packaged export smoke tests.

Attribute acceptance establishes compiler coverage, not complete canvas or email-client parity.

## Design constraints and follow-up work

Keep the editor host-controlled, with no internal draft persistence. Preserve inline editing, undo/redo, the single Puck header, and host-owned actions. Subject metadata remains supported in export without a dedicated subject control in the editor header.

The [compatibility matrix](MJML_COMPATIBILITY.md) tracks rendering limitations. Further work includes specialized native canvas behavior and a host compilation path for filesystem includes or custom MJML components. The template registry tracks unfinished template families separately. Update the relevant reference when adding capabilities; do not infer full compatibility from catalog counts.
