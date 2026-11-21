# Changelog

The package is unreleased (version `0.1.0` in `package.json`). This file records notable changes on `main`.

## Unreleased

### Fixed

- `resolveMjmlIncludes` now takes its ending-tag list from the native MJML catalog instead of a hand-written list. The old list missed `mj-carousel-image` and `mj-breakpoint`, so an `<mj-include>` inside their content was expanded when MJML's own parser would leave it as written. ([0b84956](https://github.com/n3crosis/puck-mjml/commit/0b84956))
- `toMjml` and `compileEmail` no longer throw a `TypeError` when a document has no top-level `content` property; it is treated as an empty array. A non-array `content` now fails with `Email document content must be an array`. ([4c837d1](https://github.com/n3crosis/puck-mjml/commit/4c837d1))

### Changed

- `bun run typecheck` and `bun run lint` now cover the whole `tests/` directory, not only `tests/browser`. This fixed type errors that had gone unnoticed in `tests/template-overflow.test.ts`. ([1eedb92](https://github.com/n3crosis/puck-mjml/commit/1eedb92))
- Removed an unused variable from `scripts/regenerate-native-catalog.ts`. ([1d6ed93](https://github.com/n3crosis/puck-mjml/commit/1d6ed93))
- Removed `intro-inspect.ts`, an unused debug script at the repository root. ([716c66b](https://github.com/n3crosis/puck-mjml/commit/716c66b))

### Documentation

- Added the [API reference](docs/API.md), with every public export, the block-to-MJML mapping, and conversion and preprocessing examples, and this changelog.

## Known follow-ups (not yet implemented)

These were found during review and are **not** done. They are recorded here so they are not mistaken for current behavior.

- **Type-check the build scripts.** `scripts/*.ts` is outside `tsconfig.json`; `scripts/regenerate-native-catalog.ts` has type errors when checked.
- **Reduce the demo bundle.** `bun run build:demo` warns about large chunks. Loading the editor and the `mjml-browser` compiler on demand would shrink the first load.
- **Split large modules.** `src/import.ts` and `src/config.tsx` are each well over 1,000 lines and could be split by concern.
- **Package metadata.** Consider `engines` (Node 22, as used by CI) and a `sideEffects` field so bundlers can tree-shake `puck-mjml/core`. Verify `sideEffects` against the built output first, because the root entry imports CSS.
- **CI confirmation.** Check that the GitHub Actions run passed for the commits above; the Playwright browser suite runs only in CI.
