import { Render, type Data } from "@puckeditor/core";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { createEmailConfig } from "../../../src/config";
import { compileEmail } from "../../../src/export";
import { fromMjml } from "../../../src/import";
import { scopeDocumentCss } from "../../../src/canvas-css";
import { nestedIsolationCss, rootCascadeCases, rootCascadeSource } from "./canvas-css-root-source";
import "../../../src/style.css";

const cases = rootCascadeCases.map((entry) => ({
  ...entry,
  document: fromMjml(rootCascadeSource(entry.css)).document,
}));
const isolation = scopeDocumentCss([{ css: nestedIsolationCss }], { scope: "pm-canvas-isolation" });

function Fixture() {
  const [compiled, setCompiled] = useState<string[]>([]);
  const [status, setStatus] = useState("compiling");
  useEffect(() => {
    Promise.all(cases.map((entry) => compileEmail(entry.document)))
      .then((results) => {
        setCompiled(results.map((result) => result.html));
        setStatus(results.some((result) => result.errors.length) ? "compile errors" : "ready");
      })
      .catch(() => setStatus("compile failed"));
  }, []);
  return (
    <>
      <output aria-label="Compilation status">{status}</output>
      {cases.map((entry, index) => (
        <section key={entry.id} data-case={entry.id}>
          <section aria-label="Canvas">
            <Render config={createEmailConfig()} data={entry.document as Data} />
          </section>
          <iframe
            title={`Compiled ${entry.id}`}
            sandbox=""
            srcDoc={compiled[index] ?? ""}
            style={{ display: "block", width: "100vw", height: 50, border: 0 }}
          />
        </section>
      ))}
      <section aria-label="Isolation" style={{ containerType: "inline-size" }}>
        <style>{isolation.css}</style>
        <div id="host-before" className="escape">
          Host before
        </div>
        <div className="pm-canvas pm-canvas-isolation" data-ready="yes">
          <div id="supported" className="supported">
            Supported nesting
          </div>
          <div className="safe">First</div>
          <div id="peer" className="peer">
            Contained sibling
          </div>
          <div id="conditional" className="conditional">
            Conditional nesting
          </div>
          <div id="invalid-list" className="invalid-list">
            Invalid selector list
          </div>
          <div className="pm-canvas pm-canvas-inner">
            <div id="nested-target" className="nested-target">
              Nested editor boundary
            </div>
          </div>
        </div>
        <div id="host-after" className="escape">
          Host after
        </div>
        <div className="pm-canvas pm-canvas-sibling sibling-editor">
          <div id="sibling-target" className="escape">
            Sibling editor
          </div>
        </div>
        <output aria-label="Isolation warnings">{isolation.notes.join("\n")}</output>
      </section>
    </>
  );
}

createRoot(window.document.getElementById("root")!).render(<Fixture />);
