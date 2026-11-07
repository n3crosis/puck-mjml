import { Render, type Data } from "@puckeditor/core";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { createEmailConfig } from "../../../src/config";
import { compileEmail } from "../../../src/export";
import { fromMjml } from "../../../src/import";
import "../../../src/style.css";

const tables = ["left", "center", "right", "default", "inherited"]
  .map(
    (align) =>
      `<mj-table css-class="table-${align}" ${align === "inherited" ? 'mj-class="right"' : align !== "default" ? `align="${align}"` : ""} padding="0px" width="80%"><tr><th>Heading</th><td>Inherited</td><td style="text-align:right">Right cell</td><td style="text-align:center"><strong>Centered cell</strong></td></tr></mj-table>`,
  )
  .join("");
const document = fromMjml(
  `<mjml><mj-head><mj-attributes><mj-all font-family="Arial, sans-serif" /><mj-class name="right" align="right" /></mj-attributes></mj-head><mj-body width="640px"><mj-section text-align="center" padding="0px"><mj-column padding="0px">${tables}</mj-column></mj-section></mj-body></mjml>`,
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
