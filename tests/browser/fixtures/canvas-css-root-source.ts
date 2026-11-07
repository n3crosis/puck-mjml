export const rootCascadeCases = [
  { id: "type", css: "div {max-width:250px}", desktop: "200px", mobile: "250px" },
  { id: "universal", css: "* {max-width:250px}", desktop: "200px", mobile: "250px" },
  { id: "class", css: ".wide {max-width:250px}", desktop: "250px", mobile: "250px" },
  { id: "root-type", css: ":root div {max-width:250px}", desktop: "250px", mobile: "250px" },
  {
    id: "root-class",
    css: ":root .wide {max-width:250px} .wide {max-width:150px}",
    desktop: "250px",
    mobile: "250px",
  },
  {
    id: "body-class",
    css: "body .wide {max-width:250px} .wide {max-width:150px}",
    desktop: "250px",
    mobile: "250px",
  },
  {
    id: "html-body",
    css: "html > body .wide {max-width:250px} .wide {max-width:150px}",
    desktop: "250px",
    mobile: "250px",
  },
  {
    id: "important",
    css: ":root div {max-width:250px!important} .wide {max-width:150px!important}",
    desktop: "250px",
    mobile: "250px",
  },
  {
    id: "none",
    css: ":root div {max-width:none} .wide {max-width:150px}",
    desktop: "none",
    mobile: "none",
  },
  {
    id: "body-type",
    css: "body div {max-width:250px} .wide {max-width:150px}",
    desktop: "150px",
    mobile: "150px",
  },
];

export const rootCascadeSource = (css: string) => `<mjml><mj-head>
  <mj-breakpoint width="601px"/><mj-attributes><mj-all font-family="Arial"/></mj-attributes>
  <mj-style>.wide {width:250px!important} ${css}</mj-style>
  </mj-head><mj-body width="600px"><mj-section padding="0"><mj-column width="200px" css-class="wide" padding="0"><mj-text padding="0">Cascade probe</mj-text></mj-column></mj-section></mj-body></mjml>`;

export const nestedIsolationCss = `
  :root::before {content:"root-marker"; color:rgb(31, 41, 51)}
  :root:unsupported-pseudo, .invalid-list {outline:19px solid red!important}
  :root:is(.pm-canvas-isolation, :unsupported-pseudo) > .supported {border-top:7px solid blue}
  :root .nested-target {padding-left:3px!important}
  :root {
    & > .supported {color:rgb(11, 22, 33)!important}
    & > .supported::before {content:"nested-marker"; color:rgb(21, 31, 41)}
    & .safe + .peer {color:rgb(41, 51, 61)!important}
    & + .escape {outline:19px solid red!important}
    & ~ .sibling-editor .escape {outline:19px solid red!important}
    &[data-ready="yes"]:is(.pm-canvas-isolation) + .escape {outline:19px solid red!important}
    :is(&, .escape) {outline:19px solid red!important}
    :not(&) {outline:19px solid red!important}
    & > .supported, & + .escape {outline:19px solid red!important}
    .supported,, .escape {outline:19px solid red!important}
    @media (min-width:1px) {
      @supports (display:block) {
        & + .escape {outline:19px solid red!important}
        & > .conditional {color:rgb(51, 61, 71)!important}
      }
    }
    @container (min-width:1px) { & + .escape {outline:19px solid red!important} }
    @layer nested { & + .escape {outline:19px solid red!important} }
    @scope (.escape) { & {outline:19px solid red!important} }
    @starting-style { & + .escape {outline:19px solid red!important} }
  }
`;
