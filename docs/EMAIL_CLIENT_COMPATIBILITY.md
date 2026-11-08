# Email client compatibility

The demo's **Compatibility** sidebar tab, beside **Blocks** and **Outline**, uses [Can I email](https://www.caniemail.com/) data to help discover fragile HTML and CSS in the current email. Switching sidebar tabs keeps the editor and canvas mounted, so document state and undo history remain available. Client details and caveats stack within the panel without horizontal scrolling. The compatibility integration is demo-only. The public `EmailEditor.plugins` prop accepts Puck plugin additions and overrides by name; keep the array and render functions stable across document updates. The demo uses public plugin factories and UI state, preserving the native Blocks, Outline, and mobile Fields renderers.

## Using the tab

1. Edit or import an email, then open **Compatibility**. The demo compiles the current document with the same MJML compiler and local-image policy used for export.
2. **All recorded clients** is selected by default. Checks include every one of the snapshot's 48 client/platform combinations: Outlook, Gmail, Apple Mail, Yahoo Mail, Samsung Email, Thunderbird, and the other recorded clients. Choose an individual client to narrow the results, or return to **All recorded clients** at any time. Outlook Windows means the classic Windows client versions recorded upstream, not new Outlook.
3. Review **In this email**. Each entry has a sample of the detected HTML/CSS, a recorded client version/date, the support result, upstream caveats, and a link to the full support table and original tests.
4. Turn off **Needs review only** to include supported results. Supported entries with caveats remain in the review filter. Missing results are **Unknown**, never supported.
5. Use **Browse 56 checks** to research included features even when they were not detected. Search and client filters apply to both views.

Loading, failure/retry, document replacement, and interrupted tab changes are handled without showing results from a different email. The native navigation buttons support Enter/Space, arrow keys, Home, and End. Escape closes a sidebar panel and returns focus to its navigation button. Data and analysis load on first use; compilation happens only while the compatibility panel is active, with a short debounce during live edits.

The default review filter flags a feature if **any recorded client** has unsupported, partial, unknown, or caveated support. Expand a feature to see each client's result, or use the client selector for a focused review. Client selection, search, and the review filter remain adjustable in both the detected and catalog views and survive sidebar tab changes.

**iCloud.com webmail has no results in this snapshot.** Apple Mail on macOS/iOS is included, but its results do not establish iCloud webmail support. Neither the all-client default nor an absence of warnings establishes compatibility with unrecorded clients or new Outlook; those still need separate testing.

## What the results mean

This is a static inspection, **not an inbox rendering test or a compatibility score**. It checks a curated set of 56 features, not the entire Can I email catalog or every HTML/CSS construct. It cannot promise that an email is safe merely because no warnings appear.

- The scanner checks compiled HTML, inline CSS and embedded style blocks. This catches features produced by MJML as well as custom styles. It does not determine whether every CSS selector matches, resolve the CSS cascade, or evaluate media conditions.
- MJML intentionally emits CSS that some clients ignore while providing a table, conditional-comment or VML fallback. Finding unsupported CSS is a reason to review that feature, not proof of a visible defect. Conditional-only content is not scanned and fallback effectiveness is not evaluated.
- External stylesheets, fonts and images are not fetched by the checker. An external stylesheet link is detected, but its contents, including externally defined fonts, are not inspected. Image-format detection uses declared data URLs or filename extensions, not the actual remote response.
- Malformed CSS blocks are skipped and counted under **Analysis limits and compiler notes**. Compiler warnings remain visible there.
- Each feature/client pair uses the **last entry in source order** from the pinned upstream table. This is deliberately not a numeric/date sort: upstream sometimes changes from a test date to an app version. Exact version/date labels and the upstream feature test date are shown. These results may be years old and are not claims about today's client releases.
- Support notes are rendered as plain text. Use the linked upstream page for its full formatting, references, historical versions and test cases. The live page may have newer results than this bundled snapshot.

Only feature links open the external site. The email source and analysis are not uploaded to Can I email. Ordinary editor/preview behavior may separately load the email's own image or font URLs.

## Data provenance and maintenance

The bundled subset is derived from the MIT-licensed [`hteumeuleu/caniemail`](https://github.com/hteumeuleu/caniemail) repository at commit [`cb8109c3f8658e003aa064b47a71b232ddc28d39`](https://github.com/hteumeuleu/caniemail/tree/cb8109c3f8658e003aa064b47a71b232ddc28d39). The local snapshot records that revision and a SHA-256 of each original feature file. Client labels come from `_data/nicenames.yml`. The complete [upstream MIT license](third-party/caniemail.LICENSE) is retained, with attribution in the UI and [distribution notices](../THIRD_PARTY_NOTICES.md).

To refresh, obtain a clean upstream checkout at the intended reviewed revision, then run:

```sh
# Python 3 and PyYAML are development-only requirements for this optional step.
python3 scripts/update-caniemail.py /path/to/caniemail
bunx oxfmt demo/compatibility/caniemail-data.json
```

The generator is local-only and never downloads or executes upstream code. It rejects a dirty upstream checkout. Review changed statuses, notes and feature dates; update the pinned-revision assertion in `demo/compatibility/analyze.test.ts` and this guide; then run `bun run check`, `bun run build:demo`, and the compatibility browser tests. Adding a feature also requires updating the generator's explicit feature list, its scanner behavior, displayed coverage text and tests. Do not relabel old recorded results as current.
