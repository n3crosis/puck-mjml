import { Render, type Data } from "@puckeditor/core";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { createEmailConfig } from "../../../src/config";
import { compileEmail } from "../../../src/export";
import { fromMjml } from "../../../src/import";
import {
  alignmentCases,
  alignmentSource,
  applyImplicitColumns,
} from "./native-column-alignment-source";
import "../../../src/style.css";

const query = new URLSearchParams(window.location.search);
const padding = Number(query.get("padding")) || 0;
const cases = query.has("boundary")
  ? alignmentCases().filter((entry) =>
      /^pair-(ltr|rtl)-(group|section)-normal-top-middle$/.test(entry.id),
    )
  : alignmentCases();
const source = alignmentSource(cases)
  .replace(
    "</mj-head>",
    `${padding ? `<mj-style inline="inline">body { padding:0 ${padding}px!important; }</mj-style>` : ""}</mj-head>`,
  )
  .replace("<mjml>", `<mjml dir="${query.get("dir") === "rtl" ? "rtl" : "ltr"}">`);
const document = applyImplicitColumns(fromMjml(source).document, cases);
function Fixture() {
  const [html, setHtml] = useState("");
  const [status, setStatus] = useState("compiling");
  useEffect(() => {
    compileEmail(document).then((result) => {
      setHtml(result.html);
      setStatus(result.errors.length ? "compile errors" : "ready");
    });
  }, []);
  return (
    <>
      <output aria-label="Compilation status">{status}</output>
      <section aria-label="Canvas">
        <Render config={createEmailConfig()} data={document as Data} />
      </section>
      <iframe
        id="compiled"
        title="Compiled email"
        sandbox=""
        srcDoc={html}
        style={{ display: "block", width: "100%", height: 900, border: 0 }}
      />
    </>
  );
}
createRoot(window.document.getElementById("root")!).render(<Fixture />);
