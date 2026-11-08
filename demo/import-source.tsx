import { useEffect, useState, type DragEvent } from "react";

/** Files win over the filename/URL text browsers may attach to the same drag. */
export function droppedImport(data: DataTransfer): File | string | undefined {
  if (data.files.length) return data.files[0];
  if (Array.from(data.types).includes("text/plain")) return data.getData("text/plain");
  return undefined;
}

export function ImportSource({ onImport }: { onImport: (source: File | string) => void }) {
  const [source, setSource] = useState("");
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    const reset = () => setDragging(false);
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") reset();
    };
    window.addEventListener("dragend", reset);
    window.addEventListener("drop", reset);
    window.addEventListener("blur", reset);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("dragend", reset);
      window.removeEventListener("drop", reset);
      window.removeEventListener("blur", reset);
      window.removeEventListener("keydown", escape);
    };
  }, []);
  const dragOver = (event: DragEvent<HTMLElement>) => {
    // Prevent navigation even for unsupported URL/HTML payloads in this area.
    event.preventDefault();
    const supported = Array.from(event.dataTransfer.types).some(
      (type) => type === "Files" || type === "text/plain",
    );
    event.dataTransfer.dropEffect = supported ? "copy" : "none";
    setDragging(supported);
  };
  return (
    <details
      className="demo-import-source"
      data-dragging={dragging || undefined}
      onToggle={() => setDragging(false)}
      onDragEnter={dragOver}
      onDragOver={dragOver}
      onDragLeave={(event) => {
        if (
          !(event.relatedTarget instanceof Node) ||
          !event.currentTarget.contains(event.relatedTarget)
        )
          setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        const incoming = droppedImport(event.dataTransfer);
        if (incoming === undefined) return;
        if (typeof incoming === "string") setSource(incoming);
        onImport(incoming);
      }}
    >
      <summary>Paste or drop MJML</summary>
      <label>
        MJML source to import
        <textarea
          value={source}
          onChange={(event) => setSource(event.target.value)}
          spellCheck={false}
        />
      </label>
      <button type="button" onClick={() => onImport(source)}>
        Import text
      </button>
      <span> Paste and edit source above, or drop MJML text or a file here.</span>
    </details>
  );
}
