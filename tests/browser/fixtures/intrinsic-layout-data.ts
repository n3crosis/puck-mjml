import type { EmailBlock, EmailDocument } from "../../../src/types";

export const intrinsicModes = ["stack", "two", "keep"] as const;
export const intrinsicImageUrl = "https://example.com/intrinsic-natural-24.png";
export const intrinsicLargeImageUrl = "https://example.com/intrinsic-natural-96.png";
export const intrinsicReplacementUrl = "https://example.com/intrinsic-replacement-24.png";

// Tiny, deterministic raster assets. The 24px source must be enlarged by a
// requested64px width, so natural-size clamping cannot satisfy these tests.
export const intrinsicImage24 =
  "iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAAJUlEQVR4nGOQSFz/n5aYYdSCUQtGLRi1YNSCUQtGLRi1YGhYAADs1tf9TOe7eAAAAABJRU5ErkJggg==";
export const intrinsicImage96 =
  "iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAYAAADimHc4AAAAxElEQVR4nO3RMREAIBDAsJeBPRQiEWQwNEP33mXWPlf/mt8D9QAAaAcAQDsAANoBANAOAIB2AAC0AwCgHQAA7QAAaAcAQDsAANoBANAOAIB2AAC0AwCgHQAA7QAAaAcAQDsAANoBANAOAIB2AAC0AwCgHQAA7QAAaAcAQDsAANoBANAOAIB2AAC0AwCgHQAA7QAAaAcAQDsAANoBANAOAIB2AAC0AwCgHQAA7QAAaAcAQDsAANoBANAOAIB2AAC0AwCgHQAA7QAAaAcAQDsAANoBANAOAIB2AAC0AwCg3QNnd4CEK31f/AAAAABJRU5ErkJggg==";

const text = (id: string, content: string): EmailBlock => ({
  type: "Text",
  props: {
    id,
    content: `<p>${content}</p>`,
    padding: "0px",
    align: "left",
    fontSize: 14,
    fontFamily: "Arial, sans-serif",
    fontWeight: 400,
    lineHeight: 1.5,
    letterSpacing: 0,
    color: "#222222",
    cssClass: id,
    mjmlAttributes: [{ name: "line-height", value: "20px" }],
  },
});

const image = (id: string, src: string, width?: number): EmailBlock => ({
  type: "Image",
  props: {
    id,
    src,
    alt: id,
    href: "",
    width: width ?? 560,
    padding: "0px",
    align: "left",
    borderRadius: "0px",
    cssClass: id,
    mjmlAttributes: width === undefined ? [{ name: "width", inherit: true }] : [],
  },
});

const cell = (id: string, content: EmailBlock[], padding = "8px"): EmailBlock => ({
  type: "IntrinsicCell",
  props: { id, content, padding, verticalAlign: "middle", cssClass: id },
});

const row = (
  id: string,
  cells: EmailBlock[],
  mobile: (typeof intrinsicModes)[number],
  width: "100%" | "auto" = "100%",
): EmailBlock => ({
  type: "IntrinsicRow",
  props: { id, cells, mobile, width, padding: "0px", cssClass: id },
});

const column = (id: string, content: EmailBlock[], width?: string): EmailBlock => ({
  type: "Column",
  props: {
    id,
    content,
    padding: "0px",
    width: 100,
    verticalAlign: "top",
    backgroundColor: "transparent",
    cssClass: id,
    mjmlAttributes: width ? [{ name: "width", value: width }] : [],
  },
});

const section = (id: string, columns: EmailBlock[]): EmailBlock => ({
  type: "Section",
  props: {
    id,
    columns,
    padding: "0px",
    backgroundColor: "transparent",
    direction: "ltr",
    textAlign: "left",
    fullWidth: false,
    cssClass: id,
    mjmlAttributes: [{ name: "text-align", value: "left" }],
  },
});

/** Shared synthetic model, with no production presentation/serialization helper. */
export function createIntrinsicLayoutDocument(breakpoint = 560): EmailDocument {
  const rows = intrinsicModes.map((mode) =>
    row(
      `mode-${mode}`,
      [
        cell(`${mode}-a`, [text(`${mode}-short`, "Short")]),
        cell(`${mode}-b`, [text(`${mode}-long`, "A much longer content-driven label")]),
        cell(`${mode}-c`, [
          row(
            `${mode}-nested`,
            [
              cell(
                `${mode}-icon-cell`,
                [image(`${mode}-icon`, intrinsicImageUrl, 16)],
                "0px 8px 0px 0px",
              ),
              cell(`${mode}-label-cell`, [text(`${mode}-label`, "Icon label")], "0px"),
            ],
            "keep",
            "auto",
          ),
        ]),
        cell(`${mode}-d`, [image(`${mode}-auto-image`, intrinsicLargeImageUrl)]),
      ],
      mode,
    ),
  );
  rows.push(
    row(
      "width-requested",
      [cell("requested-cell", [image("requested-image", intrinsicImageUrl, 64)], "0px")],
      "keep",
      "auto",
    ),
    row(
      "width-omitted",
      [cell("omitted-cell", [image("omitted-image", intrinsicImageUrl)], "0px")],
      "keep",
      "auto",
    ),
  );
  return {
    root: {
      props: {
        width: 600,
        fontFamily: "Arial, sans-serif",
        backgroundColor: "#ffffff",
        breakpoint,
        // This is an authored test allocation on an ordinary outer Group,
        // not a measured cell width or an overflow suppression rule.
        headStyles: [{ css: ".narrow-host { width:32px!important; }", inline: "head" }],
        sections: [
          section("main-section", [column("main-column", rows)]),
          section("narrow-section", [
            {
              type: "Group",
              props: {
                id: "narrow-group",
                width: 100,
                direction: "ltr",
                verticalAlign: "top",
                cssClass: "narrow-host",
                mjmlAttributes: [{ name: "width", value: "32px" }],
                columns: [
                  column(
                    "narrow-column",
                    [
                      row(
                        "width-constrained",
                        [
                          cell(
                            "constrained-cell",
                            [image("constrained-image", intrinsicImageUrl, 64)],
                            "0px",
                          ),
                        ],
                        "keep",
                      ),
                    ],
                    "32px",
                  ),
                ],
              },
            },
          ]),
        ],
      },
    },
    content: [],
  };
}
