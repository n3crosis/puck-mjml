import { Render, type Data } from "@puckeditor/core";
import { createRoot } from "react-dom/client";
import { createEmailConfig } from "../../../src/config";
import { fromMjml } from "../../../src/import";
import "../../../src/style.css";

const asset = (name: string) => `/tests/browser/fixtures/fonts/${name}.woff`;
const source = (name: string, font: string) => `<mjml><mj-head>
  <mj-font name="Imported Serif" href="https://fonts.example.test/${name}.css" />
  <mj-style>
    @font-face{font-family:Local Serif;src:url(${asset(font)});font-weight:400}
    @font-face{font-family:"serif";src:url(${asset(font)});font-weight:400}
  </mj-style>
</mj-head><mj-body width="300px"><mj-section padding="0px"><mj-column padding="0px">
  <mj-text css-class="imported" font-family="Imported Serif, monospace" font-size="20px" line-height="24px" padding="0px">Hamburg</mj-text>
  <mj-text css-class="local" font-family="Local Serif, monospace" font-size="20px" line-height="24px" padding="0px">Hamburg</mj-text>
  <mj-text css-class="quoted" font-family="&quot;serif&quot;, monospace" font-size="20px" line-height="24px" padding="0px">Hamburg</mj-text>
  <mj-text css-class="generic" font-family="serif" font-size="20px" line-height="24px" padding="0px">Hamburg</mj-text>
</mj-column></mj-section></mj-body></mjml>`;
const config = createEmailConfig();
createRoot(document.getElementById("root")!).render(
  <>
    <style>{`@font-face{font-family:'Imported Serif';src:url(${asset("static-600")});font-weight:400}`}</style>
    <p id="host-imported" style={{ fontFamily: "'Imported Serif', monospace", fontSize: 20 }}>
      Hamburg
    </p>
    <p id="host-generic" style={{ fontFamily: "serif", fontSize: 20 }}>
      Hamburg
    </p>
    {[
      ["first", "static-400"],
      ["second", "other-400"],
    ].map(([name, font]) => (
      <section key={name} aria-label={`${name} canvas`}>
        <Render config={config} data={fromMjml(source(name, font)).document as Data} />
      </section>
    ))}
  </>,
);
