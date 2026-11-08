import { Puck, Render, createUsePuck, type Data } from "@puckeditor/core";
import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { createEmailConfig } from "../../../src/config";
import { compileEmail, toMjml } from "../../../src/export";
import { fromMjml } from "../../../src/import";
import {
  createNativeDragPreview,
  NativeDragPreviewProvider,
} from "../../../src/native-drag-preview";
import type { EmailDocument } from "../../../src/types";
import { intrinsicLayoutSource } from "./native-intrinsic-layout-source";
import "@puckeditor/core/puck.css";
import "../../../src/style.css";

const config = createEmailConfig();
// Match EmailEditor's imported-document initialization: omitted root controls
// are inheritance, not visual defaults to insert into Puck's initial history.
if (config.root) config.root.defaultProps = undefined;
const initial = fromMjml(intrinsicLayoutSource()).document;
const editing = new URLSearchParams(window.location.search).has("editing");
const usePuck = createUsePuck();
function History() {
  const api = usePuck((state) => state);
  return (
    <>
      <button onClick={() => api.history.back()}>Undo change</button>
      <button onClick={() => api.history.forward()}>Redo change</button>
      <output aria-label="History index">{api.history.index}</output>
      <output aria-label="Editor MJML" hidden>
        {toMjml(api.appState.data as EmailDocument)}
      </output>
    </>
  );
}
function Fixture() {
  const [value, setValue] = useState(initial);
  const [html, setHtml] = useState("");
  const [status, setStatus] = useState("compiling");
  const bridge = useMemo(createNativeDragPreview, []);
  useEffect(() => () => bridge.reset(), [bridge]);
  useEffect(() => {
    let current = true;
    setStatus("compiling");
    compileEmail(value).then((result) => {
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
      <output aria-label="Exported MJML" hidden>
        {toMjml(value)}
      </output>
      <section aria-label="Canvas">
        {editing ? (
          <NativeDragPreviewProvider bridge={bridge}>
            <Puck
              config={config}
              data={value as Data}
              onChange={(next) => setValue(next as EmailDocument)}
              onAction={bridge.onAction}
              iframe={{ enabled: false }}
            >
              <History />
              <Puck.Preview />
            </Puck>
          </NativeDragPreviewProvider>
        ) : (
          <Render config={config} data={value as Data} />
        )}
      </section>
      <iframe
        id="compiled"
        title="Compiled email"
        sandbox=""
        srcDoc={html}
        style={{ display: "block", width: "100%", height: 600, border: 0 }}
      />
    </>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
