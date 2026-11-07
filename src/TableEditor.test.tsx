// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Puck, createUsePuck, type Config, type Data, type PuckApi } from "@puckeditor/core";
import type { Editor } from "@tiptap/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TableArrayField } from "./TableEditor";
import { tableConfig } from "./TableBlock";
import { PropertyFieldLabel, PropertyInspector } from "./PropertyInspector";
import type { TableProps } from "./table";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const usePuck = createUsePuck();
let root: Root | undefined;
let container: HTMLDivElement | undefined;
let api: PuckApi | undefined;
let style: HTMLStyleElement | undefined;
let cellEditor: Editor | null = null;
function CaptureApi() {
  const state = usePuck((value) => value);
  useEffect(() => {
    api = state;
  }, [state]);
  return null;
}
beforeEach(() => {
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });
  style = document.createElement("style");
  style.textContent =
    readFileSync("src/property-inspector.css", "utf8") +
    readFileSync("src/table-editor.css", "utf8");
  document.head.append(style);
});
afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  style?.remove();
  root = undefined;
  container = undefined;
  style = undefined;
  api = undefined;
  cellEditor = null;
  vi.unstubAllGlobals();
});

const table: TableProps = {
  caption: "Preserved caption",
  headerRows: [
    {
      cells: [
        { content: "<p>Product &amp; name</p>", header: true, scope: "col", padding: "3px" },
        { content: "<p>Price</p>", header: true, scope: "col" },
      ],
    },
  ],
  bodyRows: [
    {
      cells: [
        { content: "<p><strong>Apples</strong></p>", padding: "8px", backgroundColor: "#aabbcc" },
        { content: "<p>$3</p>", align: "right" },
      ],
    },
  ],
  footerRows: [{ cells: [{ content: "<p>Total</p>" }, { content: "<p>$3</p>" }] }],
};

async function mount(
  props = table,
  readOnly: Record<string, boolean | undefined> = {},
  edit = true,
  captureEditor = false,
) {
  const config: Config<{ Table: TableProps }, { notes: { text: string }[] }> = {
    components: { Table: { ...tableConfig, permissions: { edit } } },
    root: {
      fields: {
        notes: {
          type: "array",
          arrayFields: { text: { type: "text" } },
          getItemSummary: (item) => item.text,
        },
      },
    },
  };
  if (captureEditor) {
    const header = tableConfig.fields!.headerRows!;
    if (header.type !== "array" || header.arrayFields.cells.type !== "array")
      throw new Error("Missing table cell schema");
    const cells = header.arrayFields.cells;
    const content = cells.arrayFields.content;
    if (content.type !== "richtext") throw new Error("Missing cell rich text");
    config.components.Table.fields = {
      ...tableConfig.fields,
      headerRows: {
        ...header,
        arrayFields: {
          ...header.arrayFields,
          cells: {
            ...cells,
            arrayFields: {
              ...cells.arrayFields,
              content: {
                ...content,
                renderMenu: (props) => {
                  cellEditor = props.editor;
                  return content.renderMenu?.(props);
                },
              },
            },
          },
        },
      },
    };
  }
  const data = {
    root: { props: { notes: [{ text: "Regular array" }] } },
    content: [{ type: "Table", props: { id: "table", ...props }, readOnly }],
  } as unknown as Data;
  container = document.createElement("div");
  container.className = "pm-editor";
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root!.render(
      <Puck
        config={config}
        data={data}
        iframe={{ enabled: false }}
        overrides={{
          fields: PropertyInspector,
          fieldLabel: PropertyFieldLabel,
          fieldTypes: { array: TableArrayField },
        }}
      >
        <CaptureApi />
        <Puck.Fields />
      </Puck>,
    ),
  );
  await act(async () =>
    api!.dispatch({ type: "setUi", ui: { itemSelector: api!.getSelectorForId("table") } }),
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
}
const button = (label: string) =>
  [...container!.querySelectorAll<HTMLButtonElement>("button")].find(
    (item) => item.getAttribute("aria-label") === label || item.textContent?.trim() === label,
  )!;
const field = (name: string, selector = "input") =>
  container!.querySelector<HTMLInputElement>(`[data-table-cell-property="${name}"] ${selector}`)!;
const saved = () => api!.getItemById("table")!.props as TableProps;
async function edit(action: () => void) {
  await act(async () => action());
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 300));
  });
}
async function change(name: string, value: string) {
  await edit(() => {
    const input = field(name);
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("table sidebar editor", () => {
  it("shows all row groups and edits one selected cell while preserving sibling content and styles", async () => {
    await mount();
    expect(container!.querySelectorAll(".pm-table-row-group")).toHaveLength(3);
    expect(container!.querySelectorAll(".pm-table-selected-cell")).toHaveLength(1);
    expect(button("Header row 1 cell 1: Product & name")).not.toBeUndefined();
    expect(field("padding").value).toBe("8px");
    await edit(() => button("Header row 1 cell 1: Product & name").click());
    expect(field("padding").value).toBe("3px");
    await change("padding", "12px 8px");
    expect(saved().headerRows![0].cells[0].padding).toBe("12px 8px");
    expect(saved().bodyRows).toEqual(table.bodyRows);
    expect(saved().footerRows).toEqual(table.footerRows);
    expect(saved().caption).toBe(table.caption);
    expect(
      container!.querySelector('[data-table-cell-property="content"] [contenteditable="true"]'),
    ).not.toBeNull();
    await act(async () => api!.dispatch({ type: "setUi", ui: { itemSelector: null } }));
    expect(container!.textContent).toContain("Regular array");
  });

  it("adds and removes a column across all groups in one undoable operation", async () => {
    await mount();
    await edit(() => button("Add column").click());
    for (const name of ["headerRows", "bodyRows", "footerRows"] as const) {
      expect(saved()[name]![0].cells).toHaveLength(3);
      expect(saved()[name]![0].cells.slice(0, 2)).toEqual(table[name]![0].cells);
    }
    expect(saved().headerRows![0].cells[2].header).toBe(true);
    expect(api!.selectedItem?.props.id).toBe("table");
    await act(async () => api!.history.back());
    for (const name of ["headerRows", "bodyRows", "footerRows"] as const)
      expect(saved()[name]).toEqual(table[name]);
    await act(async () => api!.history.forward());
    await edit(() => button("Body row 1 cell 2: $3").click());
    await edit(() => button("Remove column").click());
    expect(saved().bodyRows![0].cells).toHaveLength(2);
    expect(saved().bodyRows![0].cells[0]).toEqual(table.bodyRows![0].cells[0]);
    expect(saved().headerRows![0].cells).toHaveLength(2);
    expect(saved().footerRows![0].cells).toHaveLength(2);
    await edit(() => button("Remove column").click());
    expect(saved().bodyRows![0].cells).toHaveLength(1);
    expect(button("Remove column").disabled).toBe(true);
  });

  it("adds and removes rows in the selected group without changing other groups", async () => {
    await mount();
    await edit(() => button("Add body row").click());
    expect(saved().bodyRows).toHaveLength(2);
    expect(saved().bodyRows![1].cells).toHaveLength(2);
    expect(saved().headerRows).toEqual(table.headerRows);
    await edit(() => button("Remove selected body row").click());
    expect(saved().bodyRows).toEqual(table.bodyRows);
    await act(async () => api!.history.back());
    expect(saved().bodyRows).toHaveLength(2);
    expect(saved().footerRows).toEqual(table.footerRows);
  });

  it("preserves merged owner cells and rowSpan zero while disabling ambiguous structure changes", async () => {
    const merged: TableProps = {
      headerRows: [],
      footerRows: [],
      bodyRows: [
        {
          cells: [
            {
              content: "<p>Merged owner</p>",
              rowSpan: 0,
              colSpan: 2,
              padding: "4px",
              backgroundColor: "#abcdef",
            },
          ],
        },
        { cells: [] },
      ],
    };
    await mount(merged);
    expect(button("Add column").disabled).toBe(true);
    expect(button("Remove column").disabled).toBe(true);
    expect(button("Add body row").disabled).toBe(true);
    expect(button("Remove selected body row").disabled).toBe(true);
    expect(button("Move selected body row down").disabled).toBe(true);
    expect(button("Move selected column right").disabled).toBe(true);
    expect(button("Add column").title).toContain("span");
    await edit(() => {
      button("Remove column").click();
      button("Remove selected body row").click();
    });
    expect(saved().bodyRows).toEqual(merged.bodyRows);
    await change("padding", "9px");
    expect(saved().bodyRows![0].cells[0]).toEqual({
      ...merged.bodyRows![0].cells[0],
      padding: "9px",
    });
    expect(container!.querySelector(".pm-table-cell-grid td")!.getAttribute("rowspan")).toBe("0");
  });

  it("honors group and nested read-only fields without disabling cell navigation", async () => {
    await mount(table, {
      headerRows: true,
      "bodyRows[0].cells[0].padding": true,
      "bodyRows[*].cells[*].color": true,
    });
    expect(button("Add column").disabled).toBe(true);
    expect(button("Add header row").disabled).toBe(true);
    expect(field("padding").readOnly).toBe(true);
    expect(field("color", 'input[type="color"]').disabled).toBe(true);
    await edit(() => button("Header row 1 cell 2: Price").click());
    expect(field("padding").readOnly).toBe(true);
    expect(button("Header row 1 cell 2: Price").disabled).toBe(false);
  });

  it.each([
    { label: "exact dot path", locks: { "bodyRows.0.cells.0.padding": true } },
    { label: "wildcard dot path", locks: { "bodyRows.*.cells.*.padding": true } },
  ])("honors $label read-only cell rules", async ({ locks }) => {
    await mount(table, locks);
    expect(field("padding").readOnly).toBe(true);
    await change("padding", "100px");
    expect(saved().bodyRows![0].cells[0].padding).toBe("8px");
  });

  it("allows a more specific false rule without weakening parent locks", async () => {
    await mount(table, {
      "bodyRows[*].cells[*].padding": true,
      "bodyRows[0].cells[0].padding": false,
      headerRows: true,
      "headerRows[0].cells[0].padding": false,
    });
    expect(field("padding").readOnly).toBe(false);
    await change("padding", "12px");
    expect(saved().bodyRows![0].cells[0].padding).toBe("12px");
    await edit(() => button("Header row 1 cell 1: Product & name").click());
    expect(field("padding").readOnly).toBe(true);
  });

  it("retains the original rich-text editor for cell content and undo", async () => {
    await mount(table, {}, true, true);
    await change("padding", "10px");
    const editable = container!.querySelector<HTMLElement>(
      '[data-table-cell-property="content"] [contenteditable="true"]',
    )!;
    expect(editable.innerHTML).toContain("Apples");
    expect(cellEditor).not.toBeNull();
    await act(async () => editable.focus());
    await edit(() => cellEditor!.commands.setContent("<p><strong>Fresh apples</strong></p>"));
    expect(saved().bodyRows![0].cells[0].content).toContain("Fresh apples");
    expect(saved().bodyRows![0].cells[0].backgroundColor).toBe("#aabbcc");
    await act(async () => api!.history.back());
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
    expect(saved().bodyRows![0].cells[0].content).toBe("<p><strong>Apples</strong></p>");
    expect(api!.selectedItem?.props.id).toBe("table");
    expect(
      container!.querySelector('[data-table-cell-property="content"] [contenteditable="true"]')!
        .innerHTML,
    ).toContain("Apples");
  });

  it("honors component edit permissions", async () => {
    await mount({ ...table, bodyRows: [{ cells: [{ content: "Short row" }] }] }, {}, false);
    expect(button("Add column").disabled).toBe(true);
    expect(button("Add body row").disabled).toBe(true);
    expect(field("padding").readOnly).toBe(true);
    expect(container!.querySelector('[contenteditable="true"]')).toBeNull();
    await change("padding", "100px");
    expect(saved().bodyRows![0].cells[0].padding).toBeUndefined();
    expect(button("Body row 1 cell 1: Short row").disabled).toBe(false);
  });

  it("prevents ambiguous column changes for unequal row lengths while keeping row controls available", async () => {
    await mount({ ...table, bodyRows: [{ cells: [{ content: "Short row" }] }] });
    expect(button("Add column").disabled).toBe(true);
    expect(button("Add column").title).toContain("same number");
    expect(button("Add body row").disabled).toBe(false);
    expect(field("padding").readOnly).toBe(false);
  });

  it("moves rows and whole-table columns without losing selection, content or undo history", async () => {
    const second = {
      cells: [{ content: "<p>Oranges</p>", padding: "7px" }, { content: "<p>$5</p>" }],
    };
    const original = { ...table, bodyRows: [...table.bodyRows!, second] };
    await mount(original);
    await edit(() => button("Body row 2 cell 1: Oranges").click());
    await edit(() => button("Move selected body row up").click());
    expect(saved().bodyRows).toEqual([second, table.bodyRows![0]]);
    expect(button("Body row 1 cell 1: Oranges").getAttribute("aria-pressed")).toBe("true");
    expect(field("padding").value).toBe("7px");
    await act(async () => api!.history.back());
    expect(saved().bodyRows).toEqual(original.bodyRows);
    await act(async () => api!.history.forward());
    await edit(() => button("Move selected column right").click());
    expect(saved().headerRows![0].cells).toEqual([...table.headerRows![0].cells].reverse());
    expect(saved().bodyRows![0].cells).toEqual([...second.cells].reverse());
    expect(saved().footerRows![0].cells).toEqual([...table.footerRows![0].cells].reverse());
    expect(button("Body row 1 cell 2: Oranges").getAttribute("aria-pressed")).toBe("true");
    expect(field("padding").value).toBe("7px");
    await act(async () => api!.history.back());
    expect(saved().headerRows).toEqual(table.headerRows);
    expect(saved().bodyRows).toEqual([second, table.bodyRows![0]]);
  });

  it("keeps empty imported rows selectable and removable", async () => {
    await mount({ ...table, footerRows: [{ cells: [] }] });
    await edit(() => button("Select empty footer row 1").click());
    expect(button("Remove selected footer row").disabled).toBe(false);
    await edit(() => button("Remove selected footer row").click());
    expect(saved().footerRows).toEqual([]);
    expect(saved().bodyRows).toEqual(table.bodyRows);
  });

  it("preserves resized column proportions when adding rows or changing column count, with undo", async () => {
    const resized: TableProps = {
      ...table,
      tableLayout: "fixed",
      headerRows: [],
      bodyRows: table.bodyRows!.map((row) => ({
        cells: row.cells.map((cell, index) => ({ ...cell, width: ["60%", "40%"][index] })),
      })),
      footerRows: table.footerRows!.map((row) => ({
        cells: row.cells.map((cell, index) => ({ ...cell, width: ["60%", "40%"][index] })),
      })),
    };
    await mount(resized);
    await edit(() => button("Add header row").click());
    expect(saved().headerRows![0].cells.map((cell) => cell.width)).toEqual(["60%", "40%"]);
    expect(saved().bodyRows).toEqual(resized.bodyRows);
    expect(saved().footerRows).toEqual(resized.footerRows);
    await act(async () => api!.history.back());
    expect(saved().headerRows).toEqual([]);
    await act(async () => api!.history.forward());
    const withHeader = saved();

    await edit(() => button("Add column").click());
    for (const name of ["headerRows", "bodyRows", "footerRows"] as const) {
      const widths = saved()[name]![0].cells.map((cell) => parseFloat(cell.width!));
      expect(widths.reduce((sum, value) => sum + value, 0)).toBe(100);
      expect(widths).toEqual([40, 26.67, 33.33]);
      expect(widths[0] / widths[1]).toBeCloseTo(1.5, 3);
      expect(
        saved()
          [name]![0].cells.slice(0, 2)
          .map(({ width: _width, ...cell }) => cell),
      ).toEqual(withHeader[name]![0].cells.map(({ width: _width, ...cell }) => cell));
    }
    expect(saved().tableLayout).toBe("fixed");
    await act(async () => api!.history.back());
    expect(saved()).toEqual(withHeader);
    await act(async () => api!.history.forward());
    await edit(() => button("Body row 1 cell 3: Cell").click());
    await edit(() => button("Remove column").click());
    for (const name of ["headerRows", "bodyRows", "footerRows"] as const)
      expect(saved()[name]![0].cells.map((cell) => cell.width)).toEqual(["60%", "40%"]);
    await act(async () => api!.history.back());
    expect(saved().bodyRows![0].cells.map((cell) => cell.width)).toEqual([
      "40%",
      "26.67%",
      "33.33%",
    ]);
  });

  it.each([
    { label: "mixed units", header: ["120px", "75%"], body: ["120px", "75%"] },
    { label: "inconsistent percentages", header: ["40%", "60%"], body: ["20%", "80%"] },
  ])("keeps $label unchanged when adding or removing columns", async ({ header, body }) => {
    const imported: TableProps = {
      ...table,
      headerRows: table.headerRows!.map((row) => ({
        cells: row.cells.map((cell, index) => ({ ...cell, width: header[index] })),
      })),
      bodyRows: table.bodyRows!.map((row) => ({
        cells: row.cells.map((cell, index) => ({ ...cell, width: body[index] })),
      })),
      footerRows: [],
    };
    await mount(imported);
    await edit(() => button("Add column").click());
    expect(saved().headerRows![0].cells.slice(0, 2)).toEqual(imported.headerRows![0].cells);
    expect(saved().bodyRows![0].cells.slice(0, 2)).toEqual(imported.bodyRows![0].cells);
    expect(saved().bodyRows![0].cells[2].width).toBe("");
    await edit(() => button("Body row 1 cell 3: Cell").click());
    await edit(() => button("Remove column").click());
    expect(saved().headerRows).toEqual(imported.headerRows);
    expect(saved().bodyRows).toEqual(imported.bodyRows);
  });
});
