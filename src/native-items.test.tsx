import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { NativeLayoutContext } from "./native-layout-context";
import { NativeItems } from "./NativeItems";
import { createCanvasScope, getCanvasElement } from "./native-canvas-context";
import type { EmailSettings, MjmlAttribute } from "./types";

beforeAll(() => vi.stubGlobal("window", globalThis));
afterAll(() => vi.unstubAllGlobals());

const entries = (values: Record<string, string>): MjmlAttribute[] =>
  Object.entries(values).map(([name, value]) => ({ name, value }));
const tags = {
  Social: "mj-social",
  Navbar: "mj-navbar",
  Accordion: "mj-accordion",
  Carousel: "mj-carousel",
};
function render(
  name: keyof typeof tags,
  props: Record<string, unknown>,
  settings: EmailSettings = {},
  width = 600,
) {
  const resolved = getCanvasElement(tags[name], props, createCanvasScope(settings));
  expect(resolved).toBeDefined();
  return renderToStaticMarkup(
    <NativeLayoutContext.Provider value={{ width }}>
      <NativeItems name={name} props={props} {...resolved!} />
    </NativeLayoutContext.Provider>,
  );
}
async function compile(body: string, head = "", width = 600) {
  const { default: mjml } = await import("mjml-browser");
  const result = await mjml(
    `<mjml><mj-head>${head}</mj-head><mj-body width="${width}px"><mj-section><mj-column>${body}</mj-column></mj-section></mj-body></mjml>`,
    { validationLevel: "strict" },
  );
  expect(result.errors).toEqual([]);
  return result.html;
}

describe("native nested-component canvas", () => {
  it("inherits Social icon borders with child overrides without bordering the containing row", async () => {
    const canvas = render(
      "Social",
      {
        mjmlAttributes: entries({ border: "2px solid red", "border-radius": "12px" }),
        links: [
          { name: "web", href: "https://example.com", alt: "Inherited" },
          {
            name: "web",
            href: "https://example.com",
            alt: "Class",
            mjClass: "outlined",
          },
          {
            name: "web",
            href: "https://example.com",
            alt: "Local",
            mjClass: "outlined",
            mjmlAttributes: entries({ border: "0" }),
          },
        ],
      },
      { mjmlClasses: [{ name: "outlined", attributes: entries({ border: "3px dashed navy" }) }] },
    );
    const native = await compile(
      '<mj-social border="2px solid red" border-radius="12px"><mj-social-element name="web" href="https://example.com" alt="Inherited" /><mj-social-element name="web" href="https://example.com" alt="Class" mj-class="outlined" /><mj-social-element name="web" href="https://example.com" alt="Local" mj-class="outlined" border="0" /></mj-social>',
      '<mj-attributes><mj-class name="outlined" border="3px dashed navy" /></mj-attributes>',
    );
    for (const markup of [canvas, native]) {
      const $ = load(markup);
      expect($('img[alt="Inherited"]').css("border")).toBe("2px solid red");
      expect($('img[alt="Class"]').css("border")).toBe("3px dashed navy");
      expect($('img[alt="Local"]').css("border")).toBe("0");
      expect($('img[alt="Inherited"]').css("border-radius")).toBe("12px");
    }
    const $ = load(canvas);
    expect($(".pm-social").css("border")).toBeUndefined();
    expect($(".pm-social").css("border-radius")).toBeUndefined();
  });

  it("lets Social element defaults override an inherited parent border", async () => {
    const canvas = render(
      "Social",
      {
        mjmlAttributes: entries({ border: "2px solid red" }),
        links: [{ name: "web", href: "https://example.com", alt: "Default" }],
      },
      {
        componentDefaults: [
          { tag: "mj-social-element", attributes: entries({ border: "4px dotted green" }) },
        ],
      },
    );
    const native = await compile(
      '<mj-social border="2px solid red"><mj-social-element name="web" href="https://example.com" alt="Default" /></mj-social>',
      '<mj-attributes><mj-social-element border="4px dotted green" /></mj-attributes>',
    );
    for (const markup of [canvas, native])
      expect(load(markup)('img[alt="Default"]').css("border")).toBe("4px dotted green");
  });

  it("matches Social render inheritance above mj-all and below child tag defaults", async () => {
    const props = {
      links: [{ name: "web", href: "https://example.com", label: <strong>Website</strong> }],
      mjmlAttributes: entries({
        "font-size": "23px",
        color: "#123456",
        mode: "vertical",
        "inner-padding": "9px",
        "icon-size": "32px",
      }),
    };
    const settings = { attributeDefaults: entries({ "font-size": "11px" }) };
    const canvas = render("Social", props, settings);
    expect(canvas).toContain("display:inline-table");
    expect(canvas).toContain("font-size:23px");
    expect(canvas).toContain("color:#123456");
    expect(canvas).toContain("padding:9px");
    expect(canvas).toContain("<strong>Website</strong>");
    expect(canvas).toContain("ico-social/web.png");
    const native = await compile(
      '<mj-social font-size="23px" color="#123456" mode="vertical" inner-padding="9px" icon-size="32px"><mj-social-element name="web" href="https://example.com">Website</mj-social-element></mj-social>',
      '<mj-attributes><mj-all font-size="11px" /></mj-attributes>',
    );
    for (const output of [canvas, native]) expect(output).toContain("font-size:23px");
    const defaults = {
      ...settings,
      componentDefaults: [
        { tag: "mj-social-element", attributes: entries({ "font-size": "17px" }) },
      ],
    };
    expect(render("Social", props, defaults)).toContain("font-size:17px");
    const nativeDefaults = await compile(
      '<mj-social font-size="23px"><mj-social-element name="web" href="https://example.com">Website</mj-social-element></mj-social>',
      '<mj-attributes><mj-all font-size="11px" /><mj-social-element font-size="17px" /></mj-attributes>',
    );
    expect(nativeDefaults).toContain("font-size:17px");
  });

  it("uses resolved custom Social icons, network modes, and item typography", async () => {
    const props = {
      links: [
        {
          name: "facebook",
          href: "https://example.com/profile",
          label: "Profile",
          mjmlAttributes: entries({
            name: "facebook",
            src: "https://example.com/custom.png",
            "background-color": "transparent",
            "icon-position": "right",
            "font-weight": "700",
            "icon-size": "34px",
            "icon-height": "40px",
            "icon-padding": "5px",
            "text-padding": "8px",
            "border-radius": "12px",
            alt: "Custom",
          }),
        },
      ],
    };
    const canvas = render("Social", props);
    expect(canvas).toContain('src="https://example.com/custom.png"');
    expect(canvas).toContain('alt="Custom"');
    expect(canvas).toContain("background-color:transparent");
    expect(canvas).toContain("font-weight:700");
    expect(canvas).toContain("min-height:40px");
    expect(canvas).toContain("border-radius:12px");
    expect(canvas).toContain(
      'href="https://www.facebook.com/sharer/sharer.php?u=https://example.com/profile"',
    );
    expect(canvas.indexOf("Profile</a>")).toBeLessThan(canvas.indexOf('class="pm-social-icon"'));
    const native = await compile(
      '<mj-social><mj-social-element name="facebook" src="https://example.com/custom.png" background-color="transparent" href="https://example.com/profile" font-weight="700">Profile</mj-social-element></mj-social>',
    );
    expect(native).toContain(
      'href="https://www.facebook.com/sharer/sharer.php?u=https://example.com/profile"',
    );
    expect(
      render("Social", {
        links: [{ name: "facebook", href: "https://example.com/profile", label: "Profile" }],
      }),
    ).toContain('href="https://example.com/profile"');
  });

  it.each(["top", "middle", "bottom"])(
    "positions Social icons at the %s of tall labels",
    async (alignment) => {
      const canvas = load(
        render("Social", {
          links: [
            {
              name: "web",
              label: "A tall label",
              mjmlAttributes: entries({ "vertical-align": alignment, "line-height": "80px" }),
            },
          ],
        }),
      );
      const iconCell = canvas(".pm-social-icon").parent();
      expect(iconCell.css("align-self")).toBe(
        alignment === "top" ? "flex-start" : alignment === "bottom" ? "flex-end" : "center",
      );
      const native = load(
        await compile(
          `<mj-social><mj-social-element name="web" vertical-align="${alignment}" line-height="80px">A tall label</mj-social-element></mj-social>`,
        ),
      );
      expect(native("img").closest("table").parent().css("vertical-align")).toBe(alignment);
    },
  );

  it("shares icon and label columns across vertical Social rows", () => {
    const canvas = load(
      render("Social", {
        mjmlAttributes: entries({ mode: "vertical" }),
        links: [
          { name: "web", label: "First", mjmlAttributes: entries({ "icon-size": "20px" }) },
          { name: "web", label: "Second", mjmlAttributes: entries({ "icon-size": "60px" }) },
        ],
      }),
    );
    expect(canvas(".pm-social-item").first().parent().css("display")).toBe("inline-table");
    expect(canvas(".pm-social-item").first().css("display")).toBe("table-row");
    expect(canvas(".pm-social-icon").first().parent().css("display")).toBe("table-cell");
    expect(canvas(".pm-social-label").first().css("display")).toBe("table-cell");
  });

  it.each([180, 600])(
    "matches fixed default Carousel thumbnails in a %spx container",
    async (width) => {
      const images = Array.from({ length: 3 }, (_, index) => ({
        src: `https://example.com/${index}.png`,
      }));
      const canvas = load(
        render(
          "Carousel",
          {
            images,
            thumbnails: "visible",
            mjmlAttributes: entries({ align: "left", padding: "10px 20px" }),
          },
          {},
          width,
        ),
      );
      const native = load(
        await compile(
          `<mj-carousel align="left" padding="10px 20px">${images.map(({ src }) => `<mj-carousel-image src="${src}" />`).join("")}</mj-carousel>`,
          "",
          width,
        ),
      );
      expect(canvas(".pm-carousel-thumbnails button").first().css("width")).toBe(
        native(".mj-carousel-thumbnail").first().css("width"),
      );
      expect(canvas(".pm-carousel-thumbnails button").first().css("box-sizing")).toBe(
        "content-box",
      );
      expect(canvas(".pm-carousel-thumbnails").css("text-align")).toBe("center");
    },
  );

  it("resolves Navbar child classes and literal native base-url concatenation", async () => {
    const canvas = render(
      "Navbar",
      {
        links: [
          {
            label: <strong data-node="editable">Products</strong>,
            href: "products",
            mjClass: "nav-item",
          },
        ],
        mjmlAttributes: entries({
          "base-url": "https://example.com/shop/",
          padding: "7px",
          align: "right",
        }),
      },
      {
        mjmlClasses: [
          {
            name: "nav-item",
            attributes: entries({
              color: "#123456",
              "font-family": "Georgia",
              "font-size": "21px",
              "letter-spacing": "-.1em",
              padding: "4px 8px",
              "text-transform": "none",
            }),
          },
        ],
      },
    );
    expect(canvas).toContain('href="https://example.com/shop/products"');
    expect(canvas).toContain('data-node="editable">Products</strong>');
    expect(canvas).toContain("font-family:Georgia");
    expect(canvas).toContain("font-size:21px");
    expect(canvas).toContain("letter-spacing:-.1em");
    expect(canvas).toContain("padding:4px 8px");
    expect(canvas).toContain("text-align:right");
    const native = await compile(
      '<mj-navbar base-url="https://example.com/shop/"><mj-navbar-link href="products" font-size="21px" padding="4px 8px">Products</mj-navbar-link></mj-navbar>',
    );
    expect(native).toContain('href="https://example.com/shop/products"');
    expect(native).toContain("font-size:21px");
  });

  it("applies Accordion element, title and text attributes while retaining React content", async () => {
    const canvas = render("Accordion", {
      mjmlAttributes: entries({
        border: "3px dashed #123456",
        "icon-position": "left",
        "icon-width": "26px",
        "icon-height": "20px",
        "icon-unwrapped-url": "https://example.com/minus.png",
        "icon-unwrapped-alt": "Close",
      }),
      items: [
        {
          title: <strong>Question</strong>,
          content: (
            <p>
              Answer <em>content</em>
            </p>
          ),
          mjmlAttributes: entries({ "background-color": "#eeeeee" }),
          titleAttributes: entries({
            color: "#345678",
            "font-size": "24px",
            padding: "8px",
            "font-family": "Georgia",
          }),
          textAttributes: entries({
            color: "#567890",
            "font-size": "18px",
            "line-height": "1.8",
            padding: "11px",
          }),
        },
      ],
    });
    expect(canvas).toContain("border:3px dashed #123456");
    expect(canvas).toContain("flex-direction:row-reverse");
    expect(canvas).toContain('src="https://example.com/minus.png"');
    expect(canvas).toContain('alt="Close"');
    expect(canvas).toContain("width:26px;height:20px");
    expect(canvas).toContain("font-family:Georgia");
    expect(canvas).toContain("font-size:24px");
    expect(canvas).toContain("font-size:18px");
    expect(canvas).toContain("line-height:1.8");
    expect(canvas).toContain("<strong>Question</strong>");
    expect(canvas).toContain("<p>Answer <em>content</em></p>");
    const native = await compile(
      '<mj-accordion border="3px dashed #123456" icon-position="left"><mj-accordion-element><mj-accordion-title font-family="Georgia" font-size="24px">Question</mj-accordion-title><mj-accordion-text font-size="18px" line-height="1.8">Answer</mj-accordion-text></mj-accordion-element></mj-accordion>',
    );
    for (const value of [
      "font-size:24px",
      "font-size:18px",
      "font-family:Georgia",
      "line-height:1.8",
    ])
      expect(native).toContain(value);
  });

  it("matches Accordion font precedence for component defaults versus enclosing font", async () => {
    const props = {
      items: [{ title: "Question", content: "Answer" }],
      mjmlAttributes: entries({ "font-family": "Verdana" }),
    };
    const settings = {
      componentDefaults: [
        { tag: "mj-accordion-title", attributes: entries({ "font-family": "Georgia" }) },
      ],
    };
    const canvas = render("Accordion", props, settings);
    expect(canvas).not.toContain("font-family:Georgia");
    const native = await compile(
      '<mj-accordion font-family="Verdana"><mj-accordion-element><mj-accordion-title>Question</mj-accordion-title><mj-accordion-text>Answer</mj-accordion-text></mj-accordion-element></mj-accordion>',
      '<mj-attributes><mj-all font-family="Arial, sans-serif" /><mj-accordion-title font-family="Georgia" /></mj-attributes>',
    );
    expect(native).not.toContain("font-family:Georgia");
    expect(native).toContain("font-family:Arial, sans-serif");
    expect(canvas).toContain("font-family:Arial, sans-serif");
  });

  it("uses Carousel image overrides, thumbnail sources, radius, width and native controls", async () => {
    const props = {
      thumbnails: "visible",
      mjmlAttributes: entries({
        "border-radius": "14px",
        "tb-width": "70px",
        "tb-border": "3px solid #123456",
        "tb-border-radius": "8px",
        "icon-width": "32px",
        "left-icon": "https://example.com/left.png",
        "right-icon": "https://example.com/right.png",
      }),
      images: [
        {
          src: "https://example.com/legacy.png",
          alt: "First",
          mjmlAttributes: entries({
            src: "https://example.com/native.png",
            "thumbnails-src": "https://example.com/thumb.png",
            href: "/gallery",
            "border-radius": "18px",
          }),
        },
        { src: "https://example.com/second.png", alt: "Second" },
      ],
    };
    const canvas = render("Carousel", props);
    expect(canvas).not.toContain("legacy.png");
    expect(canvas).toContain('src="https://example.com/native.png"');
    expect(canvas).toContain('src="https://example.com/thumb.png"');
    expect(canvas).toContain('href="/gallery"');
    expect(canvas).toContain("border-radius:18px");
    expect(canvas).toContain("border-radius:8px");
    expect(canvas).toContain("width:70px");
    expect(canvas).toContain("width:32px");
    expect(canvas).toContain('src="https://example.com/left.png"');
    expect(canvas).toContain('aria-pressed="true"');
    const native = await compile(
      '<mj-carousel border-radius="14px" tb-width="70px" icon-width="32px" left-icon="https://example.com/left.png"><mj-carousel-image src="https://example.com/native.png" thumbnails-src="https://example.com/thumb.png" href="/gallery" border-radius="18px" /><mj-carousel-image src="https://example.com/second.png" /></mj-carousel>',
    );
    for (const value of ["native.png", "thumb.png", "left.png", "border-radius:18px", "width:70px"])
      expect(native).toContain(value);
    expect(native).toMatch(/thumbnail-2:hover[^{}]+\.mj-carousel-image-2\s*\{\s*display: block/);
  });

  it("preserves ordered and raw Accordion content as safe editable previews", () => {
    const canvas = render("Accordion", {
      items: [
        { kind: "raw", html: "<script>outer</script>" },
        {
          children: [
            {
              kind: "text",
              content: <p>First answer</p>,
              mjmlAttributes: entries({ color: "#123456" }),
            },
            { kind: "raw", html: "<script>inner</script>" },
            { kind: "title", content: <strong>Later title</strong> },
            { kind: "title", htmlContent: "<b>Repeated source title</b>" },
          ],
        },
        { children: [] },
      ],
    });
    expect(canvas).not.toContain("<script>");
    expect(canvas).toContain("&lt;script&gt;outer&lt;/script&gt;");
    expect(canvas).toContain("&lt;script&gt;inner&lt;/script&gt;");
    expect(canvas).toContain("color:#123456");
    expect(canvas.indexOf("First answer")).toBeLessThan(canvas.indexOf("&lt;script&gt;inner"));
    expect(canvas.indexOf("&lt;script&gt;inner")).toBeLessThan(canvas.indexOf("Later title"));
    expect(canvas.indexOf("Later title")).toBeLessThan(canvas.indexOf("Repeated source title"));
    expect(canvas).not.toContain("<summary");
  });

  it("hides Carousel thumbnails when native attributes request it", () => {
    const canvas = render("Carousel", {
      thumbnails: "visible",
      images: [{ src: "https://example.com/image.png" }],
      mjmlAttributes: entries({ thumbnails: "hidden" }),
    });
    expect(canvas).not.toContain("pm-carousel-thumbnails");
    expect(canvas).toContain('class="pm-carousel-main"');
    expect(canvas).not.toContain("Previous image");
  });

  it("renders native hamburger controls and safe decoded glyphs with responsive hooks", () => {
    const props = {
      links: [{ label: "Home", href: "https://example.com" }],
      mjmlAttributes: entries({
        hamburger: "hamburger",
        "ico-open": "&#9776;",
        "ico-color": "#123456",
        "ico-font-size": "36px",
        "ico-line-height": "40px",
        "ico-padding": "8px",
        "ico-align": "right",
      }),
    };
    const canvas = render("Navbar", props);
    expect(canvas).toContain('data-native-navbar-open="false"');
    expect(canvas).toContain('class="pm-native-navbar-trigger"');
    expect(canvas).toContain('class="pm-native-navbar-links"');
    expect(canvas).toContain('aria-expanded="false"');
    expect(canvas).toContain('aria-label="Open navigation"');
    expect(canvas).toContain("font-size:36px");
    expect(canvas).toContain("line-height:40px");
    expect(canvas).toContain("text-align:right");
    expect(canvas).toContain("☰</button>");
    expect(canvas).not.toContain("&amp;#9776;");
    expect(render("Navbar", { links: props.links })).not.toContain("data-native-navbar-open");
  });

  it("shows nested trusted HTML as escaped source without replacing editable React nodes", () => {
    const html = '<script>alert("unsafe")</script><img src=x onerror=alert(1)>';
    const sources = [
      render("Social", {
        links: [
          { kind: "raw", html },
          { name: "web", href: "https://example.com", htmlContent: html },
        ],
      }),
      render("Navbar", {
        links: [
          { kind: "raw", html },
          { href: "https://example.com", htmlContent: html },
        ],
      }),
      render("Accordion", { items: [{ titleHtmlContent: html, htmlContent: html }] }),
    ];
    for (const canvas of sources) {
      expect(canvas).not.toContain("<script>");
      expect(canvas).not.toContain("<img src=x");
      expect(canvas).toContain("&lt;script&gt;");
      expect(canvas).toContain("Trusted HTML source");
    }
  });

  it("never applies trusted template attributes and keeps concrete visual fallbacks", () => {
    const canvas = render(
      "Carousel",
      {
        thumbnails: "hidden",
        images: [
          {
            src: "https://example.com/concrete.png",
            alt: "Safe",
            mjmlAttributes: [{ name: "src", value: "javascript:alert(1)", template: true }],
          },
        ],
      },
      {
        componentDefaults: [
          {
            tag: "mj-carousel-image",
            attributes: [{ name: "src", value: "{{ remote_image }}", template: true }],
          },
        ],
      },
    );
    expect(canvas).toContain('src="https://example.com/concrete.png"');
    expect(canvas).not.toContain("javascript:");
    expect(canvas).not.toContain("remote_image");
    const navbar = render("Navbar", {
      links: [
        {
          href: "https://example.com/concrete",
          label: "Safe",
          mjmlAttributes: [{ name: "href", value: "javascript:alert(1)", template: true }],
        },
      ],
    });
    expect(navbar).toContain('href="https://example.com/concrete"');
    expect(navbar).not.toContain("javascript:");
  });

  it("keeps item content visible while invalid native sidebar drafts are being edited", () => {
    const canvas = render("Navbar", {
      links: [
        {
          label: <em>Still editable</em>,
          href: "javascript:alert(1)",
          mjmlAttributes: entries({ "font-size": "unfinished" }),
        },
      ],
    });
    expect(canvas).toContain("<em>Still editable</em>");
    expect(canvas).not.toContain("javascript:");
    expect(canvas).not.toContain("unfinished");
  });
});
