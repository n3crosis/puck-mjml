import { useState } from "react";
import { createRoot } from "react-dom/client";
import { EmailEditor } from "../../../src/EmailEditor";
import { fromMjml } from "../../../src/import";
import "@puckeditor/core/puck.css";
import "../../../src/style.css";

const initial = fromMjml(`<mjml><mj-body><mj-section><mj-column>
  <mj-text padding="30px">First block</mj-text>
  <mj-text padding="30px">Second block</mj-text>
  <mj-text padding="30px">Third block</mj-text>
</mj-column></mj-section></mj-body></mjml>`).document;

function Fixture() {
  const [document, setDocument] = useState(initial);
  return (
    <>
      <div style={{ height: "calc(100vh - 24px)" }}>
        <EmailEditor value={document} onChange={setDocument} />
      </div>
      <output aria-label="Host document">{JSON.stringify(document)}</output>
    </>
  );
}

createRoot(document.getElementById("root")!).render(<Fixture />);
