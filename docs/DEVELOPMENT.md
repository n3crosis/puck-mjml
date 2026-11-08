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

`node_modules/`, `dist/`, and `demo-dist/` are ignored by Git. Library output includes ESM (`dist/index.js`), CommonJS (`dist/index.cjs`), declarations (`dist/index.d.ts`), conversion-only `dist/core.js` / `dist/core.cjs` / `dist/core.d.ts`, and `dist/style.css`. The package includes the built library, all canonical MJML templates and their provenance, documentation, license, and third-party notices; build before packaging.

To try the package in another local project, run `bun run build` and `bun pm pack` here, then install the resulting tarball in the host application. The host must also supply the peer dependencies listed in `package.json`.

## Source map

| Path                                                                                                                                                                                 | Responsibility                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| [src/index.ts](https://github.com/n3crosis/puck-mjml/blob/main/src/index.ts)                                                                                                         | Public exports.                                                 |
| [src/types.ts](https://github.com/n3crosis/puck-mjml/blob/main/src/types.ts)                                                                                                         | Document model, editor props, and API types.                    |
| [src/EmailEditor.tsx](https://github.com/n3crosis/puck-mjml/blob/main/src/EmailEditor.tsx)                                                                                           | Controlled Puck editor and host callbacks.                      |
| [src/EmailCanvas.tsx](https://github.com/n3crosis/puck-mjml/blob/main/src/EmailCanvas.tsx)                                                                                           | Editing canvas, scoped styles, fonts, and Tailwind integration. |
| [src/config.tsx](https://github.com/n3crosis/puck-mjml/blob/main/src/config.tsx)                                                                                                     | Visual blocks and field definitions.                            |
| [src/export.ts](https://github.com/n3crosis/puck-mjml/blob/main/src/export.ts)                                                                                                       | MJML serialization and browser compilation.                     |
| [src/import.ts](https://github.com/n3crosis/puck-mjml/blob/main/src/import.ts)                                                                                                       | MJML import and unsupported-content warnings.                   |
| [src/native-catalog.json](https://github.com/n3crosis/puck-mjml/blob/main/src/native-catalog.json)                                                                                   | Generated compiler attributes, defaults, and provenance.        |
| [src/canvas-css.ts](https://github.com/n3crosis/puck-mjml/blob/main/src/canvas-css.ts), [src/canvas-fonts.tsx](https://github.com/n3crosis/puck-mjml/blob/main/src/canvas-fonts.tsx) | Per-editor CSS scoping and web font aliases.                    |
| [src/templates/registry.ts](https://github.com/n3crosis/puck-mjml/blob/main/src/templates/registry.ts)                                                                               | Demo registry loading all 62 canonical MJML examples.           |
| [demo/main.tsx](https://github.com/n3crosis/puck-mjml/blob/main/demo/main.tsx)                                                                                                       | Demo template picker, file import, and downloads.               |

## Validation

Run these before publishing or changing compiler behavior:

```sh
bun run check
bun run build
bun run build:demo
```

Tests cover compilation, server rendering, and detached DOM interactions. Keep controlled-editor focus/caret continuity, undo/redo, read-only fields, table structure/resizing (including RTL), and overlay placement covered when changing those interactions. A stable Puck plugin list prevents controlled updates from remounting inline editors.

For API or bundling changes, run `bun run test:package` after building. It checks the generated ESM and CommonJS APIs, the paired custom-editor exports, all 62 template factories and their source metadata, HTML compilation, and the `puck-mjml/core` entry under React Server Components resolution. Run `bun run test:browser` for Chromium editor interactions, CSS authoring, responsive layouts, and every template through the actual picker and compiled preview. All 62 templates produce desktop/mobile original React Email, compiled MJML, and real editor-canvas screenshots (372 total), HTML pairs, and `comparison.json` layout/style/resource metadata. Original HTML is generated into ignored `.cache/react-email-reference/` from pinned upstream source with the separately locked [reference renderer](../scripts/render-react-email-references/README.md), then hash-verified against the committed [provenance manifest](../tests/fixtures/react-email-reference/README.md). `bun run test` and `bun run test:browser` prepare references automatically; `bun run references:prepare` prepares them for direct Vitest/Playwright runs. A cold cache needs network access; subsequent verified-cache runs are offline. CI keeps these artifacts in six `email-comparison-*` family archives; non-template interactions remain in `browser-results`. The reference tool has isolated dependencies and a source cache, excluded from the main test runner. Install its browser once with `bunx playwright install chromium`; a local Chromium can be selected with `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`. These tests do not establish real email-client parity. Prior passing test counts are not a guarantee for the current checkout.

### Template resource and geometry evidence

Wait for the live canvas's imported font CSS to settle with `waitForCanvasFontCss` before waiting for font registrations and `document.fonts.ready`. A custom static face can register before a delayed variable stylesheet, and built-in MJML families may be discovered after the first render. Neither an existing face nor an early `fonts.ready` resolution proves that the current document is ready. The runtime observer and browser helper share the same inline-family fingerprint: a child-only font edit or removal must be observed before an earlier ready/error state can apply to the new DOM. Nested canvases are measured separately. The helper rejects settled import failures; keep transport errors and original-reference resource failures visible in the comparison evidence.

Only imported families and retained head `@font-face` registrations receive canvas aliases. Head-only system fallback stacks remain unchanged and do not trigger MJML default imports; inline family edits still discover and retire those imports. Thirteen Community examples preserve their original system stacks in head-only CSS with inheriting MJML attributes, including Raycast. This preserves installed-font selection without accidental Roboto or Ubuntu downloads. Dropbox also retains its separate button stack.

Happy DOM unit tests use deterministic local font-face CSS for MJML’s five exact built-in stylesheet URLs. They exercise discovery and editor lifecycle, not binary loading or glyph metrics; Playwright retains real requests, failure evidence, and typography comparisons. Other fetches and individual test overrides are unchanged.

The font lifecycle browser fixture uses tiny original rectangle-glyph fonts, not third-party font binaries. Their reproducible generator, pinned FontTools requirement, and SHA-256 manifest are documented in `tests/browser/fixtures/fonts/README.md`. The fixture checks actual static and variable glyph advances, delayed imports, head-only faces, and multiple editors without relying on Google Fonts availability. Tested variable-font instances use integer pixel advances to avoid platform hinting ambiguity; canvas and compiled measurements are recorded before strict parity assertions.

Canvas screenshots can include intentional full-width section or wrapper backgrounds outside the centered email column. `comparison.json` keeps the email box in `metrics` and records the actual crop separately in `screenshotBounds`, with layout evidence in `canvasGeometry`. Use the crop width when scaling screenshots to equal CSS pixels. The overflow checks permit only renderer-owned top-level full-width surfaces; ordinary content still has to fit. Do not fix an overflow test by hiding scrollbars, cropping offending content, or accepting every wide descendant.

Text range geometry can include invisible hanging spaces at soft wraps, particularly in the editor's `pre-wrap` paragraphs. Overflow evidence retains the raw rectangles but checks visible word spans in collapsing/hanging whitespace modes; preserved spacing, nonbreaking spaces, real glyphs, images, and scroll overflow remain strict. Typography comparisons union visible word fragments into lines rather than counting every raw range rectangle. A line-break element separates text when matching original and compiled content, without rewriting either DOM.

### Generic comparison audit

See [the generic review contract](TEMPLATE_REVIEW.md) for the shared inventory join, hard invariants, synthetic component coverage and explicit limitations.

The inventory and reference manifests drive one workflow for every template, not a growing list of template-specific probes. At both 800px and 390px it captures the unchanged upstream render, compiled MJML, and live editable canvas, then compares all three pairs. Each `comparison.json` includes `semanticComparison` with a versioned schema, overall status, missing captures, and six pairwise reports. Existing content, resource readiness, and overflow checks remain test gates. The semantic audit reports differences rather than asserting that every port already matches.

The common browser extractor records visible text-node words, word range geometry and computed typography/decorations, ordered links, images, and painted backgrounds/borders. The shared comparator aligns words with a deterministic, case-sensitive longest common subsequence, retaining duplicate occurrences and reporting every addition/removal. Matched words report style, wrapping/position and normalized navigation-destination changes. Image occurrences retain accessible names and nearest-anchor navigation. Raw links distinguish absent from empty href; split/merged anchor wrappers remain visible separately from content navigation. Asset/link/paint inventories preserve order and duplicates. Every capture also records generic contrast evidence, including low-contrast and inconclusive surfaces. Only explicitly recorded canvas font aliases are normalized. Word geometry is quantized to Chromium's 1/64 CSS-pixel layout unit, not a relaxed visual threshold. Positions in both axes retain the matched viewport, authored margins/padding and canvas gutters, with root boxes compared separately. Fully transparent or fully clipped fragments are excluded generically; partially visible fragments keep their raw bounds. No per-template selectors, allowlists, or tolerance overrides participate.

Statuses are `differences`, `inconclusive`, and `matching-measurements`. Font/image failures, document overflow (including intentional original mobile overflow), and missing captures prevent a matching result. Inconclusive reports still retain every observed difference and its evidence. Responsive adaptations therefore remain visible rather than being called equivalent to overflowing originals. A passing browser suite means its explicit gates passed, **not** that this audit found no differences. Even `matching-measurements` is not pixel equality or email-client parity: pseudo-elements, actual glyph selection, overlapping paint, and email-client behavior need additional inspection. Different inline text-node boundaries and structurally different painted wrappers can produce differences that need manual review. Consult the full-resolution screenshots and raw capture metadata alongside the machine-readable report.

Unit tests in `tests/semantic-comparison.test.ts` cover repeated/reordered content, style and wrapping changes, aliases, asset/link/paint differences, incomplete captures, and failed-reference uncertainty. These tests validate the audit algorithm; only browser runs produce evidence about the templates.

## Dependency security

Run `bun audit` after dependency changes. This repository pins Happy DOM 21.0.4, the published patched release for [GHSA-834v-8h66-3h79](https://github.com/advisories/GHSA-834v-8h66-3h79) and [GHSA-c8p4-j97h-3vg8](https://github.com/advisories/GHSA-c8p4-j97h-3vg8). The root override covers both the test dependency and Puck's transitive dependency in this development/demo installation.

Puck 0.24.0 declares patched Happy DOM `^21.0.4` as a regular dependency; its Tiptap Node rich-text path imports it. Tiptap's browser path uses the browser DOM instead. Package-level overrides do not propagate to consuming applications: hosts must audit their own lockfile and resolve a patched Happy DOM version for their Puck installation.

## Updating Puck

The editor requires Puck 0.24. Its property inspector consumes the public `fields` map supplied to the fields override, preserving Puck's resolved visibility, permissions, and connected editors without inspecting internal React child props. The existing compact, collapsible groups remain unchanged. The selection toolbar forwards Puck's registered drag handle, enabled through `dnd.enableDragHandle`; Puck omits the handle when drag permission is denied.

`createNativeDragPreview` uses the public synchronous `onAction` callback and registered slot refs to give native inline rows flex geometry during pointer dragging. It does not inspect Puck's global dragging marker, patch its store, or override insertion indices. Keep the bridge local to one editor, exclude read-only rows, and reset it before replacing the source or unmounting. On a Puck upgrade, check whether upstream insertion markers support inline formatting before retaining this adapter. Run handle/body, palette, cross-row, RTL/mobile, authored-width, cancellation, replacement, and undo regressions in a real browser; unit dispatch tests alone do not establish pointer-drag behavior.

`ArrayFieldAccessibility` is a narrow Puck 0.24 compatibility adapter around native non-table array fields. That release uses pointer-only array drag sensors, unnamed Add icons, and clickable summaries without keyboard activation or expanded state. The adapter names Add controls and enables Enter/Space disclosure without replacing native field components or history. Its class-prefix and summary/body assumptions are scoped to each field instance, including nested and hidden copies. On a Puck upgrade, check whether upstream now supplies these semantics or keyboard drag sensors, then replace/remove the adapter as appropriate. Run the actual-Puck array accessibility tests and browser pointer-reorder regression; do not broaden the selectors into global DOM mutations.

The [0.24 release](https://github.com/puckeditor/puck/releases/tag/v0.24.0) also includes keyboard, rich-text paste, viewport, and field-transform fixes. This integration uses the published stable package, not unreleased `main` commits. It does not add Puck Cloud accounts, AI services, or experimental full-screen canvas behavior from the upstream demo. When upgrading again, run the inspector, permission, controlled-focus, overlay, and browser drag-and-drop regressions alongside the full validation commands.

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

The [compatibility matrix](MJML_COMPATIBILITY.md) tracks rendering limitations. Further work includes specialized native canvas behavior and a host compilation path for filesystem includes or custom MJML components. All 62 emails in the pinned React Email demo inventory are ported as standalone MJML; see [the template guide](../templates/README.md) for inventory and source conventions. Update the relevant reference when adding capabilities; do not infer full compatibility from catalog counts.

## GitHub Actions and Pages

`.github/workflows/ci-pages.yml` runs on pull requests, pushes to `main`, and manual dispatch. It installs Bun 1.4.2 and Node 22, installs from the frozen lockfile, audits dependencies, checks formatting/lint/types/tests, builds the library, smoke-tests the package, builds the demo, and exercises Chromium. Only successful `main` builds can deploy.

The deployment uploads `demo-dist/` as a Pages artifact and deploys it through the `github-pages` environment. Relative Vite asset URLs support repository-path hosting. Configure the repository's **Settings → Pages → Build and deployment → Source** as **GitHub Actions**. Environment protection rules may require a deployment approval. The deployment job alone receives `pages: write` and `id-token: write`; checks only need repository read permission.

Use the workflow's deployment URL as the source of truth. A workflow file alone does not mean the site is live. Verify the successful commit, deployed page, assets, template selection, import, preview, and MJML/HTML downloads before announcing a public URL. Public demo publication does not publish the npm package.

## Server and framework consumers

Use `puck-mjml/core` for `fromMjml`, `toMjml`, `compileEmail`, document factories, and model types in Node or React Server Components. Import `EmailEditor` from `puck-mjml` only inside a client component (declare `"use client"` in an RSC framework). Import the bundled CSS once in a location supported by the host framework. The existing root exports remain supported for browser and ordinary Node consumers.
