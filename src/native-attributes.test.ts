import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  nativeAttributeNames,
  nativeCatalog,
  normalizeMjClass,
  readNativeAttributes,
} from "./native-attributes";
import type { ExportOptions } from "./types";

beforeAll(() => vi.stubGlobal("window", globalThis));
afterAll(() => vi.unstubAllGlobals());

const read = (tag: string, name: string, value: string) =>
  readNativeAttributes(tag, [{ name, value }])[name];
const xml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]!,
  );
const attrs = (tag: string, values: Record<string, string>) =>
  Object.entries(
    readNativeAttributes(
      tag,
      Object.entries(values).map(([name, value]) => ({ name, value })),
    ),
  )
    .map(([name, value]) => ` ${name}="${xml(value!)}"`)
    .join("");

describe("native MJML catalog", () => {
  it("contains the complete installed component and attribute definitions", () => {
    expect(Object.keys(nativeCatalog)).toHaveLength(31);
    expect(
      Object.values(nativeCatalog).reduce(
        (count, spec) => count + Object.keys(spec.allowedAttributes).length,
        0,
      ),
    ).toBe(394);
    expect(
      new Set(Object.values(nativeCatalog).flatMap((spec) => Object.values(spec.allowedAttributes)))
        .size,
    ).toBe(26);
    expect(nativeCatalog["mj-wrapper"].allowedAttributes).toEqual({
      ...nativeCatalog["mj-section"].allowedAttributes,
      gap: "unit(px)",
    });
    for (const tag of Object.keys(nativeCatalog)) {
      expect(nativeAttributeNames(tag)).toEqual(
        expect.arrayContaining([
          "mj-class",
          "css-class",
          ...Object.keys(nativeCatalog[tag].allowedAttributes),
        ]),
      );
    }
    expect(nativeAttributeNames("*")).toEqual(
      expect.arrayContaining(["srcset", "name", "icon-wrapped-url", "thumbnails-src", "font-size"]),
    );
    expect(() => nativeAttributeNames("constructor")).toThrow(/Unknown MJML/);
    expect(() => nativeAttributeNames("mj-unknown")).toThrow(/Unknown MJML/);
  });

  it("accepts every declared scalar native default without visual-control limits", () => {
    let checked = 0;
    for (const [tag, spec] of Object.entries(nativeCatalog)) {
      for (const [name, value] of Object.entries(spec.defaultAttributes)) {
        if (
          !Object.hasOwn(spec.allowedAttributes, name) ||
          value === null ||
          typeof value === "object"
        )
          continue;
        const expected = name === "ico-open" ? "☰" : name === "ico-close" ? "⊗" : String(value);
        expect(read(tag, name, String(value)), `${tag}.${name}`).toBe(expected);
        checked += 1;
      }
    }
    expect(checked).toBe(135);
  });

  it("exercises all 26 native descriptor variants", () => {
    const checked = new Set<string>();
    for (const [tag, spec] of Object.entries(nativeCatalog))
      for (const [name, descriptor] of Object.entries(spec.allowedAttributes)) {
        if (checked.has(descriptor)) continue;
        const value =
          descriptor === "string"
            ? ""
            : descriptor === "boolean"
              ? "true"
              : descriptor === "integer"
                ? "4096"
                : descriptor === "color"
                  ? "transparent"
                  : descriptor.startsWith("enum(")
                    ? descriptor.slice(5, -1).split(",")[0]
                    : descriptor.startsWith("unitWithNegative")
                      ? "-.125em"
                      : "4096px";
        expect(read(tag, name, value), `${tag}.${name}: ${descriptor}`).toBe(value);
        checked.add(descriptor);
      }
    expect(checked.size).toBe(26);
  });
});

describe("native attribute values", () => {
  it("distinguishes drafts, inheritance, and explicit empty overrides", () => {
    const result = readNativeAttributes("mj-button", [
      { name: "", value: "" },
      { name: "  ", value: " " },
      { name: "padding" },
      { name: "color", inherit: true },
      { name: "href", value: "" },
      { name: "font-family", value: "" },
      { name: "border", value: "" },
      { name: "css-class", value: "" },
    ]);
    expect(result).toEqual({
      color: null,
      href: "",
      "font-family": "",
      border: "",
      "css-class": "",
    });
    expect(Object.getPrototypeOf(result)).toBeNull();
    expect(read("mj-section", "full-width", "")).toBe("");
    expect(() => read("mj-text", "color", "")).toThrow(/Invalid native/);
    expect(readNativeAttributes("mj-text", undefined)).toEqual({});
  });

  it("validates unit descriptors, integers, booleans, enums, colors, and native CSS strings", () => {
    expect(read("mj-text", "font-size", "120px")).toBe("120px");
    expect(read("mj-text", "letter-spacing", "-0.125em")).toBe("-0.125em");
    expect(read("mj-text", "line-height", "1.75")).toBe("1.75");
    expect(read("mj-text", "line-height", "175%")).toBe("175%");
    expect(read("mj-image", "height", "auto")).toBe("auto");
    expect(read("mj-column", "width", "33.333%")).toBe("33.333%");
    expect(read("mj-text", "padding", "0  12.5px\t4% 0")).toBe("0 12.5px 4% 0");
    expect(read("mj-table", "cellpadding", "4096")).toBe("4096");
    expect(read("mj-image", "fluid-on-mobile", "TRUE")).toBe("true");
    expect(read("mj-social", "mode", "vertical")).toBe("vertical");
    for (const color of [
      "#D8E1D4",
      "#AbC",
      "transparent",
      "inherit",
      "rebeccapurple",
      "rgb(12, 34, 56)",
      "rgba(12,34,56,0.125)",
    ])
      expect(read("mj-text", "color", color)).toBe(color);
    expect(read("mj-section", "background-size", "calc(100% - 10px) auto")).toBe(
      "calc(100% - 10px) auto",
    );
    expect(read("mj-button", "border-radius", "10px / 20%")).toBe("10px / 20%");
    expect(read("mj-column", "border", "var(--email-border, 2px solid navy)")).toBe(
      "var(--email-border, 2px solid navy)",
    );
    expect(read("mj-text", "font-family", '"Semi;Colon", Georgia, serif')).toBe(
      '"Semi;Colon", Georgia, serif',
    );
    expect(read("*", "width", "auto")).toBe("auto");
    expect(() => read("mj-image", "width", "auto")).toThrow(/Invalid native/);
    for (const [tag, name, value] of [
      ["mj-text", "font-size", "-1px"],
      ["mj-text", "padding", "1px2px"],
      ["mj-text", "padding", "1px 2px 3px 4px 5px"],
      ["mj-text", "color", "red trailing"],
      ["mj-image", "fluid-on-mobile", "yes"],
      ["mj-table", "cellpadding", "1.5"],
      ["mj-section", "direction", "sideways"],
    ])
      expect(() => read(tag, name, value)).toThrow();
  });

  it("keeps literal content attributes separate from CSS validation", () => {
    const literal = '<Title> "quoted" & text; expression(ignored):name';
    for (const name of ["alt", "title", "name", "rel", "target"])
      expect(read("mj-image", name, literal)).toBe(literal);
    expect(read("mj-navbar", "ico-open", "&#9776;")).toBe("☰");
    expect(read("mj-navbar", "ico-close", "&amp;")).toBe("&");
    expect(read("*", "name", "any-network-preset")).toBe("any-network-preset");
  });

  it("normalizes class whitespace and protects prototype-sensitive map keys", () => {
    expect(normalizeMjClass("  primary\tsecondary\nmd:wide ")).toBe("primary secondary md:wide");
    expect(normalizeMjClass(undefined)).toBeUndefined();
    expect(normalizeMjClass("  ")).toBeUndefined();
    expect(read("mj-text", "css-class", " first  second ")).toBe("first second");
    for (const value of ["__proto__", "constructor", "prototype", 'name" onclick="bad()', "<tag>"])
      expect(() => normalizeMjClass(value)).toThrow();
    expect(() => readNativeAttributes("mj-text", [{ name: "__proto__", value: "bad" }])).toThrow();
    expect(() =>
      readNativeAttributes("mj-text", [Object.create({ name: "color", value: "red" })]),
    ).toThrow();
    expect(() => readNativeAttributes("mj-text", [{ name: "color", value: 42 }])).toThrow(
      /must be text/,
    );
    expect(() => readNativeAttributes("mj-text", [{ name: "color", inherit: "true" }])).toThrow(
      /boolean/,
    );
    expect(() => readNativeAttributes("mj-text", {})).toThrow(/array/);
    expect(() => read("mj-text", "onclick", "alert(1)")).toThrow(/Unsupported/);
    expect(() => read("mj-text", "data-extra", "x")).toThrow(/Unsupported/);
  });
});

describe("native URL and CSS safety", () => {
  it("permits public asset URLs, safe link targets, and relative navbar routes", () => {
    for (const value of ["https://example.com/a.png?x=1&y=2", "http://example.com/a b.png", ""])
      expect(read("mj-image", "src", value)).toBe(value);
    for (const value of [
      "https://example.com/?a=1&b=2",
      "mailto:team@example.com",
      "tel:+123456",
      "#details",
      "./products",
      "../news",
      "/pricing",
      "?view=all",
      "products/one",
      "",
    ])
      expect(read("mj-navbar-link", "href", value)).toBe(value);
    expect(read("mj-navbar", "base-url", "https://example.com/")).toBe("https://example.com/");
    expect(() => read("mj-font", "href", "/fonts.css")).toThrow();
    expect(() => read("mj-image", "src", "images/a.png")).toThrow();
  });

  it.each([
    "javascript:alert(1)",
    "java&Tab;script&colon;alert(1)",
    "&#106;avascript&colon;alert(1)",
    "&amp;#106;avascript&amp;colon;alert(1)",
    "java\nscript:alert(1)",
    "//example.com/path",
    "\\\\example.com/path",
    "/\\example.com/path",
    "https://user:password@example.com/",
    "data:text/html,<script>alert(1)</script>",
    "file:///tmp/private",
    "vbscript:alert(1)",
  ])("rejects unsafe or disguised native URLs: %s", (value) => {
    expect(() => read("mj-navbar-link", "href", value)).toThrow();
  });

  it("validates each srcset candidate while preserving URL commas and query ampersands", () => {
    const value =
      "https://example.com/image,w=320.png?a=1&b=2 320w, https://example.com/image,w=640.png 640w";
    expect(read("mj-image", "srcset", value)).toBe(value);
    expect(
      read(
        "mj-social-element",
        "srcset",
        "https://example.com/a.png 1x, https://example.com/b.png 2x",
      ),
    ).toContain("2x");
    expect(read("mj-image", "srcset", "")).toBe("");
    for (const invalid of [
      "https://example.com/a.png 1x, javascript:alert(1) 2x",
      "https://example.com/a.png 1x, //evil.example/b.png 2x",
      "https://example.com/a.png 0x",
      "https://example.com/a.png 1x 2x",
    ])
      expect(() => read("mj-image", "srcset", invalid)).toThrow();
  });

  it("protects CSS background URL context and navbar icon HTML text context", () => {
    expect(read("mj-section", "background-url", "https://example.com/a(1)'s image.png")).toBe(
      "https://example.com/a%281%29%27s%20image.png",
    );
    expect(() =>
      read("mj-section", "background-url", "https://example.com/&apos;);color:red"),
    ).toThrow(/encoded CSS/);
    for (const value of [
      "<script>bad()</script>",
      "&lt;img src=x onerror=bad()&gt;",
      "&amp;lt;script&amp;gt;",
    ])
      expect(() => read("mj-navbar", "ico-open", value)).toThrow(/text, not HTML/);
  });

  it.each([
    "1px solid red; background:url(https://example.com/track)",
    "expression(alert(1))",
    "expre/**/ssion(alert(1))",
    "e\\78pression(alert(1))",
    "url(javascript:alert(1))",
    "url('java&#x73;cript:alert(1)')",
    "u\\72l(data:text/html,bad)",
    "red\\3b background:url(https://example.com/x)",
    "red&#59;background:red",
    "</style><script>alert(1)</script>",
    "red/*",
    "var(--x",
    "'unclosed",
  ])("rejects unsafe CSS values: %s", (value) => {
    expect(() => read("mj-column", "border", value)).toThrow();
  });
});

describe("trusted native template attributes", () => {
  const trusted = { allowRawHtml: true };

  it("preserves template strings, whitespace, quotes, and entities without interpretation", () => {
    const values = [
      ["mj-button", "href", '{{ customer.url | default: "https://example.com?a=1&b=2" }}'],
      ["mj-image", "src", "<%= customer.image %>"],
      ["mj-text", "font-size", "{% if compact %}12px{% else %}18px{% endif %}"],
      ["mj-text", "color", ""],
      ["mj-text", "css-class", "\t{{ classes }} &amp; &#34;\n"],
    ];
    for (const [tag, name, value] of values) {
      expect(readNativeAttributes(tag, [{ name, value, template: true }], trusted)).toEqual({
        [name]: value,
      });
    }
  });

  it.each([undefined, false, "true", 1, null])(
    "requires strict host trust for template values: %s",
    (allowRawHtml) => {
      expect(() =>
        readNativeAttributes("mj-button", [{ name: "href", value: "{{ url }}", template: true }], {
          allowRawHtml,
        } as ExportOptions),
      ).toThrow(/allowRawHtml: true/);
    },
  );

  it("does not weaken ordinary value checks when the host enables trusted HTML", () => {
    for (const template of [undefined, false]) {
      expect(() =>
        readNativeAttributes(
          "mj-button",
          [{ name: "href", value: "javascript:alert(1)", template }],
          trusted,
        ),
      ).toThrow(/unsupported scheme/);
      expect(() =>
        readNativeAttributes(
          "mj-text",
          [{ name: "font-size", value: "{{ size }}", template }],
          trusted,
        ),
      ).toThrow();
    }
  });

  it("keeps inheritance and incomplete drafts inert even when their template flag is set", () => {
    expect(
      readNativeAttributes("mj-button", [
        { name: "", value: "", template: true },
        { name: "  ", value: " ", template: true },
        { name: "href", template: true },
        { name: "color", value: "{{ ignored }}", inherit: true, template: true },
      ]),
    ).toEqual({ color: null });
  });

  it("retains schema and supported-name validation for trusted templates", () => {
    for (const template of ["true", 1, null, {}, []]) {
      expect(() =>
        readNativeAttributes(
          "mj-button",
          [{ name: "href", value: "{{ url }}", template }],
          trusted,
        ),
      ).toThrow(/template must be a boolean/);
      expect(() =>
        readNativeAttributes("mj-button", [{ name: "", value: "", template }], trusted),
      ).toThrow(/template must be a boolean/);
    }
    for (const name of ["onclick", "unsupported", "__proto__", 'href" injected="yes']) {
      expect(() =>
        readNativeAttributes(
          "mj-button",
          [{ name, value: "{{ value }}", template: true }],
          trusted,
        ),
      ).toThrow();
    }
    for (const value of [1, null, {}, []]) {
      expect(() =>
        readNativeAttributes("mj-button", [{ name: "href", value, template: true }], trusted),
      ).toThrow(/must be text/);
    }
  });

  it("rejects XML control characters while preserving native whitespace", () => {
    for (const code of [0, 1, 8, 11, 12, 14, 31, 127]) {
      expect(() =>
        readNativeAttributes(
          "mj-button",
          [{ name: "href", value: `{{ url }}${String.fromCharCode(code)}`, template: true }],
          trusted,
        ),
      ).toThrow(/XML control/);
    }
    const value = "\t{{ url }}\r\n";
    expect(
      readNativeAttributes("mj-button", [{ name: "href", value, template: true }], trusted).href,
    ).toBe(value);
  });

  it("keeps prototype-inherited template flags from authorizing a value", () => {
    const entry = Object.assign(Object.create({ template: true }), {
      name: "src",
      value: "{{ image }}",
    });
    expect(() => readNativeAttributes("mj-image", [entry], trusted)).toThrow(/Native URL/);
  });

  it("preserves string href and src templates through the installed compiler", async () => {
    const href = "{{ customer.url }}?source=email&campaign={{ campaign }}";
    const src = "{{ customer.image }}";
    const values = (tag: string, name: string, value: string) =>
      Object.entries(readNativeAttributes(tag, [{ name, value, template: true }], trusted))
        .map(([key, text]) => ` ${key}="${xml(text!)}"`)
        .join("");
    const { default: compile } = await import("mjml-browser");
    const result = await compile(
      `<mjml><mj-body><mj-section><mj-column><mj-button${values("mj-button", "href", href)}>Template</mj-button><mj-image${values("mj-image", "src", src)} /></mj-column></mj-section></mj-body></mjml>`,
      { validationLevel: "strict" },
    );
    expect(result.errors).toEqual([]);
    expect(result.html).toContain(`href="${xml(href)}"`);
    expect(result.html).toContain(`src="${src}"`);
  });
});

describe("installed MJML compiler compatibility", () => {
  it("compiles advanced values and nested components without validation warnings", async () => {
    const { default: compile } = await import("mjml-browser");
    const source = `<mjml><mj-head><mj-attributes><mj-all${attrs("*", { "font-family": "Georgia, serif" })} /></mj-attributes></mj-head><mj-body><mj-section${attrs("mj-section", { "background-size": "calc(100% - 10px) auto", "full-width": "", direction: "rtl" })}><mj-column${attrs("mj-column", { width: "100%", "inner-border": "1px dashed navy" })}>
      <mj-text${attrs("mj-text", { "font-size": "120px", "letter-spacing": "-0.125em", "line-height": "175%", color: "rebeccapurple", padding: "0 12.5px" })}>Native text</mj-text>
      <mj-image${attrs("mj-image", { src: "https://example.com/a.png", width: "1600px", height: "auto", "fluid-on-mobile": "true", srcset: "https://example.com/a.png 1x, https://example.com/b.png 2x", href: "#details" })} />
      <mj-button${attrs("mj-button", { href: "/products", width: "100%", border: "2px dotted rgba(10,20,30,0.25)", "border-radius": "10px / 20%" })}>Browse</mj-button>
      <mj-navbar${attrs("mj-navbar", { "base-url": "https://example.com/", hamburger: "hamburger", "ico-open": "&#9776;" })}><mj-navbar-link${attrs("mj-navbar-link", { href: "products", "font-size": "18px" })}>Products</mj-navbar-link></mj-navbar>
      <mj-accordion${attrs("mj-accordion", { "icon-position": "left", "icon-wrapped-url": "https://example.com/closed.png" })}><mj-accordion-element${attrs("mj-accordion-element", { "background-color": "aliceblue" })}><mj-accordion-title${attrs("mj-accordion-title", { "font-size": "20px" })}>Question</mj-accordion-title><mj-accordion-text${attrs("mj-accordion-text", { "letter-spacing": "-.1em" })}>Answer</mj-accordion-text></mj-accordion-element></mj-accordion>
      <mj-carousel${attrs("mj-carousel", { thumbnails: "visible" })}><mj-carousel-image${attrs("mj-carousel-image", { src: "https://example.com/a.png", "thumbnails-src": "https://example.com/thumb.png", href: "#details" })} /></mj-carousel>
      <mj-social${attrs("mj-social", { mode: "vertical", "icon-size": "40px" })}><mj-social-element${attrs("mj-social-element", { name: "web", href: "https://example.com", src: "https://example.com/social.png", "background-color": "transparent" })}>Website</mj-social-element></mj-social>
      <mj-table${attrs("mj-table", { cellpadding: "4096", cellspacing: "0", width: "auto", role: "presentation" })}><tr><td>Cell</td></tr></mj-table>
    </mj-column></mj-section></mj-body></mjml>`;
    const result = await compile(source, { validationLevel: "strict" });
    expect(result.errors).toEqual([]);
    expect(result.html).toContain("font-size:120px");
    expect(result.html).toContain("letter-spacing:-0.125em");
    expect(result.html).toContain('href="https://example.com/products"');
    expect(result.html).toContain("mj-full-width-mobile");
    expect(result.html).toContain('cellpadding="4096"');
    expect(result.html).toContain("☰");
  });
});
