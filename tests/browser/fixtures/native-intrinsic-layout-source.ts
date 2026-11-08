export const intrinsicCases = ["shrink-ltr", "shrink-rtl", "fixed-ltr", "fixed-rtl"] as const;

/** Synthetic intrinsic-width and empty-cell cases, independent of any template. */
export function intrinsicLayoutSource() {
  return `<mjml><mj-head>
    <mj-attributes><mj-all font-family="Arial, sans-serif" /></mj-attributes>
    <mj-style>
      p { margin:0; }
      .intrinsic-auto { width:auto!important; max-width:none; }
      .intrinsic-symbol { width:32px!important; max-width:32px; }
      .intrinsic-table td { vertical-align:middle; }
      .intrinsic-table p { margin:0; }
    </mj-style>
  </mj-head><mj-body width="600px">
    <mj-section padding="0px" css-class="table-section"><mj-column padding="0px">
      <mj-table css-class="intrinsic-table" padding="0px" font-size="16px" line-height="20px">
        <tr><td>Label</td><td style="padding:40px 0px 0px"></td><td style="width:75px;text-align:right">$7.50</td></tr>
        <tr><td>Authored paragraph</td><td><p><br />Spacer</p></td><td>Kept</td></tr>
        <tr><td>Authored break</td><td><br />Spacer</td><td>Kept</td></tr>
      </mj-table>
    </mj-column></mj-section>
    ${intrinsicCases
      .map(
        (
          id,
        ) => `<mj-section padding="0px" css-class="${id}" direction="${id.endsWith("rtl") ? "rtl" : "ltr"}">
      <mj-group width="240px" css-class="${id}-group${id.startsWith("shrink") ? " intrinsic-auto" : ""}" direction="${id.endsWith("rtl") ? "rtl" : "ltr"}">
        <mj-column padding="0px" width="32px" vertical-align="middle" css-class="${id}-symbol intrinsic-symbol">
          <mj-spacer height="28px" padding="0px" />
        </mj-column>
        <mj-column padding="0px" width="208px" vertical-align="middle" css-class="${id}-label intrinsic-auto">
          <mj-text padding="0px" font-size="14px" line-height="18px">Compact label</mj-text>
        </mj-column>
      </mj-group>
    </mj-section>`,
      )
      .join("")}
  </mj-body></mjml>`;
}
