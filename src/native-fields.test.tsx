import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import {
  Puck,
  Render,
  type ArrayField,
  type Data,
  type Field,
  type CustomField,
} from "@puckeditor/core";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { createEmailConfig } from "./config";
import {
  nativeAttributeField,
  nativeAttributeTagFromPath,
  nativeComponentTags,
  nativeEntryTagFromPath,
  optionalHtmlField,
} from "./NativeFields";
import { nativeAttributeNames } from "./native-attributes";
import type { MjmlAttribute } from "./types";

const renderField = (children: ReactNode) =>
  renderToStaticMarkup(
    <Puck config={{ components: {} }} data={{ root: { props: {} }, content: [] }}>
      {children}
    </Puck>,
  );

const attributeNames = (entry: unknown) => {
  expect((entry as Field | undefined)?.type).toBe("custom");
  const field = entry as CustomField<MjmlAttribute[]>;
  const markup = renderField(
    field.render({
      field,
      name: "attributes",
      id: "attributes",
      value: [{ name: "", value: "" }],
      onChange: () => {},
    }),
  );
  return load(markup)('.pm-attribute-suggestions [role="option"]')
    .toArray()
    .map((option) => option.attribs["data-property"])
    .filter(Boolean)
    .sort();
};

function canvasMarkup(type: string, props: Record<string, unknown>, allowRawHtml = true) {
  const config = createEmailConfig(undefined, allowRawHtml);
  const data = {
    root: {
      props: {
        sections: [
          {
            type: "Section1",
            props: {
              id: "section",
              column: [
                {
                  type,
                  props: { ...config.components[type].defaultProps, id: "content", ...props },
                },
              ],
            },
          },
        ],
      },
    },
    content: [],
  };
  return renderToStaticMarkup(<Render config={config} data={data as Data} />);
}

describe("native MJML editor fields", () => {
  it("groups attribute choices by purpose and keeps advanced entry options last", () => {
    const field = nativeAttributeField("mj-image", undefined, false, true);
    expect(field).toMatchObject({ type: "custom", key: "native-attributes" });
    const markup = renderField(
      field.render({
        field,
        name: "attributes",
        id: "attributes",
        value: [{ name: "src", value: "" }],
        onChange: () => {},
      }),
    );
    const $ = load(markup);
    expect($(".pm-attribute-row").length).toBe(1);
    expect($(".pm-attribute-row > .pm-attribute-name-control").length).toBe(1);
    expect($(".pm-attribute-row > .pm-attribute-value").length).toBe(1);
    const groups = $(".pm-attribute-suggestion small")
      .toArray()
      .map((group) => $(group).text());
    expect(groups[0]).toBe("Content and links");
    expect(groups.at(-1)).toBe("Classes and identifiers");
    expect($('[data-property="src"] small').text()).toBe("Content and links");
    expect($('[data-property="width"] small').text()).toBe("Layout and spacing");
    expect($('[data-property="border"] small').text()).toBe("Appearance");
  });

  it.each([
    ["bodyAttributes[0]", { bodyAttributes: [{ inherit: true }] }],
    ["attributeDefaults[0]", { attributeDefaults: [{ inherit: true }] }],
    [
      "componentDefaults[0].attributes[0]",
      { componentDefaults: [{ tag: "mj-text", attributes: [{ inherit: true }] }] },
    ],
    [
      "mjmlClasses[0].attributes[0]",
      { mjmlClasses: [{ name: "promo", attributes: [{ inherit: true }] }] },
    ],
    [
      "mjmlClasses[0].components[0].attributes[0]",
      {
        mjmlClasses: [
          { name: "promo", components: [{ tag: "mj-text", attributes: [{ inherit: true }] }] },
        ],
      },
    ],
  ] as const)("keeps inherited rows compact at %s", (path, props) => {
    const field = nativeAttributeField("*", undefined, false, true);
    const config = createEmailConfig(undefined, true);
    const markup = renderToStaticMarkup(
      <Puck config={config} data={{ root: { props }, content: [] } as unknown as Data}>
        {field.render({
          field,
          name: path.replace(/\[\d+\]$/, ""),
          id: "attributes",
          value: [{ name: "width", value: "{{ width }}", inherit: true, template: true }],
          onChange: () => {},
        })}
      </Puck>,
    );
    const $ = load(markup);
    expect($(".pm-attribute-value").val()).toBe("Inherited");
    expect($(".pm-attribute-value").attr("disabled")).toBeDefined();
    expect($(".pm-attribute-popover").text()).not.toContain("Template value");
    expect($(".pm-attribute-row").length).toBe(1);
  });

  it("gates template values in every native attribute editor with the host permission", () => {
    const expected = [
      ...Object.keys(nativeComponentTags).map((name) => `${name}.mjmlAttributes`),
      "Social.links.mjmlAttributes",
      "Navbar.links.mjmlAttributes",
      "Carousel.images.mjmlAttributes",
      "Accordion.items.mjmlAttributes",
      "Accordion.items.titleAttributes",
      "Accordion.items.textAttributes",
      "Section1.columnAttributes",
      "Section2.leftAttributes",
      "Section2.rightAttributes",
      "Section3.leftAttributes",
      "Section3.middleAttributes",
      "Section3.rightAttributes",
      "root.bodyAttributes",
      "root.attributeDefaults",
      "root.componentDefaults.attributes",
      "root.mjmlClasses.attributes",
      "root.mjmlClasses.components.attributes",
    ].sort();
    for (const allowRawHtml of [false, true]) {
      const config = createEmailConfig(undefined, allowRawHtml);
      const paths: string[] = [];
      const visit = (fields: Record<string, unknown>, prefix: string) => {
        for (const [name, entry] of Object.entries(fields)) {
          const field = entry as Field;
          const path = `${prefix}.${name}`;
          if (field.type === "custom" && field.key === "native-attributes") {
            paths.push(path);
            const markup = renderToStaticMarkup(
              <Puck config={config} data={{ root: { props: {} }, content: [] }}>
                {field.render({
                  field,
                  name,
                  id: "attributes",
                  value: [{ name: "color", value: "navy" }],
                  onChange: () => {},
                })}
              </Puck>,
            );
            expect(
              load(markup)(".pm-attribute-popover").text().includes("Template value"),
              path,
            ).toBe(allowRawHtml);
          }
          if (field.type === "array") visit(field.arrayFields, path);
        }
      };
      visit(config.root?.fields ?? {}, "root");
      for (const [name, component] of Object.entries(config.components)) {
        visit(component.fields ?? {}, name);
      }
      expect(paths.sort()).toEqual(expected);
    }
  });

  it("shows template guidance without exposing writable controls in read-only mode", () => {
    const field = nativeAttributeField("mj-text", undefined, false, true);
    const value = [{ name: "font-size", value: "{{ fontSize }}", template: true, inherit: false }];
    const markup = renderField(
      field.render({
        field,
        name: "attributes",
        id: "attributes",
        value,
        readOnly: true,
        onChange: () => {},
      }),
    );
    const $ = load(markup);
    expect($(".pm-attribute-value").val()).toBe("{{ fontSize }}");
    expect($(".pm-attribute-value").attr("disabled")).toBeDefined();
    expect($('input[aria-label="Template value for attribute 1"]').attr("checked")).toBeDefined();
    expect($('input[aria-label="Template value for attribute 1"]').attr("disabled")).toBeDefined();
    expect(markup).toContain("Preserved without evaluation");
    expect(markup).toContain("Resolve layout-dependent values before compiling HTML");
    expect($(".pm-attribute-add").length).toBe(0);
  });

  it("classifies every palette component and exposes only its supported attribute controls", () => {
    const config = createEmailConfig();
    const structuralFields = {
      IntrinsicRow: {
        cells: { type: "slot", allow: ["IntrinsicCell"] },
        padding: { type: "text" },
        width: { type: "select", options: [{ value: "100%" }, { value: "auto" }] },
        mobile: {
          type: "select",
          options: [{ value: "stack" }, { value: "two" }, { value: "keep" }],
        },
        cssClass: { type: "text" },
      },
      IntrinsicCell: {
        content: { type: "slot", allow: ["Text", "Image", "IntrinsicRow"] },
        padding: { type: "text" },
        verticalAlign: {
          type: "select",
          options: [{ value: "top" }, { value: "middle" }, { value: "bottom" }],
        },
        cssClass: { type: "text" },
      },
    };
    expect([...Object.keys(nativeComponentTags), ...Object.keys(structuralFields)].sort()).toEqual(
      Object.keys(config.components).sort(),
    );
    // Structural HTML layout blocks never acquire native/raw controls, even
    // when the host enables trusted HTML for ordinary native components.
    for (const allowRawHtml of [false, true]) {
      const structuralConfig = createEmailConfig(undefined, allowRawHtml);
      for (const [name, fields] of Object.entries(structuralFields)) {
        expect(nativeComponentTags).not.toHaveProperty(name);
        const component = structuralConfig.components[name];
        expect(Object.keys(component.fields ?? {}).sort()).toEqual(Object.keys(fields).sort());
        expect(component.fields).toMatchObject(fields);
        expect(Object.keys(component.defaultProps ?? {}).sort()).toEqual(
          Object.keys(fields).sort(),
        );
        for (const unsupported of ["mjClass", "mjmlAttributes", "htmlContent"])
          expect(component.fields).not.toHaveProperty(unsupported);
      }
    }
    for (const [name, tag] of Object.entries(nativeComponentTags)) {
      const component = config.components[name];
      expect(component.fields?.mjClass).toMatchObject({ type: "text" });
      expect(attributeNames(component.fields?.mjmlAttributes)).toEqual(nativeAttributeNames(tag));
      const attributes = component.fields?.mjmlAttributes as CustomField<MjmlAttribute[]>;
      expect(attributes).toMatchObject({ type: "custom", key: "native-attributes" });
      expect(component.defaultProps).toMatchObject({ mjmlAttributes: [] });
      expect(component.defaultProps).not.toHaveProperty("mjClass");
      const markup = renderField(
        attributes.render({
          field: attributes,
          name: "attributes",
          id: "attributes",
          value: [{ name: "", value: "" }],
          onChange: () => {},
        }),
      );
      expect(load(markup)('.pm-attribute-name[role="combobox"]').val()).toBe("");
    }
  });

  it("preserves inline editing, layout drag behavior, and trusted HTML gating", () => {
    const config = createEmailConfig();
    expect(config.components.Text.fields?.content).toMatchObject({
      type: "richtext",
      contentEditable: true,
      visible: false,
    });
    expect(config.components.Button.fields?.label).toMatchObject({
      type: "text",
      contentEditable: true,
      visible: false,
    });
    expect(config.components.Column.inline).toBe(true);
    expect(config.components.Group.inline).toBe(true);
    expect(config.categories?.Advanced.visible).toBe(false);
    expect(config.root?.fields?.rawHead?.visible).toBe(false);
    expect(config.root?.fields?.rawFileStart?.visible).toBe(false);
    expect(createEmailConfig(undefined, true).categories?.Advanced.visible).toBe(true);
  });

  it("covers nested social, navigation, carousel, and accordion elements", () => {
    const config = createEmailConfig();
    for (const [name, property, tag] of [
      ["Social", "links", "mj-social-element"],
      ["Navbar", "links", "mj-navbar-link"],
      ["Carousel", "images", "mj-carousel-image"],
      ["Accordion", "items", "mj-accordion-element"],
    ]) {
      const fields = (config.components[name].fields![property] as ArrayField).arrayFields;
      expect(fields.mjClass).toMatchObject({ type: "text" });
      if (name === "Social" || name === "Navbar") {
        expect(fields.mjmlAttributes).toMatchObject({
          type: "custom",
        });
        expect(
          nativeEntryTagFromPath(
            { links: [{ kind: "link" }, { kind: "raw" }] },
            "links[0].mjmlAttributes[0].name",
            tag,
          ),
        ).toBe(tag);
        expect(
          nativeEntryTagFromPath(
            { links: [{ kind: "link" }, { kind: "raw" }] },
            "links[1].mjmlAttributes[0].name",
            tag,
          ),
        ).toBe("mj-raw");
      } else {
        expect(attributeNames(fields.mjmlAttributes)).toEqual(nativeAttributeNames(tag));
      }
      const array = config.components[name].fields![property] as ArrayField;
      expect(array.defaultItemProps).not.toHaveProperty("mjClass");
      for (const item of config.components[name].defaultProps?.[property] ?? []) {
        expect(item).not.toHaveProperty("mjClass");
      }
    }
    const accordion = (config.components.Accordion.fields!.items as ArrayField).arrayFields;
    expect(attributeNames(accordion.titleAttributes)).toEqual(
      nativeAttributeNames("mj-accordion-title"),
    );
    expect(attributeNames(accordion.textAttributes)).toEqual(
      nativeAttributeNames("mj-accordion-text"),
    );
    expect(accordion.titleMjClass).toMatchObject({ type: "text" });
    expect(accordion.textMjClass).toMatchObject({ type: "text" });
    expect(accordion.content).toMatchObject({ type: "richtext" });
    const itemDefaults = (config.components.Accordion.fields!.items as ArrayField).defaultItemProps;
    expect(itemDefaults).not.toHaveProperty("titleMjClass");
    expect(itemDefaults).not.toHaveProperty("textMjClass");
  });

  it("exposes classes and attributes for every implicit fixed-section column", () => {
    const config = createEmailConfig();
    for (const [name, columns] of Object.entries({
      Section1: ["column"],
      Section2: ["left", "right"],
      Section3: ["left", "middle", "right"],
    })) {
      for (const column of columns) {
        const component = config.components[name];
        expect(component.fields?.[`${column}MjClass`]).toMatchObject({ type: "text" });
        expect(attributeNames(component.fields?.[`${column}Attributes`])).toEqual(
          nativeAttributeNames("mj-column"),
        );
        expect(component.fields?.[column]).toMatchObject({ type: "slot" });
        expect(component.defaultProps?.[`${column}Attributes`]).toEqual([]);
        expect(component.defaultProps).not.toHaveProperty(`${column}MjClass`);
      }
    }
  });

  it("exposes body, global, element, and class defaults with tag-aware nested dropdowns", () => {
    const root = createEmailConfig().root;
    expect(root?.fields?.bodyMjClass).toMatchObject({ type: "text" });
    expect(root?.defaultProps).not.toHaveProperty("bodyMjClass");
    expect(attributeNames(root?.fields?.bodyAttributes)).toEqual(nativeAttributeNames("mj-body"));
    expect(attributeNames(root?.fields?.attributeDefaults)).toEqual(nativeAttributeNames("*"));
    const defaults = root?.fields?.componentDefaults as ArrayField;
    expect(defaults.arrayFields.tag).toMatchObject({ type: "select" });
    expect(defaults.arrayFields.attributes.type).toBe("custom");
    const classes = root?.fields?.mjmlClasses as ArrayField;
    expect(attributeNames(classes.arrayFields.attributes)).toEqual(nativeAttributeNames("*"));
    expect(classes.arrayFields.components.type).toBe("array");
    const data = {
      componentDefaults: [
        { tag: "mj-image", attributes: [] },
        { tag: "mj-button", attributes: [] },
      ],
      mjmlClasses: [{ name: "promo", components: [{ tag: "mj-social-element", attributes: [] }] }],
    };
    expect(nativeAttributeTagFromPath(data, "componentDefaults[0].attributes[0].name")).toBe(
      "mj-image",
    );
    expect(nativeAttributeTagFromPath(data, "componentDefaults[1].attributes[2].name")).toBe(
      "mj-button",
    );
    expect(
      nativeAttributeTagFromPath(data, "mjmlClasses[0].components[0].attributes[0].name"),
    ).toBe("mj-social-element");
    expect(nativeAttributeTagFromPath(data, "mjmlClasses[0].attributes[0].name")).toBe("*");
  });

  it("renders each component-default attribute dropdown from its own selected tag", () => {
    const config = createEmailConfig();
    const defaults = config.root?.fields?.componentDefaults as ArrayField;
    const field = defaults.arrayFields.attributes;
    if (field.type !== "custom") throw new Error("Expected the tag-aware field");
    const data = {
      root: {
        props: {
          componentDefaults: [
            { tag: "mj-image", attributes: [] },
            { tag: "mj-button", attributes: [] },
          ],
          mjmlClasses: [
            { name: "icons", components: [{ tag: "mj-social-element", attributes: [] }] },
          ],
        },
      },
      content: [],
    };
    for (const [path, expected, excluded] of [
      ["componentDefaults[0].attributes", "src", "inner-padding"],
      ["componentDefaults[1].attributes", "inner-padding", "src"],
      ["mjmlClasses[0].components[0].attributes", "icon-size", "inner-padding"],
    ]) {
      const html = renderToStaticMarkup(
        <Puck config={config} data={data as Data}>
          {field.render({
            field,
            name: path,
            id: "native-name",
            value: [{ name: "", value: "" }],
            onChange: () => {},
          })}
        </Puck>,
      );
      expect(html).toContain(`data-property="${expected}"`);
      expect(html).not.toContain(`data-property="${excluded}"`);
    }
  });
});

describe("trusted ending-tag source controls", () => {
  it.each(["Social", "Navbar"])(
    "switches %s native attribute options for ordered raw entries",
    (type) => {
      const config = createEmailConfig(undefined, true);
      const links = config.components[type].fields!.links as ArrayField;
      const field = links.arrayFields.mjmlAttributes;
      if (field.type !== "custom") throw new Error("Expected the entry-aware attribute field");
      const data = {
        root: { props: {} },
        content: [
          {
            type,
            props: {
              id: "links",
              links: [
                { kind: "raw", html: "source" },
                { kind: "link", label: "Normal", href: "https://example.com", name: "web" },
              ],
            },
          },
        ],
      };
      for (const index of [0, 1]) {
        const html = renderToStaticMarkup(
          <Puck
            config={config}
            data={data as Data}
            ui={{ itemSelector: { index: 0, zone: "root:default-zone" } }}
          >
            {field.render({
              field,
              name: `links[${index}].mjmlAttributes`,
              id: "entry-name",
              value: [{ name: "", value: "" }],
              onChange: () => {},
            })}
          </Puck>,
        );
        expect(html.includes('data-property="position"')).toBe(index === 0);
        expect(html.includes('data-property="href"')).toBe(index === 1);
      }
    },
  );

  it("distinguishes disabled source from an intentionally empty source", () => {
    const field = optionalHtmlField(true);
    if (field.type !== "custom") throw new Error("Expected the optional HTML control");
    const onChange = vi.fn();
    const props = { field, name: "htmlContent", id: "source", onChange };
    const disabled = field.render({ ...props, value: undefined });
    const disabledMarkup = renderToStaticMarkup(disabled);
    expect(load(disabledMarkup)('input[type="checkbox"]').attr("checked")).toBeUndefined();
    expect(disabledMarkup).not.toContain("<textarea");
    const empty = field.render({ ...props, value: "" });
    const emptyMarkup = renderToStaticMarkup(empty);
    expect(load(emptyMarkup)('input[type="checkbox"]').attr("checked")).toBeDefined();
    expect(emptyMarkup).toContain("<textarea");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("gates trusted fields and never initializes an optional source or raw kind", () => {
    const config = createEmailConfig();
    const enabled = createEmailConfig(undefined, true);
    for (const name of ["Text", "Button", "Table"]) {
      expect(config.components[name].fields?.htmlContent?.visible).toBe(false);
      expect(enabled.components[name].fields?.htmlContent?.visible).toBe(true);
      expect(config.components[name].defaultProps).not.toHaveProperty("htmlContent");
    }
    for (const name of ["Social", "Navbar"]) {
      const array = config.components[name].fields!.links as ArrayField;
      expect(array.arrayFields.kind.visible).toBe(false);
      expect(array.arrayFields.html.visible).toBe(false);
      expect(array.arrayFields.htmlContent.visible).toBe(false);
      expect(array.defaultItemProps).not.toHaveProperty("htmlContent");
      expect(array.defaultItemProps).not.toHaveProperty("kind");
    }
    const items = config.components.Accordion.fields!.items as ArrayField;
    expect(items.arrayFields.titleHtmlContent.visible).toBe(false);
    expect(items.arrayFields.htmlContent.visible).toBe(false);
    expect(items.defaultItemProps).not.toHaveProperty("titleHtmlContent");
    expect(items.defaultItemProps).not.toHaveProperty("htmlContent");
    for (const name of ["subjectHtmlContent", "previewHtmlContent"]) {
      expect(config.root?.fields?.[name]?.visible).toBe(false);
      expect(enabled.root?.fields?.[name]?.visible).toBe(true);
      expect(config.root?.defaultProps).not.toHaveProperty(name);
    }
    expect(config.root?.fields?.breakpointWidth?.visible).toBe(true);
    expect(config.root?.defaultProps).not.toHaveProperty("breakpointWidth");
  });

  it.each(["Text", "Button", "Table"])(
    "shows %s source as escaped code without mounting its usual renderer",
    (type) => {
      const source = '<script>evil()</script><img src="x" onerror="evil()">';
      const html = canvasMarkup(
        type,
        { htmlContent: source, content: "<p>fallback content</p>", label: "fallback label" },
        false,
      );
      expect(html).toContain("&lt;script&gt;evil()&lt;/script&gt;");
      expect(html).not.toContain("<script>");
      expect(html).not.toContain("<img");
      expect(html).not.toContain("fallback content");
      expect(html).not.toContain("fallback label");
      expect(html).not.toContain('class="rich-text"');
      const empty = canvasMarkup(type, { htmlContent: "" });
      expect(empty).toContain("(empty HTML)");
    },
  );

  it("keeps ordinary rich text rendering when the override is undefined", () => {
    expect(
      canvasMarkup("Text", { content: "<p>Inline text stays</p>", htmlContent: undefined }),
    ).toContain("<p>Inline text stays</p>");
  });

  it.each(["Social", "Navbar"])("preserves ordered raw and trusted entries within %s", (type) => {
    const html = canvasMarkup(type, {
      links: [
        { name: "web", label: "First link", href: "https://example.com" },
        { kind: "raw", html: "<script>raw-entry</script>" },
        {
          name: "web",
          label: "Hidden label",
          href: "https://example.com",
          htmlContent: "<b>trusted-entry</b>",
        },
        { name: "web", label: "Last link", href: "https://example.com" },
      ],
    });
    expect(html.indexOf("First link")).toBeLessThan(html.indexOf("raw-entry"));
    expect(html.indexOf("raw-entry")).toBeLessThan(html.indexOf("trusted-entry"));
    expect(html.indexOf("trusted-entry")).toBeLessThan(html.indexOf("Last link"));
    expect(html).toContain("&lt;script&gt;raw-entry&lt;/script&gt;");
    expect(html).toContain("&lt;b&gt;trusted-entry&lt;/b&gt;");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("Hidden label");
  });

  it("escapes both accordion ending-tag sources and suppresses their fallback content", () => {
    const html = canvasMarkup("Accordion", {
      items: [
        {
          title: "fallback title",
          content: "<p>fallback answer</p>",
          titleHtmlContent: "<em>Source title</em>",
          htmlContent: "<script>Source answer</script>",
        },
      ],
    });
    expect(html).toContain("&lt;em&gt;Source title&lt;/em&gt;");
    expect(html).toContain("&lt;script&gt;Source answer&lt;/script&gt;");
    expect(html).not.toContain("fallback title");
    expect(html).not.toContain("fallback answer");
    expect(html).not.toContain("<script>");
  });
});
