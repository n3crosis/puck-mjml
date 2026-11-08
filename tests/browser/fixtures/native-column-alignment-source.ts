import type { EmailBlock, EmailDocument } from "../../../src/types";

export type AlignmentCase = { id: string; mjml: string; implicit?: 1 | 2 | 3 };

const copy = (name: string, large = false) =>
  `<mj-text css-class="${name}-copy" padding="0px" font-family="Arial" font-size="${large ? 28 : 15}px" line-height="${large ? 36 : 22.5}px">${large ? "Larger first" : "First line"}<br/>${large ? "Larger last" : "Last line"}</mj-text>`;
const column = (name: string, align: string, large = false, extra = "", content?: string) =>
  `<mj-column css-class="${name}" ${align ? `vertical-align="${align}"` : ""} ${extra}>${content ?? copy(name.split(" ")[0], large)}</mj-column>`;
const section = (id: string, content: string, extra = "") =>
  `<mj-section css-class="${id}" padding="0px" ${extra}>${content}</mj-section>`;

export function alignmentCases(): AlignmentCase[] {
  const cases: AlignmentCase[] = [];
  for (const direction of ["ltr", "rtl"])
    for (const group of [false, true])
      for (const reverse of [false, true])
        for (const first of ["top", "middle", "bottom"])
          for (const second of ["top", "middle", "bottom"]) {
            const id = `pair-${direction}-${group ? "group" : "section"}-${reverse ? "reverse" : "normal"}-${first}-${second}`;
            const content =
              column(`${id}-a`, first, reverse, 'width="50%"') +
              column(`${id}-b`, second, !reverse, 'width="50%"');
            cases.push({
              id,
              mjml: section(
                id,
                group
                  ? `<mj-group css-class="${id}-group" width="100%" direction="${direction}">${content}</mj-group>`
                  : content,
                `direction="${direction}"`,
              ),
            });
          }
  for (const padding of [false, true])
    for (const groupAlign of ["", "top", "middle", "bottom"])
      for (const direction of ["ltr", "rtl"]) {
        const id = `baseline-${padding ? "padded" : "plain"}-${groupAlign || "default"}-${direction}`;
        const extra = padding
          ? 'padding="8px 12px" border="2px solid #aabbcc" inner-border="3px solid #334455"'
          : "";
        cases.push({
          id,
          mjml: section(
            id,
            column(`${id}-a`, "middle", false, 'width="200px"') +
              `<mj-group css-class="${id}-group" width="400px" direction="${direction}" ${groupAlign ? `vertical-align="${groupAlign}"` : ""}>${column(`${id}-b`, "top", false, `width="50%" ${extra}`)}${column(`${id}-c`, "middle", true, `width="50%" ${extra}`)}</mj-group>`,
            `direction="${direction}"`,
          ),
        });
      }
  for (const padding of ["", 'padding="0px"', 'padding="7px" inner-border="2px solid navy"']) {
    const id = `authored-baseline-${cases.length}`;
    cases.push({
      id,
      mjml: section(
        id,
        column(`${id}-a authored-baseline`, "top", false, `width="50%" ${padding}`) +
          column(`${id}-b`, "middle", true, `width="50%" ${padding}`),
      ),
    });
  }
  for (const implicit of [1, 2, 3] as const)
    for (const align of ["left", "center", "right"])
      for (const direction of ["ltr", "rtl"]) {
        const id = `implicit-${implicit}-${align}-${direction}`;
        cases.push({
          id,
          implicit,
          mjml: section(
            id,
            Array.from({ length: implicit }, (_, index) =>
              column(
                `${id}-${index}`,
                ["top", "middle", "bottom"][index],
                index === 1,
                'width="25%"',
              ),
            ).join(""),
            `text-align="${align}" direction="${direction}"`,
          ),
        });
      }
  for (const direction of ["ltr", "rtl"])
    for (const grouped of [false, true])
      for (const width of ["50%", "200px"])
        for (const gutter of ["0px", "20px", "5%", "5.5%", "21.5px"]) {
          const id = `gutter-${direction}-${grouped ? "group" : "section"}-${width === "50%" ? "percent" : "pixel"}-${gutter.replace(/[^\w]/g, "-")}`;
          const content =
            column(`${id}-a`, "top", false, `width="${width}" padding="4px"`) +
            column(`${id}-b`, "middle", true, `width="${width}" padding="4px"`);
          cases.push({
            id,
            mjml: section(
              id,
              grouped
                ? `<mj-group css-class="${id}-group" width="400px" direction="${direction}">${content}</mj-group>`
                : content,
              `gutter="${gutter}" direction="${direction}"`,
            ),
          });
        }
  for (const gutter of [undefined, "0px", "5.5%"] as const) {
    const id = `auto-group-${gutter === undefined ? "none" : gutter === "0px" ? "zero" : "fractional"}`;
    cases.push({
      id,
      mjml: section(
        id,
        `<mj-group css-class="${id}-group" width="399.5px">${[0, 1, 2].map((index) => column(`${id}-${index}`, ["top", "middle", "bottom"][index], index === 1)).join("")}</mj-group>`,
        gutter ? `gutter="${gutter}"` : "",
      ),
    });
  }
  for (const grouped of [false, true]) {
    const id = `fractional-pixel-${grouped ? "group" : "direct"}`;
    const content =
      column(`${id}-a`, "middle", false, 'width="199.5px"') +
      column(`${id}-b`, "top", true, 'width="199.5px"');
    cases.push({
      id,
      mjml: section(
        id,
        grouped
          ? `<mj-group css-class="${id}-group" width="399.5px">${content}</mj-group>`
          : content,
      ),
    });
  }
  for (const group of [false, true]) {
    const id = `author-width-${group ? "group" : "section"}`;
    const content =
      column(`${id}-a author-width-fixed`, "top", false, 'width="50%"') +
      column(`${id}-b author-width-fill`, "middle", true, 'width="50%"');
    cases.push({
      id,
      mjml: section(
        id,
        group ? `<mj-group css-class="${id}-group" width="400px">${content}</mj-group>` : content,
      ),
    });
  }
  for (const kind of ["spacer", "divider", "image"])
    for (const group of [false, true]) {
      const id = `baseline-first-${kind}-${group ? "group" : "column"}`;
      const first =
        kind === "spacer"
          ? '<mj-spacer height="27px" padding="0px"/>'
          : kind === "divider"
            ? '<mj-divider border-width="3px" padding="5px 0px"/>'
            : '<mj-image src="https://example.com/alignment.svg" width="120px" height="80px" padding="0px"/>';
      const content =
        column(
          `${id}-a${group ? "" : " authored-baseline"}`,
          "top",
          false,
          'width="50%"',
          first + copy(`${id}-a`),
        ) + column(`${id}-b`, "middle", true, 'width="50%"');
      cases.push({
        id,
        mjml: section(
          id,
          group
            ? column(`${id}-solo`, "middle", false, 'width="200px"') +
                `<mj-group css-class="${id}-group" width="400px">${content}</mj-group>`
            : content,
        ),
      });
    }
  for (const gutter of [undefined, "20px"]) {
    const id = `fractional-group-container-${gutter ? "gutter" : "plain"}`;
    cases.push({
      id,
      mjml: section(
        id,
        `<mj-group css-class="${id}-group" width="33.33%">${column(`${id}-a`, "top", false, 'width="100px"')}${column(`${id}-b`, "middle", true, 'width="100px"')}</mj-group>`,
        gutter ? `gutter="${gutter}"` : "",
      ),
    });
  }
  for (const width of [80, 68]) {
    const id = `fixed-fill-${width}`;
    cases.push({
      id,
      mjml: section(
        id,
        `<mj-group css-class="${id}-group" width="100%">${column(`${id}-a fixed-${width}`, "middle", false, 'width="25%"')}${column(`${id}-b fill-${width}`, "top", true, 'width="75%"')}</mj-group>`,
      ),
    });
  }
  cases.push({
    id: "authored-percentages",
    mjml: section(
      "authored-percentages",
      `<mj-group css-class="authored-percentages-group" width="100%">${column("authored-percentages-a narrow-cell", "top", false, 'width="25%"')}${column("authored-percentages-b wide-cell", "middle", true, 'width="50%"')}${column("authored-percentages-c remainder-cell", "bottom", false, 'width="25%"')}</mj-group>`,
    ),
  });
  cases.push({
    id: "narrow-image",
    mjml: section(
      "narrow-image",
      `<mj-group css-class="narrow-image-group" width="400px">${column("narrow-image-a", "middle", false, 'width="50%"', '<mj-image css-class="narrow-image-image" src="https://example.com/alignment.svg" width="300px" padding="0px"/>')}${column("narrow-image-b", "top", true, 'width="50%"')}</mj-group>`,
    ),
  });
  for (const kind of ["column", "group", "gutter"]) {
    for (const override of [false, true]) {
      const id = `desktop-cap-${kind}-${override ? "override" : "default"}`;
      const name = `${id}-a desktop-width-wide${override ? " desktop-width-override" : ""}`;
      const content =
        kind === "group"
          ? `<mj-group css-class="${name}" width="200px">${column(`${id}-b`, "top", false, 'width="100%"')}</mj-group>`
          : column(name, "top", false, 'width="200px"') +
            column(`${id}-b`, "middle", true, 'width="200px"');
      cases.push({ id, mjml: section(id, content, kind === "gutter" ? 'gutter="20px"' : "") });
    }
  }
  cases.push({
    id: "desktop-cap-calc",
    mjml: section(
      "desktop-cap-calc",
      column("desktop-cap-calc-a", "top", false, 'width="178px"') +
        column("desktop-cap-calc-b desktop-width-flex", "middle", true, 'width="382px"'),
    ),
  });
  const id = "mixed-media";
  cases.push({
    id,
    mjml: section(
      id,
      column(
        `${id}-a`,
        "middle",
        false,
        'width="33.333333%"',
        `<mj-image css-class="${id}-image" src="https://example.com/alignment.svg" width="120px" height="80px" padding="0px" />`,
      ) +
        column(
          `${id}-b`,
          "top",
          false,
          'width="33.333333%"',
          `<mj-spacer css-class="${id}-spacer" height="97px" padding="0px" />`,
        ) +
        column(
          `${id}-c`,
          "bottom",
          false,
          'width="33.333333%" padding="0px"',
          `<mj-text css-class="${id}-copy" padding="0px" font-family="Arial" font-size="15px" line-height="150%">Long first line of content that wraps naturally over several lines with different lengths.<br/>Last line.</mj-text>`,
        ),
    ),
  });
  return cases;
}

export function alignmentSource(cases = alignmentCases()) {
  const authoredWidthCss = `
    @media only screen and (max-width:600px) {
      .fixed-80 { width:80px!important; max-width:80px!important; }
      .fill-80 { width:calc(100% - 80px)!important; max-width:calc(100% - 80px)!important; }
      .fixed-68 { width:68px!important; max-width:68px!important; }
      .fill-68 { width:calc(100% - 68px)!important; max-width:calc(100% - 68px)!important; }
    }
    @media only screen and (max-width:479px) {
      .narrow-cell { width:20%!important; }
      .wide-cell { width:64%!important; }
      .remainder-cell { width:16%!important; }
    }
  `;
  return `<mjml><mj-head><mj-breakpoint width="601px"/><mj-attributes><mj-all font-family="Arial"/></mj-attributes><mj-style>${authoredWidthCss}@media (min-width:601px) { .desktop-width-flex { width:calc(100% - 178px)!important; max-width:calc(100% - 178px); } } .desktop-width-wide { width:250px!important; } .desktop-width-override { max-width:260px; } .authored-baseline { vertical-align:baseline!important; } @media (max-width:600px) { .author-width-fixed { width:80px!important; } .author-width-fill { width:calc(100% - 80px)!important; } }</mj-style></mj-head><mj-body width="600px">${cases.map((entry) => entry.mjml).join("")}</mj-body></mjml>`;
}

export function applyImplicitColumns(document: EmailDocument, cases: AlignmentCase[]) {
  for (const entry of cases.filter((entry) => entry.implicit)) {
    const section = document.root.props!.sections!.find(
      (section) => section.props.cssClass === entry.id,
    )!;
    const columns = section.props.columns as EmailBlock[];
    section.type = `Section${entry.implicit}`;
    for (const [index, prefix] of (entry.implicit === 1
      ? ["column"]
      : entry.implicit === 2
        ? ["left", "right"]
        : ["left", "middle", "right"]
    ).entries()) {
      section.props[`${prefix}Attributes`] = [
        { name: "width", value: "25%" },
        { name: "css-class", value: `${entry.id}-${index}` },
        { name: "vertical-align", value: ["top", "middle", "bottom"][index] },
        ...(columns[index].props.mjmlAttributes ?? []).map(
          ({ importBaseline: _baseline, ...entry }) => entry,
        ),
      ];
      section.props[prefix] = columns[index].props.content;
    }
    delete section.props.columns;
  }
  return document;
}
