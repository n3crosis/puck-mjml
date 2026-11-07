import React from "react";
import { createRoot } from "react-dom/client";
import { EmailCanvas } from "../../../src/EmailCanvas";
import { TailwindRuntimeContext } from "../../../src/canvas-tailwind";

const root = createRoot(document.getElementById("root")!);
const state = {
  enabled: true,
  permission: false,
  showFirst: true,
  className: "font-bold p-4 rotate-45 translate-x-2 animate-spin",
  documentUrl: `${location.origin}/document-script.js`,
};
function update(next: Partial<typeof state> = {}) {
  Object.assign(state, next);
  root.render(
    <TailwindRuntimeContext.Provider
      value={state.permission ? `${location.origin}/tailwind-runtime.js` : undefined}
    >
      {state.showFirst ? (
        <EmailCanvas key="one" tailwind={state.enabled} tailwindScriptUrl={state.documentUrl}>
          <div id="first" className={state.className}>
            First
          </div>
        </EmailCanvas>
      ) : null}
      <EmailCanvas key="two" tailwind={true}>
        <div id="second" className="font-bold p-8 rotate-90">
          Second
        </div>
      </EmailCanvas>
    </TailwindRuntimeContext.Provider>,
  );
}
Object.assign(window, { updateTailwindFixture: update });
update();
