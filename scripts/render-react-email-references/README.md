# Render original React Email test references

This is an isolated test-fixture generator. It adds no dependency to the application, published library, or native MJML demo. It downloads and renders the 62 public upstream React Email examples without modifying their source or sample props. The TSX is cached locally, ignored by Git, and never placed in the application's template tree.

## Reproduce

Use Bun 1.4.2. From this directory:

```sh
bun install --frozen-lockfile --ignore-scripts
bun run render
bun run verify
```

The first render fetches pinned source files from the official `resend/react-email` GitHub repository. Subsequent runs reuse the checksum-verified `.cache/upstream` files. Registry/network access is required to install dependencies and populate an empty cache. No upstream scripts are executed, and npm lifecycle scripts are disabled. Only the pinned email modules, their theme/font helpers, and official rendering dependencies are evaluated.

The script writes `../../tests/fixtures/react-email-reference/`. Then run the repository's formatter from its root (`bun run format`) and run the offline verification again. Generated HTML and the verbatim upstream license are excluded from formatting so their original bytes are preserved.

For existing checked-in fixtures, no install or network access is needed:

```sh
node scripts/render-react-email-references/verify.mjs
```

This verifies all 62 canonical paths, every HTML byte count and SHA-256, the license, renderer lockfile, and provenance metadata. It does not claim visual equality; browser comparisons must inspect the rendered original, compiled MJML output, and actual editing canvas at matching viewports.

## Source and renderer pinning

- Source: `resend/react-email@674d8ec2804b86be5d99156383fb1810179847bf`.
- `upstream-provenance.json`: Git blob SHA-1 and byte count for every original source file and the MIT license. All 73 source files (62 emails and 11 helpers) must verify before rendering. Downloads and cached files are checked independently; a mismatch fails rather than overwriting trusted inputs.
- `upstream-metadata.json`: upstream package manifests, workspace catalog, lockfile catalog excerpt (lines 1–180), public component entrypoint, and shared Tailwind config fetched at the same pin, with Git blob hashes and GitHub links.
- `bun.lock`: exact isolated npm graph and package integrity hashes. Direct versions match the pinned upstream manifests and catalog resolutions: `react-email@6.11.8`, `@react-email/render@2.2.0`, React/React DOM `19.2.4`, and Tailwind CSS `4.1.18`.

These upstream examples import their components from `react-email`, which now exports both components and the renderer. Substituting legacy `@react-email/components` would not reproduce these examples. The references use the published versions identified by the pinned upstream package manifests; they are not a historical screenshot of the hosted demo.

The actual call is `render(createElement(module.default, module.default.PreviewProps ?? {}))`, with default render options. `VERCEL_URL=demo.react.email` matches the canonical MJML artwork origin, and `TZ=UTC` makes the original public date props deterministic. Original Date objects are passed to the components; their JSON ISO representations appear only in the manifest. Every email is rendered twice and must produce byte-identical output. Neither source nor HTML is transformed. No private user data, machine paths, timestamps, or secrets enter the output manifest.

The source-code MIT license is retained in the fixtures and the repository's third-party notices. Artwork and fonts remain external references and retain their separate ownership and terms.
