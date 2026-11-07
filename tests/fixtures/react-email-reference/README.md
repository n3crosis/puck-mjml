# Original React Email HTML references

These 62 files are actual HTML produced by the official React Email renderer from the unchanged original public examples at [`resend/react-email@674d8ec2804b86be5d99156383fb1810179847bf`](https://github.com/resend/react-email/tree/674d8ec2804b86be5d99156383fb1810179847bf/apps/demo/emails). They are test references only; the editable demo implementation remains native MJML.

`manifest.json` maps each canonical `.mjml` path to its original `.html` reference. Each entry includes the immutable source URL and Git blob hash, default component name, public preview props, HTML byte count, and SHA-256. The manifest also records dependency versions, runtime settings, source/license provenance, and deterministic double-render verification. The 62 HTML files total 884,331 bytes.

The originals use `VERCEL_URL=demo.react.email` and `TZ=UTC`, exactly as recorded. The HTML is stored byte-for-byte without reformatting or URL replacement. The fixtures use the published renderer/component versions identified by the pinned upstream manifests; they are newly rendered references, not historical screenshots of the hosted website.

Run `node scripts/render-react-email-references/verify.mjs` from the repository root to verify the complete set and checksums without network access or renderer dependencies. See [regeneration instructions](../../../scripts/render-react-email-references/README.md) for the isolated, locked generator and hash-verified source fetch.

Compare original output, compiled MJML output, and the actual editor canvas at the same desktop and mobile sizes. Screenshot generation and semantic checks alone do not establish visual equivalence; inspect any layout, typography, spacing, or artwork differences. Generation does not establish compatibility with every email client.

The upstream MIT license is retained verbatim in [LICENSE.md](LICENSE.md). Artwork and web fonts remain external URLs; their rights and terms are separate from the source-code license. See [third-party notices](../../../THIRD_PARTY_NOTICES.md).
