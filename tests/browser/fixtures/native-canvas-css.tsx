import { Render, type Data } from "@puckeditor/core";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { createEmailConfig } from "../../../src/config";
import { compileEmail } from "../../../src/export";
import { fromMjml } from "../../../src/import";
import "../../../src/style.css";

const source = `<mjml><mj-head>
  <mj-breakpoint width="601px" />
  <mj-attributes><mj-all font-family="Arial, sans-serif" /></mj-attributes>
  <mj-style>
    @media (max-width: 600px) {
      .inset > table > tbody > tr > td { padding-left: 24px !important; padding-right: 24px !important; }
      .shell > table > tbody > tr > td { padding-left: 8px !important; padding-right: 8px !important; }
      .column > table > tbody > tr > td { padding: 7px !important; }
      .unpadded > table > tbody > tr > td { padding-left: 3px !important; }
      .full > table > tbody > tr > td { padding-left: 2px !important; }
      .inset { padding-left: 32px !important; }
      .image-inset > table > tbody > tr > td { padding-left:24px !important; padding-right:24px !important; }
      .cart-image table, .feature-image table { width:100% !important; }
      .cart-image :where(a), .feature-image :where(a) { width:50% !important; }
    }
    .authored td { padding-right: 9px !important; }
    body + .host-target, body ~ .host-target { padding: 99px !important; }
  </mj-style>
</mj-head><mj-body width="640px">
  <mj-wrapper css-class="shell" padding="16px 24px">
    <mj-section css-class="inset" padding="40px" gutter="20px">
      <mj-column css-class="column" padding="12px"><mj-text>First column</mj-text></mj-column>
      <mj-column padding="0px"><mj-text>Second column</mj-text></mj-column>
    </mj-section>
    <mj-section><mj-column css-class="unpadded">
      <mj-text>First child cell</mj-text><mj-text>Second child cell</mj-text>
      <mj-table css-class="authored"><tr><td>Authored table</td></tr></mj-table>
    </mj-column></mj-section>
  </mj-wrapper>
  <mj-section css-class="full" padding="40px" full-width="full-width">
    <mj-column><mj-text>Full-width section</mj-text></mj-column>
  </mj-section>
<mj-section css-class="image-inset" padding="0px 40px"><mj-column width="33.333333%" padding="0px"><mj-image css-class="cart-image" src="https://example.com/image.svg" width="177px" padding="0px" /></mj-column><mj-column width="66.666667%" padding="0px"><mj-text>Cart details</mj-text></mj-column></mj-section>
  <mj-section css-class="image-inset" padding="0px 40px"><mj-column width="50%" css-class="feature-image" padding="0px"><mj-image src="https://example.com/image.svg" width="280px" padding="0px" /></mj-column><mj-column width="50%" padding="0px"><mj-text>Feature details</mj-text></mj-column></mj-section>
  <mj-section padding="0px 24px"><mj-column padding="0px"><mj-table css-class="cart-image" width="120px"><tr><td>Original image-class table rule</td></tr></mj-table><mj-image css-class="no-rule" src="https://example.com/image.svg" width="100px" padding="0px" /></mj-column></mj-section>
</mj-body></mjml>`;
const document = fromMjml(source).document;
const other = structuredClone(document);
other.root.props!.headStyles = [];
const config = createEmailConfig();

function Fixture() {
  const [html, setHtml] = useState("");
  const [status, setStatus] = useState("compiling");
  useEffect(() => {
    let active = true;
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
  }, []);
  return (
    <>
      <output aria-label="Compilation status">{status}</output>
      <section aria-label="Styled canvas">
        <Render config={config} data={document as Data} />
      </section>
      <section aria-label="Other canvas">
        <Render config={config} data={other as Data} />
      </section>
      <div className="inset host-target" data-pm-mjml-padding="self" style={{ padding: "40px" }}>
        Host element
      </div>
      <div className="cart-image">
        <a
          className="host-image"
          data-pm-mjml-image-width=""
          style={{ display: "inline-block", width: 40 }}
        >
          Host image target
        </a>
      </div>
      <iframe
        id="compiled"
        title="Compiled email"
        sandbox=""
        srcDoc={html}
        style={{ display: "block", width: "100%", height: 800, border: 0 }}
      />
    </>
  );
}

createRoot(window.document.getElementById("root")!).render(<Fixture />);
