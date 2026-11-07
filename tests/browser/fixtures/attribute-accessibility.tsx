import { useState } from "react";
import { createRoot } from "react-dom/client";
import { NativeAttributeEditor } from "../../../src/NativeAttributeEditor";
import { CodeArea } from "../../../src/CodeField";
import type { MjmlAttribute } from "../../../src/types";
import "../../../src/style.css";

function Fixture() {
  const [attributes, setAttributes] = useState<MjmlAttribute[]>([
    { name: "width", value: "600px" },
    { name: "background-color", value: "#ffffff" },
    { name: "css-class", value: "email" },
  ]);
  const [source, setSource] = useState("<p>Keyboard-editable HTML</p>");
  const [locked, setLocked] = useState(false);
  const [changes, setChanges] = useState(0);
  return (
    <main
      style={{
        width: "min(304px, calc(100vw - 16px))",
        margin: 8,
        background: "#ffffff",
        color: "#263446",
        font: "12px/1.5 system-ui, sans-serif",
      }}
    >
      <NativeAttributeEditor
        id="fixture-attributes"
        name="attributes"
        label="Body attributes"
        tag="mj-body"
        value={attributes}
        onChange={setAttributes}
      />
      <section aria-label="HTML source" style={{ marginTop: 16 }}>
        <CodeArea
          id="fixture-html"
          ariaLabel="Trusted HTML source"
          rows={6}
          value={source}
          disabled={locked}
          onChange={(value) => {
            setChanges((count) => count + 1);
            setSource(value);
          }}
        />
        <button type="button" onClick={() => setLocked((value) => !value)}>
          Toggle source lock
        </button>
        <output aria-label="Source change count" style={{ display: "block" }}>
          {changes}
        </output>
        <pre
          aria-label="Host HTML source"
          style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
        >
          {source}
        </pre>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Fixture />);
