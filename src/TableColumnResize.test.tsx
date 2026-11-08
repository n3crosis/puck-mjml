// @vitest-environment happy-dom
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  Puck,
  createUsePuck,
  type Config,
  type Data,
  type Overrides,
  type PuckApi,
} from "@puckeditor/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  TableColumnResize,
  measureTableColumns,
  rectangularTableRows,
  resizeColumnPair,
} from "./TableColumnResize";
import { tableConfig } from "./TableBlock";
import type { TableProps } from "./table";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const usePuck = createUsePuck();
let root: Root | undefined;
let container: HTMLDivElement | undefined;
let api: PuckApi | undefined;
const rect = (x: number, y: number, width: number, height: number) =>
  new DOMRect(x, y, width, height);
beforeEach(() => {
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });
  // Happy DOM has no hit testing; Puck's pointer hover monitor still calls it.
  Object.defineProperty(document, "elementsFromPoint", { configurable: true, value: () => [] });
});
function Capture() {
  const state = usePuck((state) => state);
  useEffect(() => {
    api = state;
  }, [state]);
  return null;
}
function Overlay(props: Parameters<Overrides["componentOverlay"]>[0]) {
  return (
    <>
      {props.children}
      <TableColumnResize {...props} />
    </>
  );
}
afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
  api = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const initial: TableProps = {
  caption: "Keep caption",
  headerRows: [
    {
      cells: [
        { content: "<p>Product</p>", header: true, scope: "col", width: "40%" },
        { content: "<p>Price</p>", header: true, width: "60%" },
      ],
    },
  ],
  bodyRows: [
    {
      cells: [
        {
          content: "<p><strong>Apples</strong></p>",
          width: "40%",
          backgroundColor: "#abcdef",
          padding: "8px",
        },
        { content: "<p>$3</p>", width: "60%", align: "right" },
      ],
    },
  ],
  footerRows: [
    {
      cells: [
        { content: "<p>Total</p>", width: "40%" },
        { content: "<p>$3</p>", width: "60%" },
      ],
    },
  ],
};
type Layout = { stacked?: boolean; stackedBody?: boolean; hiddenHeader?: boolean };
async function mount(
  props = initial,
  readOnly: Record<string, boolean | undefined> = {},
  edit = true,
  direction: "ltr" | "rtl" = "ltr",
  layout: Layout = {},
) {
  const original = HTMLElement.prototype.getBoundingClientRect;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement,
  ) {
    if (
      this.matches(".pm-table, [data-puck-component=table]") ||
      this.className?.toString().includes("_DraggableComponent-overlayWrapper_")
    )
      return rect(100, 50, 500, 120);
    if (this.matches(".pm-table th, .pm-table td")) {
      const cells = [...this.parentElement!.children] as HTMLElement[];
      const index = cells.indexOf(this);
      const row = [...this.closest("table")!.rows].indexOf(
        this.parentElement as HTMLTableRowElement,
      );
      if (layout.hiddenHeader && this.closest("thead")) return rect(0, 0, 0, 0);
      if (layout.stacked || (layout.stackedBody && this.closest("tbody")))
        return rect(100, 50 + row * 80 + index * 40, 500, 40);
      const explicit = cells.map((cell) => parseFloat(cell.style.width) || 0);
      const remaining = 100 - explicit.reduce((sum, width) => sum + width, 0);
      const implicit = explicit.filter((width) => !width).length;
      const widths = explicit.map((width) => width || remaining / implicit);
      const preceding = widths.slice(0, index).reduce((a, b) => a + b, 0);
      return rect(
        100 + (direction === "rtl" ? 100 - preceding - widths[index] : preceding) * 5,
        50 + row * 40,
        widths[index] * 5,
        40,
      );
    }
    return original.call(this);
  });
  const config: Config = {
    components: {
      Table: { ...tableConfig, permissions: { edit } },
      Other: { render: ({ content }) => <p>{content}</p> },
    },
  };
  container = document.createElement("div");
  container.dir = direction;
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root!.render(
      <Puck
        config={config}
        data={
          {
            root: { props: {} },
            content: [
              { type: "Table", props: { id: "table", ...props }, readOnly },
              { type: "Other", props: { id: "sibling", content: "Do not change" } },
            ],
          } as Data
        }
        iframe={{ enabled: false }}
        overrides={{ componentOverlay: Overlay }}
      >
        <Capture />
        <Puck.Preview />
      </Puck>,
    ),
  );
  await act(async () =>
    api!.dispatch({ type: "setUi", ui: { itemSelector: api!.getSelectorForId("table") } }),
  );
  await settle();
}
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 35));
  });
}
const saved = () => api!.getItemById("table")!.props as TableProps;
const handle = () => container!.querySelector<HTMLElement>('[role="separator"]')!;
async function pointer(type: string, x: number) {
  await act(async () =>
    handle().dispatchEvent(
      new PointerEvent(type, {
        pointerId: 1,
        clientX: x,
        button: 0,
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
}
async function key(key: string) {
  await act(async () =>
    handle().dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })),
  );
  await settle();
}
function measureRows(rows: DOMRect[][]) {
  const host = document.createElement("div");
  const table = document.createElement("table");
  for (const row of rows) {
    const element = table.insertRow();
    for (const box of row)
      vi.spyOn(element.insertCell(), "getBoundingClientRect").mockReturnValue(box);
  }
  vi.spyOn(host, "getBoundingClientRect").mockReturnValue(rect(100, 50, 500, 200));
  vi.spyOn(table, "getBoundingClientRect").mockReturnValue(rect(100, 50, 500, 200));
  return measureTableColumns(table, host, 2);
}

describe("table column resize", () => {
  it("measures boundaries in overlay coordinates, including zoom and cell spacing", () => {
    const host = document.createElement("div");
    const table = document.createElement("table");
    table.innerHTML = "<tbody><tr><td>A</td><td>B</td></tr></tbody>";
    vi.spyOn(host, "getBoundingClientRect").mockReturnValue(rect(100, 50, 600, 200));
    vi.spyOn(host, "offsetWidth", "get").mockReturnValue(300);
    vi.spyOn(table, "getBoundingClientRect").mockReturnValue(rect(120, 70, 560, 160));
    vi.spyOn(table.rows[0].cells[0], "getBoundingClientRect").mockReturnValue(
      rect(120, 70, 220, 60),
    );
    vi.spyOn(table.rows[0].cells[1], "getBoundingClientRect").mockReturnValue(
      rect(360, 70, 320, 60),
    );
    const geometry = measureTableColumns(table, host, 2)!;
    expect(geometry.top).toBe(10);
    expect(geometry.height).toBe(80);
    expect(geometry.boundaries).toEqual([125]);
    expect(geometry.direction).toBe(1);
    expect(geometry.widths[0] + geometry.widths[1]).toBeCloseTo(100);
    // RTL keeps the same shared edge, even with zoom and a gap between cells.
    vi.spyOn(table.rows[0].cells[0], "getBoundingClientRect").mockReturnValue(
      rect(360, 70, 320, 60),
    );
    vi.spyOn(table.rows[0].cells[1], "getBoundingClientRect").mockReturnValue(
      rect(120, 70, 220, 60),
    );
    expect(measureTableColumns(table, host, 2)?.boundaries).toEqual([125]);
    expect(measureTableColumns(table, host, 2)?.direction).toBe(-1);
    expect(resizeColumnPair([40, 40, 20], 0, 100)).toEqual([75, 5, 20]);
    expect(resizeColumnPair([40, 40, 20], 0, -100)).toEqual([5, 75, 20]);
  });

  it.each([
    {
      name: "stacked cells",
      rows: [[rect(100, 50, 500, 40), rect(100, 90, 500, 40)]],
    },
    {
      name: "a stacked body below a horizontal header",
      rows: [
        [rect(100, 50, 200, 40), rect(300, 50, 300, 40)],
        [rect(100, 90, 500, 40), rect(100, 130, 500, 40)],
      ],
    },
    {
      name: "vertically wrapped cells with adjacent x coordinates",
      rows: [[rect(100, 50, 200, 40), rect(300, 90, 300, 40)]],
    },
    {
      name: "overlapping cells",
      rows: [[rect(100, 50, 300, 40), rect(300, 50, 300, 40)]],
    },
    {
      name: "reordered columns in a later row",
      rows: [
        [rect(100, 50, 200, 40), rect(300, 50, 300, 40)],
        [rect(300, 90, 300, 40), rect(100, 90, 200, 40)],
      ],
    },
    {
      name: "different column boundaries in a later row",
      rows: [
        [rect(100, 50, 200, 40), rect(300, 50, 300, 40)],
        [rect(100, 90, 250, 40), rect(350, 90, 250, 40)],
      ],
    },
    {
      name: "a partially hidden row",
      rows: [[rect(0, 0, 0, 0), rect(300, 50, 300, 40)]],
    },
    { name: "a ragged rendered row", rows: [[rect(100, 50, 500, 40)]] },
    { name: "only hidden rows", rows: [[rect(0, 0, 0, 0), rect(0, 0, 0, 0)]] },
    {
      name: "non-finite bounds",
      rows: [[rect(100, 50, Number.NaN, 40), rect(300, 50, 300, 40)]],
    },
  ])("does not invent a column boundary for $name", ({ rows }) => {
    expect(measureRows(rows)).toBeNull();
  });

  it.each(["ltr", "rtl"] as const)(
    "measures a visible %s grid without including hidden rows",
    (direction) => {
      const row = [rect(100, 90, 200, 40), rect(300, 90, 300, 40)];
      const footer = [rect(100, 170, 200, 40), rect(300, 170, 300, 40)];
      if (direction === "rtl") {
        row.reverse();
        footer.reverse();
      }
      const geometry = measureRows([
        [rect(0, 0, 0, 0), rect(0, 0, 0, 0)],
        row,
        [rect(100, 130, 200, 0), rect(300, 130, 300, 0)],
        footer,
      ])!;
      expect(geometry.top).toBe(40);
      expect(geometry.height).toBe(160);
      expect(geometry.boundaries).toEqual([200]);
      expect(geometry.widths).toEqual(direction === "rtl" ? [60, 40] : [40, 60]);
      expect(geometry.direction).toBe(direction === "rtl" ? -1 : 1);
    },
  );

  it.each(["ltr", "rtl"] as const)(
    "removes stacked %s controls, cancels a pending drag, and restores the grid without history",
    async (direction) => {
      const layout: Layout = {};
      await mount(initial, {}, true, direction, layout);
      const before = saved();
      const start = direction === "rtl" ? 400 : 300;
      const left = handle().style.left;
      expect(handle().tabIndex).toBe(0);
      await pointer("pointerdown", start);
      await pointer("pointermove", start + 50);
      expect(handle().dataset.resizing).toBe("true");
      layout.stackedBody = true;
      window.dispatchEvent(new Event("resize"));
      await settle();
      expect(handle()).toBeNull();
      expect(saved()).toBe(before);
      expect(api!.history.hasPast).toBe(false);
      layout.stackedBody = false;
      window.dispatchEvent(new Event("resize"));
      await settle();
      expect(handle().style.left).toBe(left);
      expect(handle().dataset.resizing).toBeUndefined();
      await pointer("pointerup", start + 50);
      expect(saved()).toBe(before);
      expect(api!.history.hasPast).toBe(false);
      await key("ArrowRight");
      expect(saved().bodyRows![0].cells[0].width).toBe(direction === "rtl" ? "39%" : "41%");
    },
  );

  it("rejects stale pointer-up and keyboard edits before responsive remeasurement runs", async () => {
    const layout: Layout = {};
    await mount(initial, {}, true, "ltr", layout);
    const before = saved();
    await pointer("pointerdown", 300);
    await pointer("pointermove", 350);
    layout.stacked = true;
    // No resize event or observer callback: the interaction itself must verify
    // that the previously measured column grid still exists.
    await pointer("pointerup", 350);
    await key("ArrowRight");
    expect(saved()).toBe(before);
    expect(api!.history.hasPast).toBe(false);
    expect(handle().dataset.resizing).toBeUndefined();
    window.dispatchEvent(new Event("resize"));
    await settle();
    expect(handle()).toBeNull();
  });

  it("cancels a drag when a still-horizontal grid changes before pointer-up", async () => {
    await mount();
    const before = saved();
    await pointer("pointerdown", 300);
    await pointer("pointermove", 350);
    for (const cell of container!.querySelectorAll<HTMLTableCellElement>(
      ".pm-table th, .pm-table td",
    ))
      vi.spyOn(cell, "getBoundingClientRect").mockReturnValue(
        rect(cell.cellIndex === 0 ? 100 : 260, 50, cell.cellIndex === 0 ? 160 : 240, 40),
      );
    await pointer("pointerup", 350);
    expect(saved()).toBe(before);
    expect(api!.history.hasPast).toBe(false);
  });

  it("remeasures cell-only layout changes even when the table and host sizes stay unchanged", async () => {
    const observers: TestResizeObserver[] = [];
    class TestResizeObserver implements ResizeObserver {
      targets = new Set<Element>();
      constructor(readonly callback: ResizeObserverCallback) {
        observers.push(this);
      }
      observe(target: Element) {
        this.targets.add(target);
      }
      unobserve(target: Element) {
        this.targets.delete(target);
      }
      disconnect() {
        this.targets.clear();
      }
    }
    vi.stubGlobal("ResizeObserver", TestResizeObserver);
    const layout: Layout = { hiddenHeader: true };
    await mount(initial, {}, true, "ltr", layout);
    const before = saved();
    expect(handle()).not.toBeNull();
    const cell = container!.querySelector(".pm-table tbody td")!;
    const observer = observers.find((candidate) => candidate.targets.has(cell))!;
    expect(observer).toBeDefined();
    expect(observer.targets.has(cell.parentElement!)).toBe(true);
    await pointer("pointerdown", 300);
    await pointer("pointermove", 350);
    layout.stackedBody = true;
    observer.callback([], observer);
    await settle();
    expect(handle()).toBeNull();
    layout.stackedBody = false;
    observer.callback([], observer);
    await settle();
    expect(handle()).not.toBeNull();
    expect(handle().dataset.resizing).toBeUndefined();
    await pointer("pointerup", 350);
    expect(saved()).toBe(before);
    expect(api!.history.hasPast).toBe(false);
  });

  it("moves an RTL boundary with the pointer and arrow keys while preserving undo", async () => {
    await mount(initial, {}, true, "rtl");
    const before = saved();
    expect(handle().style.left).toBe("300px");
    await pointer("pointerdown", 400);
    await pointer("pointermove", 450);
    expect(saved()).toBe(before);
    expect(handle().style.left).toBe("350px");
    await pointer("pointerup", 450);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
    for (const group of ["headerRows", "bodyRows", "footerRows"] as const)
      expect(saved()[group]![0].cells.map((cell) => cell.width)).toEqual(["30%", "70%"]);
    expect(handle().style.left).toBe("350px");
    await act(async () => api!.history.back());
    await settle();
    expect(saved()).toEqual(before);
    expect(api!.history.hasPast).toBe(false);
    await act(async () => api!.history.forward());
    await settle();
    await key("ArrowLeft");
    expect(saved().bodyRows![0].cells.map((cell) => cell.width)).toEqual(["31%", "69%"]);
    expect(handle().style.left).toBe("345px");
    await key("ArrowRight");
    expect(saved().bodyRows![0].cells.map((cell) => cell.width)).toEqual(["30%", "70%"]);
    expect(handle().style.left).toBe("350px");
  });

  it.each([2, 5])(
    "keeps a %s%% column unchanged on click, return drag, or a key at its limit",
    async (width) => {
      const props = {
        ...initial,
        ...Object.fromEntries(
          (["headerRows", "bodyRows", "footerRows"] as const).map((group) => [
            group,
            initial[group]!.map((row) => ({
              ...row,
              cells: row.cells.map((cell, index) => ({
                ...cell,
                width: `${index ? 100 - width : width}%`,
              })),
            })),
          ]),
        ),
      };
      await mount(props);
      const before = saved();
      const start = 100 + width * 5;
      await pointer("pointerdown", start);
      await pointer("pointerup", start);
      expect(saved()).toBe(before);
      await pointer("pointerdown", start);
      await pointer("pointermove", start + 50);
      await pointer("pointermove", start);
      await pointer("pointerup", start);
      await key("ArrowLeft");
      expect(saved()).toBe(before);
      expect(api!.history.hasPast).toBe(false);
      expect(Number(handle().getAttribute("aria-valuemin"))).toBeLessThanOrEqual(width);
      await key("ArrowRight");
      expect(saved().bodyRows![0].cells.map((cell) => cell.width)).toEqual([
        `${width + 1}%`,
        `${99 - width}%`,
      ]);
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 300));
      });
      await act(async () => api!.history.back());
      await settle();
      expect(saved()).toEqual(before);
      expect(api!.history.hasPast).toBe(false);
    },
  );

  it("previews drag locally then changes both columns in all groups as one undoable edit", async () => {
    await mount();
    expect(handle()).not.toBeNull();
    expect(handle().style.left).toBe("200px");
    const before = saved();
    const sibling = api!.getItemById("sibling");
    await pointer("pointerdown", 300);
    await pointer("pointermove", 350);
    await pointer("pointermove", 400);
    expect(saved()).toBe(before);
    expect(handle().style.left).toBe("300px");
    await pointer("pointerup", 400);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
    for (const group of ["headerRows", "bodyRows", "footerRows"] as const) {
      expect(saved()[group]![0].cells.map((cell) => cell.width)).toEqual(["60%", "40%"]);
      expect(saved()[group]![0].cells.map(({ width: _width, ...cell }) => cell)).toEqual(
        before[group]![0].cells.map(({ width: _width, ...cell }) => cell),
      );
    }
    expect(saved().caption).toBe("Keep caption");
    expect(api!.getItemById("sibling")).toEqual(sibling);
    await act(async () => api!.history.back());
    await settle();
    expect(saved()).toEqual(before);
    expect(api!.history.hasPast).toBe(false);
    await act(async () => api!.history.forward());
    await settle();
    expect(saved().bodyRows![0].cells[0].width).toBe("60%");
  });

  it("freezes untouched implicit columns at their measured share and honors unrelated width locks", async () => {
    const props: TableProps = {
      headerRows: [],
      footerRows: [],
      bodyRows: [
        {
          cells: [
            { content: "A", width: "25%" },
            { content: "B" },
            { content: "C", width: "50%", color: "#123456" },
          ],
        },
      ],
    };
    await mount(props, { "bodyRows[0].cells[2].width": true });
    expect(container!.querySelectorAll('[role="separator"]')).toHaveLength(1);
    await pointer("pointerdown", 225);
    await pointer("pointermove", 250);
    await pointer("pointerup", 250);
    await settle();
    expect(saved().bodyRows![0].cells).toEqual([
      { content: "A", width: "30%" },
      { content: "B", width: "20%" },
      { content: "C", width: "50%", color: "#123456" },
    ]);
  });

  it("records measured widths for implicit columns outside the dragged pair", async () => {
    await mount({
      headerRows: [],
      footerRows: [],
      bodyRows: [
        {
          cells: [{ content: "A", width: "25%" }, { content: "B", width: "25%" }, { content: "C" }],
        },
      ],
    });
    await pointer("pointerdown", 225);
    await pointer("pointerup", 250);
    await settle();
    expect(saved().bodyRows![0].cells.map((cell) => cell.width)).toEqual(["30%", "20%", "50%"]);
  });

  it("supports keyboard steps and cancels a drag without changing data", async () => {
    await mount();
    const original = saved();
    await pointer("pointerdown", 300);
    await pointer("pointermove", 450);
    await act(async () =>
      handle().dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
      ),
    );
    expect(saved()).toBe(original);
    expect(handle().dataset.resizing).toBeUndefined();
    await act(async () =>
      handle().dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }),
      ),
    );
    await settle();
    expect(saved().bodyRows![0].cells.map((cell) => cell.width)).toEqual(["41%", "59%"]);
    await act(async () =>
      handle().dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true, cancelable: true }),
      ),
    );
    await settle();
    expect(saved().bodyRows![0].cells.map((cell) => cell.width)).toEqual(["40%", "60%"]);
  });

  it("discards an unfinished drag when selection leaves the table", async () => {
    await mount();
    const original = saved();
    await pointer("pointerdown", 300);
    await pointer("pointermove", 450);
    expect(handle().dataset.resizing).toBe("true");
    await act(async () =>
      api!.dispatch({ type: "setUi", ui: { itemSelector: api!.getSelectorForId("sibling") } }),
    );
    await settle();
    expect(handle()).toBeNull();
    await act(async () =>
      api!.dispatch({ type: "setUi", ui: { itemSelector: api!.getSelectorForId("table") } }),
    );
    await settle();
    expect(handle().dataset.resizing).toBeUndefined();
    expect(handle().style.left).toBe("200px");
    await pointer("pointerup", 450);
    expect(saved()).toBe(original);
    expect(api!.history.hasPast).toBe(false);
  });

  it("discards a pending drag when the current table is externally replaced", async () => {
    await mount();
    await pointer("pointerdown", 300);
    await pointer("pointermove", 450);
    const current = api!.getItemById("table")!;
    const selector = api!.getSelectorForId("table")!;
    const replacement = {
      ...current,
      props: {
        ...current.props,
        ...Object.fromEntries(
          (["headerRows", "bodyRows", "footerRows"] as const).map((group) => [
            group,
            initial[group]!.map((row) => ({
              ...row,
              cells: row.cells.map((cell, index) => ({ ...cell, width: index ? "80%" : "20%" })),
            })),
          ]),
        ),
      },
    };
    await act(async () =>
      api!.dispatch({
        type: "replace",
        destinationIndex: selector.index,
        destinationZone: selector.zone,
        data: replacement,
        recordHistory: false,
      }),
    );
    await settle();
    await pointer("pointerup", 450);
    expect(saved().bodyRows![0].cells.map((cell) => cell.width)).toEqual(["20%", "80%"]);
    expect(handle().dataset.resizing).toBeUndefined();
  });

  it.each([
    { props: { ...initial, bodyRows: [{ cells: [{ content: "Merged", colSpan: 2 }] }] } },
    {
      props: {
        ...initial,
        bodyRows: [{ cells: [{ content: "Tall", rowSpan: 2 }, { content: "B" }] }],
      },
    },
    { props: { ...initial, bodyRows: [{ cells: [{ content: "Ragged" }] }] } },
    { props: initial, readOnly: { "bodyRows[*].cells[*].width": true } },
    { props: initial, edit: false },
  ])("omits handles for ambiguous or locked rows", async ({ props, readOnly, edit }) => {
    await mount(props, readOnly, edit);
    expect(handle()).toBeNull();
  });

  it.each([
    { label: "exact dot path", locks: { "bodyRows.0.cells.0.width": true } },
    { label: "wildcard dot path", locks: { "bodyRows.*.cells.*.width": true } },
  ])("honors $label width locks", async ({ locks }) => {
    await mount(initial, locks);
    expect(handle()).toBeNull();
  });

  it("honors specific false width rules under a wildcard lock", async () => {
    await mount(initial, {
      "bodyRows[*].cells[*].width": true,
      "bodyRows[0].cells[0].width": false,
      "bodyRows[0].cells[1].width": false,
    });
    expect(handle()).not.toBeNull();
    await key("ArrowRight");
    expect(saved().bodyRows![0].cells.map((cell) => cell.width)).toEqual(["41%", "59%"]);
  });

  it("preserves legacy text when converting its two columns and rejects malformed rows", () => {
    const rows = rectangularTableRows({
      firstHeading: "A & B",
      secondHeading: "C",
      rows: [{ first: "<literal>", second: "2" }],
    })!;
    expect(rows.headerRows[0].cells[0].content).toBe("<p>A &amp; B</p>");
    expect(rows.bodyRows[0].cells[0].content).toBe("<p>&lt;literal&gt;</p>");
    expect(rectangularTableRows({ bodyRows: [{ cells: [] }] })).toBeNull();
  });
});
