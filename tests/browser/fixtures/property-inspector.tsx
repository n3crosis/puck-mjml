import { useState } from "react";
import { createRoot } from "react-dom/client";
import { Puck, createUsePuck, type Data } from "@puckeditor/core";
import { createEmailConfig } from "../../../src/config";
import { PropertyInspector, PropertyFieldLabel } from "../../../src/PropertyInspector";
import { emailFieldTypes } from "../../../src/editor-field-types";
import "@puckeditor/core/puck.css";
import "../../../src/style.css";

const config = createEmailConfig(undefined, true);
const usePuck = createUsePuck();
const data = {
  root: {
    props: {
      ...config.root?.defaultProps,
      headStyles: [{ css: ".card { color: red; }", inline: "head" }],
      bodyAttributes: [{ name: "width", value: "600px" }],
      attributeDefaults: [{ name: "font-family", value: "Arial" }],
      componentDefaults: [{ tag: "mj-text", attributes: [{ name: "color", value: "#112233" }] }],
      mjmlClasses: [
        {
          name: "theme",
          attributes: [{ name: "font-size", value: "20px" }],
          components: [
            {
              tag: "mj-image",
              attributes: [{ name: "src", value: "https://example.com/image.png" }],
            },
          ],
        },
      ],
      htmlAttributes: [{ selector: ".card", name: "data-id", value: "fixture" }],
    },
  },
  content: [
    {
      type: "Text",
      props: {
        ...config.components.Text.defaultProps,
        id: "text",
        mjmlAttributes: [{ name: "align", value: "left" }],
      },
    },
  ],
} as unknown as Data;
function Controls() {
  const api = usePuck((state) => state);
  return (
    <>
      <button
        type="button"
        onClick={() =>
          api.dispatch({ type: "setUi", ui: { itemSelector: api.getSelectorForId("text") } })
        }
      >
        Select text
      </button>
      <button
        type="button"
        onClick={() => api.dispatch({ type: "setUi", ui: { itemSelector: null } })}
      >
        Select document
      </button>
      <button
        type="button"
        onClick={() =>
          api.dispatch({
            type: "setData",
            data: (previous) => ({
              root: {
                ...previous.root,
                props: {
                  ...previous.root.props,
                  headStyles: [
                    {
                      css: `.card { background-image: url(https://example.com/${"a".repeat(300)}.png); }`,
                      inline: "head",
                    },
                  ],
                },
              },
            }),
          })
        }
      >
        Load long CSS
      </button>
      <output
        aria-label="Saved document"
        style={{ display: "block", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
      >
        {JSON.stringify(api.appState.data)}
      </output>
    </>
  );
}
function Fixture() {
  const [width, setWidth] = useState(304);
  return (
    <Puck
      config={config}
      data={data}
      iframe={{ enabled: false }}
      overrides={{
        fields: PropertyInspector,
        fieldLabel: PropertyFieldLabel,
        fieldTypes: emailFieldTypes,
      }}
    >
      <main style={{ width: "min(100%, 600px)" }}>
        <label>
          Inspector width{" "}
          <input
            aria-label="Inspector width"
            type="number"
            value={width}
            onChange={(event) => setWidth(Number(event.target.value))}
          />
        </label>
        <div
          className="pm-editor"
          data-testid="inspector"
          style={{ width, maxWidth: "100%", height: 580, minHeight: 0, overflowY: "auto" }}
        >
          <Puck.Fields />
        </div>
        <Controls />
      </main>
    </Puck>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
