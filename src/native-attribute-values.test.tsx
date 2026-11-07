// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { Puck, createUsePuck, type Config, type Data } from "@puckeditor/core";
import { load } from "cheerio";
import { afterEach, describe, expect, it, vi } from "vitest";
import { nativeAttributeField } from "./NativeFields";
import { readNativeAttributes } from "./native-attributes";
import type { MjmlAttribute } from "./types";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
let container: HTMLDivElement | undefined;
afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

function renderValue({
  tag,
  entry,
  path = "attributes[0]",
  rootProps = { attributes: [entry] },
  itemProps,
  dynamicTag = false,
  readOnly = false,
  valueOnly = true,
}: {
  tag: string;
  entry: MjmlAttribute;
  path?: string;
  rootProps?: Record<string, unknown>;
  itemProps?: Record<string, unknown>;
  dynamicTag?: boolean | string;
  readOnly?: boolean;
  valueOnly?: boolean;
}) {
  const field = nativeAttributeField(tag, undefined, dynamicTag, true);
  const config: Config = { components: { Test: { render: () => <div /> } } };
  const onChange = vi.fn();
  const markup = renderToStaticMarkup(
    <Puck
      config={config}
      data={
        {
          root: { props: rootProps },
          content: itemProps ? [{ type: "Test", props: { id: "test", ...itemProps } }] : [],
        } as Data
      }
      ui={itemProps ? { itemSelector: { index: 0, zone: "root:default-zone" } } : undefined}
    >
      {field.render({
        field,
        id: "value",
        name: path.replace(/\[\d+\]$/, ""),
        value: [entry],
        readOnly,
        onChange,
      })}
    </Puck>,
  );
  expect(onChange).not.toHaveBeenCalled();
  const $ = load(markup);
  return valueOnly ? load($.html($(".pm-attribute-value"))) : $;
}

describe("catalog-aware native attribute values", () => {
  it.each([
    ["mj-body", "background-color"],
    ["mj-text", "color"],
    ["mj-carousel", "tb-selected-border-color"],
    ["mj-navbar", "ico-color"],
    ["*", "background-color"],
  ])("offers a color picker for catalog-declared %s.%s colors", (tag, name) => {
    const $ = renderValue({
      tag,
      entry: { name, value: "transparent" },
      valueOnly: false,
      readOnly: true,
    });
    expect($('input[type="color"]').length).toBe(1);
    expect($('input[type="color"]').attr("disabled")).toBeDefined();
    expect($(".pm-attribute-value").val()).toBe("transparent");
  });

  it.each([
    { name: "border", value: "1px solid #123456" },
    { name: "unknown-color", value: "#123456" },
    { name: "color", value: "{{ color }}", template: true },
    { name: "color", value: "#123456", inherit: true },
  ])("keeps non-color properties and special modes out of the color picker: %j", (entry) => {
    const $ = renderValue({ tag: "mj-text", entry, valueOnly: false });
    expect($('input[type="color"]').length).toBe(0);
  });

  it.each([
    ["mj-text", "align", "justify", ["left", "right", "center", "justify"]],
    ["mj-image", "fluid-on-mobile", "false", ["true", "false"]],
    ["mj-section", "full-width", "", ["full-width", "false", ""]],
  ])(
    "offers the declared %s.%s choices without changing the value",
    (tag, name, value, choices) => {
      const $ = renderValue({
        tag: tag as string,
        entry: { name: name as string, value: value as string },
        readOnly: true,
      });
      expect($("input").length).toBe(0);
      expect($("select").attr("disabled")).toBeDefined();
      expect($("select").val()).toBe(value);
      expect(
        $("option")
          .toArray()
          .map((option) => option.attribs.value),
      ).toEqual(choices);
      if (value === "") expect($('option[value=""]').text()).toBe("Empty value");
    },
  );

  it.each(["sideways", " left ", ""])("preserves an existing non-option value %j", (value) => {
    const $ = renderValue({ tag: "mj-text", entry: { name: "align", value } });
    expect($("select").val()).toBe(value);
    expect($("option:selected").text()).toBe(value ? `${value} (current value)` : "Choose value…");
    expect($('option[value="justify"]').length).toBe(1);
  });

  it.each([
    ["mj-text", "font-size", "20px"],
    ["mj-text", "color", "rgb(10, 20, 30)"],
    ["mj-image", "height", "auto"],
    ["mj-text", "unknown-attribute", "custom"],
    ["mj-text", "constructor", "custom"],
    ["mj-text", "css-class", "lead copy"],
  ])("keeps %s.%s as editable text", (tag, name, value) => {
    const $ = renderValue({ tag, entry: { name, value } });
    expect($("select").length).toBe(0);
    expect($("input").val()).toBe(value);
  });

  it("uses the union of finite global choices but leaves mixed descriptors open-ended", () => {
    const $ = renderValue({ tag: "*", entry: { name: "align", value: "justify" } });
    expect($("select").val()).toBe("justify");
    expect(
      new Set(
        $("option")
          .toArray()
          .map((option) => option.attribs.value),
      ),
    ).toEqual(new Set(["left", "center", "right", "justify"]));
    const mixed = renderValue({ tag: "*", entry: { name: "mode", value: "fixed-height" } });
    expect(mixed("select").length).toBe(0);
    expect(mixed("input").val()).toBe("fixed-height");
  });

  it("resolves component and nested class default choices from each selected tag", () => {
    const entry = { name: "align", value: "left" };
    const rootProps = {
      componentDefaults: [
        { tag: "mj-text", attributes: [entry] },
        { tag: "mj-button", attributes: [entry] },
      ],
      mjmlClasses: [{ name: "theme", components: [{ tag: "mj-text", attributes: [entry] }] }],
    };
    for (const [path, justify] of [
      ["componentDefaults[0].attributes[0]", true],
      ["componentDefaults[1].attributes[0]", false],
      ["mjmlClasses[0].components[0].attributes[0]", true],
    ] as const) {
      const $ = renderValue({ tag: "*", entry, path, rootProps, dynamicTag: true });
      expect($('option[value="justify"]').length).toBe(justify ? 1 : 0);
    }
  });

  it("switches nested link and raw-entry value choices using the same tag as the name control", () => {
    const raw = { name: "position", value: "file-start" };
    const link = { name: "icon-position", value: "right" };
    const itemProps = {
      links: [
        { kind: "raw", mjmlAttributes: [raw] },
        { kind: "link", mjmlAttributes: [link] },
      ],
    };
    const rawValue = renderValue({
      tag: "mj-social-element",
      entry: raw,
      path: "links[0].mjmlAttributes[0]",
      itemProps,
      dynamicTag: "mj-social-element",
    });
    expect(
      rawValue("option")
        .toArray()
        .map((option) => option.attribs.value),
    ).toEqual(["file-start"]);
    const linkValue = renderValue({
      tag: "mj-social-element",
      entry: link,
      path: "links[1].mjmlAttributes[0]",
      itemProps,
      dynamicTag: "mj-social-element",
    });
    expect(
      linkValue("option")
        .toArray()
        .map((option) => option.attribs.value),
    ).toEqual(["left", "right"]);
  });

  it("updates choices on attribute changes and preserves template text while toggling modes", () => {
    type RootProps = { attributes: MjmlAttribute[] };
    const usePuck = createUsePuck<Config<{}, RootProps>>();
    const array = nativeAttributeField("mj-image", undefined, false, true);
    const config: Config<{}, RootProps> = {
      components: {},
      root: { fields: { attributes: array } },
    };
    let entry: MjmlAttribute;
    function Controls() {
      const { appState, dispatch } = usePuck((state) => state);
      entry = appState.data.root.props!.attributes[0];
      return array.render({
        field: array,
        id: "attributes",
        name: "attributes",
        value: [entry],
        onChange: (attributes) =>
          dispatch({
            type: "setData",
            data: (previous) => ({
              root: { ...previous.root, props: { ...previous.root.props, attributes } },
            }),
          }),
      });
    }
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() =>
      root!.render(
        <Puck
          config={config}
          data={{
            root: { props: { attributes: [{ name: "align", value: "left" }] } },
            content: [],
          }}
        >
          <Controls />
        </Puck>,
      ),
    );
    const query = <T extends Element>(selector: string) => container!.querySelector<T>(selector)!;
    const changeSelect = (id: string, value: string) =>
      act(() => {
        query<HTMLSelectElement>(`select#${id}`).value = value;
        query<HTMLSelectElement>(`select#${id}`).dispatchEvent(
          new Event("change", { bubbles: true }),
        );
      });
    changeSelect("attributes-0-name", "fluid-on-mobile");
    expect(query<HTMLSelectElement>("select#attributes-0-value").value).toBe("left");
    changeSelect("attributes-0-value", "true");
    expect(entry!.value).toBe("true");
    expect(readNativeAttributes("mj-image", [entry!])).toEqual({ "fluid-on-mobile": "true" });
    act(() =>
      query<HTMLInputElement>('input[aria-label="Template value for attribute 1"]').click(),
    );
    expect(query("select#attributes-0-value")).toBeNull();
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    act(() => {
      setValue.call(query("input#attributes-0-value"), "{{ fluid }}");
      query("input#attributes-0-value").dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(entry!.value).toBe("{{ fluid }}");
    act(() =>
      query<HTMLInputElement>('input[aria-label="Template value for attribute 1"]').click(),
    );
    expect(query<HTMLSelectElement>("select#attributes-0-value").value).toBe("{{ fluid }}");
    act(() => query<HTMLInputElement>('input[aria-label="Inherit attribute 1"]').click());
    expect(query<HTMLInputElement>(".pm-attribute-value").value).toBe("Inherited");
    expect(query<HTMLInputElement>(".pm-attribute-value").disabled).toBe(true);
    act(() => query<HTMLInputElement>('input[aria-label="Inherit attribute 1"]').click());
    expect(query<HTMLSelectElement>("select#attributes-0-value").value).toBe("{{ fluid }}");
    expect(entry!.value).toBe("{{ fluid }}");
  });
});
