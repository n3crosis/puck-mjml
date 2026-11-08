import { Puck, Render, createUsePuck, type Data } from "@puckeditor/core";
import { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { createEmailConfig } from "../../../src/config";
import { EmailEditor } from "../../../src/EmailEditor";
import { compileEmail, toMjml } from "../../../src/export";
import {
  createNativeDragPreview,
  NativeDragPreviewProvider,
} from "../../../src/native-drag-preview";
import type { EmailDocument } from "../../../src/types";
import { createIntrinsicLayoutDocument, intrinsicReplacementUrl } from "./intrinsic-layout-data";
import { intrinsicLayoutOracle } from "./intrinsic-layout-oracle";
import "@puckeditor/core/puck.css";
import "../../../src/style.css";

const query = new URLSearchParams(window.location.search);
const config = createEmailConfig();
const usePuck = createUsePuck();

function Evidence({
  pendingUpload,
  completeUpload,
}: {
  pendingUpload?: boolean;
  completeUpload?: () => void;
}) {
  const api = usePuck((state) => state);
  const committed = api.history.histories[api.history.index]?.state.data;
  const committedMjml = useMemo(() => {
    if (!committed) return "";
    try {
      return toMjml(committed as EmailDocument);
    } catch {
      // Intermediate input can legitimately be invalid, including in history.
      // Keep evidence mounted until a valid final document is committed.
      return "";
    }
  }, [committed]);
  function updateSibling(content: string) {
    // A host/plugin update must not change the selected Image or cancel its
    // upload. Clicking a sibling's inline editor would intentionally select
    // Text and unmount the image field, which is a different cancellation case.
    const item = api.getItemById("stack-long");
    const selector = api.getSelectorForId("stack-long");
    if (!item || !selector) throw new Error("Missing intrinsic sibling Text");
    api.dispatch({
      type: "replace",
      destinationIndex: selector.index,
      destinationZone: selector.zone,
      data: { ...item, props: { ...item.props, content: `<p>${content}</p>` } },
      ui: { itemSelector: api.appState.ui.itemSelector },
      recordHistory: true,
    });
  }
  function updateNativeHead(valid: boolean) {
    const root = (api.appState.data as EmailDocument).root;
    api.dispatch({
      type: "replaceRoot",
      root: {
        ...root,
        props: {
          ...root.props,
          mjmlClasses: [{ name: valid ? "valid-fixture" : "", attributes: [] }],
        },
      } as typeof api.appState.data.root,
      ui: { itemSelector: api.appState.ui.itemSelector },
      recordHistory: true,
    });
  }
  return (
    <>
      <output aria-label="History index" hidden>
        {api.history.index}
      </output>
      <output aria-label="Current history MJML" hidden>
        {committedMjml}
      </output>
      <output aria-label="Drag state" hidden>
        {String(api.appState.ui.isDragging)}
      </output>
      <output aria-label="Selected block type" hidden>
        {api.selectedItem?.type ?? "none"}
      </output>
      <output aria-label="Selected block ID" hidden>
        {api.selectedItem?.props.id ?? "none"}
      </output>
      {completeUpload && (
        <>
          <button onClick={() => updateSibling("Sibling changed while upload was pending")}>
            Update sibling text
          </button>
          <button onClick={() => updateSibling("x".repeat(64 * 1024 + 1))}>
            Exceed sibling text budget
          </button>
          <button disabled={!pendingUpload} onClick={completeUpload}>
            Complete pending upload
          </button>
          <button onClick={() => updateNativeHead(false)}>Set invalid native head</button>
          <button onClick={() => updateNativeHead(true)}>Correct native head</button>
        </>
      )}
    </>
  );
}

function Fixture() {
  const [value, setValue] = useState(createIntrinsicLayoutDocument);
  const [html, setHtml] = useState("");
  const [status, setStatus] = useState("compiling");
  const [upload, setUpload] = useState("");
  const [pendingUpload, setPendingUpload] = useState(false);
  const uploadCompletion = useRef<((source: string) => void) | null>(null);
  const source = useMemo(() => {
    try {
      return { mjml: toMjml(value), error: "" };
    } catch (cause) {
      // Invalid intermediate URL typing and deliberate over-budget host edits
      // must remain editable instead of crashing this fixture's evidence UI.
      return { mjml: "", error: cause instanceof Error ? cause.message : "Export failed" };
    }
  }, [value]);
  const bridge = useMemo(createNativeDragPreview, []);
  useEffect(() => () => bridge.reset(), [bridge]);
  useEffect(() => {
    let current = true;
    setStatus("compiling");
    compileEmail(value).then(
      (result) => {
        if (!current) return;
        setHtml(result.html);
        setStatus(result.errors.length ? JSON.stringify(result.errors) : "ready");
      },
      (error: unknown) => {
        if (current) setStatus(error instanceof Error ? error.message : "compile failed");
      },
    );
    return () => {
      current = false;
    };
  }, [value]);
  return (
    <>
      <output aria-label="Compilation status">{status}</output>
      <output aria-label="Exported MJML" hidden>
        {source.mjml}
      </output>
      <output aria-label="Export error" hidden>
        {source.error}
      </output>
      <output aria-label="Host document" hidden>
        {JSON.stringify(value)}
      </output>
      <output aria-label="Uploaded file" hidden>
        {upload}
      </output>
      {query.has("editor") ? (
        <div style={{ height: "calc(100vh - 24px)" }}>
          <EmailEditor
            value={value}
            onChange={setValue}
            headerActions={
              <Evidence
                pendingUpload={pendingUpload}
                completeUpload={() => {
                  const complete = uploadCompletion.current;
                  uploadCompletion.current = null;
                  setPendingUpload(false);
                  complete?.(intrinsicReplacementUrl);
                }}
              />
            }
            onUploadImage={async (file) => {
              const bytes = await file.arrayBuffer();
              setUpload(`${file.name}:${bytes.byteLength}`);
              return new Promise<string>((resolve) => {
                uploadCompletion.current = resolve;
                setPendingUpload(true);
              });
            }}
          />
        </div>
      ) : (
        <section aria-label="Canvas">
          {query.has("editing") ? (
            <NativeDragPreviewProvider bridge={bridge}>
              <Puck
                config={config}
                data={value as Data}
                onChange={(next) => setValue(next as EmailDocument)}
                onAction={bridge.onAction}
                iframe={{ enabled: false }}
              >
                <Evidence />
                <Puck.Preview />
              </Puck>
            </NativeDragPreviewProvider>
          ) : (
            <Render config={config} data={value as Data} />
          )}
        </section>
      )}
      <iframe
        id="compiled"
        title="Compiled email"
        sandbox=""
        srcDoc={html}
        style={{ display: "block", width: "100%", height: 1600, border: 0 }}
      />
      <iframe
        id="oracle"
        title="Independent HTML table oracle"
        sandbox=""
        srcDoc={intrinsicLayoutOracle()}
        style={{ display: "block", width: "100%", height: 1600, border: 0 }}
      />
    </>
  );
}

createRoot(document.getElementById("root")!).render(<Fixture />);
