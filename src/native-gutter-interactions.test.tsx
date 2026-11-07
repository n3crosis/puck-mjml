// @vitest-environment happy-dom
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Puck, createUsePuck, type Data, type PuckApi } from "@puckeditor/core";
import { afterEach, describe, expect, it } from "vitest";
import { createEmailConfig } from "./config";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const usePuck = createUsePuck();
let root: Root | undefined;
let container: HTMLDivElement | undefined;
let api: PuckApi | undefined;

function CaptureApi() {
  const current = usePuck((state) => state);
  useEffect(() => {
    api = current;
  }, [current]);
  return null;
}

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  api = undefined;
});

async function edit(action: () => void) {
  await act(async () => {
    action();
    // Puck commits its public history after a 250ms debounce.
    await new Promise((resolve) => setTimeout(resolve, 300));
  });
}

describe("native gutter editing", () => {
  it("recalculates sibling gutters after insert, reorder, remove, undo, and redo", async () => {
    const config = createEmailConfig();
    config.components.Column.defaultProps = {
      ...config.components.Column.defaultProps,
      cssClass: "column-c",
      mjmlAttributes: [{ name: "width", value: "200px" }],
    };
    const data = {
      root: {
        props: {
          width: 600,
          sections: [
            {
              type: "Section",
              props: {
                id: "section",
                padding: "0px",
                mjmlAttributes: [{ name: "gutter", value: "18px" }],
                columns: [
                  {
                    type: "Column",
                    props: { id: "column-a", cssClass: "column-a", content: [] },
                  },
                  {
                    type: "Column",
                    props: { id: "column-b", cssClass: "column-b", content: [] },
                  },
                ],
              },
            },
          ],
        },
      },
      content: [],
    } as Data;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(
        <Puck config={config} data={data} iframe={{ enabled: false }}>
          <CaptureApi />
          <Puck.Preview />
        </Puck>,
      );
    });
    const columns = () => [...container!.querySelectorAll<HTMLElement>(".pm-flex-column")];
    const snapshot = () =>
      columns().map((column) => ({
        name: [...column.classList].find((name) => name.startsWith("column-")),
        width: column.style.width,
        left: column.style.paddingLeft,
        right: column.style.paddingRight,
        mobile: column.style.getPropertyValue("--pm-gutter-mobile-padding"),
      }));
    expect(api).toBeDefined();
    expect(snapshot()).toEqual([
      { name: "column-a", width: "191px", left: "0px", right: "9px", mobile: "0% 0 1.5% 0" },
      { name: "column-b", width: "191px", left: "9px", right: "0px", mobile: "1.5% 0 0% 0" },
    ]);

    await edit(() =>
      api!.dispatch({
        type: "insert",
        componentType: "Column",
        id: "column-c",
        destinationIndex: 1,
        destinationZone: "section:columns",
      }),
    );
    expect(snapshot()).toEqual([
      { name: "column-a", width: "188px", left: "0px", right: "9px", mobile: "0% 0 1.5% 0" },
      { name: "column-c", width: "188px", left: "9px", right: "9px", mobile: "1.5% 0 1.5% 0" },
      { name: "column-b", width: "188px", left: "9px", right: "0px", mobile: "1.5% 0 0% 0" },
    ]);

    await edit(() =>
      api!.dispatch({
        type: "reorder",
        sourceIndex: 1,
        destinationIndex: 2,
        destinationZone: "section:columns",
      }),
    );
    const reordered = snapshot();
    expect(reordered.map(({ name, width }) => [name, width])).toEqual([
      ["column-a", "188px"],
      ["column-b", "188px"],
      ["column-c", "188px"],
    ]);
    expect(reordered[2].right).toBe("0px");
    expect(reordered[2].mobile).toBe("1.5% 0 0% 0");

    await edit(() => api!.dispatch({ type: "remove", index: 0, zone: "section:columns" }));
    const removed = snapshot();
    expect(removed.map(({ name, width }) => [name, width])).toEqual([
      ["column-b", "191px"],
      ["column-c", "191px"],
    ]);
    expect(removed[0].left).toBe("0px");
    expect(removed[0].mobile).toBe("0% 0 1.5% 0");

    expect(api!.history.hasPast).toBe(true);
    await edit(() => api!.history.back());
    expect(snapshot()).toEqual(reordered);
    expect(api!.history.hasFuture).toBe(true);
    await edit(() => api!.history.forward());
    expect(snapshot()).toEqual(removed);
  });
});
