import { useState } from "react";
import { createRoot } from "react-dom/client";
import { CodeArea } from "../../../src/CodeField";
import "../../../src/fields.css";

function Fixture() {
  const [source, setSource] = useState(".card{color:red}");
  const [locked, setLocked] = useState(false);
  const [changes, setChanges] = useState(0);
  return (
    <main style={{ width: "min(280px, calc(100vw - 32px))", margin: 8 }}>
      <CodeArea
        id="fixture-css"
        ariaLabel="Custom CSS"
        format="css"
        rows={10}
        value={source}
        disabled={locked}
        onChange={(value) => {
          setChanges((count) => count + 1);
          setSource(value);
        }}
      />
      <button type="button" onClick={() => setLocked((value) => !value)}>
        Toggle read-only
      </button>
      <button type="button" onClick={() => setSource(".host{color:green}")}>
        Replace source
      </button>
      <button
        type="button"
        onClick={() =>
          setSource(
            Array.from(
              { length: 60 },
              (_, index) =>
                `.card-${index} { background-image: url(https://example.com/${"a".repeat(160)}.png); }`,
            ).join("\n"),
          )
        }
      >
        Load long source
      </button>
      <output aria-label="Change count">{changes}</output>
      <pre aria-label="Host source" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
        {source}
      </pre>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Fixture />);
