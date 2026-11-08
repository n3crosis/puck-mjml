# Render original React Email test references

This is an isolated test-fixture generator. It adds no dependency to the application, published library, or native MJML demo. It downloads and renders the 62 public upstream React Email examples without modifying their source or sample props. The TSX is cached locally, ignored by Git, and never placed in the application's template tree.

## Reproduce

Use Bun 1.4.2. From the repository root:

```sh
bun run references:prepare
bun run references:verify
```

`prepare` verifies an existing cache offline first. If missing or invalid, it installs the isolated renderer with `--frozen-lockfile --ignore-scripts`, fetches pinned upstream source, renders all 62 originals twice, and verifies the results against the committed manifest. `bun run test` and `bun run test:browser` prepare automatically; CI also prepares explicitly before validation. Direct `vitest` or `playwright` invocations require preparation first.

Generated HTML, a copy of the manifest, and the license live only in the Git-ignored root `.cache/react-email-reference/`. No rendered reference HTML is checked in. The committed `tests/fixtures/react-email-reference/manifest.json` retains the expected hashes and provenance, and the license remains there for attribution. Rendering never updates this baseline: any source, dependency, runtime, or output drift fails.

The first render fetches pinned source files from the official `resend/react-email` GitHub repository. Subsequent renders reuse this tool's checksum-verified `.cache/upstream` files. Registry/network access is required to install dependencies and populate an empty cache. No upstream package scripts are executed, and npm lifecycle scripts are disabled. Only the pinned email modules, their theme/font helpers, and official rendering dependencies are evaluated. An invalid cached source fails rather than being silently replaced.

To force a fresh render using installed dependencies, run `bun run --cwd scripts/render-react-email-references render`, then `bun run references:verify`. To test a fully cold setup, remove the ignored root reference cache and this tool's ignored source cache and `node_modules`, then prepare again. The independent offline verifier requires no renderer dependencies:

```sh
node scripts/render-react-email-references/verify.mjs
```

Verification checks the committed baseline against all 62 generated canonical paths, every HTML byte count and SHA-256, license, renderer lockfile, and provenance metadata. It does not claim visual equality; browser comparisons must inspect the rendered original, compiled MJML output, and actual editing canvas at matching viewports.

## Source and renderer pinning

- Source: `resend/react-email@674d8ec2804b86be5d99156383fb1810179847bf`.
- `upstream-provenance.json`: Git blob SHA-1 and byte count for every original source file and the MIT license. All 73 source files (62 emails and 11 helpers) must verify before rendering. Downloads and cached files are checked independently; a mismatch fails rather than overwriting trusted inputs.
- `upstream-metadata.json`: upstream package manifests, workspace catalog, lockfile catalog excerpt (lines 1–180), public component entrypoint, and shared Tailwind config fetched at the same pin, with Git blob hashes and GitHub links.
- `bun.lock`: exact isolated npm graph and package integrity hashes. Direct versions match the pinned upstream manifests and catalog resolutions: `react-email@6.11.8`, `@react-email/render@2.2.0`, React/React DOM `19.2.4`, and Tailwind CSS `4.1.18`.

These upstream examples import their components from `react-email`, which now exports both components and the renderer. Substituting legacy `@react-email/components` would not reproduce these examples. The references use the published versions identified by the pinned upstream package manifests; they are not a historical screenshot of the hosted demo.

The actual call is `render(createElement(module.default, module.default.PreviewProps ?? {}))`, with default render options. `VERCEL_URL=demo.react.email` matches the canonical MJML artwork origin, and `TZ=UTC` makes the original public date props deterministic. Original Date objects are passed to the components; their JSON ISO representations appear only in the manifest. Every email is rendered twice and must produce byte-identical output. Neither source nor HTML is transformed. No private user data, machine paths, timestamps, or secrets enter the output manifest.

The source-code MIT license is retained alongside the manifest and the repository's third-party notices. Artwork and fonts remain external references and retain their separate ownership and terms.
