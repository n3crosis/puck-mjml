import { Render, type Data, type ComponentConfig, type CustomField } from "@puckeditor/core";
import { load } from "cheerio";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  createIntrinsicLayoutDocument,
  intrinsicImage24,
} from "../tests/browser/fixtures/intrinsic-layout-data";
import { createEmailConfig } from "./config";
import { compileEmail, toMjml } from "./export";
import { fromMjml } from "./import";
import {
  intrinsicResponsiveCss,
  isIntrinsicResponsiveCss,
  readIntrinsicOrigin,
  resolveIntrinsicLeaf,
  validateIntrinsicContent,
  validateIntrinsicStructure,
} from "./intrinsic-layout";
import { createNativeContext } from "./native-cascade";
import * as whitespace from "./imported-whitespace";
import { assertIntrinsicSourceBounds } from "./intrinsic-source";
import { preflightIntrinsicImage } from "./IntrinsicImageSourceField";
import { sanitizeDocumentRichText } from "./normalize";
import type { EmailBlock, EmailDocument, EmailSettings } from "./types";

beforeAll(() => vi.stubGlobal("window", globalThis));
afterAll(() => vi.unstubAllGlobals());
const text = (props: EmailBlock["props"] = {}): EmailBlock => ({
  type: "Text",
  props: { id: "copy", content: "<p>Editable content</p>", padding: "10px", ...props },
});
const image = (props: EmailBlock["props"] = {}): EmailBlock => ({
  type: "Image",
  props: { id: "image", src: "https://example.com/image.png", padding: "0px", width: 64, ...props },
});
const row = (content: EmailBlock[]): EmailBlock => ({
  type: "IntrinsicRow",
  props: { id: "row", cells: [{ type: "IntrinsicCell", props: { id: "cell", content } }] },
});
const documentWith = (content: EmailBlock[], settings: EmailSettings = {}): EmailDocument => ({
  root: {
    props: {
      width: 600,
      ...settings,
      sections: [
        { type: "Section1", props: { id: "section", padding: "0px", column: [row(content)] } },
      ],
    },
  },
  content: [],
});
function allBlocks(value: unknown): EmailBlock[] {
  if (!value || typeof value !== "object") return [];
  return [
    ...("type" in value && "props" in value ? [value as EmailBlock] : []),
    ...Object.values(value).flatMap(allBlocks),
  ];
}
const sourceRows = (source: string) => {
  const $ = load(source, { xml: true });
  return $("mj-table")
    .toArray()
    .map((node) => $(node).html());
};
const roundtrip = (source: string) => {
  const result = fromMjml(source);
  expect(result.warnings).toEqual([]);
  return result.document;
};

describe("safe editable intrinsic layout", () => {
  it("compiles generic nested cells and preserves source after normalization", async () => {
    const data = createIntrinsicLayoutDocument();
    const before = JSON.stringify(data),
      source = toMjml(data);
    const imported = roundtrip(source),
      exported = toMjml(imported);
    expect(sourceRows(exported)).toEqual(sourceRows(source));
    expect(toMjml(roundtrip(exported))).toBe(exported);
    expect(JSON.stringify(data)).toBe(before);
    expect((await compileEmail(data)).errors).toEqual([]);
    const canvas = load(
      renderToStaticMarkup(<Render config={createEmailConfig()} data={data as Data} />),
    );
    expect(canvas("div.pm-intrinsic-table")).toHaveLength(9);
    expect(canvas("div.pm-intrinsic-cell")).toHaveLength(21);
    expect(canvas(".pm-intrinsic-error")).toHaveLength(0);
    expect(canvas("table div.pm-intrinsic-cell")).toHaveLength(0);
    const ids = allBlocks(imported).map((block) => block.props.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain("mode-stack");
    for (const literal of ["<b x", "<!--", "<![CDATA["]) {
      const cssSource = source.replace(
        "</mj-head>",
        `<mj-style>.x { content: "${literal}" }</mj-style></mj-head>`,
      );
      // The XML-only test helper cannot parse raw CSS literals either. Compare
      // the complete normalized body without reparsing the authored head.
      expect(toMjml(roundtrip(cssSource)).split("<mj-body")[1]).toBe(exported.split("<mj-body")[1]);
    }
  });
  it("retains shorthand fallback, class inheritance, source side edits and visual edit release", () => {
    const settings = {
      mjmlClasses: [
        {
          name: "theme",
          attributes: [
            { name: "padding-left", value: "20px" },
            { name: "color", value: "#123456" },
          ],
        },
      ],
    };
    const source = toMjml(
      documentWith(
        [text({ mjClass: "theme", mjmlAttributes: [{ name: "color", inherit: true }] })],
        settings,
      ),
    );
    const first = roundtrip(source);
    const rules = first.root.props!.mjmlClasses![0].attributes;
    rules.find((entry) => entry.name === "padding-left")!.value = "30px";
    expect(toMjml(first)).toContain("padding:10px;padding-left:30px");
    rules.splice(
      rules.findIndex((entry) => entry.name === "padding-left"),
      1,
    );
    expect(toMjml(first)).toContain("padding:10px;text-align:left");
    expect(toMjml(roundtrip(source.replace("padding-left:20px", "padding-left:25px")))).toContain(
      "padding-left:25px",
    );
    const copy = allBlocks(roundtrip(source)).find((block) => block.type === "Text")!;
    expect(
      toMjml(documentWith([{ ...copy, props: { ...copy.props, color: "#abcdef" } }], settings)),
    ).toContain("color:#abcdef");
    expect(
      fromMjml(
        source.replace("padding:10px;padding-left:20px", "padding-left:20px;padding:10px"),
      ).warnings.some((warning) => warning.includes("allowRawHtml")),
    ).toBe(true);
    // Removing an unrepresentable side cannot silently restore its class value.
    expect(
      fromMjml(source.replace("padding-left:20px;", "")).warnings.some((warning) =>
        warning.includes("allowRawHtml"),
      ),
    ).toBe(true);
  });
  it("keeps cleared inherited links empty across repeated source imports", () => {
    const source = toMjml(
      documentWith(
        [image({ mjClass: "linked", mjmlAttributes: [{ name: "href", inherit: true }] })],
        {
          mjmlClasses: [
            {
              name: "linked",
              attributes: [{ name: "href", value: "https://example.com/inherited" }],
            },
          ],
        },
      ),
    );
    const exported = toMjml(
      roundtrip(source.replace('<a href="https://example.com/inherited"', "<a")),
    );
    expect(exported).toContain('<a href=""');
    expect(toMjml(roundtrip(exported))).toContain('<a href=""');
    const noHints = source.replace(/ data-pm-origin="[^"]*"/g, "");
    expect(
      toMjml(roundtrip(noHints.replace('<a href="https://example.com/inherited"', "<a"))),
    ).toContain('<a href=""');
    for (const cssClass of [
      "你好",
      "foo:bar",
      "foo foo",
      "pm-intrinsic-other",
      "pm-intrinsic-fluid",
    ])
      for (const leaf of [
        text({ mjmlAttributes: [{ name: "css-class", value: cssClass }] }),
        image({ mjmlAttributes: [{ name: "css-class", value: cssClass }] }),
      ]) {
        const marked = toMjml(documentWith([leaf]));
        expect(sourceRows(toMjml(roundtrip(marked)))).toEqual(sourceRows(marked));
      }
  });
  it.each(["1.0px", ".5px", "064px"])("retains native pixel width spelling %s", (width) => {
    const source = toMjml(
      documentWith([image({ mjmlAttributes: [{ name: "width", value: width }] })]),
    );
    expect(sourceRows(toMjml(roundtrip(source)))).toEqual(sourceRows(source));
  });
  it("keeps omitted image width and rejects unsafe URLs or raw/template leaves", () => {
    const source = toMjml(
      documentWith([image({ mjmlAttributes: [{ name: "width", inherit: true }] })]),
    );
    const $ = load(source, { xml: true });
    expect($("img").attr("width")).toBeUndefined();
    expect($("img").attr("style")).toContain("width:100%");
    expect(sourceRows(toMjml(roundtrip(source)))).toEqual(sourceRows(source));
    const noHints = roundtrip(source.replace(/ data-pm-origin="[^"]*"/g, ""));
    noHints.root.props!.componentDefaults = [
      { tag: "mj-image", attributes: [{ name: "width", value: "72px" }] },
    ];
    expect(toMjml(noHints)).toContain('width="72"');
    const deliberate = roundtrip(
      source
        .replace(/(<img[^>]*style="[^"]*;)width:100%/, "$1width:32px")
        .replace("<img ", '<img width="32" '),
    );
    deliberate.root.props!.componentDefaults = noHints.root.props!.componentDefaults;
    expect(toMjml(deliberate)).toContain('width="32"');
    expect(() => toMjml(documentWith([image({ src: "javascript:alert(1)" })]))).toThrow();
    expect(() =>
      toMjml(documentWith([text({ htmlContent: "<b>trusted</b>" })]), { allowRawHtml: true }),
    ).toThrow(/trusted HTML/);
    expect(() =>
      toMjml(
        documentWith([
          image({ mjmlAttributes: [{ name: "src", value: "{{ image }}", template: true }] }),
        ]),
        { allowRawHtml: true },
      ),
    ).toThrow(/template/);
  });
  it("requires bounded canonical hints without duplicate keys or authorization fields", () => {
    for (const hint of [
      '{"v":1,"v":1}',
      '{"v":1,"allowRawHtml":true}',
      '{"inherit":[],"v":1}',
      '{"v":1,"inherit":[["src","bad"]]}',
    ])
      expect(() => readIntrinsicOrigin(hint, "mj-image", {})).toThrow();
    expect(readIntrinsicOrigin('{"v":1}', "mj-image", {}).inherit).toEqual([]);
    expect(() => readIntrinsicOrigin("x".repeat(8193), "mj-text", {})).toThrow(/8 KiB/);
  });
  it("rejects unsupported marked HTML without promoting raw content", () => {
    const source = toMjml(documentWith([text(), image()]));
    const mutations = [
      source.replace('data-pm-layout="1"', 'data-pm-layout="1" data-pm-layout="999"'),
      source.replace('data-pm-layout="1"', 'data-pm-layout="999"'),
      source.replace("Editable content", "Editable<!-- hidden --> content"),
      source.replace("</mj-table>", "<div>fostered</div></mj-table>"),
      source.replace("</mj-table>", '<img src="https://example.com/extra.png" /></mj-table>'),
      source.replace("padding:10px", "padding:10px;padding:20px"),
      source.replace('data-pm-layout="1"', `data-pm-layout="1" ${"a".repeat(16 * 1024)}`),
    ];
    for (const mutated of mutations) {
      const result = fromMjml(mutated);
      expect(allBlocks(result.document).some((block) => block.type === "Table")).toBe(true);
      expect(result.warnings.some((warning) => warning.includes("allowRawHtml"))).toBe(true);
      expect(() => toMjml(result.document)).toThrow(/allowRawHtml/);
    }
  });
  it("hard-stops resource failures before rich-text sanitization or raw fallback", () => {
    const atNodeLimit = row(
      Array.from({ length: 254 }, (_, index) => text({ id: `node-${index}` })),
    );
    expect(() => validateIntrinsicStructure(atNodeLimit)).not.toThrow();
    (atNodeLimit.props.cells as EmailBlock[])[0].props.content = [
      ...((atNodeLimit.props.cells as EmailBlock[])[0].props.content as EmailBlock[]),
      text({ id: "node-overflow" }),
    ];
    expect(() => validateIntrinsicStructure(atNodeLimit)).toThrow(/at most 256 blocks/);
    const source = toMjml(documentWith([text()]));
    const analysis = vi.spyOn(whitespace, "hasSourceWhitespaceStyles");
    for (const literal of ["<b x", "<!--", "<![CDATA["]) {
      const cssSource = source.replace(
        "</mj-head>",
        `<mj-style>.x { content: "${literal}" }</mj-style></mj-head>`,
      );
      expect(() => fromMjml(cssSource.replace("Editable content", "x".repeat(70000)))).toThrow(
        /limit/,
      );
    }
    for (const content of [
      "x".repeat(65537),
      "<b>".repeat(65) + "x" + "</b>".repeat(65),
      "<br />".repeat(4100),
    ]) {
      expect(() => fromMjml(source.replace("Editable content", content))).toThrow(/limit/);
      expect(() => toMjml(documentWith([text({ content })]))).toThrow(/limit/);
    }
    expect(analysis).not.toHaveBeenCalled();
    analysis.mockRestore();
    const options = { nativeContext: createNativeContext() };
    // Limits include the outer mj-table's two tokens and one depth level.
    const boundary = documentWith([text({ content: "<br>".repeat(4076) })]);
    expect(fromMjml(toMjml(boundary)).warnings).toEqual([]);
    for (const count of [4077, 4078]) {
      const invalid = documentWith([text({ content: "<br>".repeat(count) })]);
      expect(() => toMjml(invalid)).toThrow(/4096 HTML tokens/);
      expect(() =>
        validateIntrinsicContent(
          allBlocks(invalid).find((item) => item.type === "IntrinsicRow")!,
          options,
        ),
      ).toThrow(/4096 HTML tokens/);
    }
    for (const leaf of [
      text({
        importedRichText: { source: "x".repeat(65537), baseline: "<p>Editable content</p>" },
      }),
      image({ mjmlAttributes: [{ name: "title", value: "x".repeat(65537) }] }),
    ]) {
      expect(() => toMjml(documentWith([leaf]))).toThrow(/limit/);
      expect(() => validateIntrinsicContent(row([leaf]), options)).toThrow(/limit/);
    }
    const inherited = {
      componentDefaults: [
        { tag: "mj-image", attributes: [{ name: "title", value: "x".repeat(65537) }] },
      ],
    };
    expect(() => toMjml(documentWith([image()], inherited))).toThrow(/limit/);
    expect(() =>
      validateIntrinsicContent(row([image()]), { nativeContext: createNativeContext(inherited) }),
    ).toThrow(/limit/);
    const split = `<b>${"x".repeat(40000)}</b><i>${"y".repeat(40000)}</i>`;
    expect(() =>
      toMjml(
        documentWith([
          text({ importedRichText: { source: split, baseline: "<p>Editable content</p>" } }),
        ]),
      ),
    ).toThrow(/64 KiB/);
    expect(() => fromMjml(source.replace("<p>Editable content</p>", split))).toThrow(/64 KiB/);
    expect(() => assertIntrinsicSourceBounds(`<div ${"a".repeat(65537)}></div>`)).toThrow(/limit/);
    expect(() => assertIntrinsicSourceBounds(`<!--${"x".repeat(65537)}-->`)).toThrow(/limit/);
  });
  it("sanitizes nested lazy text slots while retaining IDs and stable unchanged data", () => {
    const normalized = sanitizeDocumentRichText(
      documentWith([text({ content: "<p>Safe<script>bad()</script></p>" })]),
    );
    const copy = allBlocks(normalized).find((block) => block.type === "Text")!;
    expect(copy.props.id).toBe("copy");
    expect(copy.props.content).toBe("<p>Safe</p>");
    expect(sanitizeDocumentRichText(normalized)).toBe(normalized);
  });
  it("supports local assets without allocating UTF-8 copies during adjacent text validation", () => {
    const bytes = new Uint8Array(512 * 1024);
    bytes.set(Buffer.from(intrinsicImage24, "base64"));
    const src = `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`;
    const data = documentWith([image({ src }), text()]);
    const intrinsic = allBlocks(data).find((block) => block.type === "IntrinsicRow")!;
    const options = { nativeContext: createNativeContext(), allowLocalImages: true };
    const nativeImage = image({ mjmlAttributes: [{ name: "src", value: src }] });
    const nativeRow = row([nativeImage]);
    const beforeNative = JSON.stringify(nativeImage);
    validateIntrinsicContent(intrinsic, options);
    validateIntrinsicContent(nativeRow, options);
    const encode = vi.spyOn(TextEncoder.prototype, "encode");
    const decode = vi.spyOn(globalThis, "atob");
    for (let i = 0; i < 5; i++) {
      allBlocks(data).find((block) => block.type === "Text")!.props.content = `<p>Edit ${i}</p>`;
      validateIntrinsicStructure(intrinsic);
      validateIntrinsicContent(intrinsic, options);
      validateIntrinsicContent(nativeRow, options);
    }
    expect(
      encode.mock.calls.some(([value]) => typeof value === "string" && value.length > 65536),
    ).toBe(false);
    expect(decode).not.toHaveBeenCalled();
    decode.mockRestore();
    encode.mockRestore();
    expect(JSON.stringify(nativeImage)).toBe(beforeNative);
    expect(() =>
      validateIntrinsicContent(nativeRow, { ...options, allowLocalImages: false }),
    ).toThrow();
    nativeImage.props.mjmlAttributes!.push({ name: "src", inherit: true });
    expect(() => validateIntrinsicContent(nativeRow, options)).toThrow(/image source/);
    nativeImage.props.mjmlAttributes!.splice(1, 1, {
      name: "src",
      value: "https://example.com/replaced.png",
    });
    expect(resolveIntrinsicLeaf(nativeImage, options).attributes.src).toBe(
      "https://example.com/replaced.png",
    );
    nativeImage.props.mjmlAttributes!.splice(1);
    validateIntrinsicContent(nativeRow, options);
    nativeImage.props.mjmlAttributes![0].inherit = "invalid" as unknown as boolean;
    expect(() => validateIntrinsicContent(nativeRow, options)).toThrow(/inherit must be a boolean/);
    delete nativeImage.props.mjmlAttributes![0].inherit;
    const malformed = Object.assign([], { name: "src", value: src });
    nativeImage.props.mjmlAttributes = [
      malformed as unknown as NonNullable<EmailBlock["props"]["mjmlAttributes"]>[number],
    ];
    expect(() => validateIntrinsicContent(nativeRow, options)).toThrow(/invalid entry/);
    expect(() =>
      resolveIntrinsicLeaf(
        allBlocks(data).find((block) => block.type === "Image")!,
        { ...options, allowLocalImages: 1 as unknown as boolean },
      ),
    ).toThrow();
    expect(() => preflightIntrinsicImage(intrinsic, "image", src)).not.toThrow();
    const source = toMjml(data, { allowLocalImages: true });
    expect(fromMjml(source, { allowLocalImages: true }).warnings).toEqual([]);
    expect(() => toMjml(data)).toThrow();
    expect(() =>
      preflightIntrinsicImage(
        intrinsic,
        "image",
        `data:image/png;base64,${"a".repeat(64 * 1024 * 1024)}`,
      ),
    ).toThrow(/64 MiB/);
  });
  it("deduplicates generated media CSS, updates breakpoints and preserves modified authored CSS", () => {
    const initial = toMjml(documentWith([text()], { breakpointWidth: "480.5px" }));
    expect(initial).toContain("max-width:479px");
    const data = roundtrip(initial);
    data.root.props!.breakpointWidth = "640px";
    const authored = intrinsicResponsiveCss("400px") + "\n.custom { color:red; }";
    data.root.props!.headStyles!.push({ css: authored, inline: "head" });
    const next = toMjml(data);
    expect(next).toContain("max-width:639px");
    expect(next).not.toContain("max-width:479px");
    expect(next).toContain(authored);
    expect(toMjml(roundtrip(next))).toBe(next);
    expect(
      isIntrinsicResponsiveCss(
        `/* puck-mjml:intrinsic-layout:v1 */\n@media only screen and (max-width:${"9".repeat(1000)}px) {}`,
      ),
    ).toBe(false);
  });
  it("keeps intrinsic image field identity stable across field resolution", async () => {
    const config = createEmailConfig(),
      component = config.components.Image;
    const data = documentWith([image(), text()]),
      fields = component.fields!;
    const params = {
      changed: {},
      fields,
      lastFields: fields,
      lastData: null,
      metadata: {},
      parent: null,
      appState: { data, ui: {} },
    } as unknown as Parameters<NonNullable<ComponentConfig["resolveFields"]>>[1];
    const first = await component.resolveFields!({ props: image().props }, params);
    allBlocks(data).find((block) => block.type === "Text")!.props.content =
      "<p>Changed sibling</p>";
    const second = await component.resolveFields!({ props: image().props }, params);
    expect((first.src as CustomField<string>).render).toBe(
      (second.src as CustomField<string>).render,
    );
    expect((config.components.IntrinsicCell.fields!.content as { allow: string[] }).allow).toEqual([
      "Text",
      "Image",
      "IntrinsicRow",
    ]);
  });
});
