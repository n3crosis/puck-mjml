/** Minimal editable text/table fixture shared by component and browser regressions. */
export const importedRichContentSource = `<mjml><mj-head>
  <mj-attributes><mj-all font-family="Arial" /><mj-text padding="0px" /></mj-attributes>
  <mj-style>
    .rich-labels a { color:#0066cc; text-decoration:none; }
    .details p { margin:0; font-size:12px; line-height:18px; }
    .details p:first-child { font-size:10px; color:#666666; }
    .details td { word-break:normal; }
    @media (max-width:479px) { .rich-labels a { color:#003399; } }
  </mj-style></mj-head><mj-body width="600px"><mj-section><mj-column>
  <mj-text css-class="rich-labels"><a>Primary label</a> and <a>Secondary label</a>.</mj-text>
  <mj-table css-class="details" table-layout="auto" align="left" padding="12px 0px">
    <tr><td><p>REFERENCE</p><p>First value</p><p>Second value</p></td>
    <td><p>DATE</p><p>Sample date</p></td></tr>
  </mj-table>
  </mj-column></mj-section></mj-body></mjml>`;
