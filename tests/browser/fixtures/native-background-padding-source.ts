const image = "https://example.com/background.png";
const background = `background-url="${image}" background-size="cover"`;
const column = (name: string) =>
  `<mj-column padding="0px"><mj-text css-class="probe-${name}" padding="0px">${name}</mj-text></mj-column>`;
export const backgroundPaddingSource = (inset: number, hasBackground: boolean) => `<mjml><mj-head>
  <mj-breakpoint width="601px" />
  <mj-attributes><mj-all font-family="Arial, sans-serif" /><mj-text font-size="14px" line-height="20px" /></mj-attributes>
  <mj-style>
    @media (max-width: 600px) {
      @supports (display: block) {
        .inset > table > tbody > tr > td { padding-left: 16px !important; padding-right: 16px !important; }
        .inset > div > table > tbody > tr > td { padding-left: ${inset}px !important; padding-right: ${inset}px !important; }
        .shell > div > table > tbody > tr > td { padding: 8px !important; }
        .ordinary-rule-only > table > tbody > tr > td { padding: 3px !important; }
        .background-rule-only > div > table > tbody > tr > td { padding: 2px !important; }
        .full > table > tbody > tr > td, .full > div > table > tbody > tr > td { padding: 1px !important; }
        .priority > div > table > tbody > tr > td { padding-left: 5px; }
        .specificity > div > table > tbody > tr > td { padding-left: ${inset}px !important; }
      }
    }
    .authored > table > tbody > tr > td { padding-right: 9px !important; }
  </mj-style>
</mj-head><mj-body width="640px">
  <mj-section css-class="ordinary inset" padding="32px">${column("ordinary")}</mj-section>
  <mj-section css-class="background inset" padding="32px" ${hasBackground ? background : ""}>${column("background")}</mj-section>
  <mj-wrapper css-class="shell" padding="32px" ${background}>
    <mj-section padding="0px">${column("shell")}</mj-section>
  </mj-wrapper>
  <mj-section css-class="ordinary-rule-only" padding="32px" ${background}>${column("ordinary-rule-only")}</mj-section>
  <mj-section css-class="background-rule-only" padding="32px">${column("background-rule-only")}</mj-section>
  <mj-section css-class="full full-section" full-width="full-width" padding="32px" ${background}>${column("full-section")}</mj-section>
  <mj-wrapper css-class="full full-wrapper" full-width="full-width" padding="32px" ${background}>
    <mj-section padding="0px">${column("full-wrapper")}</mj-section>
  </mj-wrapper>
  <mj-section css-class="priority" padding="32px" ${background}>${column("priority")}</mj-section>
  <mj-section css-class="specificity" padding="32px" ${background}>${column("specificity")}</mj-section>
  <mj-section padding="0px"><mj-column padding="0px">
    <mj-table css-class="authored inset" padding="0px"><tr><td style="padding: 6px">Authored table</td></tr></mj-table>
  </mj-column></mj-section>
</mj-body></mjml>`;
