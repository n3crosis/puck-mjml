# Changelog

The package is unreleased (version `0.1.0` in `package.json`). This file records notable changes on `main`.

## Unreleased

### Fixed

- Rich-text inventory checks run separately for each template and release their editor instances between cases, retaining full anchor and source-preservation coverage.

- Functional test budgets allow 30 seconds for editor/compiler unit cases and 60 seconds for multi-step browser flows on shared runners. Assertions and browser assertion deadlines are unchanged.

- Modal focus test cleanup restores spies even after a timeout, preventing one interrupted test from corrupting subsequent dialog checks.

- Browser import checks wait for the editor header before deciding whether to open its responsive menu, preventing a startup race on slower machines.

- Include preprocessing now rejects excessive element nesting with a bounded error before recursive traversal exhausts the call stack. Opaque ending-tag content remains unchanged.

- Catalog regeneration now formats its output so an unchanged compiler does not leave a formatting-only diff.

- Type checking and linting now cover the TypeScript build and maintenance scripts. Fixed catalog indexing and the compiler window shim types in the catalog generator.

- `resolveMjmlIncludes` now takes its ending-tag list from the native MJML catalog instead of a hand-written list. The old list missed `mj-carousel-image` and `mj-breakpoint`, so an `<mj-include>` inside their content was expanded when MJML's own parser would leave it as written. ([0b84956](https://github.com/n3crosis/puck-mjml/commit/0b84956))
- `toMjml` and `compileEmail` no longer throw a `TypeError` when a document has no top-level `content` property; it is treated as an empty array. A non-array `content` now fails with `Email document content must be an array`. ([4c837d1](https://github.com/n3crosis/puck-mjml/commit/4c837d1))

### Changed

- Package dependencies now follow Puck. The shared Tiptap packages (`@tiptap/core`, `@tiptap/extension-bold`, `@tiptap/extension-link`) use Puck's `^3.30.4` range instead of an exact `3.32.0` pin, so npm installs one copy shared with `@puckeditor/core`. `@tiptap/core` is now a runtime dependency because the published declarations import its types. `happy-dom` uses Puck's `^21.0.4` range, and the `overrides` entry that pinned it is gone.
- Packages bundled into `dist` (CodeMirror, Lezer, `@noble/hashes`, Phosphor icons, `cheerio`, `mjml-browser`, `postcss`, `sanitize-html`) moved to `devDependencies`, so consumers no longer install about 65 MB of code they never load.
- `package.json` now declares `engines.node` `>=20.0.0` (matching Puck) and `sideEffects: ["**/*.css"]`, and `CHANGELOG.md` is included in the package.
- Added `bun run test:package:peers`, which installs the packed tarball from the registry with React 18 and with React 19, checks that Tiptap is shared with Puck, and runs the rich-text runtime check in ESM and CommonJS. CI runs it after `test:package`.
- Packaged docs now link to source files on GitHub instead of relative paths that are not in the npm package.
- `bun run typecheck` and `bun run lint` now cover the whole `tests/` directory, not only `tests/browser`. This fixed type errors that had gone unnoticed in `tests/template-overflow.test.ts`. ([1eedb92](https://github.com/n3crosis/puck-mjml/commit/1eedb92))
- Removed an unused variable from `scripts/regenerate-native-catalog.ts`. ([1d6ed93](https://github.com/n3crosis/puck-mjml/commit/1d6ed93))
- Removed `intro-inspect.ts`, an unused debug script at the repository root. ([716c66b](https://github.com/n3crosis/puck-mjml/commit/716c66b))

### Documentation

- Added the [API reference](docs/API.md), with every public export, the block-to-MJML mapping, and conversion and preprocessing examples, and this changelog.

## Known follow-ups (not yet implemented)

These were found during review and are **not** done. They are recorded here so they are not mistaken for current behavior.

- **Reduce the demo bundle.** `bun run build:demo` warns about large chunks. Loading the editor and the `mjml-browser` compiler on demand would shrink the first load.
- **Split large modules.** `src/import.ts` and `src/config.tsx` are each well over 1,000 lines and could be split by concern.
