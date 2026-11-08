# Generic template review

## One inventory, shared rules

`tests/template-inventory.ts` joins `templates/manifest.json` to the pinned original-render manifest in `.cache/react-email-reference/manifest.json` and the pinned semantic-content manifest. Missing, extra, duplicated, stale-revision or wrong-source-blob entries fail instead of being filtered out. Every original HTML file is checked against its recorded byte length and SHA-256. The canonical manifest schedules both unit and browser cases; adding a template requires its source and verified references, not a new test file or expected-style map.

## Hard invariants

- Registry coverage matches all canonical files and the blank document. Template factories produce independent editable documents with unique block IDs, no raw fallback, no import warnings, and clean MJML compilation.
- Direct MJML and editor import/export preserve visible content, ordered images, image styles and link destinations. Every source retains pinned preview text, content sections, artwork and required destinations.
- `src/templates/inventory-review.test.tsx` checks original heading levels/text and ordered images (including alt text and nearest navigation destination) across the entire inventory, both direct and roundtripped compilation and actual Puck DOM rendering. Authored CSS sheets remain byte-for-byte intact and in order after the exporter's prepended rich-text defaults; declared font imports remain intact.
- The same inventory case applies the shared font-family/fallback/alias rule without mutating source data. It reuses three compiled outputs (canonical source, editor export and reimported export) and one safe canvas render, rather than repeating those operations in parallel suites.
- Browser resource-readiness and port-overflow checks remain gates. Missing captures are reported. Original-resource failures and original overflow remain evidence, rather than being repaired or excluded by template name.

Static DOM checks are not computed-layout tests. The editor intentionally renders buttons as non-navigating spans and adds image wrappers, so static anchor-list equality with exported HTML is not asserted. Browser semantic comparisons preserve and report those actual differences.

## Shared browser evidence

Run `bun run test:browser -- tests/browser/templates.spec.ts`. Each manifest entry loads through the real picker and produces original React Email, compiled MJML and live editing-canvas captures at 800px and 390px. The current 62-entry manifest produces 372 screenshots, paired original/compiled HTML and one `comparison.json` per template. Reference HTML bytes are unchanged and loaded at a verified synthetic document URL on the original asset origin.

All three representation pairs are compared at both widths. Shared extraction records ordered words, headings in the unit layer, links, images, painted surfaces, exact computed typography, line rectangles, root geometry, fonts, network/image readiness, overflow and contrast. Word alignment is case-sensitive and retains additions/removals. Normalized destinations are compared on matched words, independently of split/merged anchors. Raw anchor evidence distinguishes missing from empty href. Explicit canvas font aliases are the only family normalization. Geometry is rounded only to Chromium's 1/64 CSS-pixel layout precision.

Style and layout comparisons are an audit, not an assertion of equality. Results are `matching-measurements`, `differences` or `inconclusive`. Resource failures and overflow make the result inconclusive without hiding observed differences. Contrast evidence uses common WCAG text thresholds on opaque ancestor backgrounds; gradients, images, translucency and filters are inconclusive. Overlapping surfaces, clipping, pseudo-elements and raster text still need visual inspection. Low contrast is recorded without a branded allowlist or an accessibility-certification claim.

Every capture retains raw cumulative resource events. A separate `resourceAttribution` report checks whether historical failures still affect the captured document: current dependencies, ownership, later successful transport, and decoded images or loaded faces provide the evidence. Unknown dependencies and unresolved failures remain inconclusive, including opaque stylesheets and CSS artwork without decode proof. Inspection is skipped when no relevant transport failure exists and otherwise limited to failed resource kinds; a late failure of an uninspected kind stays ambiguous. No template-specific resource exemptions are used.

Raw viewport coordinates are retained, including authored margins and the editor's renderer-owned vertical gutter. No hardcoded offset, per-template tolerance or inferred parity is applied. A future secondary origin normalization must measure renderer-owned geometry and preserve the raw evidence alongside it. Structural paint inventories and text-node segmentation may also require manual interpretation.

## Component regressions stay separate

Template-specific review files and selectors have been removed, not moved into one switch statement. Renderer behavior is tested using small synthetic fixtures: inline heading inheritance and emphasis, label/value typography, href-less labels, inherited fonts, normal word breaking in intrinsic tables, responsive background padding, image sizing, table alignment and editable content. Real editor tests retain inline edits, export, undo/redo, clone echoes and viewport restoration. The native column matrix keeps alignment, fixed/fill widths, fractional percentages, baseline and responsive sizing coverage without importing brand templates. Existing security, accessibility, import/export, font readiness and editor history suites remain.

The trade-off is explicit: a former assertion such as a particular brand's gap being exactly N pixels is now a reported source/port difference, not a handwritten gate. Component invariants and content integrity remain gates; there is no claim that a green unit suite means the ports visually match their originals. Real email-client testing is separate from browser rendering.

## Validation commands

```sh
bun run test
bun run typecheck
bun run lint
bun run build
bun run build:demo
bun run test:browser -- tests/browser/templates.spec.ts
```

`bun run references:prepare` (included in both test commands) prepares and verifies the pinned references. A browser-test listing checks discovery only, not rendering. If Chromium cannot launch, report that limitation and leave browser validation pending.
