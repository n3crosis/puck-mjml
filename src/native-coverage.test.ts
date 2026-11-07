import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { compileEmail, toMjml } from "./export";
import { nativeCatalog, readNativeAttributes } from "./native-attributes";
import type { EmailBlock, EmailDocument, MjmlAttribute } from "./types";

beforeAll(() => vi.stubGlobal("window", globalThis));
afterAll(() => vi.unstubAllGlobals());

const imageUrl = "https://example.com/native.png";
const linkUrl = "https://example.com/native-link";
const block = (type: string, props: EmailBlock["props"] = {}): EmailBlock => ({ type, props });
const text = () => block("Text", { content: "<p>Native attribute coverage</p>" });
const column = () => block("Column", { content: [text()] });
const section = () => block("Section", { columns: [column()] });
const documentWith = (sections: EmailBlock[]): EmailDocument => ({
  root: { props: { sections } },
  content: [],
});
const withContent = (content: EmailBlock) =>
  documentWith([block("Section1", { column: [content] })]);
type Fixture = (attributes: MjmlAttribute[]) => EmailDocument;
const leaf =
  (type: string, props: EmailBlock["props"] = {}): Fixture =>
  (mjmlAttributes) =>
    withContent(block(type, { ...props, mjmlAttributes }));

// Explicit fixtures ensure every registered body component has an actual document
// route, including native children represented by item fields rather than blocks.
const fixtures: Record<string, Fixture> = {
  "mj-body": (bodyAttributes) => ({
    ...documentWith([section()]),
    root: { props: { sections: [section()], bodyAttributes } },
  }),
  "mj-wrapper": (mjmlAttributes) =>
    documentWith([block("Wrapper", { sections: [section()], mjmlAttributes })]),
  "mj-section": (mjmlAttributes) =>
    documentWith([block("Section", { columns: [column()], mjmlAttributes })]),
  "mj-column": (mjmlAttributes) =>
    documentWith([
      block("Section", { columns: [block("Column", { content: [text()], mjmlAttributes })] }),
    ]),
  "mj-group": (mjmlAttributes) =>
    documentWith([
      block("Section", { columns: [block("Group", { columns: [column()], mjmlAttributes })] }),
    ]),
  "mj-hero": (mjmlAttributes) =>
    documentWith([
      block("Hero", {
        content: [text()],
        backgroundUrl: imageUrl,
        backgroundWidth: 600,
        backgroundHeight: 320,
        height: 320,
        mjmlAttributes,
      }),
    ]),
  "mj-button": leaf("Button", { label: "Read more", href: linkUrl }),
  "mj-image": leaf("Image", { src: imageUrl, alt: "Native image" }),
  "mj-text": leaf("Text", { content: "<p>Native text</p>" }),
  "mj-spacer": leaf("Spacer"),
  "mj-divider": leaf("Divider"),
  "mj-table": leaf("Table", { bodyRows: [{ cells: [{ content: "<p>Native cell</p>" }] }] }),
  "mj-raw": leaf("Raw", { html: "<div>Native raw HTML</div>" }),
  "mj-social": leaf("Social", {
    links: [{ name: "web", href: linkUrl, src: imageUrl, label: "Website" }],
  }),
  "mj-social-element": (mjmlAttributes) =>
    withContent(
      block("Social", {
        links: [{ name: "web", href: linkUrl, src: imageUrl, label: "Website", mjmlAttributes }],
      }),
    ),
  "mj-navbar": leaf("Navbar", { links: [{ href: linkUrl, label: "Read more" }] }),
  "mj-navbar-link": (mjmlAttributes) =>
    withContent(
      block("Navbar", { links: [{ href: linkUrl, label: "Read more", mjmlAttributes }] }),
    ),
  "mj-accordion": leaf("Accordion", { items: [{ title: "Question", content: "<p>Answer</p>" }] }),
  "mj-accordion-element": (mjmlAttributes) =>
    withContent(
      block("Accordion", {
        items: [{ title: "Question", content: "<p>Answer</p>", mjmlAttributes }],
      }),
    ),
  "mj-accordion-title": (titleAttributes) =>
    withContent(
      block("Accordion", {
        items: [{ title: "Question", content: "<p>Answer</p>", titleAttributes }],
      }),
    ),
  "mj-accordion-text": (textAttributes) =>
    withContent(
      block("Accordion", {
        items: [{ title: "Question", content: "<p>Answer</p>", textAttributes }],
      }),
    ),
  "mj-carousel": leaf("Carousel", {
    images: [{ src: imageUrl, alt: "Native image", href: linkUrl }],
  }),
  "mj-carousel-image": (mjmlAttributes) =>
    withContent(
      block("Carousel", {
        images: [{ src: imageUrl, alt: "Native image", href: linkUrl, mjmlAttributes }],
      }),
    ),
};

const stringSamples: Record<string, string> = {
  alt: "Native image",
  title: "Native title",
  name: "web",
  rel: "noopener",
  target: "_blank",
  usemap: "#native-map",
  "background-position": "center center",
  "background-position-x": "50%",
  "background-position-y": "50%",
  "background-size": "cover",
  "background-url": imageUrl,
  "base-url": "https://example.com/",
  src: imageUrl,
  href: linkUrl,
  "icon-wrapped-url": imageUrl,
  "icon-unwrapped-url": imageUrl,
  "left-icon": imageUrl,
  "right-icon": imageUrl,
  "thumbnails-src": imageUrl,
  "icon-wrapped-alt": "Expand",
  "icon-unwrapped-alt": "Collapse",
  "ico-open": "+",
  "ico-close": "-",
  srcset: `${imageUrl} 1x, https://example.com/native@2x.png 2x`,
  sizes: "(max-width: 600px) 100vw, 600px",
  "font-family": "Arial, sans-serif",
  "ico-font-family": "Arial, sans-serif",
  "font-style": "italic",
  "font-weight": "500",
  "text-decoration": "underline",
  "ico-text-decoration": "none",
  "text-transform": "uppercase",
  "ico-text-transform": "uppercase",
  "border-radius": "6px",
  "tb-border-radius": "6px",
  "inner-border-radius": "6px",
  id: "native-body",
  "border-style": "solid",
  hamburger: "hamburger",
  mode: "fixed-height",
};

function sample(tag: string, name: string, descriptor: string): string {
  const nativeDefault = nativeCatalog[tag].defaultAttributes[name];
  if (["string", "number", "boolean"].includes(typeof nativeDefault)) {
    try {
      const value = readNativeAttributes(tag, [{ name, value: String(nativeDefault) }])[name];
      if (typeof value === "string") return value;
    } catch {
      // Some native defaults are internal sentinels, not legal explicit inputs.
    }
  }
  let value: string;
  if (descriptor === "color") value = "#123456";
  else if (descriptor === "integer") value = "2";
  else if (descriptor === "boolean") value = "true";
  else if (descriptor.startsWith("enum(")) value = descriptor.slice(5, -1).split(",")[0];
  else if (descriptor.startsWith("unit")) value = name.includes("width") ? "200px" : "12px";
  else if (descriptor === "string") {
    value = /^(?:inner-)?border(?:-(?:top|right|bottom|left))?$|^tb-border$/.test(name)
      ? "1px solid #123456"
      : stringSamples[name];
    if (value === undefined) throw new Error(`Missing meaningful string fixture: ${tag}.${name}`);
  } else throw new Error(`Missing descriptor fixture: ${tag}.${name} (${descriptor})`);
  const validated = readNativeAttributes(tag, [{ name, value }])[name];
  if (typeof validated !== "string")
    throw new Error(`Fixture did not produce a value: ${tag}.${name}`);
  return validated;
}

const bodyTags = Object.entries(nativeCatalog)
  .filter(([, spec]) => spec.kind === "body")
  .map(([tag]) => tag);
const declaredAttributes = bodyTags.flatMap((tag) =>
  Object.entries(nativeCatalog[tag].allowedAttributes).map(([name, descriptor]) => ({
    tag,
    name,
    descriptor,
  })),
);
const allAttributes = (tag: string): MjmlAttribute[] =>
  Object.entries(nativeCatalog[tag].allowedAttributes).map(([name, descriptor]) => ({
    name,
    value: sample(tag, name, descriptor),
  }));
const options = { allowRawHtml: true };

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function openingTag(mjml: string, tag: string): string {
  const opening = mjml.match(new RegExp(`<${tag}(?=[\\s>])[^>]*>`))?.[0];
  expect(opening, `Missing serialized ${tag}`).toBeDefined();
  return opening!;
}

function expectAttributes(opening: string, attributes: MjmlAttribute[]): void {
  for (const { name, value } of attributes)
    expect(opening).toContain(` ${name}="${escapeAttribute(value!)}"`);
}

describe("registered native body attribute export coverage", () => {
  it("has a document fixture for every registered body component", () => {
    expect(Object.keys(fixtures).sort()).toEqual([...bodyTags].sort());
    expect(bodyTags).toHaveLength(23);
    expect(declaredAttributes).toHaveLength(390);
  });

  it.each(declaredAttributes)("serializes $tag.$name", ({ tag, name, descriptor }) => {
    const attributes = [{ name, value: sample(tag, name, descriptor) }];
    const mjml = toMjml(fixtures[tag](attributes), options);
    expectAttributes(openingTag(mjml, tag), attributes);
  });

  it.each(bodyTags)("compiles all declared attributes together on %s", async (tag) => {
    const attributes = allAttributes(tag);
    // The native raw position belongs before mj-head/mj-body. The individual
    // serialization case above still exercises Raw.mjmlAttributes itself.
    const document =
      tag === "mj-raw"
        ? {
            root: { props: { sections: [section()], rawFileStart: "<!-- Native file start -->" } },
            content: [],
          }
        : fixtures[tag](attributes);
    const result = await compileEmail(document, options);
    expect(result.errors, tag).toEqual([]);
    expectAttributes(openingTag(result.mjml, tag), attributes);
    expect(result.html.includes("<!doctype html>")).toBe(true);
    if (tag === "mj-raw") expect(result.html.trimStart()).toMatch(/^<!-- Native file start -->/);
  });

  it.each(bodyTags)("supports shared class attributes on %s", (tag) => {
    const attributes = [
      { name: "css-class", value: "native-coverage" },
      { name: "mj-class", value: "native-unknown-class" },
    ];
    const opening = openingTag(toMjml(fixtures[tag](attributes), options), tag);
    const classes = opening.match(/ css-class="([^"]*)"/)?.[1].split(" ");
    expect(classes).toContain("native-coverage");
    expect(opening).toContain(' mj-class="native-unknown-class"');
  });

  it.each([
    ["Section1", "column"],
    ["Section2", "left"],
    ["Section2", "right"],
    ["Section3", "left"],
    ["Section3", "middle"],
    ["Section3", "right"],
  ])("compiles every column attribute through %s.%s", async (type, slot) => {
    const attributes = [...allAttributes("mj-column"), { name: "css-class", value: "native-slot" }];
    const document = documentWith([
      block(type, { [slot]: [text()], [`${slot}Attributes`]: attributes }),
    ]);
    const result = await compileEmail(document, options);
    expect(result.errors).toEqual([]);
    const opening = result.mjml.match(/<mj-column(?=[\s>])[^>]*css-class="native-slot"[^>]*>/)?.[0];
    expect(opening).toBeDefined();
    expectAttributes(opening!, attributes);
  });

  it("compiles Raw in body content with shared attributes", async () => {
    const result = await compileEmail(
      fixtures["mj-raw"]([{ name: "css-class", value: "native-raw" }]),
      options,
    );
    expect(result.errors).toEqual([]);
    expect(result.html).toContain("<div>Native raw HTML</div>");
    expect(openingTag(result.mjml, "mj-raw")).toContain('css-class="native-raw"');
  });
});
