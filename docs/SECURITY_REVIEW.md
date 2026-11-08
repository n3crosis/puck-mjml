# Security review

Reviewed the November 8, 2026 working changes based on `b40ed79`. This is a code review with focused regression checks, not a penetration-test certification or a guarantee that arbitrary MJML is safe in every host.

## Confirmed finding and fix

**Medium: custom CSS could escape the canvas selector scope.** A document's `mj-style` becomes a stylesheet in the editing document. The handwritten list splitter treated escaped opening parentheses/brackets and punctuation inside comments as structural delimiters, and did not correctly handle a string ending with an escaped backslash. For example, `.escaped\(, body { color:red }` became `.pm-canvas-example .escaped\(, body { color:red }`. The second selector remained global.

The result was CSS injection outside the intended canvas, not demonstrated JavaScript execution. It could change surrounding UI or another editor in the same document. An embedding application with sensitive DOM attributes in that document could also expose them to conditional CSS resource requests. Puck's default iframe limits the affected document; integrations using the public configuration without an iframe have a larger boundary.

`src/canvas-css.ts` now consumes escapes, hexadecimal escape terminators, comments, and quoted strings before interpreting separators and combinators. Every actual selector-list branch is scoped, while root-sibling selectors remain rejected and ordinary escaped utility classes remain supported. Tests cover escaped delimiters and quotes, repeated backslashes, hex escapes, comments, root mapping, sibling escapes, host elements, and a second canvas. The correction does not relax the conservative nesting policy or modify exported source CSS.

## Other reviewed boundaries

- **Imports and rich HTML:** regular rich text and retained imported markup pass the same `sanitize-html` allowlist. Links are scheme-validated. Native attribute source metadata is revalidated rather than treated as trusted markup. Unsupported includes do not read files. Raw blocks, trusted ending content, and template attributes require the host's explicit `allowRawHtml` opt-in. The public demo validates serialization before replacing its draft and does not enable that opt-in from imported content.
- **Previews and downloads:** the compiled preview iframe has an empty sandbox token list. Local downloads use short-lived Blob URLs and fixed filenames. Exported HTML is a deliverable, not a safe host-page DOM fragment; do not inject it into a privileged application document.
- **Generated attributes:** event handlers and other active attributes require raw trust. URL, srcset, CSS-value, selector quoting, and markup-boundary checks remain in place. Rich content, native attributes, and HTML-attribute paths have focused hostile-input regression coverage.
- **Images:** files are limited to 5 MiB, supported raster signatures, 8192 pixels per side, and 16 megapixels. SVG is not accepted. The demo additionally decodes the image and verifies dimensions. Embedded raster data requires explicit local-image support. Upload callback results are validated; server-side storage authorization remains the host's responsibility.
- **Executable resources:** document-controlled Tailwind script URLs are ignored. Tailwind execution requires a host-controlled opt-in and trusted runtime. No new document-controlled code execution path was found.
- **Reference generation:** upstream source is pinned to a commit and verified by blob digest and byte count before execution. Reference tooling has a separate frozen lockfile, installs with lifecycle scripts disabled, and verifies generated HTML against committed hashes without rewriting that baseline. Generated HTML remains in ignored caches.
- **Dependencies:** `bun audit` reported no advisories in the application graph (355 packages) or isolated reference renderer graph (138 packages). CI now audits both graphs. This result is time-specific; host applications must audit their own dependency resolution.
- **CI and deployment:** pull requests receive read-only repository permissions. Publishing is restricted to `main`, excluded from pull-request events, and depends on successful checks. Pages write and OIDC permissions are confined to the deployment job. No obvious credential files or common private-key/token patterns were found in the reviewed source/configuration tree; repository history was not exhaustively scanned.

## Host responsibilities and remaining limits

Custom CSS scoping is not a CSS security sandbox. Authored CSS and remote images/fonts may make network requests; CSS can change layout and position elements within the rendering document. Do not place secrets in that document or rely on selector scoping to enforce network privacy. For hostile multi-tenant documents, use a separate-origin rendering boundary with a suitable CSP and remote-resource policy. The current demo makes no no-network or server-side processing claim.

Parsing, compilation, and remote font loading do not provide a complete resource budget. A host accepting automated or untrusted bulk input should enforce input-size, complexity, request, and execution-time limits, and compile outside its privileged main process. Trusted HTML and downloaded emails must retain the same trust classification after export.

## Verification

The focused tokenizer/scoping/Tailwind run passed 183 tests. The broader security run passed 737 tests across 21 files, followed by successful TypeScript validation. Repository formatting and lint checks also passed. A real-Chromium isolation regression was added at `tests/browser/canvas-css-security.spec.ts`. Local Chromium could not start because this executor denied its Unix-socket creation, including the approved escalated attempt, so the browser regression must be verified by CI; DOM selector matching in the unit tests confirmed the original escape and the corrected containment.
