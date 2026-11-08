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
