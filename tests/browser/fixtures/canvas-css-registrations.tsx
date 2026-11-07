import { createRoot } from "react-dom/client";
import { EmailCanvas } from "../../../src/EmailCanvas";
import "../../../src/style.css";

const font = (name: string) => `/tests/browser/fixtures/fonts/${name}.woff`;
const motion = (name: string, opacity: number) => `@keyframes ${name}{from,to{opacity:${opacity}}}`;
const host = `
  @font-face{font-family:Final;src:url(${font("static-600")});font-weight:400}
  @font-face{font-family:Escaped;src:url(${font("static-600")});font-weight:400}
  ${motion("pulse", 0.2)}
  ${motion("quoted", 0.3)}
  ${motion("fade", 0.4)}
  .host{font:20px Final,monospace;animation:pulse 1s linear infinite paused}
  .host-quoted{animation-name:quoted}
  .host-escaped{font-family:Escaped;animation-name:fade}
`;
const canvasCss = (source: string, opacity: number) => `
  @font-face{font-family:Discarded;FONT-FAMILY:Final;src:url(${font(source)});font-weight:400}
  ${motion("pulse", opacity)}
  ${motion("linear", 0.6)}
  ${motion('"quoted"', 0.9)}
  ${motion(String.raw`f\61 de`, 0.9)}
  @font-face{font-family:Bad;font-family:12;src:url(${font("other-400")})}
  @font-face{font-family:PrefixFallback;_font-family:Ghost;src:url(${font("other-400")})}
  @font-face{font-family:PrefixFallback;*font-family:Ghost;src:url(${font("other-400")})}
  @font-face{font-family:Ignored;font-\\66 amily:Escaped;src:url(${font("other-400")})}
  .layer{@layer local{font-family:Final;font-size:20px;animation:pulse 1s linear infinite paused}}
  .keyword{animation-name:linear;animation-duration:1s;animation-play-state:paused;animation-fill-mode:both}
`;

createRoot(document.getElementById("root")!).render(
  <>
    <style>{host}</style>
    <p id="host-before" className="host">
      Hamburg
    </p>
    <section aria-label="first canvas">
      <EmailCanvas headStyles={[{ css: canvasCss("static-400", 0.7) }]}>
        <div className="layer">Hamburg</div>
        <div className="keyword">Keyword name</div>
      </EmailCanvas>
    </section>
    <section aria-label="sibling canvas">
      <EmailCanvas headStyles={[{ css: canvasCss("other-400", 0.8) }]}>
        <div className="layer">Hamburg</div>
        <div className="keyword">Keyword name</div>
      </EmailCanvas>
    </section>
    <p id="host-after" className="host">
      Hamburg
    </p>
    <p id="host-quoted" className="host host-quoted">
      Hamburg
    </p>
    <p id="host-escaped" className="host host-escaped">
      Hamburg
    </p>
  </>,
);
