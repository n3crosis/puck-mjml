import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { EmailEditor } from "../../../src/EmailEditor";
import { fromMjml } from "../../../src/import";
import "@puckeditor/core/puck.css";
import "../../../src/style.css";

const initial = fromMjml(`<mjml><mj-body><mj-section><mj-column>
  <mj-text>Selectable preview text</mj-text>
  <mj-accordion><mj-accordion-element>
    <mj-accordion-title>Show the answer</mj-accordion-title>
    <mj-accordion-text>The pointer opened this answer.</mj-accordion-text>
  </mj-accordion-element></mj-accordion>
  <mj-spacer height="1400px" />
  <mj-text>End of preview</mj-text>
</mj-column></mj-section></mj-body></mjml>`).document;

function Fixture() {
  const [document, setDocument] = useState(initial);
  return (
    <div style={{ height: "100vh" }}>
      <EmailEditor value={document} onChange={setDocument} />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Fixture />
  </StrictMode>,
);
