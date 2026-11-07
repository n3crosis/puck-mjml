import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { renderHeadSettings, resolveBreakpointWidth } from "./head";
import type { EmailSettings, ExportOptions } from "./types";

beforeAll(() => vi.stubGlobal("window", globalThis));
afterAll(() => vi.unstubAllGlobals());

const body =
  '<mj-section><mj-column><mj-text css-class="promo">Body <a href="https://example.com/original">Link</a></mj-text><mj-image css-class="picture" src="https://example.com/original.png" /></mj-column></mj-section>';

async function compile(settings: EmailSettings, options: ExportOptions = {}, content = body) {
  const head = renderHeadSettings(settings, options);
  const mjml = `<mjml><mj-head>${head.breakpoint}${head.fontImports}${head.styles}${head.htmlAttributes}</mj-head><mj-body>${content}</mj-body></mjml>`;
  const { default: mjml2html } = await import("mjml-browser");
  const result = await mjml2html(mjml, { validationLevel: "strict" });
  expect(result.errors).toEqual([]);
  return { ...result, mjml };
}

function attribute(name: string, value: string, selector = ".promo > div"): EmailSettings {
  return { htmlAttributes: [{ selector, name, value }] };
}

describe("native head settings", () => {
  it.each(["1440px", "120px", "640.5px", "0"])(
    "compiles native breakpoint %s without visual clamps",
    async (breakpointWidth) => {
      const result = await compile({ breakpoint: 480, breakpointWidth });
      expect(result.mjml).toContain(`<mj-breakpoint width="${breakpointWidth}" />`);
      expect(result.html).toContain(`@media only screen and (min-width:${breakpointWidth})`);
    },
  );

  it("retains legacy breakpoint defaults and numeric normalization when native width is absent", () => {
    expect(resolveBreakpointWidth({})).toBeUndefined();
    expect(renderHeadSettings({}).breakpoint).toBe("");
    expect(resolveBreakpointWidth({ breakpoint: 900.5 })).toBe("900.5px");
    expect(resolveBreakpointWidth({ breakpoint: 10000 })).toBe("1000px");
    expect(resolveBreakpointWidth({ breakpoint: 0 })).toBe("200px");
    expect(resolveBreakpointWidth({ breakpoint: Number.NaN })).toBe("480px");
  });

  it.each(["", "50%", "auto", "-1px", "480px; color:red", '480px" /><mj-raw>'])(
    "rejects non-native breakpoint %s",
    (breakpointWidth) => {
      expect(() => renderHeadSettings({ breakpointWidth })).toThrow(
        /Native CSS|Invalid native width/,
      );
    },
  );

  it("rejects non-text native width instead of silently falling back to the numeric control", () => {
    expect(() =>
      resolveBreakpointWidth({
        breakpoint: 600,
        breakpointWidth: 1440,
      } as unknown as EmailSettings),
    ).toThrow(/must be text/);
  });

  it("preserves stylesheet content and both native output modes", async () => {
    const result = await compile({
      headStyles: [
        { css: ".promo > div { color: #123456 !important; }", inline: "inline" },
        { css: "@media (max-width: 900px) { .promo { display: none; } }", inline: "head" },
      ],
    });
    expect(result.mjml).toContain(
      '<mj-style inline="inline">.promo > div { color: #123456 !important; }</mj-style>',
    );
    expect(result.html).toContain("color: #123456;");
    expect(result.html).toContain("@media (max-width: 900px)");
  });

  it("keeps custom stylesheet closing-tag and schema validation", () => {
    expect(() =>
      renderHeadSettings({
        headStyles: [{ css: "</style><script>alert(1)</script>", inline: "head" }],
      }),
    ).toThrow(/closing tag/);
    expect(() =>
      renderHeadSettings({ headStyles: [{ css: "</mj-head><mj-body>", inline: "head" }] }),
    ).toThrow(/closing tag/);
    expect(() =>
      renderHeadSettings({
        headStyles: [{ css: ".a{}", inline: "other" }],
      } as unknown as EmailSettings),
    ).toThrow(/head or inline/);
  });

  it("imports safe font names without a visual name-length limit", async () => {
    const name = `École Font ${"Extended ".repeat(12).trim()}`;
    const result = await compile(
      { fontImports: [{ name, href: "https://example.com/fonts.css" }] },
      {},
      `<mj-section><mj-column><mj-text font-family="${name}">Font</mj-text></mj-column></mj-section>`,
    );
    expect(result.mjml).toContain(`name="${name}"`);
    expect(result.html).toContain(
      '<link href="https://example.com/fonts.css" rel="stylesheet" type="text/css">',
    );
  });

  it("protects the compiler's unquoted font URL CSS context", async () => {
    const result = await compile(
      { fontImports: [{ name: "Example", href: "https://example.com/font(1).css" }] },
      {},
      '<mj-section><mj-column><mj-text font-family="Example">Font</mj-text></mj-column></mj-section>',
    );
    expect(result.html).toContain("@import url(https://example.com/font%281%29.css)");
  });

  it("rejects font names interpreted as regular expressions and unsafe font sources", () => {
    expect(() =>
      renderHeadSettings({
        fontImports: [{ name: "[Broken", href: "https://example.com/font.css" }],
      }),
    ).toThrow(/regular-expression/);
    expect(() =>
      renderHeadSettings({ fontImports: [{ name: "Example", href: "javascript:alert(1)" }] }),
    ).toThrow(/Web font CSS/);
  });
});

describe("generated HTML attributes", () => {
  it("compiles native presentation, namespace, custom, and literal text attributes", async () => {
    const attrs = {
      class: "custom one",
      align: "right",
      width: "100%",
      "xml:lang": "fr",
      "data-見出し": "見出し",
      "aria-hidden": "true",
      title: 'A & "B" <C>',
    };
    const result = await compile({
      htmlAttributes: Object.entries(attrs).map(([name, value]) => ({
        selector: ".promo > div",
        name,
        value,
      })),
    });
    expect(result.html).toContain('class="custom one"');
    expect(result.html).toContain('align="right"');
    expect(result.html).toContain('width="100%"');
    expect(result.html).toContain('xml:lang="fr"');
    expect(result.html).toContain('data-見出し="見出し"');
    expect(result.html).toContain('aria-hidden="true"');
    expect(result.html).toContain('title="A &amp; &quot;B&quot; &lt;C&gt;"');
  });

  it("retains native selector syntax and allows long selectors", async () => {
    const selector = `[class~="promo"]:not([data-unused="${"x".repeat(300)}"]) > div`;
    const result = await compile(attribute("data-long", "matched", selector));
    expect(result.html).toContain('data-long="matched"');
  });

  it("supports safe URL overrides, query ampersands, and relative navigation links", async () => {
    const result = await compile({
      htmlAttributes: [
        { selector: ".promo a", name: "href", value: "../offer?a=1&b=2#section" },
        { selector: ".picture img", name: "src", value: "https://example.com/new.png?a=1&b=2" },
        {
          selector: ".picture img",
          name: "srcset",
          value: "https://example.com/one.png 1x, https://example.com/two.png 2x",
        },
      ],
    });
    expect(result.html).toContain('href="../offer?a=1&amp;b=2#section"');
    expect(result.html).toContain('src="https://example.com/new.png?a=1&amp;b=2"');
    expect(result.html).toContain(
      'srcset="https://example.com/one.png 1x, https://example.com/two.png 2x"',
    );
  });

  it("supports CSS declarations without treating quoted semicolons or functions as separators", async () => {
    const style =
      'color: #123456; font-family: "Family; One"; --space: calc(10px + 2%); margin: var(--space); background-image: url("https://example.com/a;b.png");';
    const result = await compile(attribute("style", style));
    expect(result.html).toContain(
      'style="color: #123456; font-family: &quot;Family; One&quot;; --space: calc(10px + 2%); margin: var(--space); background-image: url(&quot;https://example.com/a;b.png&quot;);"',
    );
  });

  it.each([
    ["href", "javascript:alert(1)"],
    ["xlink:href", "java&#x73;cript&colon;alert(1)"],
    ["formaction", "java&Tab;script&colon;alert(1)"],
    ["src", "data:text/html,<script>alert(1)</script>"],
    ["srcset", "https://example.com/good.png 1x, javascript:alert(1) 2x"],
    ["ping", "https://example.com/ping javascript:alert(1)"],
    ["style", "width: expression(alert(1))"],
    ["style", "be/**/havior: url(https://example.com/behavior.htc)"],
    ["style", "-moz-binding: url(https://example.com/binding.xml)"],
    ["style", "background: u\\72l(javascript:alert(1))"],
    ["style", "color: red; @import url(https://example.com/style.css)"],
    ["style", "color:red; } body {color:blue"],
  ])("rejects active %s=%s without a trusted opt-in", (name, value) => {
    expect(() => renderHeadSettings(attribute(name, value))).toThrow();
  });

  it.each(["onclick", "onLOAD", "srcdoc", "http-equiv", "is"])(
    "requires strict trust for active attribute %s",
    (name) => {
      for (const allowRawHtml of [undefined, false, "true", 1]) {
        expect(() =>
          renderHeadSettings(attribute(name, "value"), { allowRawHtml } as ExportOptions),
        ).toThrow(/allowRawHtml: true/);
      }
    },
  );

  it("preserves explicitly trusted active attribute values without escaping the MJML tree", async () => {
    const result = await compile(
      {
        htmlAttributes: [
          { selector: ".promo > div", name: "onclick", value: 'alert("A & B")' },
          { selector: ".promo > div", name: "srcdoc", value: '<span title="x">Hello</span>' },
          { selector: ".promo a", name: "href", value: "javascript:alert(1)" },
        ],
      },
      { allowRawHtml: true },
    );
    expect(result.html).toContain('onclick="alert(&quot;A &amp; B&quot;)"');
    expect(result.html).toContain('srcdoc="&lt;span title=&quot;x&quot;&gt;Hello&lt;/span&gt;"');
    expect(result.html).toContain('href="javascript:alert(1)"');
  });

  it.each(['name" injected="x', "a b", "data-x><mj-raw", "=name", "data-x/", ""])(
    "rejects invalid attribute name %s even when trusted",
    (name) => {
      expect(() => renderHeadSettings(attribute(name, "value"), { allowRawHtml: true })).toThrow(
        /attribute name/,
      );
    },
  );

  it("preserves explicit empty generated values", async () => {
    const result = await compile(attribute("href", "", ".promo a"));
    expect(result.html).toContain('href=""');
  });
});
