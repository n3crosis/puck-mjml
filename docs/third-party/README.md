# Dependency license audit

The top-level [third-party notices](../../THIRD_PARTY_NOTICES.md) cover template provenance, external assets, and major dependencies. This directory retains supplemental upstream evidence that is not reliably present in installed package license files.

## Generated distribution artifacts

Run `bun install --frozen-lockfile`, `bun run build`, and `bun run build:demo`. The Vite plugin in [`scripts/third-party-notices.ts`](../../scripts/third-party-notices.ts) emits a separate inventory for each build:

- `THIRD_PARTY_LICENSES.json`: package/version, declared license, module paths, full license texts and SHA-256 hashes, retained inline legal comments, host-supplied external modules, and supplement references.
- `THIRD_PARTY_LICENSES.txt`: readable full notices, including the supplemental upstream dependency license texts.
- `THIRD_PARTY_NOTICES.md`: the repository's human-readable notice and asset-rights qualifications.
- `third-party/*.json`: applicable verified supplements.

These files are emitted into `dist/` and `demo-dist/`, not committed as a potentially stale snapshot. The package already includes `dist/` through `package.json`'s `files` list. No network access is needed to generate notices after the dependencies are installed. Sorting and omission of machine paths/timestamps make unchanged inputs reproducible.

The inventory is based on rendered module paths, including CSS. It deliberately includes imported package metadata too. The library externalizes React/React DOM/Puck JavaScript, but bundles Puck CSS; the demo includes those runtimes. A dependency's classification in `package.json` does not decide whether it belongs in a notice.

## Verified supplements

- [`license-overrides.json`](license-overrides.json): boolbase 1.0.0 and react-remove-scroll-bar 2.3.8 declare licenses in their npm metadata but omit the full text. The exact texts are copied from immutable upstream repository commits. Those license files were added after the package releases; this fact is recorded rather than obscured.
- [`puck-core.json`](puck-core.json): exact package versions found in the source-path comments of Puck 0.24.0's prebundled ESM, with full license files from integrity-verified npm archives. Lucide's license file also preserves the Feather notice. Bundle hashes make a changed upstream artifact require review.
- [`mjml-browser.json`](mjml-browser.json): verified license texts from the pinned MJML source lockfile's conservative runtime and browser-polyfill dependency closure. This intentionally includes packages that may have been removed or replaced by the upstream browser build. It is not an exact bundle module manifest. The supplement records its collection sources and remaining limitations.

- [`object-hash.json`](object-hash.json): exact package license, bundle hash, and Browserify module-map evidence, with the unresolved historical embedded-dependency provenance stated explicitly.

## Audit limits

Module-level inventories cannot reconstruct code that upstream packages already combined and minified. In particular, the published MJML browser compiler lacks a complete embedded license manifest, and object-hash 3.0.0's browser bundle includes historical Buffer, base64-js, ieee754, process, and crypto-browserify implementations without embedded version identifiers. Modern installed dependency versions must not be presented as the versions of that historical bundled code. Consult the supplements for verified coverage and unresolved provenance details; these records are not a legal-compliance certification. The MJML conservative superset also includes slick 1.12.2, whose archive omits a full license and whose declared license URL no longer resolves. Known supplement gaps are visible in both the generated files and build warnings; missing text for a newly encountered direct Vite module still fails the build.

External template artwork, trademarks, and font URLs are not covered by a claim of MIT asset rights. There are no checked-in third-party font or artwork binaries in the template collection. The React Email source license and all 62 example source pins are retained in the top-level notice and [`templates/manifest.json`](../../templates/manifest.json).

## Maintenance

After a dependency update, build both distributions and inspect the generated inventories. A missing license text fails the build. Add a source-verified, version-specific exception only after examining the upstream license; never manufacture copyright notices from an author field or an SPDX identifier. Review the prebundled-code supplements when their package version or recorded bundle hash changes. Preserve all source license and copyright text, including nested vendor notices.

The generated inventory includes full text and hashes so maintainers can compare it directly with installed packages. The supplemental archives record their registry URLs and integrity hashes so their license files can be retrieved and verified independently. Keep this guide's limitations accurate when deeper upstream evidence becomes available.
