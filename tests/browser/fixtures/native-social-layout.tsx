import { Render, type Data } from "@puckeditor/core";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { createEmailConfig } from "../../../src/config";
import { compileEmail } from "../../../src/export";
import { fromMjml } from "../../../src/import";
import { socialPreviewSource, socialSource } from "./native-social-source";
import "../../../src/style.css";

const document = fromMjml(socialSource).document;
const previews = fromMjml(socialPreviewSource).document;
function Fixture() {
  const [html, setHtml] = useState("");
  const [status, setStatus] = useState("compiling");
  useEffect(() => {
    compileEmail(document).then(
      (result) => {
        setHtml(result.html);
        setStatus(result.errors.length ? "compile errors" : "ready");
      },
      () => setStatus("compile failed"),
    );
  }, []);
  return (
    <>
      <output aria-label="Compilation status">{status}</output>
      <section aria-label="Canvas">
        <Render config={createEmailConfig()} data={document as Data} />
      </section>
      <section aria-label="Source previews">
        <Render config={createEmailConfig(undefined, true)} data={previews as Data} />
      </section>
      <iframe
        id="compiled"
        title="Compiled email"
        sandbox=""
        srcDoc={html}
        style={{ display: "block", width: "100%", height: 1100, border: 0 }}
      />
    </>
  );
}
createRoot(window.document.getElementById("root")!).render(<Fixture />);
