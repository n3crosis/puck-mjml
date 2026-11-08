import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { createUsePuck, type Data } from "@puckeditor/core";
import { EmailEditor } from "../../../src/EmailEditor";
import { createEmptyDocument } from "../../../src/document";
import { fromMjml } from "../../../src/import";
import type { EmailDocument } from "../../../src/types";
import "@puckeditor/core/puck.css";
import "../../../src/style.css";

const query = new URLSearchParams(window.location.search);
const usePuck = createUsePuck();
const source =
  "<mjml><mj-body><mj-section><mj-column><mj-text>Imported copy</mj-text></mj-column></mj-section></mj-body></mjml>";
function Controls({ replace }: { replace: (value: EmailDocument) => void }) {
  const api = usePuck((state) => state);
  const dispatch = api.dispatch;
  useEffect(() => {
    const width = Number(query.get("panel") ?? 240);
    dispatch({
      type: "setUi",
      ui: { leftSideBarWidth: width, leftSideBarVisible: true, plugin: { current: "blocks" } },
      recordHistory: false,
    });
  }, [dispatch]);
  return (
    <>
      <output aria-label="Editor document" hidden>
        {JSON.stringify(api.appState.data)}
      </output>
      <output aria-label="History index" hidden>
        {api.history.index}
      </output>
      <output aria-label="Selected block ID" hidden>
        {api.selectedItem?.props.id ?? ""}
      </output>
      <button
        type="button"
        onClick={() => {
          const replacement = createEmptyDocument();
          replacement.root.props!.previewText = "Replacement email";
          replace(replacement);
        }}
      >
        Replace with blank email
      </button>
    </>
  );
}
function Fixture() {
  const [value, setValue] = useState<EmailDocument>(() => {
    const data = query.has("imported") ? fromMjml(source).document : createEmptyDocument();
    if (query.has("locked"))
      (data as Data).root.readOnly = { sections: true } as Data["root"]["readOnly"];
    return data;
  });
  return (
    <>
      <EmailEditor
        value={value}
        onChange={(next) => setValue(structuredClone(next))}
        allowRawHtml={query.has("trusted")}
        headerActions={<Controls replace={setValue} />}
      />
      <output aria-label="Host document" hidden>
        {JSON.stringify(value)}
      </output>
    </>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
