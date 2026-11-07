import { useEffect, useId, useMemo, useRef, useState, type RefObject } from "react";
import { DownloadSimpleIcon } from "@phosphor-icons/react/dist/csr/DownloadSimple";
import { compileEmail, toMjml } from "./export";
import { downloadEmailSource, type ExportFormat } from "./export-download";
import { usePreviewFocus } from "./preview-focus";
import { hasEmbeddedLocalImages, LOCAL_IMAGE_WARNING } from "./image-upload";
import type { CompiledEmail, EmailDocument } from "./types";

type ExportDialogProps = {
  document: EmailDocument;
  allowRawHtml: boolean;
  allowLocalImages?: boolean;
  onClose: () => void;
  restoreRef: RefObject<HTMLButtonElement | null>;
};

const errorMessage = (error: unknown) =>
  error instanceof Error && error.message
    ? error.message
    : "Unable to export email. Please try again.";

export function EmailExportDialog({
  document,
  allowRawHtml,
  allowLocalImages = false,
  onClose,
  restoreRef,
}: ExportDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const sourceId = useId();
  const helpId = useId();
  const [format, setFormat] = useState<ExportFormat>("html");
  const [attempt, setAttempt] = useState(0);
  const [downloadStatus, setDownloadStatus] = useState({ error: "", message: "" });
  usePreviewFocus(true, dialogRef, restoreRef);

  // MJML remains available even if HTML compilation fails or is still loading.
  const serialized = useMemo(() => {
    try {
      return { source: toMjml(document, { allowRawHtml, allowLocalImages }), error: "" };
    } catch (error) {
      return { source: undefined, error: errorMessage(error) };
    }
  }, [document, allowRawHtml, allowLocalImages]);
  const embeddedImages = useMemo(() => hasEmbeddedLocalImages(document), [document]);
  const [compilation, setCompilation] = useState<{
    input: typeof serialized;
    attempt: number;
    result?: CompiledEmail;
    error?: string;
  }>();
  // A replacement document must never display or download a previous result,
  // including the render before the new effect starts.
  const current =
    compilation?.input === serialized && compilation.attempt === attempt ? compilation : undefined;
  const compiling = serialized.source !== undefined && !current;
  const source = format === "mjml" ? serialized.source : current?.result?.html;

  useEffect(() => {
    let cancelled = false;
    setDownloadStatus({ error: "", message: "" });
    if (serialized.source === undefined) return;
    Promise.resolve()
      .then(() =>
        cancelled ? undefined : compileEmail(document, { allowRawHtml, allowLocalImages }),
      )
      .then(
        (result) => {
          if (!cancelled && result) setCompilation({ input: serialized, attempt, result });
        },
        (error: unknown) => {
          if (!cancelled)
            setCompilation({ input: serialized, attempt, error: errorMessage(error) });
        },
      );
    return () => {
      cancelled = true;
    };
  }, [document, allowRawHtml, allowLocalImages, serialized, attempt]);

  const changeFormat = (next: ExportFormat) => {
    setFormat(next);
    setDownloadStatus({ error: "", message: "" });
  };
  const download = () => {
    if (source === undefined) return;
    try {
      downloadEmailSource(format, source);
      setDownloadStatus({ error: "", message: `Download started: email.${format}` });
    } catch (error) {
      setDownloadStatus({ error: errorMessage(error), message: "" });
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="pm-preview-backdrop"
      aria-label="Export email"
      aria-describedby={helpId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={() => {
        // Effect cleanup closes the native dialog during StrictMode replay.
        // Wait for the replay to reopen it before treating close as dismissal.
        queueMicrotask(() => {
          const dialog = dialogRef.current;
          if (dialog?.isConnected && !dialog.open) onClose();
        });
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
        }
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="pm-preview-dialog pm-export-dialog">
        <header className="pm-preview-header">
          <div>
            <strong>Export email</strong>
            <span id={helpId}>Review and download your current email. No upload required.</span>
          </div>
          <div className="pm-preview-actions">
            <button type="button" aria-label="Close export" onClick={onClose}>
              Close
            </button>
          </div>
        </header>
        <div className="pm-export-toolbar">
          <div className="pm-preview-actions" role="group" aria-label="Export format">
            <button
              type="button"
              aria-pressed={format === "html"}
              aria-controls={sourceId}
              onClick={() => changeFormat("html")}
            >
              HTML
            </button>
            <button
              type="button"
              aria-pressed={format === "mjml"}
              aria-controls={sourceId}
              onClick={() => changeFormat("mjml")}
            >
              MJML
            </button>
          </div>
          <span>{format === "html" ? "Compiled email HTML" : "Editable MJML source"}</span>
        </div>
        <div className="pm-export-body">
          {embeddedImages && (
            <p className="pm-export-warnings" role="note">
              {LOCAL_IMAGE_WARNING}
            </p>
          )}
          {compiling && (
            <p className="pm-export-status" role="status">
              Compiling HTML… MJML is already available.
            </p>
          )}
          {serialized.error && (
            <p className="pm-export-error" role="alert">
              Export failed: {serialized.error}
            </p>
          )}
          {current?.error && (
            <div className="pm-export-error" role="alert">
              <p>HTML compilation failed: {current.error}</p>
              <div className="pm-preview-actions">
                <button type="button" onClick={() => setAttempt((value) => value + 1)}>
                  Retry HTML compilation
                </button>
              </div>
            </div>
          )}
          {current?.result?.errors.length ? (
            <details className="pm-export-warnings">
              <summary tabIndex={0}>MJML warnings ({current.result.errors.length})</summary>
              <ul>
                {current.result.errors.map((error, index) => (
                  <li key={index}>
                    {error.line ? `Line ${error.line}: ` : ""}
                    {error.message}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          <label className="pm-export-source-label" htmlFor={sourceId}>
            {format.toUpperCase()} source <span>Read-only</span>
          </label>
          <textarea
            id={sourceId}
            className="pm-code pm-export-source"
            aria-label={`${format.toUpperCase()} source`}
            aria-busy={format === "html" && compiling}
            value={source ?? ""}
            placeholder={format === "html" && compiling ? "Compiling email HTML…" : ""}
            readOnly
            spellCheck={false}
            wrap="off"
          />
        </div>
        <footer className="pm-export-footer">
          <div className="pm-export-feedback">
            {downloadStatus.error ? (
              <p className="pm-export-error" role="alert">
                Download failed: {downloadStatus.error}
              </p>
            ) : (
              <p role="status">{downloadStatus.message || `email.${format} · UTF-8`}</p>
            )}
          </div>
          <div className="pm-preview-actions">
            <button
              type="button"
              className="pm-export-download"
              disabled={source === undefined}
              onClick={download}
            >
              <DownloadSimpleIcon aria-hidden="true" />
              Download {format.toUpperCase()}
            </button>
          </div>
        </footer>
      </section>
    </dialog>
  );
}
