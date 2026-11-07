import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { compileEmail, toMjml } from "./export";
import type { EmailBlock, EmailDocument, EmailSettings, MjmlAttribute } from "./types";

beforeAll(() => vi.stubGlobal("window", globalThis));
afterAll(() => vi.unstubAllGlobals());

const values = (attributes: Record<string, string>): MjmlAttribute[] =>
  Object.entries(attributes).map(([name, value]) => ({ name, value }));
const inherited = (...names: string[]): MjmlAttribute[] =>
  names.map((name) => ({ name, inherit: true }));
const doc = (column: EmailBlock[], settings: EmailSettings = {}): EmailDocument => ({
  root: { props: { sections: [{ type: "Section1", props: { id: "s", column } }], ...settings } },
  content: [],
});

describe("native MJML attribute export", () => {
  it("exports values beyond the visual control ranges and keeps explicitly empty attributes", async () => {
    const result = await compileEmail(
      doc(
        [
          {
            type: "Text",
            props: {
              id: "t",
              content: "<p>Large text</p>",
              mjmlAttributes: values({
                "font-size": "96px",
                "line-height": "110%",
                "letter-spacing": "-0.1em",
                color: "navy",
                "text-transform": "uppercase",
              }),
            },
          },
          {
            type: "Button",
            props: {
              id: "b",
              label: "Unlinked",
              mjmlAttributes: values({
                href: "",
                border: "2px dotted navy",
                width: "200px",
                "inner-padding": "0",
              }),
            },
          },
          {
            type: "Spacer",
            props: {
              id: "space",
              mjmlAttributes: values({
                height: "0px",
                "container-background-color": "rgba(0, 0, 0, 0.5)",
              }),
            },
          },
        ],
        { bodyAttributes: values({ width: "1200px" }) },
      ),
    );
    expect(result.errors).toEqual([]);
    expect(result.mjml).toContain('<mj-body width="1200px"');
    expect(result.mjml).toContain('font-size="96px"');
    expect(result.mjml).toContain('href=""');
    expect(result.html).toContain("font-size:96px");
    expect(result.html).toContain("letter-spacing:-0.1em");
    expect(result.html).toContain("text-transform:uppercase");
  });

  it("lets local fields inherit global, component, named, and ancestor class defaults", async () => {
    const document: EmailDocument = {
      root: {
        props: {
          attributeDefaults: values({ color: "#111111" }),
          componentDefaults: [
            { tag: "mj-text", attributes: values({ "font-size": "19px", color: "#222222" }) },
          ],
          mjmlClasses: [
            { name: "body-copy", attributes: values({ color: "#333333", "css-class": "copy" }) },
            {
              name: "theme",
              attributes: [],
              components: [
                {
                  tag: "mj-text",
                  attributes: values({ color: "#444444", "font-style": "italic" }),
                },
              ],
            },
          ],
          sections: [
            {
              type: "Wrapper",
              props: {
                id: "w",
                mjClass: "theme",
                sections: [
                  {
                    type: "Section1",
                    props: {
                      id: "s",
                      column: [
                        {
                          type: "Text",
                          props: {
                            id: "t",
                            content: "<p>Inherited</p>",
                            mjClass: "body-copy",
                            mjmlAttributes: inherited("font-size", "color"),
                          },
                        },
                      ],
                    },
                  },
                ],
              },
            },
          ],
        },
      },
      content: [],
    };
    const result = await compileEmail(document);
    expect(result.errors).toEqual([]);
    expect(result.mjml).toContain(
      '<mj-class name="theme"><mj-text color="#444444" font-style="italic" /></mj-class>',
    );
    const text = result.mjml.match(/<mj-text[^>]*>\s*<p>Inherited/)?.[0];
    expect(text).not.toContain("font-size=");
    expect(text).not.toContain("color=");
    expect(text).toContain('mj-class="body-copy"');
    expect(result.html).toContain("font-size:19px");
    expect(result.html).toContain("color:#444444");
    expect(result.html).toContain("font-style:italic");
    expect(result.html).toContain('class="pm-email-text copy"');
  });

  it("supports native implicit-column and nested element attributes", async () => {
    const document = doc([
      {
        type: "Navbar",
        props: {
          id: "nav",
          mjmlAttributes: values({ "base-url": "https://example.com/", hamburger: "hamburger" }),
          links: [
            {
              label: "Offers",
              href: "offers",
              mjmlAttributes: values({ "font-size": "18px", "padding-left": "4px" }),
            },
          ],
        },
      },
      {
        type: "Social",
        props: {
          id: "social",
          links: [
            {
              name: "web",
              label: "Docs",
              href: "https://example.com/",
              mjmlAttributes: values({
                "icon-size": "32px",
                "text-padding": "0",
                "vertical-align": "top",
              }),
            },
          ],
        },
      },
      {
        type: "Accordion",
        props: {
          id: "accordion",
          mjmlAttributes: values({ "icon-position": "left" }),
          items: [
            {
              title: "Question",
              content: "<p>Answer</p>",
              mjmlAttributes: values({ border: "1px solid red" }),
              titleAttributes: values({ "font-size": "24px", "background-color": "#eeeeee" }),
              textAttributes: values({ padding: "30px", "line-height": "150%" }),
            },
          ],
        },
      },
      {
        type: "Carousel",
        props: {
          id: "carousel",
          thumbnails: "visible",
          images: [
            {
              src: "https://example.com/photo.png",
              alt: "Photo",
              mjmlAttributes: values({
                "thumbnails-src": "https://example.com/thumb.png",
                target: "_self",
              }),
            },
          ],
        },
      },
    ]);
    Object.assign(document.root.props!.sections![0].props, {
      columnAttributes: values({
        "inner-background-color": "#fafafa",
        padding: "12px",
        "border-left": "2px solid green",
      }),
    });
    const result = await compileEmail(document);
    expect(result.errors).toEqual([]);
    expect(result.mjml).toContain(
      '<mj-column inner-background-color="#fafafa" padding="12px" border-left="2px solid green">',
    );
    expect(result.html).toContain('href="https://example.com/offers"');
    expect(result.mjml).toContain(
      '<mj-accordion-title font-size="24px" background-color="#eeeeee">',
    );
    expect(result.mjml).toContain('<mj-accordion-text padding="30px" line-height="150%">');
    expect(result.html).toContain("https://example.com/thumb.png");
  });

  it("replaces invalid visual URLs before validation and allows inherited sources", async () => {
    const result = await compileEmail(
      doc(
        [
          {
            type: "Image",
            props: {
              id: "image",
              src: "unfinished",
              mjmlAttributes: values({ src: "https://example.com/final.png" }),
            },
          },
          {
            type: "Button",
            props: {
              id: "button",
              href: "unfinished",
              label: "Inherited link",
              mjClass: "link",
              mjmlAttributes: inherited("href"),
            },
          },
        ],
        {
          mjmlClasses: [
            { name: "link", attributes: values({ href: "https://example.com/inherited" }) },
          ],
        },
      ),
    );
    expect(result.errors).toEqual([]);
    expect(result.html).toContain('src="https://example.com/final.png"');
    expect(result.html).toContain('href="https://example.com/inherited"');
    expect(result.mjml).not.toContain("unfinished");
  });

  it("does not provide an unchecked attribute or URL escape hatch", () => {
    expect(() =>
      toMjml(doc([{ type: "Text", props: { mjmlAttributes: values({ onclick: "bad()" }) } }])),
    ).toThrow();
    expect(() =>
      toMjml(
        doc([{ type: "Button", props: { mjmlAttributes: values({ href: "javascript:bad()" }) } }]),
      ),
    ).toThrow();
    expect(() =>
      toMjml(
        doc([], {
          mjmlClasses: [
            { name: "unsafe", attributes: values({ "background-url": "javascript:bad()" }) },
          ],
        }),
      ),
    ).toThrow();
  });
});
