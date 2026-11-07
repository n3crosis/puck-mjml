import { Render, type Data } from "@puckeditor/core";
import { load, type CheerioAPI } from "cheerio";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createEmailConfig } from "./config";
import { compileEmail, toMjml } from "./export";
import { fromMjml } from "./import";
import type { EmailBlock, EmailDocument } from "./types";

beforeAll(() => vi.stubGlobal("window", globalThis));
afterAll(() => vi.unstubAllGlobals());

const cell = "> table > tbody > tr > td";
const target = (name: string) =>
  `.${name}[data-pm-mjml-padding="self"], .${name}[data-pm-mjml-padding="child"] > [data-pm-mjml-padding-target]`;
const style = ($: CheerioAPI, selector: string, property: string) =>
  $(selector)
    .attr("style")
    ?.split(";")
    .find((entry) => entry.trim().startsWith(`${property}:`))
    ?.split(":")
    .slice(1)
    .join(":")
    .trim();
const block = (type: string, id: string, props: EmailBlock["props"] = {}): EmailBlock => ({
  type,
  props: { id, ...props },
});

async function renderDocument(document: EmailDocument) {
  const canvas = load(
    renderToStaticMarkup(<Render config={createEmailConfig()} data={document as Data} />),
  );
  const result = await compileEmail(document);
  expect(result.errors).toEqual([]);
  return { canvas, compiled: load(result.html), document };
}

async function render(source: string) {
  const { document, warnings } = fromMjml(source);
  expect(warnings).toEqual([]);
  return renderDocument(document);
}

function expectSamePadding(
  canvas: CheerioAPI,
  compiled: CheerioAPI,
  name: string,
  property = "padding",
) {
  expect(canvas(target(name))).toHaveLength(1);
  expect(compiled(`.${name} ${cell}`)).toHaveLength(1);
  expect(style(canvas, target(name), property)).toBe(style(compiled, `.${name} ${cell}`, property));
}

describe("native canvas padding targets", () => {
  it("marks ordinary imported wrappers, sections, and padded columns at their compiled padding box", async () => {
    const { canvas, compiled } = await render(`<mjml><mj-body>
      <mj-wrapper css-class="wrapper" padding="12px 24px">
        <mj-section css-class="section" padding="40px">
          <mj-column css-class="column" padding="16px"><mj-text>Hello</mj-text></mj-column>
        </mj-section>
      </mj-wrapper>
    </mj-body></mjml>`);
    for (const name of ["wrapper", "section", "column"]) expectSamePadding(canvas, compiled, name);
  });

  it.each([
    { name: "explicit zero", local: 'padding="0px"', head: "", property: "padding" },
    { name: "one zero edge", local: 'padding-left="0px"', head: "", property: "padding-left" },
    {
      name: "component default",
      local: "",
      head: '<mj-attributes><mj-column padding="0px" /></mj-attributes>',
      property: "padding",
    },
    {
      name: "MJML class",
      local: 'mj-class="padded"',
      head: '<mj-attributes><mj-class name="padded" padding="0px" /></mj-attributes>',
      property: "padding",
    },
  ])("recognizes the compiler's extra column cell for $name", async ({ local, head, property }) => {
    const { canvas, compiled } = await render(`<mjml><mj-head>${head}</mj-head><mj-body>
      <mj-section><mj-column css-class="column" ${local}>
        <mj-text>First</mj-text><mj-text>Second</mj-text>
      </mj-column></mj-section>
    </mj-body></mjml>`);
    expectSamePadding(canvas, compiled, "column", property);
    expect(compiled(`.column ${cell}`).children("table")).toHaveLength(1);
  });

  it.each(["", 'gutter="20px"'])(
    "does not mark unpadded columns whose compiled selector addresses child cells (%s)",
    async (gutter) => {
      const { canvas, compiled } = await render(`<mjml><mj-body><mj-section ${gutter}>
        <mj-column css-class="column"><mj-text>First</mj-text><mj-text>Second</mj-text></mj-column>
        <mj-column><mj-text>Other</mj-text></mj-column>
      </mj-section></mj-body></mjml>`);
      expect(canvas(target("column"))).toHaveLength(0);
      expect(canvas(".column [data-pm-mjml-padding-target]")).toHaveLength(0);
      expect(compiled(`.column ${cell}`)).toHaveLength(2);
      expect(compiled(`.column ${cell}`).children("div")).toHaveLength(2);
    },
  );

  it("maps gutter column padding to the inner box without marking the gutter as a padding target", async () => {
    const { canvas, compiled } = await render(`<mjml><mj-body><mj-section gutter="20px">
      <mj-column css-class="column" padding="12px 18px"><mj-text>First</mj-text></mj-column>
      <mj-column padding="0px"><mj-text>Other</mj-text></mj-column>
    </mj-section></mj-body></mjml>`);
    expectSamePadding(canvas, compiled, "column");
    expect(canvas(".column").attr("data-pm-mjml-padding")).toBe("child");
    expect(canvas(target("column")).hasClass("pm-native-column-content")).toBe(true);
    expect(canvas(".column").attr("data-pm-mjml-padding-target")).toBeUndefined();
    expect(style(canvas, ".column", "padding")).not.toBe("12px 18px");
  });

  it.each([
    ["mj-section", 'full-width="full-width"'],
    ["mj-wrapper", 'full-width="full-width"'],
    ["mj-section", 'full-width="full-width" background-url="https://example.com/background.png"'],
    ["mj-wrapper", 'full-width="full-width" background-url="https://example.com/background.png"'],
  ])("does not mark %s with structurally different %s", async (tag, attributes) => {
    const column = "<mj-column><mj-text>Hello</mj-text></mj-column>";
    const content = tag === "mj-wrapper" ? `<mj-section>${column}</mj-section>` : column;
    const { canvas, compiled } = await render(
      `<mjml><mj-body><${tag} css-class="different" padding="40px" ${attributes}>${content}</${tag}></mj-body></mjml>`,
    );
    expect(compiled(`.different ${cell}`)).toHaveLength(0);
    expect(canvas(target("different"))).toHaveLength(0);
    expect(canvas(".different").attr("data-pm-mjml-padding")).toBeUndefined();
    expect(
      canvas(".different > .pm-native-layout-content").attr("data-pm-mjml-padding-target"),
    ).toBeUndefined();
  });

  it("keeps authored table blocks, text, and same-class images out of the padding adapter", async () => {
    const { canvas, compiled, document } = await render(`<mjml><mj-head><mj-style>
      .shared > table > tbody > tr > td { padding-left: 24px !important; }
      .authored td { padding-right: 9px !important; }
    </mj-style></mj-head><mj-body><mj-section><mj-column css-class="shared" padding="0px">
      <mj-image css-class="shared" src="https://example.com/image.png" width="100px" />
      <mj-text css-class="authored"><p>Rich text</p></mj-text>
      <mj-table css-class="authored"><tr><td>Table block</td></tr></mj-table>
    </mj-column></mj-section></mj-body></mjml>`);
    expect(canvas(target("shared"))).toHaveLength(1);
    expect(compiled(`.shared ${cell}`)).toHaveLength(2);
    expect(canvas(".pm-image.shared[data-pm-mjml-padding]")).toHaveLength(0);
    expect(
      canvas(".authored[data-pm-mjml-padding], .authored [data-pm-mjml-padding]"),
    ).toHaveLength(0);
    expect(canvas(".authored table td")).toHaveLength(1);
    expect(canvas("style[data-pm-canvas-css]").text()).toContain(".authored td");
    expect(toMjml(document)).not.toContain("data-pm-mjml-padding");
    expect(toMjml(document)).not.toContain(":is(");
    expect(document.root.props?.headStyles?.[0].css).toContain(
      ".shared > table > tbody > tr > td { padding-left: 24px !important; }",
    );
  });

  it("does not relax trusted-source requirements for tables inside imported text", async () => {
    const { document, warnings } = fromMjml(`<mjml><mj-body><mj-section><mj-column>
      <mj-text css-class="authored"><table><tbody><tr><td>Rich table</td></tr></tbody></table></mj-text>
    </mj-column></mj-section></mj-body></mjml>`);
    expect(warnings).toContain(
      "mj-text HTML outside the rich-text model preserved; compiling it requires allowRawHtml: true.",
    );
    const canvas = load(
      renderToStaticMarkup(<Render config={createEmailConfig()} data={document as Data} />),
    );
    expect(canvas(target("authored"))).toHaveLength(0);
    await expect(compileEmail(document)).rejects.toThrow(/allowRawHtml/);
  });
});

describe("visual-only canvas padding targets", () => {
  it("marks fallback wrappers, all section variants, and explicit columns without changing renderers", async () => {
    const sections = [1, 2, 3].map((count) =>
      block(`Section${count}`, `fixed-${count}`, {
        cssClass: `fixed-${count}`,
        padding: `${count * 10}px`,
        ...Object.fromEntries(
          (count === 1
            ? ["column"]
            : count === 2
              ? ["left", "right"]
              : ["left", "middle", "right"]
          ).map((name) => [name, []]),
        ),
      }),
    );
    sections.push(
      block("Section", "flex", {
        cssClass: "flex",
        padding: "8px",
        columns: [block("Column", "column", { cssClass: "column", padding: "6px", content: [] })],
      }),
    );
    const { canvas, compiled } = await renderDocument({
      root: {
        props: {
          width: 600,
          sections: [
            block("Wrapper", "wrapper", { cssClass: "wrapper", padding: "12px", sections }),
          ],
        },
      },
      content: [],
    });
    for (const name of ["wrapper", "fixed-1", "fixed-2", "fixed-3", "flex", "column"])
      expectSamePadding(canvas, compiled, name);
    // The visual-only column still uses its original direct slot, not the
    // additional inner native column box. Markers do not switch renderers.
    expect(canvas(".column > div > div")).toHaveLength(0);
  });
});

describe("native image sizing targets", () => {
  it("marks only existing image anchors without changing desktop width or serialization", async () => {
    const { canvas, compiled, document } =
      await render(`<mjml><mj-head><mj-style>@media(max-width:600px){.image table {width:100% !important;}}</mj-style></mj-head><mj-body width="640px"><mj-section padding="40px"><mj-column css-class="image" padding="0px">
      <mj-image css-class="direct" src="https://example.com/image.png" width="280px" padding="0px" />
      <mj-image src="https://example.com/second.png" width="177px" padding="0px" />
      <mj-table><tr><td>Authored table</td></tr></mj-table>
    </mj-column></mj-section></mj-body></mjml>`);
    expect(canvas("[data-pm-mjml-image-width]")).toHaveLength(2);
    expect(canvas(".direct > [data-pm-mjml-image-width]").prop("tagName")).toBe("A");
    expect(style(canvas, ".direct > [data-pm-mjml-image-width]", "width")).toBe("280px");
    expect(style(compiled, ".direct > table > tbody > tr > td", "width")).toBe("280px");
    expect(canvas(".pm-native-table [data-pm-mjml-image-width]")).toHaveLength(0);
    expect(canvas("[data-pm-mjml-image-width] > img")).toHaveLength(2);
    expect(toMjml(document)).not.toContain("data-pm-mjml-image-width");
    expect(toMjml(document)).not.toContain(":is(");
  });
  it("also marks visual-only images, not empty image placeholders", async () => {
    const document = {
      root: {
        props: {
          sections: [
            block("Section1", "section", {
              column: [
                block("Image", "image", { src: "https://example.com/image.png", width: 177 }),
                block("Image", "empty", { src: "" }),
              ],
            }),
          ],
        },
      },
      content: [],
    };
    const canvas = load(
      renderToStaticMarkup(<Render config={createEmailConfig()} data={document as Data} />),
    );
    expect(canvas("[data-pm-mjml-image-width]")).toHaveLength(1);
    expect(style(canvas, "[data-pm-mjml-image-width]", "width")).toBe("177px");
    expect(canvas(".pm-image-empty [data-pm-mjml-image-width]")).toHaveLength(0);
  });
});
