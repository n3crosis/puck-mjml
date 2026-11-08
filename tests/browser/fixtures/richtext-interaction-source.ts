/** Generic light-weight copy exercises marks without branded template assumptions. */
export const richTextInteractionSource = `<mjml><mj-head><mj-attributes>
  <mj-all font-family="Arial, sans-serif" />
  <mj-text font-weight="300" font-size="16px" />
  <mj-table font-weight="300" font-size="16px" />
  </mj-attributes></mj-head><mj-body><mj-section><mj-column>
  <mj-text css-class="formatting-target">Light selection stays editable.</mj-text>
  <mj-text css-class="source-target">Unchanged source <strong>relative</strong>.</mj-text>
  <mj-table css-class="formatting-table"><tr><td>Table selection stays editable.</td>
  <td>Untouched neighbor.</td></tr></mj-table>
  </mj-column></mj-section></mj-body></mjml>`;

export const adjacentLinkSource = `<mjml><mj-head><mj-attributes>
  <mj-all font-family="Arial, sans-serif"/><mj-text font-size="16px"/>
  </mj-attributes><mj-style inline="inline">
  .adjacent-links a { display:inline-block; margin:8px 10px 0 0; }
  </mj-style></mj-head><mj-body><mj-section><mj-column>
  <mj-text css-class="adjacent-links"><a href="https://example.com/shared">First</a><a href="https://example.com/shared">Second</a><a href="https://example.com/shared">Third</a><a href="https://example.com/shared">Fourth</a></mj-text>
  </mj-column></mj-section></mj-body></mjml>`;

/** Original offline font deliberately substitutes ffi, including in synthetic bold. */
export async function createShapingSource() {
  const { fromMjml } = await import("../../../src/import");
  const { toMjml } = await import("../../../src/export");
  const shapingDocument = fromMjml(`<mjml><mj-head>
  <mj-attributes><mj-all font-family="LigatureProbe, monospace" font-size="16px" font-weight="400" /></mj-attributes>
  <mj-style>
    @font-face { font-family:LigatureProbe; font-weight:400; src:url('/tests/browser/fixtures/fonts/ligature.woff') format('woff'); }
    :where(.shaping-direct .ProseMirror) { font-variant-ligatures:normal; font-feature-settings:normal; }
    .shaping-disabled, .shaping-direct { font-variant-ligatures:none; font-feature-settings:"liga" 0; }
    .shaping-direct p { font-variant-ligatures:normal; font-feature-settings:normal; }
    .shaping-descendant strong { font-variant-ligatures:none; font-feature-settings:"liga" 0; }
  </mj-style></mj-head><mj-body><mj-section><mj-column>
  <mj-text css-class="shaping-text"><p>office planet <strong>office</strong> <a href="https://example.com/help">office</a></p></mj-text>
  <mj-text css-class="shaping-disabled"><p>office planet <strong>office</strong></p></mj-text>
  <mj-text css-class="shaping-direct"><p>office planet <strong>office</strong></p></mj-text>
  <mj-text css-class="shaping-descendant"><p>office planet <strong>office</strong></p></mj-text>
  <mj-table css-class="shaping-table"><tr><td>office planet <strong>office</strong></td></tr></mj-table>
  </mj-column></mj-section></mj-body></mjml>`).document;
  // Exercise the public intrinsic model/serialization boundary, not an ordinary
  // MJML group with authored auto-width CSS (which remains a native Group).
  shapingDocument.root.props!.sections!.push({
    type: "Section",
    props: {
      id: "shaping-section",
      padding: "0px",
      columns: [
        {
          type: "Column",
          props: {
            id: "shaping-column",
            padding: "0px",
            content: [
              {
                type: "IntrinsicRow",
                props: {
                  id: "shaping-row",
                  width: "auto",
                  mobile: "keep",
                  padding: "0px",
                  cells: [
                    {
                      type: "IntrinsicCell",
                      props: {
                        id: "shaping-cell",
                        padding: "0px",
                        content: [
                          {
                            type: "Text",
                            props: {
                              id: "shaping-intrinsic",
                              cssClass: "shaping-intrinsic",
                              padding: "0px",
                              fontFamily: "LigatureProbe, monospace",
                              fontSize: 16,
                              fontWeight: 400,
                              content: "<p>office planet <strong>office</strong></p>",
                            },
                          },
                        ],
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
      ],
    },
  });
  return toMjml(shapingDocument);
}
