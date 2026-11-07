import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Puck, createUsePuck, type Config, type Data } from "@puckeditor/core";
import { emailFieldTypes } from "../../../src/editor-field-types";
import { PropertyFieldLabel } from "../../../src/PropertyInspector";
import { CodeArea } from "../../../src/CodeField";
import "@puckeditor/core/puck.css";
import "../../../src/style.css";

type RootProps = {
  rules: { name: string; css: string; conditions: { query: string }[] }[];
  locked: { name: string }[];
};
const config: Config<Record<string, never>, RootProps> = {
  components: {},
  root: {
    fields: {
      rules: {
        type: "array",
        label: "CSS rules",
        getItemSummary: (item) => item.name,
        defaultItemProps: { name: "New rule", css: "", conditions: [] },
        arrayFields: {
          name: { type: "text", label: "Rule name" },
          css: {
            type: "custom",
            render: ({ value, onChange, readOnly }) => (
              <CodeArea
                value={value}
                onChange={onChange}
                disabled={readOnly}
                ariaLabel="CSS"
                format="css"
              />
            ),
          },
          conditions: {
            type: "array",
            label: "Conditions",
            getItemSummary: (item) => item.query,
            defaultItemProps: { query: "New condition" },
            arrayFields: { query: { type: "text", label: "Query" } },
          },
        },
      },
      locked: {
        type: "array",
        label: "Locked rules",
        getItemSummary: (item) => item.name,
        arrayFields: { name: { type: "text", label: "Locked rule name" } },
      },
    },
  },
};
const data: Data<Record<string, never>, RootProps> = {
  root: {
    props: {
      rules: [
        { name: "First rule", css: ".card{color:red}", conditions: [{ query: "Mobile" }] },
        { name: "Second rule", css: "", conditions: [] },
        { name: "Third rule", css: "", conditions: [] },
      ],
      locked: [{ name: "Protected rule" }],
    },
    readOnly: { locked: true },
  },
  content: [],
};
const usePuck = createUsePuck();
function Status() {
  const document = usePuck((state) => state.appState.data);
  const history = usePuck((state) => state.history);
  return (
    <>
      <output aria-label="Host document">{JSON.stringify(document)}</output>
      <output aria-label="History index">{history.index}</output>
      <button type="button" disabled={!history.hasPast} onClick={history.back}>
        Undo array edit
      </button>
      <button type="button" disabled={!history.hasFuture} onClick={history.forward}>
        Redo array edit
      </button>
    </>
  );
}
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <main className="pm-editor" style={{ width: "min(340px, calc(100vw - 32px))", margin: 16 }}>
      <Puck
        config={config}
        data={data}
        iframe={{ enabled: false }}
        overrides={{ fieldTypes: emailFieldTypes, fieldLabel: PropertyFieldLabel }}
      >
        <div hidden>
          <Puck.Fields />
        </div>
        <div data-visible-fields>
          <Puck.Fields />
        </div>
        <div style={{ overflowWrap: "anywhere", marginTop: 20 }}>
          <Status />
        </div>
      </Puck>
    </main>
  </StrictMode>,
);
