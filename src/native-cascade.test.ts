import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { applyNativeAttributes, createNativeContext, type NativeContext } from "./native-cascade";
import type { EmailSettings, ExportOptions, MjmlAttribute } from "./types";

beforeAll(() => vi.stubGlobal("window", globalThis));
afterAll(() => vi.unstubAllGlobals());

const entries = (attributes: Record<string, string>): MjmlAttribute[] =>
  Object.entries(attributes).map(([name, value]) => ({ name, value }));
const escape = (value: unknown) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
const attributes = (values: Readonly<Record<string, unknown>>) =>
  Object.entries(values)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([name, value]) => ` ${name}="${escape(value)}"`)
    .join("");

function head(context: NativeContext) {
  return `<mj-attributes><mj-all${attributes(context.all)} />${Object.entries(context.components)
    .map(([tag, values]) => `<${tag}${attributes(values)} />`)
    .join("")}${Object.entries(context.classes)
    .map(
      ([name, definition]) =>
        `<mj-class name="${name}"${attributes(definition.attributes)}>${Object.entries(
          definition.components,
        )
          .map(([tag, values]) => `<${tag}${attributes(values)} />`)
          .join("")}</mj-class>`,
    )
    .join("")}</mj-attributes>`;
}

async function compile(head: string, body: string) {
  const { default: mjml } = await import("mjml-browser");
  const result = await mjml(`<mjml><mj-head>${head}</mj-head><mj-body>${body}</mj-body></mjml>`, {
    validationLevel: "strict",
  });
  expect(result.errors).toEqual([]);
  return result.html;
}

function markerStyle(html: string, marker = "CASCADE_MARKER") {
  const expression = new RegExp(`<div[^>]+style="([^"]*)"[^>]*>\\s*${marker}\\s*<\\/div>`);
  const match = html.match(expression);
  expect(match, `Expected a text style around ${marker}`).not.toBeNull();
  return Object.fromEntries(
    match![1]
      .split(";")
      .filter(Boolean)
      .map((entry) => {
        const separator = entry.indexOf(":");
        return [entry.slice(0, separator).trim(), entry.slice(separator + 1).trim()];
      }),
  );
}

describe("native MJML cascade", () => {
  it("applies native defaults, root font settings, mj-all, tag defaults and local inheritance", async () => {
    const context = createNativeContext({
      fontFamily: "Verdana, sans-serif",
      attributeDefaults: entries({ color: "#111111", "font-size": "15px" }),
      componentDefaults: [
        { tag: "mj-text", attributes: entries({ color: "#222222", "line-height": "1.8" }) },
      ],
    });
    const resolved = applyNativeAttributes(
      "mj-text",
      {
        mjmlAttributes: [
          { name: "color", inherit: true },
          { name: "font-size", value: "19px" },
        ],
      },
      { color: "#444444", "font-size": "16px", padding: undefined, "font-family": "" },
      context,
    );
    expect(resolved.attributes).toEqual({ "font-size": "19px" });
    expect(resolved.effective).toMatchObject({
      align: "left",
      color: "#222222",
      "font-size": "19px",
      "line-height": "1.8",
      "font-family": "Verdana, sans-serif",
      padding: "10px 25px",
    });
    const html = await compile(
      head(context),
      `<mj-section><mj-column><mj-text${attributes(resolved.attributes)}>CASCADE_MARKER</mj-text></mj-column></mj-section>`,
    );
    expect(markerStyle(html)).toMatchObject({
      color: resolved.effective.color,
      "font-size": resolved.effective["font-size"],
      "font-family": resolved.effective["font-family"],
      "line-height": resolved.effective["line-height"],
    });
  });

  it("uses later explicit classes and concatenates their css-class values until locally overridden", async () => {
    const context = createNativeContext({
      mjmlClasses: [
        {
          name: "first",
          attributes: entries({ color: "#111111", "font-size": "18px", "css-class": "first-css" }),
        },
        { name: "second", attributes: entries({ color: "#222222", "css-class": "second-css" }) },
      ],
    });
    const resolved = applyNativeAttributes("mj-text", { mjClass: "first second" }, {}, context);
    expect(resolved.effective).toMatchObject({
      color: "#222222",
      "font-size": "18px",
      "css-class": "first-css second-css",
    });
    expect(resolved.effective).not.toHaveProperty("mj-class");
    const html = await compile(
      head(context),
      `<mj-section><mj-column><mj-text${attributes(resolved.attributes)}>CASCADE_MARKER</mj-text></mj-column></mj-section>`,
    );
    expect(markerStyle(html).color).toBe(resolved.effective.color);
    expect(html).toContain('class="first-css second-css"');
    const local = applyNativeAttributes(
      "mj-text",
      { mjClass: "first second", mjmlAttributes: entries({ "css-class": "local-css" }) },
      {},
      context,
    );
    expect(local.effective["css-class"]).toBe("local-css");
  });

  it("applies ancestor nested defaults after own classes and propagates the nearest class context", async () => {
    const context = createNativeContext({
      mjmlClasses: [
        {
          name: "outer",
          attributes: [],
          components: [{ tag: "mj-text", attributes: entries({ color: "#111111" }) }],
        },
        {
          name: "inner",
          attributes: [],
          components: [{ tag: "mj-text", attributes: entries({ color: "#222222" }) }],
        },
        { name: "text", attributes: entries({ color: "#333333" }) },
      ],
    });
    const section = applyNativeAttributes("mj-section", { mjClass: "outer" }, {}, context);
    const inheritedColumn = applyNativeAttributes(
      "mj-column",
      {},
      {},
      context,
      section.childClasses,
    );
    const inheritedText = applyNativeAttributes(
      "mj-text",
      { mjClass: "text" },
      {},
      context,
      inheritedColumn.childClasses,
    );
    expect(inheritedColumn.childClasses).toBe("outer");
    expect(inheritedText.effective.color).toBe("#111111");
    expect(inheritedText.childClasses).toBe("text");
    const ownColumn = applyNativeAttributes(
      "mj-column",
      { mjClass: "inner" },
      {},
      context,
      section.childClasses,
    );
    const ownText = applyNativeAttributes(
      "mj-text",
      { mjClass: "text" },
      {},
      context,
      ownColumn.childClasses,
    );
    expect(ownText.effective.color).toBe("#222222");
    const html = await compile(
      head(context),
      `<mj-section mj-class="outer"><mj-column mj-class="inner"><mj-text mj-class="text">CASCADE_MARKER</mj-text></mj-column></mj-section>`,
    );
    expect(markerStyle(html).color).toBe(ownText.effective.color);
  });

  it("resets inherited context for an explicit empty or unknown class, but inherit removes that reset", async () => {
    const context = createNativeContext({
      mjmlClasses: [
        {
          name: "parent",
          attributes: [],
          components: [{ tag: "mj-text", attributes: entries({ color: "#123456" }) }],
        },
        { name: "empty", attributes: [] },
      ],
    });
    for (const mjClass of ["", "missing", "empty"]) {
      const column = applyNativeAttributes("mj-column", { mjClass }, {}, context, "parent");
      const child = applyNativeAttributes("mj-text", {}, {}, context, column.childClasses);
      expect(column.childClasses).toBe(mjClass);
      expect(child.effective.color).toBe("#000000");
      const html = await compile(
        head(context),
        `<mj-section mj-class="parent"><mj-column${attributes(column.attributes)}><mj-text>CASCADE_MARKER</mj-text></mj-column></mj-section>`,
      );
      expect(markerStyle(html).color).toBe(child.effective.color);
    }
    const inherited = applyNativeAttributes(
      "mj-column",
      { mjClass: "", mjmlAttributes: [{ name: "mj-class", inherit: true }] },
      {},
      context,
      "parent",
    );
    expect(inherited.childClasses).toBe("parent");
    expect(inherited.attributes).not.toHaveProperty("mj-class");
  });

  it("preserves valid explicit empty overrides while omitting blank generated controls", async () => {
    const context = createNativeContext({
      mjmlClasses: [{ name: "font", attributes: entries({ "font-family": "Verdana" }) }],
    });
    const inherited = applyNativeAttributes(
      "mj-text",
      { mjClass: "font" },
      { "font-family": "" },
      context,
    );
    expect(inherited.effective["font-family"]).toBe("Verdana");
    const empty = applyNativeAttributes(
      "mj-text",
      { mjClass: "font", mjmlAttributes: entries({ "font-family": "" }) },
      { "font-family": "Arial" },
      context,
    );
    expect(empty.attributes["font-family"]).toBe("");
    expect(empty.effective["font-family"]).toBe("");
    const html = await compile(
      head(context),
      `<mj-section><mj-column><mj-text${attributes(empty.attributes)}>CASCADE_MARKER</mj-text></mj-column></mj-section>`,
    );
    expect(markerStyle(html)["font-family"]).toBe("");
  });

  it("matches native duplicate definition merging, including nested tag replacement", async () => {
    const settings: EmailSettings = {
      componentDefaults: [
        { tag: "mj-text", attributes: entries({ "font-size": "17px", color: "#101010" }) },
        { tag: "mj-text", attributes: entries({ color: "#202020" }) },
      ],
      mjmlClasses: [
        {
          name: "same",
          attributes: entries({ "font-size": "19px", "font-weight": "500" }),
          components: [
            { tag: "mj-text", attributes: entries({ color: "#303030", "line-height": "2" }) },
          ],
        },
        {
          name: "same",
          attributes: entries({ "font-size": "21px" }),
          components: [{ tag: "mj-text", attributes: entries({ color: "#404040" }) }],
        },
      ],
    };
    const context = createNativeContext(settings);
    expect(context.components["mj-text"]).toEqual({ "font-size": "17px", color: "#202020" });
    expect(context.classes.same.attributes).toEqual({ "font-size": "21px", "font-weight": "500" });
    expect(context.classes.same.components["mj-text"]).toEqual({ color: "#404040" });
    const resolved = applyNativeAttributes("mj-text", { mjClass: "same" }, {}, context, "same");
    const rawHead =
      '<mj-attributes><mj-all font-family="Arial, sans-serif"/><mj-text font-size="17px" color="#101010"/><mj-text color="#202020"/><mj-class name="same" font-size="19px" font-weight="500"><mj-text color="#303030" line-height="2"/></mj-class><mj-class name="same" font-size="21px"><mj-text color="#404040"/></mj-class></mj-attributes>';
    const html = await compile(
      rawHead,
      '<mj-section mj-class="same"><mj-column><mj-text mj-class="same">CASCADE_MARKER</mj-text></mj-column></mj-section>',
    );
    expect(markerStyle(html)).toMatchObject({
      color: resolved.effective.color,
      "font-size": resolved.effective["font-size"],
      "line-height": resolved.effective["line-height"],
      "font-weight": resolved.effective["font-weight"],
    });
  });

  it("owns immutable context maps and preserves internal structured native defaults", () => {
    const settings: EmailSettings = {
      mjmlClasses: [{ name: "original", attributes: entries({ color: "#123456" }) }],
    };
    const context = createNativeContext(settings);
    settings.mjmlClasses![0].attributes[0].value = "#ffffff";
    expect(context.classes.original.attributes.color).toBe("#123456");
    expect(Object.isFrozen(context)).toBe(true);
    expect(Object.isFrozen(context.classes.original.attributes)).toBe(true);
    const result = applyNativeAttributes("mj-accordion-element", {}, {}, context);
    expect(result.effective.title).toBeTypeOf("object");
    const title = result.effective.title as Record<string, unknown>;
    title.changed = true;
    expect(
      applyNativeAttributes("mj-accordion-element", {}, {}, context).effective.title,
    ).not.toHaveProperty("changed");
  });

  it("handles prototype-like keys safely and rejects reserved class identifiers and names", () => {
    const context = createNativeContext({
      mjmlClasses: [{ name: "toString", attributes: entries({ color: "#123456" }) }],
    });
    expect(Object.getPrototypeOf(context.classes)).toBeNull();
    expect(
      applyNativeAttributes("mj-text", { mjClass: "toString" }, {}, context).effective.color,
    ).toBe("#123456");
    expect(
      applyNativeAttributes("mj-text", { mjClass: "valueOf" }, {}, context).effective.color,
    ).toBe("#000000");
    for (const name of ["__proto__", "constructor", "prototype"]) {
      expect(() => createNativeContext({ mjmlClasses: [{ name, attributes: [] }] })).toThrow();
    }
    expect(() =>
      createNativeContext({ componentDefaults: [{ tag: "constructor", attributes: [] }] }),
    ).toThrow(/Unknown MJML component/);
    expect(() =>
      createNativeContext({ mjmlClasses: [{ name: "one", attributes: entries({ name: "two" }) }] }),
    ).toThrow(/reserved name/);
    expect(() => applyNativeAttributes("constructor", {}, {}, context)).toThrow(
      /Unknown MJML component/,
    );
  });

  it("distinguishes automatic root font defaults from explicit native definitions", () => {
    expect(createNativeContext().hasNativeDefinitions).toBe(false);
    expect(createNativeContext({ fontFamily: "Verdana" }).hasNativeDefinitions).toBe(false);
    expect(
      createNativeContext({ attributeDefaults: [{ name: "font-family", inherit: true }] }).all,
    ).not.toHaveProperty("font-family");
    expect(
      createNativeContext({ attributeDefaults: [{ name: "font-family", inherit: true }] })
        .hasNativeDefinitions,
    ).toBe(true);
    expect(
      createNativeContext({ mjmlClasses: [{ name: "empty", attributes: [] }] })
        .hasNativeDefinitions,
    ).toBe(true);
  });
});

describe("trusted template attribute cascade", () => {
  const trusted = { allowRawHtml: true };
  const template = (name: string, value: string): MjmlAttribute => ({
    name,
    value,
    template: true,
  });

  it("requires trust throughout root defaults and every class definition path", () => {
    const definition = [template("href", "{{ destination }}")];
    const cases: EmailSettings[] = [
      { attributeDefaults: definition },
      { componentDefaults: [{ tag: "mj-button", attributes: definition }] },
      { mjmlClasses: [{ name: "link", attributes: definition }] },
      {
        mjmlClasses: [
          {
            name: "parent",
            attributes: [],
            components: [{ tag: "mj-button", attributes: definition }],
          },
        ],
      },
    ];
    for (const settings of cases) {
      expect(() => createNativeContext(settings)).toThrow(/allowRawHtml: true/);
      expect(() =>
        createNativeContext(settings, { allowRawHtml: "true" } as unknown as ExportOptions),
      ).toThrow(/allowRawHtml: true/);
      expect(() => createNativeContext(settings, trusted)).not.toThrow();
    }
    const options = { allowRawHtml: true };
    const context = createNativeContext({}, options);
    options.allowRawHtml = false;
    expect(context.allowRawHtml).toBe(true);
    expect(Object.isFrozen(context)).toBe(true);
    expect(createNativeContext().allowRawHtml).toBe(false);
    expect(
      createNativeContext({}, { allowRawHtml: "true" } as unknown as ExportOptions).allowRawHtml,
    ).toBe(false);
  });

  it("compiles inherited template defaults and keeps their provenance out of local attributes", async () => {
    const context = createNativeContext(
      {
        attributeDefaults: [template("title", "{{ universal_title }}")],
        componentDefaults: [{ tag: "mj-image", attributes: [template("src", "{{ image_url }}")] }],
        mjmlClasses: [
          { name: "link", attributes: [template("href", "{{ class_url }}")] },
          {
            name: "parent",
            attributes: [],
            components: [{ tag: "mj-button", attributes: [template("href", "{{ parent_url }}")] }],
          },
        ],
      },
      trusted,
    );
    const inherited = applyNativeAttributes(
      "mj-button",
      { mjClass: "link", mjmlAttributes: [{ name: "href", inherit: true }] },
      { href: "https://example.com/base" },
      context,
      "parent",
    );
    const image = applyNativeAttributes("mj-image", {}, {}, context);
    expect(inherited.attributes).toEqual({ "mj-class": "link" });
    expect(inherited.effective.href).toBe("{{ parent_url }}");
    expect(inherited.effective.title).toBe("{{ universal_title }}");
    expect(inherited.templateAttributes).toEqual([]);
    expect(image.effective.src).toBe("{{ image_url }}");
    expect(image.templateAttributes).toEqual([]);
    const html = await compile(
      head(context),
      `<mj-section mj-class="parent"><mj-column><mj-button${attributes(inherited.attributes)}>Inherited</mj-button><mj-image${attributes(image.attributes)} /></mj-column></mj-section>`,
    );
    expect(html).toContain('href="{{ parent_url }}"');
    expect(html).toContain('src="{{ image_url }}"');
  });

  it("tracks the last effective local entry and ignores unfinished duplicate drafts", () => {
    const context = createNativeContext({}, trusted);
    const cases: [MjmlAttribute[], string[], string | undefined][] = [
      [[template("href", "{{ first }}")], ["href"], "{{ first }}"],
      [
        [template("href", "{{ first }}"), { name: "href", value: "https://example.com" }],
        [],
        "https://example.com",
      ],
      [
        [{ name: "href", value: "https://example.com" }, template("href", "{{ last }}")],
        ["href"],
        "{{ last }}",
      ],
      [[template("href", "{{ first }}"), { name: "href", inherit: true }], [], undefined],
      [
        [template("href", "{{ first }}"), { name: "href", template: false }],
        ["href"],
        "{{ first }}",
      ],
      [
        [template("href", "{{ first }}"), { name: "href", template: true, inherit: true }],
        [],
        undefined,
      ],
      [[template("href", "{{ first }}"), { name: "href", value: "", template: false }], [], ""],
      [[template("href", "{{ first }}"), template("href", "")], ["href"], ""],
    ];
    for (const [mjmlAttributes, expected, value] of cases) {
      const result = applyNativeAttributes(
        "mj-button",
        { mjmlAttributes },
        { href: "https://example.com/base" },
        context,
      );
      expect(result.templateAttributes).toEqual(expected);
      expect(result.attributes.href).toBe(value);
      expect(Object.isFrozen(result.templateAttributes)).toBe(true);
    }
  });

  it("requires explicit local template flags and does not authorize unrelated attributes", () => {
    const context = createNativeContext({}, trusted);
    const result = applyNativeAttributes(
      "mj-image",
      { mjmlAttributes: [template("src", "{{ image }}"), { name: "", value: "", template: true }] },
      { href: "https://example.com", width: "120px" },
      context,
    );
    expect(result.templateAttributes).toEqual(["src"]);
    expect(result.attributes).toEqual({
      href: "https://example.com",
      width: "120px",
      src: "{{ image }}",
    });
    expect(() =>
      applyNativeAttributes(
        "mj-image",
        { mjmlAttributes: [template("src", "{{ image }}")] },
        {},
        createNativeContext(),
      ),
    ).toThrow(/allowRawHtml: true/);
    expect(() =>
      applyNativeAttributes(
        "mj-image",
        { mjmlAttributes: [{ name: "src", value: "{{ image }}" }] },
        {},
        context,
      ),
    ).toThrow(/Native URL/);
    expect(() =>
      applyNativeAttributes(
        "mj-image",
        {
          mjmlAttributes: [
            template("src", "{{ image }}"),
            { name: "href", value: "javascript:alert(1)" },
          ],
        },
        {},
        context,
      ),
    ).toThrow(/unsupported scheme/);
  });

  it("treats templated class expressions as literal class tokens without evaluating them", async () => {
    const value = '{{ customer.kind | default: "unknown" }} real';
    const context = createNativeContext(
      {
        mjmlClasses: [
          {
            name: "real",
            attributes: [],
            components: [{ tag: "mj-text", attributes: entries({ color: "#123456" }) }],
          },
        ],
      },
      trusted,
    );
    const section = applyNativeAttributes(
      "mj-section",
      { mjmlAttributes: [template("mj-class", value)] },
      {},
      context,
    );
    const column = applyNativeAttributes("mj-column", {}, {}, context, section.childClasses);
    const child = applyNativeAttributes("mj-text", {}, {}, context, column.childClasses);
    expect(section.attributes["mj-class"]).toBe(value);
    expect(section.templateAttributes).toEqual(["mj-class"]);
    expect(column.childClasses).toBe(value);
    expect(child.effective.color).toBe("#123456");
    const html = await compile(
      head(context),
      `<mj-section${attributes(section.attributes)}><mj-column><mj-text>CASCADE_MARKER</mj-text></mj-column></mj-section>`,
    );
    expect(markerStyle(html).color).toBe(child.effective.color);
  });

  it("leaves unresolved numeric templates to the native compiler rather than inventing dimensions", async () => {
    const context = createNativeContext({}, trusted);
    const resolved = applyNativeAttributes(
      "mj-text",
      { mjmlAttributes: [template("font-size", "{{ size }}px")] },
      {},
      context,
    );
    expect(resolved.effective["font-size"]).toBe("{{ size }}px");
    expect(resolved.templateAttributes).toEqual(["font-size"]);
    const { default: mjml } = await import("mjml-browser");
    const result = await mjml(
      `<mjml><mj-body><mj-section><mj-column><mj-text${attributes(resolved.attributes)}>Unresolved</mj-text></mj-column></mj-section></mj-body></mjml>`,
      { validationLevel: "soft" },
    );
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tagName: "mj-text",
          message: expect.stringContaining("font-size"),
        }),
      ]),
    );
  });
});
