# Third-party notices

This project combines its own MIT-licensed code with the separately licensed work below. These notices do not change the terms of any dependency.

## Distribution notices and scope

Every library and demo build emits `THIRD_PARTY_LICENSES.txt` (full license texts), `THIRD_PARTY_LICENSES.json` (package names, exact installed versions, source module paths, license hashes, and external modules), and a copy of this file. The library artifacts are included in the npm package under `dist/`; the demo artifacts are placed at the root of `demo-dist/`. Keep them with redistributed build output.

The [build-time collector](scripts/third-party-notices.ts) derives separate inventories from the modules actually rendered by Vite, rather than assuming that `devDependencies` are absent from the demo. It includes dependency license files and retained inline legal notices, and fails when a newly bundled package has no verified license text. See the [audit sources and maintenance guide](docs/third-party/README.md) for the checked-in supplemental notices, provenance, reproducibility, and limits of upstream prebundled-code inspection.

The library leaves React, React DOM, and the Puck JavaScript runtime to the host application; Puck CSS is bundled. The standalone demo bundles those runtimes, Tiptap/ProseMirror, drag-and-drop and accessibility dependencies. Each distribution has its own inventory. A package represented only by imported metadata can also appear; an inventory entry does not imply that its entire runtime is bundled.

## React Email

All 62 standalone MJML examples in [`templates/`](templates/README.md) adapt the templates, themes, public sample data, and artwork references from [React Email](https://github.com/resend/react-email/tree/674d8ec2804b86be5d99156383fb1810179847bf/apps/demo/emails), pinned at commit `674d8ec2804b86be5d99156383fb1810179847bf`. The complete source inventory and per-example provenance are recorded in [`templates/manifest.json`](templates/manifest.json); only examples with a checked-in `.mjml` file appear in the demo. `src/example.css` contains canvas-specific adaptations. Images remain external URL references, including the React Email demo hosts, and web fonts are requested from external providers such as Google Fonts. No image or font binary is licensed by this notice. The source-code MIT license is not a representation that trademarks, logos, photographs, artwork, or font files are available under MIT; their owners and providers may impose separate terms. Review those terms and replace demonstration assets before commercial use where necessary. Brand names and artwork references do not imply endorsement. Sample prices, dates, addresses, receipts, and policy text are illustrative and may be historical.

Source license: [React Email MIT license](https://github.com/resend/react-email/blob/674d8ec2804b86be5d99156383fb1810179847bf/LICENSE.md).

Copyright 2024 Plus Five Five, Inc

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## MJML

The native attribute catalog and canvas social-network presets are derived from the installed MJML compiler and pinned [MJML source](https://github.com/mjmlio/mjml/tree/1c434fcbfd042ddfcb9fa4e0496f7eedf1d90bc7/packages). MJML is also bundled for browser compilation. The published `mjml-browser` package contains prebundled third-party code without a complete embedded license manifest. The [pinned compiler supplement](docs/third-party/mjml-browser.json) preserves verified upstream dependency license texts as a conservative superset, with its scope and remaining provenance limits recorded explicitly. It is not an exact enumeration of the opaque upstream bundle.

The MIT License (MIT)

Copyright (c) 2016 Mailjet SAS, https://mjml.io

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## PostCSS

Canvas custom CSS and web font stylesheets are scoped and rewritten with [PostCSS](https://github.com/postcss/postcss), which is bundled for browser use.

The MIT License (MIT)

Copyright (c) 2015 Andrey Sitnik <andrey@sitnik.ru>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Phosphor Icons

The editor controls and block palette use [Phosphor Icons](https://phosphoricons.com/) through `@phosphor-icons/react`. The selected icons are bundled with the editor.

MIT License

Copyright (c) 2020 Phosphor Icons

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## CodeMirror and Lezer

The CSS source editor bundles [CodeMirror 6](https://codemirror.net/) (`autocomplete`, `commands`, `lang-css`, `language`, `state`, and `view`) and [Lezer](https://lezer.codemirror.net/) (`common`, `css`, `highlight`, and `lr`), together with `@marijn/find-cluster-break`, `style-mod`, and `w3c-keyname`. Their individual installed license texts and versions are retained in each build's generated notices.

MIT License

Copyright (C) 2018-2021 by Marijn Haverbeke <marijn@haverbeke.berlin> and others (CodeMirror)

Copyright (C) 2018 by Marijn Haverbeke <marijn@haverbeke.berlin> and others (Lezer and style-mod)

Copyright (C) 2024 by Marijn Haverbeke <marijn@haverbeke.berlin> (find-cluster-break)

Copyright (C) 2016 by Marijn Haverbeke <marijn@haverbeke.berlin> and others (w3c-keyname)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.

## Cheerio

[Cheerio](https://github.com/cheeriojs/cheerio) provides the browser DOM parsing required by MJML. Its parser, selector, entity, and DOM dependencies have their own MIT, BSD-2-Clause, or ISC notices in the generated inventory.

MIT License

Copyright (c) 2022 The Cheerio contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## sanitize-html

[sanitize-html](https://github.com/apostrophecms/sanitize-html) sanitizes imported and rendered rich text. The generated inventory also preserves its parser, CSS, URL, and utility dependency notices.

Copyright (c) 2013, 2014, 2015 P'unk Avenue LLC

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## Puck and standalone demo dependencies

[Puck](https://github.com/puckeditor/puck), [React](https://github.com/facebook/react), and [Tiptap](https://github.com/ueberdosis/tiptap) are MIT-licensed. The generated demo inventory includes their complete installed license texts and those of ProseMirror, DnD Kit, Radix UI, Floating UI, TanStack Virtual, Zustand, and the other bundled dependencies. Puck's CSS license is also retained in the library inventory.

Puck 0.24.0 additionally embeds code from Lucide React, css-box-model, tiny-invariant, classnames, and DnD Kit collision. Their verified archive license texts and source evidence are retained in the [Puck supplement](docs/third-party/puck-core.json), including Lucide's ISC license and the Feather MIT notice. Upstream prebundled code has the limitations documented in the [audit guide](docs/third-party/README.md).

### Puck

MIT License

Copyright (c) The Puck Contributors.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

### React and React DOM

MIT License

Copyright (c) Meta Platforms, Inc. and affiliates.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

### Tiptap

MIT License

Copyright (c) 2025, Tiptap GmbH

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
