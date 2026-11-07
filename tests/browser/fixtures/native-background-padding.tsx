import { Render, type Data } from "@puckeditor/core";
import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { createEmailConfig } from "../../../src/config";
import { compileEmail } from "../../../src/export";
import { fromMjml } from "../../../src/import";
import "../../../src/style.css";

import { backgroundPaddingSource } from "./native-background-padding-source";

const config = createEmailConfig();

function Fixture() {
  const [inset, setInset] = useState(24);
  const [hasBackground, setHasBackground] = useState(true);
  const document = useMemo(
    () => fromMjml(backgroundPaddingSource(inset, hasBackground)).document,
    [inset, hasBackground],
  );
  const other = useMemo(() => {
    const copy = structuredClone(document);
    copy.root.props!.headStyles = [];
    return copy;
  }, [document]);
  const [html, setHtml] = useState("");
  const [status, setStatus] = useState("compiling");
  useEffect(() => {
    let active = true;
    setStatus("compiling");
    compileEmail(document).then(
      (result) => {
        if (!active) return;
        setHtml(result.html);
        setStatus(result.errors.length ? "compile errors" : "ready");
      },
      () => {
        if (active) setStatus("compile failed");
      },
    );
    return () => {
      active = false;
    };
  }, [document]);
  return (
    <>
      <output aria-label="Compilation status">{status}</output>
      <button onClick={() => setInset((value) => (value === 24 ? 18 : 24))}>
        Change CSS inset
      </button>
      <button onClick={() => setHasBackground((value) => !value)}>Toggle background</button>
      <style>{`@media (max-width:600px) { .pm-canvas .specificity:not(table):not(tbody):not(tr):not(td) { padding-left:63px!important; } }`}</style>
      <section aria-label="Styled canvas">
        <Render config={config} data={document as Data} />
      </section>
      <section aria-label="Other canvas">
        <Render config={config} data={other as Data} />
      </section>
      <div className="inset host-target" data-pm-mjml-padding="background" style={{ padding: 32 }}>
        Host element
      </div>
      <iframe
        id="compiled"
        title="Compiled email"
        sandbox=""
        srcDoc={html}
        style={{ display: "block", width: "100%", height: 1800, border: 0 }}
      />
    </>
  );
}

createRoot(window.document.getElementById("root")!).render(<Fixture />);
