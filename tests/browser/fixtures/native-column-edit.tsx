import { Puck, createUsePuck, type Data } from "@puckeditor/core";
import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { createEmailConfig } from "../../../src/config";
import {
  createNativeDragPreview,
  NativeDragPreviewProvider,
} from "../../../src/native-drag-preview";
import { EmailEditor } from "../../../src/EmailEditor";
import { compileEmail } from "../../../src/export";
import { fromMjml } from "../../../src/import";
import type { EmailBlock, EmailDocument } from "../../../src/types";
import "@puckeditor/core/puck.css";
import "../../../src/style.css";

import { columnEditSource as source } from "./native-column-edit-source";
const query = new URLSearchParams(window.location.search);
const direction = query.get("dir") === "rtl" ? "rtl" : "ltr";
const usePuck = createUsePuck();
function Controls({ replace }: { replace: (value: EmailDocument) => void }) {
  const api = usePuck((state) => state);
  function align(value: string) {
    const current = api.appState.data as EmailDocument;
    const sections = current.root.props!.sections!.map((section, index) =>
      index
        ? section
        : {
            ...section,
            props: {
              ...section.props,
              columns: (section.props.columns as EmailBlock[]).map((block) =>
                block.type !== "Group"
                  ? block
                  : {
                      ...block,
                      props: {
                        ...block.props,
                        mjmlAttributes: [
                          ...(block.props.mjmlAttributes ?? []).filter(
                            (entry) => entry.name !== "vertical-align",
                          ),
                          value
                            ? { name: "vertical-align", value }
                            : { name: "vertical-align", inherit: true },
                        ],
                      },
                    },
              ),
            },
          },
    );
    api.dispatch({
      type: "replaceRoot",
      root: {
        ...current.root,
        props: { ...current.root.props, sections },
      } as typeof api.appState.data.root,
      recordHistory: true,
    });
  }
  return (
    <>
      <output aria-label="History index">{api.history.index}</output>
      <output aria-label="Drag state">{String(api.appState.ui.isDragging)}</output>
      <output aria-label="Document column order" hidden>
        {JSON.stringify(
          (api.appState.data as EmailDocument).root.props?.sections?.map((section) =>
            (section.props.columns as EmailBlock[]).map(
              (column) => column.props.cssClass || "inserted",
            ),
          ),
        )}
      </output>
      {["top", "middle", "bottom", ""].map((value) => (
        <button key={value} onClick={() => align(value)}>
          Align {value || "default"}
        </button>
      ))}
      <button
        onClick={() =>
          api.dispatch({
            type: "setUi",
            ui: {
              itemSelector: {
                index: 0,
                zone: `${(api.appState.data as EmailDocument).root.props!.sections![0].props.id}:columns`,
              },
            },
          })
        }
      >
        Select first column
      </button>
      <button onClick={() => replace(fromMjml(source("bottom", direction)).document)}>
        Replace source
      </button>
    </>
  );
}
function Fixture() {
  const bridge = useMemo(createNativeDragPreview, []);
  const config = useMemo(() => {
    const config = createEmailConfig(undefined, true);
    if (query.has("locked")) config.components.Column.permissions = { drag: false };
    return config;
  }, []);
  useEffect(() => () => bridge.reset(), [bridge]);
  const [value, setValue] = useState(() => fromMjml(source("top", direction)).document);
  const [html, setHtml] = useState("");
  const [status, setStatus] = useState("compiling");
  useEffect(() => {
    let current = true;
    setStatus("compiling");
    compileEmail(value, { allowRawHtml: true }).then((result) => {
      if (!current) return;
      setHtml(result.html);
      setStatus(result.errors.length ? "compile errors" : "ready");
    });
    return () => {
      current = false;
    };
  }, [value]);
  return (
    <>
      <output aria-label="Compilation status">{status}</output>
      {query.has("direct") ? (
        <NativeDragPreviewProvider bridge={bridge}>
          <Puck
            config={config}
            data={value as Data}
            onChange={(next) => setValue(next as EmailDocument)}
            onAction={bridge.onAction}
            dnd={{ enableDragHandle: true }}
            viewports={[
              { width: 800, label: "Desktop" },
              { width: 390, label: "Mobile" },
            ]}
            overrides={{ headerActions: () => <Controls replace={setValue} /> }}
          />
        </NativeDragPreviewProvider>
      ) : (
        <EmailEditor
          value={value}
          onChange={setValue}
          allowRawHtml
          headerActions={<Controls replace={setValue} />}
        />
      )}
      <iframe
        id="compiled"
        title="Compiled email"
        sandbox=""
        srcDoc={html}
        style={{ width: 800, height: 600, border: 0 }}
      />
    </>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
