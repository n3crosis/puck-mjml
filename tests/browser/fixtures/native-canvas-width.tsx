import { Render, type Data } from "@puckeditor/core";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { createEmailConfig } from "../../../src/config";
import { compileEmail } from "../../../src/export";
import { fromMjml } from "../../../src/import";
import "../../../src/style.css";

const query = new URLSearchParams(window.location.search);
const padding = query.get("padding") === "16" ? 16 : 0;
const width = query.get("email") === "600" ? 600 : 640;
const document = fromMjml(
  `<mjml><mj-head><mj-breakpoint width="601px" />${padding ? '<mj-style inline="inline">body { padding:0 16px !important; }</mj-style>' : ""}</mj-head><mj-body width="${width}px"><mj-section css-class="width-probe" padding="0px"><mj-column padding="0px"><mj-text padding="0px">Full email content width</mj-text></mj-column></mj-section><mj-section css-class="full-probe" full-width="full-width" padding="0px" background-color="#123456"><mj-column padding="0px"><mj-text padding="0px" color="#ffffff">Full-width background</mj-text></mj-column></mj-section></mj-body></mjml>`,
).document;
function Fixture() {
  const [html, setHtml] = useState("");
  useEffect(() => {
    compileEmail(document).then((result) => setHtml(result.html));
  }, []);
  return (
    <>
      <output aria-label="Compilation status">{html ? "ready" : "compiling"}</output>
      <section aria-label="Canvas">
        <Render config={createEmailConfig()} data={document as Data} />
      </section>
      <iframe
        id="compiled"
        title="Compiled email"
        sandbox=""
        srcDoc={html}
        style={{ display: "block", width: "100%", height: 500, border: 0 }}
      />
    </>
  );
}
createRoot(window.document.getElementById("root")!).render(<Fixture />);
