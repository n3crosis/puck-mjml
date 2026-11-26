import catalog from "./native-catalog.json";

/** MJML component bodies that contain opaque content rather than child components. */
export const nativeEndingTags: ReadonlySet<string> = new Set([
  ...Object.entries(catalog.components)
    .filter(([, component]) => component.endingTag)
    .map(([name]) => name),
  "mj-html-attribute",
]);

/** The native parser implicitly closes ending tags at any MJML closing tag, including ancestors. */
export const mjmlClosingTag = new RegExp(
  `<\\s*\\/\\s*(?:${[...new Set(["mjml", "mj-head", "mj-body", ...Object.keys(catalog.components)])].join("|")})(?=[\\s/>])`,
  "i",
);
