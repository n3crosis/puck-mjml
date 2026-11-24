import catalog from "./native-catalog.json";

/** MJML component bodies that contain opaque content rather than child components. */
export const nativeEndingTags: ReadonlySet<string> = new Set([
  ...Object.entries(catalog.components)
    .filter(([, component]) => component.endingTag)
    .map(([name]) => name),
  "mj-html-attribute",
]);
