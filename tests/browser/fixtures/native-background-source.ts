export const backgroundStates = {
  initial: { "background-position": "top center" },
  x: { "background-position": "top center", "background-position-x": "25%" },
  xy: {
    "background-position": "top center",
    "background-position-x": "25%",
    "background-position-y": "75%",
  },
  removed: { "background-position": "top center" },
  changed: { "background-position": "right bottom" },
  replacement: { "background-position": "bottom left" },
} as const;
export type BackgroundState = keyof typeof backgroundStates;
export function backgroundSource(state: BackgroundState) {
  const attributes = Object.entries(backgroundStates[state])
    .map(([name, value]) => `${name}="${value}"`)
    .join(" ");
  return `<mjml><mj-body width="640px"><mj-section css-class="background-target" padding="48px 32px 240px" background-url="https://example.com/background.svg" background-color="#431D26" background-size="cover" background-repeat="no-repeat" ${attributes}><mj-column padding="0px"><mj-text padding="0px" font-family="Arial" font-size="64px" line-height="64px">Position<br />fixture</mj-text><mj-text padding="28px 0px 0px" font-family="Arial" font-size="16px" line-height="24px">Editable content</mj-text></mj-column></mj-section></mj-body></mjml>`;
}
