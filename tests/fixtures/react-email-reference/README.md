# Original React Email reference provenance

The 62 locally generated references are actual HTML produced by the official React Email renderer from the unchanged original public examples at [`resend/react-email@674d8ec2804b86be5d99156383fb1810179847bf`](https://github.com/resend/react-email/tree/674d8ec2804b86be5d99156383fb1810179847bf/apps/demo/emails). They are test references only; the editable demo implementation remains native MJML.

Only provenance and licensing are checked in here. Run `bun run references:prepare` to generate the originals into the ignored root `.cache/react-email-reference/` directory. The unit and browser test commands do this automatically, and CI starts from the same reproducible generation flow.

`manifest.json` maps each canonical `.mjml` path to its original `.html` reference. Each entry includes the immutable source URL and Git blob hash, default component name, public preview props, HTML byte count, and SHA-256. The manifest also records dependency versions, runtime settings, source/license provenance, and deterministic double-render verification. The 62 generated HTML files total 884,331 bytes.

The originals use `VERCEL_URL=demo.react.email` and `TZ=UTC`, exactly as recorded. The ignored HTML cache preserves the renderer output byte-for-byte without reformatting or URL replacement. The fixtures use the published renderer/component versions identified by the pinned upstream manifests; they are newly rendered references, not historical screenshots of the hosted website.

Browser captures fulfill these same bytes through an exact Playwright document route at `https://demo.react.email/__puck_mjml_reference__.html`; the document is intercepted, not fetched from the deployed app. This preserves the origin for relative artwork URLs without rewriting HTML or injecting a base tag. `comparison.json` records each document's URL/baseURI, computed background images, and image response/failure evidence separately from font evidence. Original resource failures remain visible as reference behavior rather than being repaired or attributed to the MJML port; existing compiled-email and canvas artwork/font checks remain in force.

The focused Arcane heading checks explicitly record the original Inter 400 URL's HTTP 404 in `original-reference-resources.json`. Only that exact observed 404 is allowed; Instrument Serif must still load and match the original heading geometry, and other font or artwork failures remain fatal. This exception does not establish body-font parity with the unavailable upstream font.

Run `node scripts/render-react-email-references/verify.mjs` from the repository root after generation to verify the complete cached set against this committed manifest without network access or renderer dependencies. See [regeneration instructions](../../../scripts/render-react-email-references/README.md) for the isolated, locked generator and hash-verified source fetch.

Compare original output, compiled MJML output, and the actual editor canvas at the same desktop and mobile sizes. Screenshot generation and semantic checks alone do not establish visual equivalence; inspect any layout, typography, spacing, or artwork differences. Generation does not establish compatibility with every email client.

The upstream MIT license is retained verbatim in [LICENSE.md](LICENSE.md). Artwork and web fonts remain external URLs; their rights and terms are separate from the source-code license. See [third-party notices](../../../THIRD_PARTY_NOTICES.md).
