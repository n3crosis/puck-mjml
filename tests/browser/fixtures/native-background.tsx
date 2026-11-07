import { createUsePuck } from "@puckeditor/core";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { EmailEditor } from "../../../src/EmailEditor";
import { compileEmail } from "../../../src/export";
import { fromMjml } from "../../../src/import";
import type { EmailDocument } from "../../../src/types";
import { backgroundSource, type BackgroundState } from "./native-background-source";
import "@puckeditor/core/puck.css";
import "../../../src/style.css";

const usePuck = createUsePuck();
function Controls({ replace }: { replace: (value: EmailDocument) => void }) {
  const api = usePuck((state) => state);
  function edit(state: BackgroundState) {
    const next = fromMjml(backgroundSource(state)).document;
    const current = api.appState.data as EmailDocument;
    const root = {
      ...current.root,
      props: {
        ...current.root.props,
        sections: current.root.props!.sections!.map((section, index) =>
          index === 0
            ? {
                ...section,
                // Keep component IDs and children stable. This exercises updates on
                // the mounted section, unlike an import that legitimately remounts it.
                props: {
                  ...section.props,
                  mjmlAttributes: next.root.props!.sections![0].props.mjmlAttributes,
                },
              }
            : section,
        ),
      },
    };
    api.dispatch({
      type: "replaceRoot",
      root: root as typeof api.appState.data.root,
      recordHistory: true,
    });
  }
  return (
    <>
      <output aria-label="History index">{api.history.index}</output>
      <button onClick={() => edit("x")}>Set X override</button>
      <button onClick={() => edit("xy")}>Set both overrides</button>
      <button onClick={() => edit("removed")}>Remove overrides</button>
      <button onClick={() => edit("changed")}>Change position</button>
      <button onClick={() => replace(fromMjml(backgroundSource("replacement")).document)}>
        Replace source
      </button>
    </>
  );
}
function Fixture() {
  const [value, setValue] = useState(() => fromMjml(backgroundSource("initial")).document);
  const [html, setHtml] = useState("");
  const [status, setStatus] = useState("compiling");
  useEffect(() => {
    let current = true;
    setStatus("compiling");
    compileEmail(value).then(
      (result) => {
        if (!current) return;
        setHtml(result.html);
        setStatus(result.errors.length ? "compile errors" : "ready");
      },
      () => {
        if (current) setStatus("compile failed");
      },
    );
    return () => {
      current = false;
    };
  }, [value]);
  return (
    <>
      <output aria-label="Compilation status">{status}</output>
      <EmailEditor
        value={value}
        onChange={setValue}
        headerActions={<Controls replace={setValue} />}
      />
      <iframe
        id="compiled"
        title="Compiled email"
        sandbox=""
        srcDoc={html}
        style={{ width: 390, height: 600, border: 0 }}
      />
    </>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
