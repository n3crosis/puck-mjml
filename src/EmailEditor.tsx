import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Puck, type Data, type Plugin, type Overrides } from "@puckeditor/core";
import { EyeIcon } from "@phosphor-icons/react/dist/csr/Eye";
import { BlockPaletteItem } from "./BlockPaletteItem";
import { EmailOutline } from "./EmailOutline";
import { SelectionActionBar } from "./SelectionActionBar";
import { EditorComponentOverlay } from "./EditorComponentOverlay";
import { TableArrayField } from "./TableEditor";
import { PropertyFieldLabel, PropertyInspector } from "./PropertyInspector";
import { createEmailConfig } from "./config";
import { compileEmail } from "./export";
import { sanitizeDocumentRichText } from "./normalize";
import { TailwindRuntimeContext } from "./canvas-tailwind";
import { usePreviewFocus } from "./preview-focus";
import { RawHtmlPolicy } from "./RawHtmlPolicy";
import type { CompiledEmail, EmailDocument, EmailEditorProps } from "./types";

const fingerprint = (value: EmailDocument) => JSON.stringify(value);
// Puck otherwise creates a new empty plugin array when host props update,
// rebuilding slot renderers and unmounting focused inline text editors.
const editorPlugins: Plugin[] = [];

export function EmailEditor({
  value,
  onChange,
  onPublish,
  onUploadImage,
  allowRawHtml = false,
  tailwindRuntime,
  headerTitle = "Puck MJML",
  headerActions,
  className,
}: EmailEditorProps) {
  const [editorData, setEditorData] = useState(() => sanitizeDocumentRichText(value));
  const [editorKey, setEditorKey] = useState(0);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewWidth, setPreviewWidth] = useState<"desktop" | "mobile">("desktop");
  const [compiled, setCompiled] = useState<CompiledEmail | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [compiling, setCompiling] = useState(false);
  const dialogRef = useRef<HTMLElement>(null);
  const previewButtonRef = useRef<HTMLButtonElement>(null);
  usePreviewFocus(previewOpen, dialogRef, previewButtonRef);
  const currentData = useRef(editorData);
  // Keep Puck's component renderers stable when the host recreates its upload callback.
  const uploadCallback = useRef(onUploadImage);
  uploadCallback.current = onUploadImage;
  const uploadImage = useCallback((file: File) => {
    const upload = uploadCallback.current;
    if (!upload) return Promise.reject(new Error("Image upload is unavailable"));
    return upload(file);
  }, []);
  const uploadEnabled = Boolean(onUploadImage);
  const config = useMemo(
    () => createEmailConfig(uploadEnabled ? uploadImage : undefined, allowRawHtml),
    [uploadEnabled, uploadImage, allowRawHtml],
  );

  useEffect(() => {
    const current = fingerprint(currentData.current);
    if (fingerprint(value) === current) return;
    const next = sanitizeDocumentRichText(value);
    const normalizedCurrent = sanitizeDocumentRichText(currentData.current);
    // Equivalent host input must not remount Puck or clear its undo history.
    if (fingerprint(next) !== fingerprint(normalizedCurrent)) {
      currentData.current = next;
      setEditorData(next);
      setEditorKey((key) => key + 1);
      setPreviewOpen(false);
      setCompiled(null);
    }
  }, [value]);

  useEffect(() => {
    if (!previewOpen) return;
    let cancelled = false;
    setCompiling(true);
    setCompiled(null);
    setPreviewError("");
    compileEmail(currentData.current, { allowRawHtml })
      .then((result) => {
        if (!cancelled) setCompiled(result);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setCompiled(null);
          setPreviewError(error instanceof Error ? error.message : "Unable to compile email");
        }
      })
      .finally(() => {
        if (!cancelled) setCompiling(false);
      });
    return () => {
      cancelled = true;
    };
  }, [previewOpen, allowRawHtml]);

  useEffect(() => {
    if (!previewOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreviewOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [previewOpen]);

  const handleChange = (next: Data) => {
    const document = next as EmailDocument;
    currentData.current = document;
    onChange(document);
  };

  const renderHeaderActions = useCallback<Overrides["headerActions"]>(
    ({ children }) => (
      <>
        <RawHtmlPolicy enabled={allowRawHtml} />
        {onPublish && children}
        {headerActions}
        <button
          type="button"
          className="pm-preview-button"
          ref={previewButtonRef}
          aria-label="Preview email"
          onClick={() => setPreviewOpen(true)}
        >
          <EyeIcon aria-hidden="true" />
          Preview
        </button>
      </>
    ),
    [allowRawHtml, onPublish, headerActions],
  );

  return (
    <TailwindRuntimeContext.Provider value={tailwindRuntime}>
      <div
        className={["pm-editor", headerActions ? "pm-editor--custom-header" : "", className]
          .filter(Boolean)
          .join(" ")}
      >
        <div
          className="pm-editor-workspace"
          inert={previewOpen || undefined}
          style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}
        >
          <Puck
            key={editorKey}
            config={config}
            plugins={editorPlugins}
            height="100%"
            data={editorData as Data}
            onChange={handleChange}
            onPublish={onPublish ? (data) => onPublish(data as EmailDocument) : undefined}
            overrides={{
              drawerItem: BlockPaletteItem,
              outline: EmailOutline,
              actionBar: SelectionActionBar,
              componentOverlay: EditorComponentOverlay,
              fieldTypes: { array: TableArrayField },
              fields: PropertyInspector,
              fieldLabel: PropertyFieldLabel,
              headerActions: renderHeaderActions,
            }}
            headerTitle={headerTitle}
            viewports={[
              { width: 800, label: "Desktop" },
              { width: 390, label: "Mobile" },
            ]}
          />
        </div>
        {previewOpen && (
          <div
            className="pm-preview-backdrop"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setPreviewOpen(false);
            }}
          >
            <section
              ref={dialogRef}
              tabIndex={-1}
              className="pm-preview-dialog"
              role="dialog"
              aria-modal="true"
              aria-label="Email preview"
            >
              <span
                tabIndex={0}
                data-preview-focus-guard="start"
                aria-hidden="true"
                style={{ position: "fixed", width: 1, height: 1, overflow: "hidden", opacity: 0 }}
              />
              <header className="pm-preview-header">
                <div>
                  <strong>Email preview</strong>
                  <span>Rendered by MJML</span>
                </div>
                <div className="pm-preview-actions">
                  <button
                    type="button"
                    aria-pressed={previewWidth === "desktop"}
                    onClick={() => setPreviewWidth("desktop")}
                  >
                    Desktop
                  </button>
                  <button
                    type="button"
                    aria-pressed={previewWidth === "mobile"}
                    onClick={() => setPreviewWidth("mobile")}
                  >
                    Mobile
                  </button>
                  <button
                    type="button"
                    aria-label="Close preview"
                    onClick={() => setPreviewOpen(false)}
                  >
                    Close
                  </button>
                </div>
              </header>
              {compiling && <p className="pm-preview-status">Rendering preview…</p>}
              {previewError && (
                <p className="pm-preview-error" role="alert">
                  {previewError}
                </p>
              )}
              {compiled?.errors.length ? (
                <div className="pm-preview-errors" role="alert">
                  <strong>MJML warnings</strong>
                  <ul>
                    {compiled.errors.map((error, index) => (
                      <li key={index}>
                        {error.line ? `Line ${error.line}: ` : ""}
                        {error.message}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {compiled && !compiling && (
                <div className="pm-preview-stage">
                  <iframe
                    title="Rendered email"
                    sandbox=""
                    srcDoc={compiled.html}
                    className={
                      previewWidth === "mobile" ? "pm-preview-mobile" : "pm-preview-desktop"
                    }
                  />
                </div>
              )}
              <span
                tabIndex={0}
                data-preview-focus-guard="end"
                aria-hidden="true"
                style={{ position: "fixed", width: 1, height: 1, overflow: "hidden", opacity: 0 }}
              />
            </section>
          </div>
        )}
      </div>
    </TailwindRuntimeContext.Provider>
  );
}
