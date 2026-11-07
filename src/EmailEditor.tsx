import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Puck, createUsePuck, type Data, type Plugin, type Overrides } from "@puckeditor/core";
import { EyeIcon } from "@phosphor-icons/react/dist/csr/Eye";
import { ExportIcon } from "@phosphor-icons/react/dist/csr/Export";
import { EmailExportDialog } from "./EmailExportDialog";
import { BlockPaletteItem } from "./BlockPaletteItem";
import { EmailOutline } from "./EmailOutline";
import { SelectionActionBar } from "./SelectionActionBar";
import { EditorComponentOverlay } from "./EditorComponentOverlay";
import { emailFieldTypes } from "./editor-field-types";
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
const usePuck = createUsePuck();

// Retain Puck's native controls while giving tablet canvases room to work.
// This stable override changes only UI state, never document data or history.
const ResponsiveEditorLayout: Overrides["puck"] = ({ children }) => {
  const left = usePuck((state) => state.appState.ui.leftSideBarVisible);
  const right = usePuck((state) => state.appState.ui.rightSideBarVisible);
  const dispatch = usePuck((state) => state.dispatch);
  const [tablet, setTablet] = useState(false);
  const previous = useRef({ left, right });

  useEffect(() => {
    const query = window.matchMedia("(min-width: 638px) and (max-width: 1000px)");
    const update = () => setTablet(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const was = previous.current;
    previous.current = { left, right };
    if (tablet && left && right) {
      dispatch({
        type: "setUi",
        // A newly opened panel wins. On initial load/resize, retain Fields.
        ui: !was.left ? { rightSideBarVisible: false } : { leftSideBarVisible: false },
        recordHistory: false,
      });
    }
  }, [tablet, left, right, dispatch]);

  return <>{children}</>;
};

export function EmailEditor({
  value,
  onChange,
  onPublish,
  onUploadImage,
  allowRawHtml = false,
  allowLocalImages = false,
  tailwindRuntime,
  headerTitle = "Puck MJML",
  headerActions,
  className,
}: EmailEditorProps) {
  const [editorData, setEditorData] = useState(() => sanitizeDocumentRichText(value));
  const [editorKey, setEditorKey] = useState(0);
  const [previewDocument, setPreviewDocument] = useState<EmailDocument | null>(null);
  const previewOpen = previewDocument !== null;
  const [exportDocument, setExportDocument] = useState<EmailDocument | null>(null);
  const [previewWidth, setPreviewWidth] = useState<"desktop" | "mobile">("desktop");
  const [compiled, setCompiled] = useState<CompiledEmail | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [compiling, setCompiling] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const previewButtonRef = useRef<HTMLButtonElement>(null);
  const exportButtonRef = useRef<HTMLButtonElement>(null);
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
    () =>
      createEmailConfig(uploadEnabled ? uploadImage : undefined, allowRawHtml, allowLocalImages),
    [uploadEnabled, uploadImage, allowRawHtml, allowLocalImages],
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
      setPreviewDocument(null);
      setCompiled(null);
      setExportDocument((openDocument) => (openDocument ? next : null));
    }
  }, [value]);

  useEffect(() => {
    if (!previewDocument) return;
    let cancelled = false;
    setCompiling(true);
    setCompiled(null);
    setPreviewError("");
    compileEmail(previewDocument, { allowRawHtml, allowLocalImages })
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
  }, [previewDocument, allowRawHtml, allowLocalImages]);

  useEffect(() => {
    if (!previewOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreviewDocument(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [previewOpen]);

  const handleChange = (next: Data) => {
    const document = next as EmailDocument;
    currentData.current = document;
    // Async edits such as pending uploads can finish while the workspace is
    // inert. Host echoes intentionally skip replacement, so refresh open
    // dialogs here without remounting Puck or changing its history.
    setPreviewDocument((openDocument) => (openDocument ? document : null));
    setExportDocument((openDocument) => (openDocument ? document : null));
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
          onClick={() => setPreviewDocument(currentData.current)}
        >
          <EyeIcon aria-hidden="true" />
          Preview
        </button>
        <button
          type="button"
          className="pm-preview-button"
          ref={exportButtonRef}
          aria-label="Export email"
          onClick={() => setExportDocument(currentData.current)}
        >
          <ExportIcon aria-hidden="true" />
          Export
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
          inert={previewOpen || Boolean(exportDocument) || undefined}
          style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}
        >
          <Puck
            key={editorKey}
            config={config}
            plugins={editorPlugins}
            dnd={{ enableDragHandle: true }}
            height="100%"
            data={editorData as Data}
            onChange={handleChange}
            onPublish={onPublish ? (data) => onPublish(data as EmailDocument) : undefined}
            overrides={{
              puck: ResponsiveEditorLayout,
              drawerItem: BlockPaletteItem,
              outline: EmailOutline,
              actionBar: SelectionActionBar,
              componentOverlay: EditorComponentOverlay,
              fieldTypes: emailFieldTypes,
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
        {exportDocument && (
          <EmailExportDialog
            document={exportDocument}
            allowRawHtml={allowRawHtml}
            allowLocalImages={allowLocalImages}
            onClose={() => setExportDocument(null)}
            restoreRef={exportButtonRef}
          />
        )}
        {previewOpen && (
          <dialog
            ref={dialogRef}
            className="pm-preview-backdrop"
            aria-label="Email preview"
            onCancel={(event) => {
              event.preventDefault();
              setPreviewDocument(null);
            }}
            onClose={() => {
              // Ignore a queued close from an effect cleanup if the modal has
              // already reopened (for example React StrictMode replay).
              if (!dialogRef.current?.open) setPreviewDocument(null);
            }}
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setPreviewDocument(null);
            }}
          >
            <section className="pm-preview-dialog">
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
                    Responsive
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
                    onClick={() => setPreviewDocument(null)}
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
          </dialog>
        )}
      </div>
    </TailwindRuntimeContext.Provider>
  );
}
