import { Render, type Data } from "@puckeditor/core";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { createEmailConfig } from "../../../src/config";
import { compileEmail } from "../../../src/export";
import { fromMjml } from "../../../src/import";
import "../../../src/style.css";

const image = (name: string, attributes: string) =>
  `<mj-image css-class="probe-${name}" alt="${name}" src="https://example.com/image-box.png" width="64px" height="64px" padding="0px" ${attributes} />`;
const document = fromMjml(`<mjml><mj-head>
  <mj-attributes><mj-all font-family="Arial" /></mj-attributes>
  <mj-style inline="inline">.probe-authored img { box-sizing: border-box; }</mj-style>
</mj-head><mj-body width="600px"><mj-section padding="0px"><mj-column padding="0px">
  ${image("plain", 'border="none"')}
  ${image("bordered", 'border="1px solid #123456"')}
  ${image("linked", 'border="1px solid #123456" href="https://example.com/image"')}
  ${image("asymmetric", 'border="1px solid #123456" border-right="3px solid red" border-top="2px solid red" border-bottom="4px solid red"')}
  ${image("authored", 'border="1px solid #123456"')}
  <mj-image css-class="probe-auto" alt="auto" src="https://example.com/image-box.png" width="64px" padding="0px" border="1px solid #123456" />
  <mj-image css-class="probe-constrained" alt="constrained" src="https://example.com/image-box.png" width="900px" padding="0px" border="2px solid #123456" />
</mj-column></mj-section></mj-body></mjml>`).document;
const config = createEmailConfig();

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
      <div data-host-reset style={{ width: 64, height: 64, border: "1px solid red" }} />
      <section aria-label="Canvas">
        <Render config={config} data={document as Data} />
      </section>
      <iframe
        id="compiled"
        title="Compiled email"
        sandbox=""
        srcDoc={html}
        style={{ display: "block", width: "100%", height: 1600, border: 0 }}
      />
    </>
  );
}

createRoot(window.document.getElementById("root")!).render(<Fixture />);
