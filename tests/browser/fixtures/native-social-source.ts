const icon = (name: string, label = "", attributes = "") =>
  `<mj-social-element name="web" src="https://example.com/social-icon.svg" href="https://example.com/${name}" alt="${name} icon" title="${name} destination" rel="noopener" target="_blank" padding="0px 24px 0px 0px" background-color="transparent" ${attributes}>${label}</mj-social-element>`;

export const socialCases = [
  {
    name: "horizontal-icons",
    attributes: "",
    children: icon("first") + icon("second"),
  },
  {
    name: "vertical-icons",
    attributes: 'mode="vertical"',
    children: icon("first") + icon("second"),
  },
  {
    name: "horizontal-labels",
    attributes: "",
    children: icon("first", "Website") + icon("second", "Updates"),
  },
  {
    name: "vertical-labels",
    attributes: 'mode="vertical"',
    children: icon("first", "Website") + icon("second", "Updates"),
  },
  {
    name: "right-icon",
    attributes: 'align="right"',
    children: icon("right", "Website", 'icon-position="right"'),
  },
  {
    name: "inherited-font",
    attributes:
      'align="center" font-family="Georgia, serif" font-size="23px" line-height="31px" font-weight="600" color="#345678"',
    children: icon("inherited", "Inherited typography"),
  },
  {
    name: "child-font",
    attributes: 'font-size="23px" line-height="31px"',
    children: icon(
      "child",
      "Child typography",
      'font-family="Courier New, monospace" font-size="17px" line-height="29px" font-weight="700" color="#234567"',
    ),
  },
];

export const socialSource = `<mjml><mj-head><mj-attributes><mj-all font-family="Arial, sans-serif" /></mj-attributes><mj-style inline="inline">.social-following p { margin:0; }</mj-style></mj-head><mj-body width="640px">${socialCases
  .map(
    ({ name, attributes, children }) =>
      `<mj-section padding="0px"><mj-column padding="0px"><mj-social css-class="social-${name}" padding="0px" icon-size="20px" icon-padding="0px" border-radius="0px" ${attributes}>${children}</mj-social><mj-text css-class="after-${name} social-following" padding="32px 0px" font-size="14px" line-height="21px"><p>After ${name}</p></mj-text></mj-column></mj-section>`,
  )
  .join("")}</mj-body></mjml>`;

export const socialPreviewSource = `<mjml><mj-body width="640px"><mj-section padding="0px"><mj-column padding="0px"><mj-social css-class="social-raw-child" padding="0px"><mj-raw><em>Stored raw child</em></mj-raw>${icon("raw")}</mj-social><mj-social css-class="social-raw-label" padding="0px">${icon("label", "<strong>Stored label</strong>")}</mj-social></mj-column></mj-section></mj-body></mjml>`;
