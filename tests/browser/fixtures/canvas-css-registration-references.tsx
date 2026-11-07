import { createRoot } from "react-dom/client";
import { EmailCanvas } from "../../../src/EmailCanvas";
import "../../../src/style.css";

const font = (name: string) => `/tests/browser/fixtures/fonts/${name}.woff`;
const host = `
  @font-face{font-family:Local;src:url(${font("static-600")});font-weight:400}
  @font-face{font-family:Ghost;src:url(${font("static-600")});font-weight:400}
  @keyframes ghost{from,to{opacity:0.2}}
  .host{font:20px Local,monospace}
  .host-ghost{font-family:Ghost;animation:ghost 1s linear paused both}
`;
const canvasCss = (source: string, opacity: number) => `
  @scope (.inside){
    @font-face{font-family:Ghost;src:url(${font("other-400")});font-weight:400}
    @keyframes ghost{from,to{opacity:0.9}}
  }
  @font-face{font-family:Local;src:url(${font(source)});font-weight:400}
  @keyframes swap{from,to{font-family:Local;opacity:${opacity}}}
  @keyframes invalid{from,to{font-family:Local,,serif;opacity:0.5}}
  .animated{font-family:Local;font-size:20px;animation:swap 1s linear paused both}
  .ghost{font-family:Ghost;font-size:20px;animation:ghost 1s linear paused both}
  .invalid-list{font-family:Ghost;font-size:20px;animation:invalid 1s linear paused both}
`;

createRoot(document.getElementById("root")!).render(
  <>
    <style>{host}</style>
    <p id="host-before" className="host">
      Hamburg
    </p>
    <p id="host-ghost-before" className="host host-ghost">
      Hamburg
    </p>
    <section aria-label="first canvas">
      <EmailCanvas headStyles={[{ css: canvasCss("static-400", 0.7) }]}>
        <div className="animated">Hamburg</div>
        <div className="ghost">Hamburg</div>
        <div className="invalid-list">Hamburg</div>
      </EmailCanvas>
    </section>
    <section aria-label="sibling canvas">
      <EmailCanvas headStyles={[{ css: canvasCss("other-400", 0.8) }]}>
        <div className="animated">Hamburg</div>
        <div className="ghost">Hamburg</div>
        <div className="invalid-list">Hamburg</div>
      </EmailCanvas>
    </section>
    <p id="host-after" className="host">
      Hamburg
    </p>
    <p id="host-ghost-after" className="host host-ghost">
      Hamburg
    </p>
  </>,
);
