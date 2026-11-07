import { Render, type Data } from "@puckeditor/core";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { EmailCanvas } from "../../../src/EmailCanvas";
import { inspectCanvasFontInputs } from "../../../src/canvas-font-inputs";
import { getCanvasElement, useNativeCanvasScope } from "../../../src/native-canvas-context";
import { createEmailConfig } from "../../../src/config";
import { compileEmail } from "../../../src/export";
import { fromMjml } from "../../../src/import";
import "../../../src/style.css";

const asset = (name: string) => `${location.origin}/tests/browser/fixtures/fonts/${name}.woff`;
const face = (family: string, font: string, weight: string) =>
  `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};src:url('${asset(font)}') format('woff');}`;
const body = (family: string) =>
  [400, 420, 450, 600]
    .map(
      (weight) =>
        `<mj-text css-class="weight-${weight}" font-family="${family}, monospace" font-size="20px" line-height="24px" font-weight="${weight}" padding="0px">Hamburg</mj-text>`,
    )
    .join("");
const source = (kind: string) => `<mjml><mj-head>
${kind === "first" || kind === "other" ? '<mj-font name="Probe" href="https://fonts.example.test/variable.css" />' : ""}
<mj-style>${kind === "first" ? face("Probe", "static-400", "400") + face("Probe", "static-600", "600") : kind === "other" ? face("Probe", "other-400", "400") : kind === "head" ? face("Head Only", "static-400", "400") : ""}</mj-style>
</mj-head><mj-body width="500px"><mj-section padding="0px"><mj-column padding="0px">${body(kind === "head" ? "Head Only" : kind === "implicit" ? "Roboto" : "Probe")}</mj-column></mj-section></mj-body></mjml>`;
const documents = Object.fromEntries(
  ["first", "other", "head", "implicit"].map((name) => [name, fromMjml(source(name)).document]),
);
const config = createEmailConfig();
function Fixture() {
  const [html, setHtml] = useState("");
  useEffect(() => {
    void compileEmail(documents.first, { allowRawHtml: true }).then((result) =>
      setHtml(result.html),
    );
  }, []);
  return (
    <>
      {Object.entries(documents).map(([name, document]) => (
        <section key={name} aria-label={`${name} canvas`}>
          <Render config={config} data={document as Data} />
        </section>
      ))}
      <iframe
        id="compiled"
        title="Compiled font reference"
        srcDoc={html}
        style={{ width: 500, height: 180, border: 0 }}
      />
    </>
  );
}
declare global {
  interface Window {
    fontTransitionSnapshot?: ReturnType<typeof inspectCanvasFontInputs>;
  }
}
function ChangingCopy() {
  const [family, setFamily] = useState("Ubuntu");
  const scope = useNativeCanvasScope();
  const node = getCanvasElement(
    "mj-text",
    { mjmlAttributes: [{ name: "font-family", value: family }] },
    scope,
  )!;
  return (
    <>
      <p
        className="transition-copy"
        style={{
          fontFamily: node.attributes["font-family"],
          fontSize: 20,
          fontWeight: 400,
          margin: 0,
        }}
      >
        Hamburg
      </p>
      {["Roboto", "Arial"].map((name) => (
        <button
          key={name}
          onClick={(event) => {
            const canvas = event.currentTarget.closest(".pm-canvas")!;
            flushSync(() => setFamily(name));
            window.fontTransitionSnapshot = inspectCanvasFontInputs(canvas, true);
          }}
        >
          Set font {name}
        </button>
      ))}
    </>
  );
}
function TransitionFixture() {
  return (
    <section aria-label="transition canvas">
      <EmailCanvas>
        <ChangingCopy />
      </EmailCanvas>
    </section>
  );
}
createRoot(document.getElementById("root")!).render(
  new URLSearchParams(location.search).has("transition") ? <TransitionFixture /> : <Fixture />,
);
