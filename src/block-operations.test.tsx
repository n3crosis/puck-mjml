// @vitest-environment happy-dom
import { act, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  Puck,
  useGetPuck,
  type ComponentData,
  type Config,
  type Field,
  type Data as PuckData,
  type Permissions,
  type PuckAction,
  type PuckApi,
} from "@puckeditor/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createEmailConfig as createPublicConfig,
  createEmailEditorConfig,
  type BlockOperationsPolicy,
} from "./config";
const policies = new WeakMap<Config, BlockOperationsPolicy>();
function createEmailConfig(...args: Parameters<typeof createPublicConfig>) {
  const bundle = createEmailEditorConfig(...args);
  policies.set(bundle.config, bundle.blockOperationsPolicy);
  return bundle.config;
}
import { createEmptyDocument } from "./document";
import { createBlockOperations } from "./block-operations";
import { BlockOperations } from "./BlockOperations";
import { fromMjml } from "./import";
import { toMjml } from "./export";
import type { EmailDocument } from "./types";

type Data = PuckData<
  Record<string, Record<string, unknown>>,
  Record<string, unknown> & { sections: ComponentData[]; replacementKey?: string }
>;
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
let container: HTMLDivElement;
let getPuck: () => PuckApi;
let value: Data;
let actions: PuckAction[];
let replace: (data: Data) => void;
const pause = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 300));
  });
function Capture() {
  const get = useGetPuck();
  useEffect(() => {
    getPuck = get;
  }, [get]);
  return null;
}
async function mount(
  config = createEmailConfig(),
  initial = createEmptyDocument() as Data,
  permissions?: Partial<Permissions>,
) {
  actions = [];
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 0, 800, 600),
  );
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  function Host() {
    const [data, setData] = useState(initial);
    value = data;
    replace = setData;
    return (
      <Puck
        key={String(data.root.props?.replacementKey ?? "same")}
        config={config}
        data={data}
        iframe={{ enabled: false }}
        permissions={permissions}
        onChange={(next) => setData(JSON.parse(JSON.stringify(next)) as Data)}
        onAction={(action) => actions.push(action)}
      >
        <Capture />
        <BlockOperations policy={policies.get(config)!} />
        <Puck.Preview />
      </Puck>
    );
  }
  await act(async () => root!.render(<Host />));
  return createBlockOperations(() => getPuck(), policies.get(config)!);
}
function dataWith(...sections: Data["content"]): Data {
  const data = createEmptyDocument() as Data;
  data.root.props!.sections = sections;
  return data;
}
const text = (id: string) => ({ type: "Text", props: { id, content: `<p>${id}</p>` } });
const section = (id: string, items = [text(`${id}-a`), text(`${id}-b`)]) => ({
  type: "Section1",
  props: { id, column: items },
});
function allBlocks(value: unknown): ComponentData[] {
  if (!value || typeof value !== "object") return [];
  return [
    ...("type" in value && "props" in value ? [value as ComponentData] : []),
    ...Object.values(value).flatMap(allBlocks),
  ];
}
async function select(id: string) {
  await act(async () =>
    getPuck().dispatch({
      type: "setUi",
      ui: { itemSelector: getPuck().getSelectorForId(id) },
      recordHistory: false,
    }),
  );
}
async function run(action: () => { ok: boolean }) {
  let ok = false;
  await act(async () => {
    ok = action().ok;
  });
  return ok;
}
afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("bounded block operations with actual Puck", () => {
  it("inserts defaults with fresh IDs, preserves controlled echoes, and restores data/selection through undo and redo", async () => {
    const config = createEmailConfig();
    const operations = await mount(config);
    const initial = structuredClone(getPuck().appState.data);
    expect(await run(() => operations.add("root:sections", "Section1"))).toBe(true);
    const first = getPuck().selectedItem!;
    expect(first.type).toBe("Section1");
    expect(first.props.padding).toBe(config.components.Section1.defaultProps!.padding);
    expect(first.props.column).toEqual([]);
    expect(getPuck().appState.data.content).toEqual([]);
    expect(value).toEqual(getPuck().appState.data);
    expect(container.querySelector(".pm-section")).not.toBeNull();
    await pause();
    await act(async () => getPuck().history.back());
    expect(value).toEqual(initial);
    await act(async () => getPuck().history.forward());
    expect(getPuck().selectedItem?.props.id).toBe(first.props.id);
    expect(await run(() => operations.add("root:sections", "Section1"))).toBe(true);
    const second = getPuck().selectedItem!;
    expect(second.props.id).not.toBe(first.props.id);
    await pause();
    await act(async () => getPuck().history.back());
    expect(value.root.props!.sections).toHaveLength(1);
    expect(getPuck().selectedItem?.props.id).toBe(first.props.id);
    await act(async () => getPuck().history.forward());
    expect(value.root.props!.sections).toHaveLength(2);
    expect(getPuck().selectedItem?.props.id).toBe(second.props.id);
    expect(await run(() => operations.add(`${first.props.id}:column`, "Text"))).toBe(true);
    expect(getPuck().getItemById(first.props.id)!.props.column).toHaveLength(1);
    expect(getPuck().getItemById(second.props.id)!.props.column).toHaveLength(0);
  });

  it("adds to empty/nested slots while rejecting the wrong child types without dispatching", async () => {
    const operations = await mount(
      createEmailConfig(),
      dataWith({ type: "Section2", props: { id: "two", left: [], right: [] } }),
    );
    expect(operations.model().destinations.map((zone) => zone.id)).toEqual([
      "root:sections",
      "two:left",
      "two:right",
    ]);
    const before = actions.length;
    expect(await run(() => operations.add("root:sections", "Text"))).toBe(false);
    expect(await run(() => operations.add("two:left", "Column"))).toBe(false);
    expect(await run(() => operations.add("two:unknown", "Text"))).toBe(false);
    const permissionCheck = vi.fn(getPuck().getPermissions);
    const guarded = createBlockOperations(
      () => ({ ...getPuck(), getPermissions: permissionCheck }),
      policies.get(getPuck().config)!,
    );
    for (const type of ["__proto__", "constructor", "toString", "root"]) {
      expect(await run(() => guarded.add("root:sections", type))).toBe(false);
    }
    expect(permissionCheck).not.toHaveBeenCalled();
    for (const direction of [0, 0.5, 2, NaN, Infinity, "1", null, undefined]) {
      expect(await run(() => operations.move("two", direction as -1 | 1))).toBe(false);
    }
    expect(actions).toHaveLength(before);
    expect(await run(() => operations.add("two:left", "Text"))).toBe(true);
    expect(getPuck().selectedItem!.type).toBe("Text");
    expect(getPuck().getItemById("two")!.props.left).toHaveLength(1);
    expect(getPuck().getItemById("two")!.props.right).toEqual([]);
    const slot = getPuck().config.root!.fields!.sections as Extract<Field, { type: "slot" }>;
    if (slot.type !== "slot") throw new Error("Expected the actual root slot");
    const original = { allow: slot.allow, disallow: slot.disallow };
    const unchanged = actions.length;
    for (const field of ["allow", "disallow"] as const) {
      for (const name of ["__proto__", "constructor", "toString"]) {
        slot[field] = [name];
        expect(await run(() => operations.add("root:sections", "Section1"))).toBe(false);
        Object.assign(slot, original);
      }
    }
    expect(actions).toHaveLength(unchanged);
  });

  it.each([false, true])(
    "supports attested intrinsic slots and slot-neutral Image fields with imported=%s",
    async (imported) => {
      const picture = (id: string): ComponentData => ({
        type: "Image",
        props: { id, src: "https://example.com/picture.png", width: 24, padding: "0px" },
      });
      const original = dataWith(
        {
          type: "Section1",
          props: {
            id: "one",
            column: [
              picture("outside"),
              {
                type: "IntrinsicRow",
                props: {
                  id: "row",
                  cells: [
                    {
                      type: "IntrinsicCell",
                      props: { id: "first", content: [picture("inside"), text("caption")] },
                    },
                    { type: "IntrinsicCell", props: { id: "second", content: [] } },
                  ],
                },
              },
            ],
          },
        },
        section("two", []),
      );
      const data = imported
        ? (fromMjml(toMjml(original as EmailDocument)).document as Data)
        : original;
      const config = createEmailConfig(undefined, true);
      const operations = await mount(config, data);
      const initialIds = allBlocks(data).map((item) => item.props.id);
      const row = allBlocks(data).find((item) => item.type === "IntrinsicRow")!;
      const [first, second] = row.props.cells as ComponentData[];
      const [outside, inside] = allBlocks(data).filter((item) => item.type === "Image");
      const outerZone = getPuck().getSelectorForId(row.props.id)!.zone!;
      expect(
        operations
          .model()
          .destinations.find((zone) => zone.id === "root:sections")!
          .types.some((type) => type.name === "Section1"),
      ).toBe(true);
      const fields = config.components.Image.fields!;
      for (const item of [outside, inside]) {
        const resolve = () =>
          config.components.Image.resolveFields!(item, {
            changed: {},
            fields,
            lastFields: fields,
            lastData: null,
            metadata: {},
            appState: getPuck().appState,
            parent: null,
          });
        const resolved = await resolve();
        expect(Object.keys(resolved)).toEqual(Object.keys(fields));
        expect(Object.values(resolved).some((field) => field.type === "slot")).toBe(false);
        for (const name of Object.keys(fields).filter((name) => name !== "src"))
          expect(resolved[name]).toBe(fields[name]);
        if (item === outside) expect(resolved).toBe(fields);
        else
          expect((resolved.src as { render: unknown }).render).toBe(
            ((await resolve()).src as { render: unknown }).render,
          );
      }
      const beforeInvalid = actions.length;
      for (const [zone, type] of [
        ["root:sections", "IntrinsicCell"],
        [outerZone, "IntrinsicCell"],
        [`${row.props.id}:cells`, "Text"],
        [`${row.props.id}:cells`, "Image"],
        [`${first.props.id}:content`, "Raw"],
      ])
        expect(await run(() => operations.add(zone, type))).toBe(false);
      expect(actions).toHaveLength(beforeInvalid);
      expect(await run(() => operations.add(`${second.props.id}:content`, "IntrinsicRow"))).toBe(
        true,
      );
      const nested = getPuck().selectedItem!;
      expect(nested.props.cells).toEqual([]);
      expect(await run(() => operations.add(`${nested.props.id}:cells`, "IntrinsicCell"))).toBe(
        true,
      );
      const nestedCell = getPuck().selectedItem!;
      expect(nestedCell.props.content).toEqual([]);
      for (const type of ["Text", "Image"]) {
        expect(await run(() => operations.add(`${nestedCell.props.id}:content`, type))).toBe(true);
        expect(initialIds).not.toContain(getPuck().selectedItem!.props.id);
      }
      const newImage = getPuck().selectedItem!;
      expect(newImage.props.src).toBe(config.components.Image.defaultProps!.src);
      await pause();
      const before = structuredClone(getPuck().appState.data);
      expect(await run(() => operations.move(newImage.props.id, -1))).toBe(true);
      expect(getPuck().getSelectorForId(newImage.props.id)).toEqual({
        index: 0,
        zone: `${nestedCell.props.id}:content`,
      });
      await pause();
      await act(async () => getPuck().history.back());
      expect(value).toEqual(before);
      await act(async () => getPuck().history.forward());
      expect(getPuck().selectedItem!.props.id).toBe(newImage.props.id);
      await select(first.props.id);
      expect(await run(() => operations.move(first.props.id, 1))).toBe(true);
      await select(row.props.id);
      expect(await run(() => operations.move(row.props.id, -1))).toBe(true);
      // The same subtree/ancestor rules apply to both native and imported IDs.
      const unlocked = structuredClone(getPuck().appState.data);
      for (const lock of ["ancestor", "subtree", "neighbor"]) {
        const locked = structuredClone(unlocked);
        const target = allBlocks(locked).find(
          (item) =>
            item.props.id ===
            (lock === "ancestor"
              ? row.props.id
              : lock === "subtree"
                ? inside.props.id
                : second.props.id),
        )!;
        target.readOnly = {
          [lock === "ancestor" ? "cells" : lock === "subtree" ? "src" : "content"]: true,
        };
        await act(async () =>
          getPuck().dispatch({ type: "setData", data: locked, recordHistory: false }),
        );
        await select(first.props.id);
        const count = actions.length;
        expect(await run(() => operations.move(first.props.id, -1))).toBe(false);
        if (lock === "ancestor")
          expect(await run(() => operations.add(`${first.props.id}:content`, "Text"))).toBe(false);
        expect(actions).toHaveLength(count);
        await act(async () =>
          getPuck().dispatch({
            type: "setData",
            data: structuredClone(unlocked),
            recordHistory: false,
          }),
        );
      }
      if (!imported) {
        // Add uses the same explicit invalid-state/Undo contract as pointer
        // editing, rather than imposing a second private insertion policy.
        let deep: ComponentData | undefined;
        for (let level = 8; level >= 1; level--)
          deep = {
            type: "IntrinsicRow",
            props: {
              id: `depth-${level}`,
              cells: [
                {
                  type: "IntrinsicCell",
                  props: { id: `depth-cell-${level}`, content: deep ? [deep] : [] },
                },
              ],
            },
          };
        const boundary = dataWith({ type: "Section1", props: { id: "boundary", column: [deep!] } });
        await act(async () =>
          getPuck().dispatch({ type: "setData", data: boundary, recordHistory: true }),
        );
        await pause();
        const beforeLimit = structuredClone(getPuck().appState.data);
        expect(await run(() => operations.add("depth-cell-8:content", "IntrinsicRow"))).toBe(true);
        expect(container.querySelector(".pm-intrinsic-error")?.textContent).toContain(
          "at most 8 nested rows",
        );
        expect(() => toMjml(getPuck().appState.data as EmailDocument)).toThrow(
          /at most 8 nested rows/,
        );
        await pause();
        await act(async () => getPuck().history.back());
        expect(value).toEqual(beforeLimit);
        expect(container.querySelector(".pm-intrinsic-error")).toBeNull();
      }
    },
  );

  it.each([false, true])(
    "inherits Raw trust constraints from the actual config: %s",
    async (trusted) => {
      const operations = await mount(createEmailConfig(undefined, trusted));
      expect(operations.model().destinations[0].types.some((type) => type.name === "Raw")).toBe(
        trusted,
      );
      expect(await run(() => operations.add("root:sections", "Raw"))).toBe(trusted);
    },
  );

  it("reorders only the selected block's current slot and preserves selection, undo, redo, and host echoes", async () => {
    const operations = await mount(createEmailConfig(), dataWith(section("one"), section("two")));
    await select("one-a");
    const initial = structuredClone(getPuck().appState.data);
    expect(operations.model().selected).toMatchObject({ id: "one-a", earlier: false, later: true });
    expect(await run(() => operations.move("one-a", 1))).toBe(true);
    expect(getPuck().getSelectorForId("one-a")).toEqual({ index: 1, zone: "one:column" });
    expect(getPuck().selectedItem?.props.id).toBe("one-a");
    expect(
      getPuck()
        .getItemById("two")!
        .props.column.map((item: { props: { id: string } }) => item.props.id),
    ).toEqual(["two-a", "two-b"]);
    const changed = structuredClone(value);
    await pause();
    await act(async () => getPuck().history.back());
    expect(value).toEqual(initial);
    await act(async () => getPuck().history.forward());
    expect(value).toEqual(changed);
    expect(getPuck().selectedItem?.props.id).toBe("one-a");
    expect(await run(() => operations.move("one-a", 1))).toBe(false);
    expect(await run(() => operations.move("one-a", -1))).toBe(true);
  });

  it("uses current indices after external reorder and refuses removed/stale destinations and changed selections", async () => {
    const operations = await mount(createEmailConfig(), dataWith(section("one"), section("two")));
    await select("one-a");
    await act(async () =>
      getPuck().dispatch({
        type: "reorder",
        sourceIndex: 0,
        destinationIndex: 1,
        destinationZone: "root:sections",
      }),
    );
    expect(await run(() => operations.add("one:column", "Text"))).toBe(true);
    expect(getPuck().getSelectorForId("one")!.index).toBe(1);
    expect(getPuck().getItemById("one")!.props.column).toHaveLength(3);
    await select("one-a");
    await act(async () =>
      getPuck().dispatch({
        type: "reorder",
        sourceIndex: 0,
        destinationIndex: 1,
        destinationZone: "one:column",
      }),
    );
    // Puck's old index now selects one-b. A stale rendered action must not move one-a.
    expect(await run(() => operations.move("one-a", -1))).toBe(false);
    await select("one-a");
    expect(await run(() => operations.move("one-a", -1))).toBe(true);
    await act(async () => getPuck().dispatch({ type: "remove", index: 1, zone: "root:sections" }));
    const before = actions.length;
    expect(await run(() => operations.add("one:column", "Text"))).toBe(false);
    expect(await run(() => operations.move("one-a", 1))).toBe(false);
    expect(actions).toHaveLength(before);
  });

  it.each(["insert", "root", "owner", "ancestor", "subtree", "neighbor", "drag"])(
    "protects %s permissions and structural locks",
    async (lock) => {
      const config = createEmailConfig();
      const data = dataWith(section("one"), section("two"));
      if (lock === "insert") config.components.Text.permissions = { insert: false };
      if (lock === "root") config.root!.permissions = { edit: false };
      if (lock === "owner")
        (data.root.props!.sections as ComponentData[])[0].readOnly = { column: true };
      if (lock === "ancestor") data.root.readOnly = { "sections.*.column": true };
      if (lock === "subtree")
        (data.root.props!.sections as ComponentData[])[0].props.column[0].readOnly = {
          content: true,
        };
      if (lock === "neighbor")
        (data.root.props!.sections as ComponentData[])[0].props.column[1].readOnly = {
          content: true,
        };
      if (lock === "drag") config.components.Text.permissions = { drag: false };
      const operations = await mount(config, data);
      if (["insert", "root", "owner", "ancestor"].includes(lock))
        expect(await run(() => operations.add("one:column", "Text"))).toBe(false);
      if (lock !== "insert") {
        await select("one-a");
        expect(await run(() => operations.move("one-a", 1))).toBe(false);
      }
      if (lock === "subtree" || lock === "neighbor") {
        await select("one");
        expect(await run(() => operations.move("one", 1))).toBe(false);
      }
    },
  );

  it("protects global permissions and rejects active dragging", async () => {
    const operations = await mount(createEmailConfig(), dataWith(section("one")), {
      insert: false,
      drag: false,
    });
    expect(operations.model().destinations).toEqual([]);
    await select("one-a");
    expect(await run(() => operations.move("one-a", 1))).toBe(false);
    await act(async () => getPuck().dispatch({ type: "setUi", ui: { isDragging: true } }));
    expect(operations.model().reason).toBeTruthy();
  });

  it.each([
    "unknown",
    "dynamic-slot",
    "dynamic-leaf",
    "dynamic-permission",
    "dynamic-data",
    "nested-slot",
  ])("fails closed for %s configurations", async (kind) => {
    const config = createEmailConfig();
    if (kind === "unknown") config.components.HostBlock = { render: () => <div /> };
    if (kind === "dynamic-slot")
      config.components.Section1.resolveFields = (_, { fields }) => fields;
    if (kind === "dynamic-leaf")
      config.components.Text.resolveFields = (_, { fields }) => ({
        ...fields,
        hiddenSlot: { type: "slot", allow: ["Raw"] },
      });
    if (kind === "dynamic-permission")
      config.components.Section1.resolvePermissions = async () => ({ edit: true });
    if (kind === "dynamic-data") config.components.Section1.resolveData = (data) => data;
    if (kind === "nested-slot")
      config.components.Section1.fields!.extra = {
        type: "object",
        objectFields: { nested: { type: "slot" } },
      };
    const operations = await mount(config, dataWith(section("one")));
    expect(await run(() => operations.add("one:column", "Text"))).toBe(false);
    await select("one-a");
    expect(await run(() => operations.move("one-a", 1))).toBe(false);
  });

  it("rejects a config identity mismatch and a replacement document without the saved destination", async () => {
    const config = createEmailConfig();
    const operations = await mount(config, dataWith(section("one")));
    const mismatch = createBlockOperations(() => getPuck(), policies.get(createEmailConfig())!);
    expect(mismatch.model().destinations).toEqual([]);
    const next = createEmptyDocument() as Data;
    next.root.props!.replacementKey = "new";
    await act(async () => replace(next));
    expect(await run(() => operations.add("one:column", "Text"))).toBe(false);
  });

  it.each(["root-child", "nested-child", "intrinsic-row-child", "intrinsic-cell-child"])(
    "refuses existing invalid %s placement without changing the document",
    async (placement) => {
      let data =
        placement === "root-child"
          ? dataWith(text("bad"), section("one"))
          : dataWith(
              {
                type: "Section1",
                props: {
                  id: "one",
                  column: [{ type: "Column", props: { id: "bad", content: [] } }],
                },
              },
              section("two"),
            );
      if (placement.startsWith("intrinsic")) {
        const invalid: ComponentData =
          placement === "intrinsic-row-child"
            ? text("bad")
            : {
                type: "IntrinsicCell",
                props: {
                  id: "bad-cell",
                  content: [{ type: "Raw", props: { id: "bad", html: "<p>Untrusted</p>" } }],
                },
              };
        data = dataWith(
          {
            type: "Section1",
            props: {
              id: "one",
              column: [{ type: "IntrinsicRow", props: { id: "bad-row", cells: [invalid] } }],
            },
          },
          section("two"),
        );
      }
      const operations = await mount(createEmailConfig(), data);
      await select("one");
      const before = structuredClone(getPuck().appState.data);
      const count = actions.length;
      expect(operations.model().destinations).toEqual([]);
      expect(await run(() => operations.add("root:sections", "Section1"))).toBe(false);
      expect(await run(() => operations.move("one", -1))).toBe(false);
      expect(await run(() => operations.move("one", 1))).toBe(false);
      expect(actions).toHaveLength(count);
      expect(getPuck().appState.data).toEqual(before);
    },
  );

  it("rejects malformed root and subtree readOnly records instead of interpreting them as unlocked", async () => {
    const operations = await mount(createEmailConfig(), dataWith(section("one"), section("two")));
    for (const invalid of [null, true, false, 1, [], { column: "locked" }]) {
      for (const location of ["root", "subtree"]) {
        const data = dataWith(section("one"), section("two"));
        if (location === "root") data.root.readOnly = invalid as never;
        else (data.root.props!.sections as ComponentData[])[0].readOnly = invalid as never;
        await act(async () => getPuck().dispatch({ type: "setData", data, recordHistory: false }));
        await select("one");
        const before = structuredClone(getPuck().appState.data);
        const count = actions.length;
        expect(await run(() => operations.add("root:sections", "Section1"))).toBe(false);
        expect(await run(() => operations.move("one", 1))).toBe(false);
        expect(actions).toHaveLength(count);
        expect(getPuck().appState.data).toEqual(before);
      }
    }
  });

  it.each([
    ["fluid-height", false],
    ["fixed-height", false],
    ["fluid-height", true],
    ["fixed-height", true],
  ] as const)(
    "attests Hero static slots in %s mode with Raw trust=%s, preserving insertion, move and history",
    async (mode, trusted) => {
      const config = createEmailConfig(undefined, trusted);
      const operations = await mount(config, dataWith(section("one", [])));
      expect(await run(() => operations.add("root:sections", "Hero"))).toBe(true);
      const heroId = getPuck().selectedItem!.props.id;
      expect(getPuck().selectedItem!.props.mode).toBe("fluid-height");
      expect(getPuck().selectedItem!.props.content).toEqual([]);
      expect(operations.model().destinations.some((zone) => zone.id === `${heroId}:content`)).toBe(
        true,
      );
      if (mode === "fixed-height") {
        await act(async () =>
          getPuck().dispatch({
            type: "replace",
            destinationIndex: 1,
            destinationZone: "root:sections",
            data: { ...getPuck().selectedItem!, props: { ...getPuck().selectedItem!.props, mode } },
          }),
        );
      }
      const fields = config.components.Hero.fields!;
      const resolved = await config.components.Hero.resolveFields!(getPuck().getItemById(heroId)!, {
        changed: {},
        fields,
        lastFields: fields,
        lastData: null,
        metadata: {},
        appState: getPuck().appState,
        parent: null,
      });
      expect(resolved.content).toBe(fields.content);
      expect(resolved.height.visible).toBe(mode === "fixed-height");
      expect(await run(() => operations.add(`${heroId}:content`, "Text"))).toBe(true);
      expect(await run(() => operations.add(`${heroId}:content`, "Raw"))).toBe(trusted);
      await pause();
      await select(heroId);
      const before = structuredClone(getPuck().appState.data);
      expect(await run(() => operations.move(heroId, -1))).toBe(true);
      expect(getPuck().getSelectorForId(heroId)).toEqual({ index: 0, zone: "root:sections" });
      expect(getPuck().selectedItem!.props.id).toBe(heroId);
      await pause();
      await act(async () => getPuck().history.back());
      expect(value).toEqual(before);
      await act(async () => getPuck().history.forward());
      expect(getPuck().selectedItem!.props.id).toBe(heroId);
      expect(getPuck().getSelectorForId(heroId)!.index).toBe(0);
    },
  );

  it.each(["owner", "ancestor", "subtree", "permission"])(
    "does not let the Hero attestation bypass %s locks",
    async (lock) => {
      const config = createEmailConfig();
      const hero: ComponentData = { type: "Hero", props: { id: "hero", content: [text("copy")] } };
      const data = dataWith(hero, section("one", []));
      if (lock === "owner") hero.readOnly = { content: true };
      if (lock === "ancestor") data.root.readOnly = { sections: true };
      if (lock === "subtree") hero.props.content[0].readOnly = { content: true };
      if (lock === "permission") config.components.Hero.permissions = { edit: false };
      const operations = await mount(config, data);
      await select("hero");
      expect(await run(() => operations.move("hero", 1))).toBe(false);
      if (lock !== "subtree")
        expect(await run(() => operations.add("hero:content", "Text"))).toBe(false);
    },
  );

  it("rejects forged, mismatched, absent and stale policies plus altered factory callbacks/slot rules", async () => {
    const config = createEmailConfig();
    const operations = await mount(config, dataWith(section("one"), section("two")));
    await select("one");
    const policy = policies.get(config)!;
    const other = createEmailEditorConfig();
    for (const invalid of [undefined, null, {}, { ...policy }, other.blockOperationsPolicy]) {
      const rejected = createBlockOperations(() => getPuck(), invalid as BlockOperationsPolicy);
      expect(rejected.model().destinations).toEqual([]);
      expect(await run(() => rejected.add("root:sections", "Hero"))).toBe(false);
    }
    const publicConfig = createPublicConfig();
    expect(
      createBlockOperations(() => ({ ...getPuck(), config: publicConfig }), policy).model()
        .destinations,
    ).toEqual([]);
    const hero = config.components.Hero;
    const slot = hero.fields!.content as Extract<Field, { type: "slot" }>;
    const changes: (() => () => void)[] = [
      () => {
        const image = config.components.Image;
        const previous = image.resolveFields;
        image.resolveFields = (_, { fields }) => fields;
        return () => {
          image.resolveFields = previous;
        };
      },
      () => {
        config.components.Image.fields!.hiddenSlot = { type: "slot", allow: ["Raw"] };
        return () => {
          delete config.components.Image.fields!.hiddenSlot;
        };
      },
      () => {
        const field = config.components.IntrinsicCell.fields!.content as Extract<
          Field,
          { type: "slot" }
        >;
        field.allow!.push("Raw");
        return () => {
          field.allow!.pop();
        };
      },
      () => {
        const defaults = config.components.IntrinsicRow.defaultProps!;
        const previous = defaults.cells;
        defaults.cells = [{ type: "IntrinsicCell", props: { id: "seeded", content: [] } }];
        return () => {
          defaults.cells = previous;
        };
      },
      () => {
        const defaults = config.components.Section1.defaultProps!;
        const previous = defaults.column;
        defaults.column = [{ type: "Raw", props: { id: "unsafe-default", html: "<p>x</p>" } }];
        return () => {
          defaults.column = previous;
        };
      },
      () => {
        const previous = hero.render;
        hero.render = () => <div />;
        return () => {
          hero.render = previous;
        };
      },
      () => {
        const previous = config.root!.render;
        config.root!.render = () => <div />;
        return () => {
          config.root!.render = previous;
        };
      },
      () => {
        const previous = hero.resolveFields;
        hero.resolveFields = (_, { fields }) => fields;
        return () => {
          hero.resolveFields = previous;
        };
      },
      () => {
        const previous = slot.allow![0];
        slot.allow![0] = "Raw";
        return () => {
          slot.allow![0] = previous;
        };
      },
      () => {
        const previous = hero.fields!.content;
        hero.fields!.content = { ...slot };
        return () => {
          hero.fields!.content = previous;
        };
      },
      () => {
        hero.fields!.extraSlot = { type: "slot", allow: ["Raw"] };
        return () => {
          delete hero.fields!.extraSlot;
        };
      },
    ];
    for (const change of changes) {
      const restore = change();
      const before = structuredClone(getPuck().appState.data);
      const count = actions.length;
      expect(operations.model().destinations).toEqual([]);
      expect(await run(() => operations.add("root:sections", "Hero"))).toBe(false);
      expect(await run(() => operations.add("root:sections", "Section1"))).toBe(false);
      expect(await run(() => operations.move("one", 1))).toBe(false);
      expect(actions).toHaveLength(count);
      expect(getPuck().appState.data).toEqual(before);
      restore();
      expect(operations.model().destinations.length).toBeGreaterThan(0);
    }
    const next = createEmptyDocument() as Data;
    next.root.props!.replacementKey = "stale-policy-document";
    await act(async () => replace(next));
    // The config instance is reused by this test host, but the old destination is gone.
    expect(await run(() => operations.add("one:column", "Text"))).toBe(false);
  });

  it("keeps panel focus, labels, status, and destination intent without changing the native canvas", async () => {
    await mount();
    expect(container.querySelector("details .pm-block-operations-panel")).toBeNull();
    await act(async () => {
      container.querySelector("details")!.open = true;
      container.querySelector("details")!.dispatchEvent(new Event("toggle"));
    });
    const selectBlock = container.querySelectorAll("select")[1];
    expect(container.querySelector(`label[for="${CSS.escape(selectBlock.id)}"]`)!.textContent).toBe(
      "Block",
    );
    await act(async () => {
      selectBlock.value = "Section1";
      selectBlock.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const add = container.querySelector<HTMLButtonElement>(".pm-block-operations-add button")!;
    add.focus();
    await act(async () => add.click());
    expect(document.activeElement).toBe(add);
    expect(container.querySelector('[role="status"]')!.textContent).toContain(
      "added to Email / Sections",
    );
    expect(container.querySelector(".pm-section")).not.toBeNull();
    await act(async () => add.click());
    const selected = getPuck().selectedItem!;
    const earlier = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Move earlier",
    )!;
    earlier.focus();
    await act(async () => earlier.click());
    expect(document.activeElement).toBe(earlier);
    expect(getPuck().selectedItem!.props.id).toBe(selected.props.id);
    expect(container.querySelector('[role="status"]')!.textContent).toContain("moved earlier");
    expect(earlier.getAttribute("aria-disabled")).toBe("true");
    expect(earlier.disabled).toBe(false);
    const before = structuredClone(getPuck().appState.data);
    await act(async () => earlier.click());
    expect(document.activeElement).toBe(earlier);
    expect(getPuck().appState.data).toEqual(before);
  });
});
