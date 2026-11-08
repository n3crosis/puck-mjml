import { useEffect, useId, useRef, useState, type DragEvent, type RefObject } from "react";
import { usePreviewFocus } from "../src/preview-focus";
import "./import-source.css";

export type ImportResult =
  | { status: "imported" | "cancelled" | "superseded" }
  | { status: "error"; message: string };

/** Files win over the filename/URL text browsers may attach to the same drag. */
export function droppedImport(data: DataTransfer): File | string | undefined {
  if (data.files.length) return data.files[0];
  if (Array.from(data.types).includes("text/plain")) return data.getData("text/plain");
  return undefined;
}

export function ImportSource({
  onImport,
  onClose,
  restoreRef,
}: {
  onImport: (source: File | string) => Promise<ImportResult>;
  onClose: () => void;
  restoreRef: RefObject<HTMLButtonElement | null>;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef(0);
  const composingRef = useRef(false);
  const id = useId();
  const [source, setSource] = useState("");
  const [dragging, setDragging] = useState(false);
  const [feedback, setFeedback] = useState({ pending: false, error: "", message: "" });
  usePreviewFocus(true, dialogRef, restoreRef);
  useEffect(() => {
    fieldRef.current?.focus({ preventScroll: true });
    const reset = () => setDragging(false);
    window.addEventListener("dragend", reset);
    window.addEventListener("drop", reset);
    window.addEventListener("blur", reset);
    return () => {
      // A late read must not close a newer dialog or update an unmounted one.
      requestRef.current += 1;
      window.removeEventListener("dragend", reset);
      window.removeEventListener("drop", reset);
      window.removeEventListener("blur", reset);
    };
  }, []);
  const close = () => {
    requestRef.current += 1;
    onClose();
  };
  const submit = async (input: File | string) => {
    const request = ++requestRef.current;
    setFeedback({ pending: true, error: "", message: "Reading and checking MJML…" });
    try {
      const result = await onImport(input);
      if (request !== requestRef.current) return;
      if (result.status === "imported") close();
      else
        setFeedback({
          pending: false,
          error: result.status === "error" ? result.message : "",
          message:
            result.status === "cancelled"
              ? "Import cancelled. Your current email is unchanged."
              : "",
        });
    } catch (error) {
      if (request === requestRef.current)
        setFeedback({
          pending: false,
          error:
            error instanceof Error ? error.message : "Unable to read this MJML. Please try again.",
          message: "",
        });
    }
  };
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
    <dialog
      ref={dialogRef}
      className="demo-import-backdrop"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-help`}
      onCancel={(event) => {
        event.preventDefault();
        if (!composingRef.current) close();
      }}
      onCompositionStart={() => {
        composingRef.current = true;
      }}
      onCompositionEnd={() => {
        composingRef.current = false;
      }}
      onClose={() => {
        // Ignore native close events queued during StrictMode effect replay.
        queueMicrotask(() => {
          const dialog = dialogRef.current;
          if (dialog?.isConnected && !dialog.open) close();
        });
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          // Escape also dismisses IME suggestions. Prevent the dialog's native
          // close request, but keep the unfinished source while composing.
          event.preventDefault();
          if (!event.nativeEvent.isComposing && !composingRef.current) close();
        }
      }}
      onMouseDown={(event) => {
        if (event.target !== event.currentTarget) return;
        event.preventDefault();
        close();
      }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => event.preventDefault()}
    >
      <form
        className="demo-import-panel"
        data-dragging={dragging || undefined}
        onSubmit={(event) => {
          event.preventDefault();
          void submit(source);
        }}
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
          void submit(incoming);
        }}
      >
        <header className="demo-import-header">
          <h2 id={`${id}-title`}>Import MJML</h2>
          <button type="button" aria-label="Close import" onClick={close}>
            Close
          </button>
        </header>
        <p id={`${id}-help`}>
          Paste MJML below, or drop source text or a file here. Importing replaces the current email
          after validation.
        </p>
        <label className="demo-import-source-label" htmlFor={`${id}-source`}>
          MJML source to import
        </label>
        <textarea
          ref={fieldRef}
          id={`${id}-source`}
          value={source}
          onChange={(event) => setSource(event.target.value)}
          placeholder="<mjml>…</mjml>"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
        />
        <div className="demo-import-file-row">
          <button type="button" onClick={() => fileRef.current?.click()}>
            Choose file
          </button>
          <input
            ref={fileRef}
            type="file"
            aria-label="MJML file"
            accept=".mjml,text/xml,application/xml,text/plain"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void submit(file);
            }}
          />
          <span>Choosing or dropping a file imports it immediately.</span>
        </div>
        <div className="demo-import-feedback" data-pending={feedback.pending || undefined}>
          {feedback.error ? (
            <p className="demo-import-error" role="alert">
              {feedback.error}
            </p>
          ) : (
            <p role="status">{feedback.message}</p>
          )}
        </div>
        <footer className="demo-import-footer">
          <button type="button" onClick={close}>
            Cancel
          </button>
          <button type="submit" className="demo-import-submit" disabled={!source.trim()}>
            Import text
          </button>
        </footer>
      </form>
    </dialog>
  );
}
