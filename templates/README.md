# React Email examples in MJML

The `.mjml` files in this directory are the canonical, standalone email sources. Edit them directly. They are not generated at build time and do not require React Email, TypeScript, a template engine, filesystem includes, or trusted raw HTML to compile.

The editor imports these files into editable Puck blocks. Its TypeScript adapters contain loading and registry code only. `createExampleDocument()` loads `02-Matte/product-update.mjml`; it continues to return a fresh document on every call.

## Upstream inventory

[manifest.json](manifest.json) records the exact inventory and per-file Git blob hashes from [React Email commit 674d8ec2804b86be5d99156383fb1810179847bf](https://github.com/resend/react-email/tree/674d8ec2804b86be5d99156383fb1810179847bf/apps/demo/emails).

| Family      | Actual emails | Examples                                                                                                               |
| ----------- | ------------: | ---------------------------------------------------------------------------------------------------------------------- |
| 01-Barebone |             8 | Welcome, activation, feature announcement, password reset, product update, subscription confirmation/update, text only |
| 02-Matte    |             8 | The same eight SaaS messages, styled for Collage                                                                       |
| 03-Protocol |             8 | The same eight SaaS messages, styled for Dither                                                                        |
| 04-Arcane   |             8 | Welcome, activation, password reset, abandoned cart, newsletter, order confirmation/shipping, promo                    |
| 05-Studio   |             8 | The same eight commerce messages, styled for Halo                                                                      |
| Community   |            22 | Magic links (6), newsletters (3), notifications (4), receipts (2), password resets (2), reviews (2), welcome (3)       |
| **Total**   |        **62** | The demo also offers a blank document                                                                                  |

The upstream `theme.ts` and `*-fonts.tsx` files are shared helpers, not emails. Font declarations are included in the real MJML documents, so the picker does not contain empty font-only examples.

All 62 canonical sources are included, plus the blank document in the picker. Exact inventory tests reject missing, extra, duplicate, or placeholder entries. A source without provenance, or a manifest entry without a source, is an error.

## Source conventions

- Preserve the official family and filename: `02-Matte/welcome.mjml`, or `Community/magic-links/linear-login-code.mjml`.
- Keep every document self-contained, with `mjml`, `mj-head`, `mj-title`, `mj-preview`, and `mj-body`. Use native MJML components for layout and editable content.
- Keep fonts in `mj-font`, styling in `mj-style`, and responsive rules beside the email they affect. Normal HTML fragments in text or table content are permitted; do not wrap a compiled HTML email in `mj-raw`.
- Include the pinned upstream URL and attribution in the opening XML comment. The manifest's `file` is relative to this directory; `upstreamPath` is relative to the upstream repository.
- Use public upstream preview data, not real account information. These are examples, not send-ready production emails. Replace demo destinations, addresses, dates, receipt data, and copy before sending.
- Images use `https://demo.react.email/static/`; web fonts use Google Fonts. They require network access and are not bundled. Host your own authorized assets for production. System-font fallbacks remain available when clients block web fonts.

The MIT copyright and license text are preserved in [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md). Brand names and artwork are demonstration material, not an endorsement. Historical sample prices and policy text are not current offers or advice.

## Validation

From the repository root:

```sh
bun run test -- src/templates src/example.test.ts src/import.test.ts
bun run typecheck
bun run build
bun run build:demo
```

Registry tests check inventory/provenance, source registration, unique editable blocks, independent documents, clean direct MJML compilation, and preservation of visible content, images, and links after editor import/export. All available ports additionally retain upstream preview text, content sections, artwork, and link destinations through fixtures extracted from the pinned source. The browser suite exercises every template through the actual picker and captures all 62 at desktop/mobile widths in three forms: the pinned original React Email HTML, compiled MJML HTML, and the actual Puck editing canvas. That produces 372 named screenshots plus HTML pairs and `comparison.json` files with resource, text, image, link, computed-style, and layout measurements. Reference inventory and SHA-256 checks are mandatory. Original overflow or unavailable resources are recorded separately from port failures. These are review artifacts, not a claim of pixel equality; editor gutters and documented responsive/accessibility adaptations can differ. See the [reference renderer](../scripts/render-react-email-references/README.md) for reproducible source pins and regeneration. Real email-client testing remains separate: successful compilation or browser rendering does not establish email-client parity.

To refresh the semantic fixtures after an intentional upstream pin update, first update the manifest's commit and blob hashes, obtain that exact upstream source, and run:

```sh
node scripts/refresh-template-fixtures.mjs /path/to/react-email
bun run format
```

The extractor verifies every input file against its pinned Git blob before evaluating its public `PreviewProps`. Relative destinations resolve against `https://demo.react.email/`; date-dependent sample text is resolved in UTC. This extractor deliberately does not render or translate layout, CSS, themes, or fonts. It is a semantic regression baseline, not a source generator or proof of pixel parity.
