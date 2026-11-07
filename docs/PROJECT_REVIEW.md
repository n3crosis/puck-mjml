# Project review

## Scope and baseline

The full-project review preceded compatibility fixes and publication work. Baseline commit: `e4656b3`. Review covered the document model, import/export, native attribute catalog and inheritance, canvas layouts, rich text and tables, security boundaries, editor interactions, packaging, demo, documentation, and deployment. The baseline passed 1,160 tests in 58 files, formatting, lint, types, library and demo builds, and ordinary Node ESM/CommonJS/HTML-compilation smoke tests. Regenerating the native catalog produced no semantic changes, and its allowed-child relationships matched upstream MJML commit `1c434fc`.

Those passes did not prove compatibility completeness. Catalog acceptance, lossless import, visual canvas fidelity, browser interaction, and email-client rendering are different claims.

## Findings and remediation scope

- **Import fidelity:** native/head defaults were overridden, XML parsing of ending-tag HTML void elements could swallow siblings, nested-table traversal duplicated rows, and accordion part attributes were dropped. Additional gaps affected raw group/social/navbar entries, rich labels, social share names, pixel widths, native value ranges, empty attributes, and prototype-like attribute names. Regression coverage accompanies the targeted importer corrections. Imported native values now keep static provenance and original control baselines, so visual edits can supersede preserved values without an on-change rewrite; native edits remove ownership and undo restores it. Ending-tag scanning respects quotes/comments, while unsafe embedded boundaries remain preserved with explicit cannot-export warnings.
- **Native rendering and editing:** social vertical alignment/shared column sizing, carousel default thumbnail sizing, simple versus native image sizing, and locked image-source editing needed correction. Native canvas remains an approximation, not a replacement for compiled email preview.
- **Editor accessibility:** preview needed focus trapping, background isolation, and trigger-focus restoration. Browser verification supplements detached-DOM tests.
- **Tailwind isolation:** React-rendered script tags did not establish runtime execution, and broad cleanup could remove styles owned elsewhere. Runtime activation now requires a host opt-in, ignores the old document-controlled script URL, and uses isolation. No sanitizer exploit was confirmed by the review.
- **MJML class semantics:** nested class names containing dots/brackets can differ under the upstream compiler's resolution; report unsupported nested definitions instead of promising equivalence.
- **Trusted raw content:** legal accordion raw insertion positions needed a modeled API. Trusted content always remains a separate explicit host/export opt-in.
- **Package consumers:** ordinary Node imports worked, but the root editor bundle failed in React Server Components. The conversion-only `puck-mjml/core` entry avoids client runtime/CSS imports, with dedicated smoke coverage.
- **Demo safety:** template/import replacement could erase edits and reset undo. The demo adds visible no-persistence guidance, dirty replacement/unload confirmation, complete warning access, preflight import export validation, and independent MJML source download.
- **Delivery:** the baseline had no GitHub workflow. CI now gates builds and Pages deployment; a live URL must be verified after deployment, not inferred from configuration.

## Remaining limitations

- Filesystem `mj-include` and custom `.mjmlconfig` components require a host compiler.
- Outlook/VML and other email-client behavior require actual client testing.
- CSS written against compiled table markup may not match the div-based editing canvas.
- Arbitrary MJML is not guaranteed to survive import/edit/export unchanged; sanitization and trust policy deliberately limit some input.
- Tailwind utility output must be provided separately for exported email.
- The demo does not persist drafts or provide uploads/publishing services. Network-hosted fonts and sample artwork may fail offline.
- Large editor and compiler chunks warrant performance measurement on slower devices and networks.
- Test results refer to the exact checkout tested; final CI results are the authoritative validation for a published commit.

## Validation strategy

Run `bun run check`, `bun run build`, `bun run test:package`, `bun run build:demo`, and `bun run test:browser`. Test representative imports and compare both MJML and compiled HTML. For visual changes, exercise actual Chromium at multiple widths and test keyboard, repeated actions, cancellation, and replacement flows. Real email-client testing remains a separate release criterion.
