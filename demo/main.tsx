import { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { CaretDownIcon } from "@phosphor-icons/react/dist/csr/CaretDown";
import { UploadSimpleIcon } from "@phosphor-icons/react/dist/csr/UploadSimple";
import {
  EmailEditor,
  createExampleDocument,
  emailTemplates,
  type EmailDocument,
  type EmailTemplateDefinition,
} from "../src";
import "./style.css";
import { reviewImport, hasUnsavedChanges, documentSnapshot } from "./import-review";
import { uploadLocalImage } from "./local-images";
import { ImportSource, type ImportResult } from "./import-source";
import { DemoWorkspace, demoWorkspacePlugins } from "./DemoWorkspace";
import { LOCAL_IMAGE_WARNING } from "../src/image-upload";

const DEFAULT_TEMPLATE_ID = "02-matte/product-update";

export function App() {
  const [templateId, setTemplateId] = useState(DEFAULT_TEMPLATE_ID);
  const [value, setValue] = useState<EmailDocument>(() => createExampleDocument());
  const [status, setStatus] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const importButtonRef = useRef<HTMLButtonElement>(null);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [baseline, setBaseline] = useState(() => documentSnapshot(value));
  const dirty = useMemo(() => hasUnsavedChanges(value, baseline), [value, baseline]);
  const importRequest = useRef(0);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const canReplace = () =>
    !dirtyRef.current || window.confirm("Discard your unsaved edits and replace this email?");

  const groups = useMemo(() => {
    const grouped = new Map<string, EmailTemplateDefinition[]>();
    for (const template of emailTemplates) {
      const bucket = grouped.get(template.group);
      if (bucket) bucket.push(template);
      else grouped.set(template.group, [template]);
    }
    return grouped;
  }, []);

  const loadTemplate = (id: string) => {
    const template = emailTemplates.find((entry) => entry.id === id);
    if (!template || !canReplace()) return;
    importRequest.current += 1;
    const next = template.create();
    setTemplateId(id);
    setValue(next);
    setBaseline(documentSnapshot(next));
    setImportWarnings([]);
    setStatus("");
  };

  const importMjml = async (input: File | string): Promise<ImportResult> => {
    const request = ++importRequest.current;
    try {
      const source = typeof input === "string" ? input : await input.text();
      if (request !== importRequest.current) return { status: "superseded" };
      const { document, warnings } = reviewImport(source);
      if (!canReplace()) return { status: "cancelled" };
      setValue(document);
      setBaseline(documentSnapshot(document));
      setImportWarnings(warnings);
      setTemplateId("imported");
      setStatus(
        warnings.length
          ? `Imported ${typeof input === "string" ? "MJML text" : input.name} with ${warnings.length} note${warnings.length === 1 ? "" : "s"}: ${warnings.slice(0, 3).join(" ")}${warnings.length > 3 ? " …" : ""}`
          : `Imported ${typeof input === "string" ? "MJML text" : input.name}.`,
      );
      return { status: "imported" };
    } catch (error) {
      if (request !== importRequest.current) return { status: "superseded" };
      const message = `Import not loaded. Your previous email is unchanged. ${error instanceof Error ? error.message : "Import failed"}`;
      setStatus(message);
      return { status: "error", message };
    }
  };

  const closeImport = () => {
    importRequest.current += 1;
    setImportOpen(false);
  };

  return (
    <div className="demo-app">
      <div className="demo-notice">
        Demo only: drafts are not saved. Download MJML before leaving.{" "}
        {dirty ? "You have unsaved edits." : ""}
        <span className="demo-local-images">
          {" "}
          Image uploads stay in this browser draft. {LOCAL_IMAGE_WARNING}
        </span>
      </div>
      {importWarnings.length > 0 && (
        <details className="demo-status">
          <summary>All import notes ({importWarnings.length})</summary>
          <ul>
            {importWarnings.map((warning, index) => (
              <li key={index}>{warning}</li>
            ))}
          </ul>
        </details>
      )}
      {status && (
        <div className="demo-status" role="status">
          {status}
        </div>
      )}
      {importOpen && (
        <ImportSource onImport={importMjml} onClose={closeImport} restoreRef={importButtonRef} />
      )}
      <main>
        <DemoWorkspace document={value}>
          <EmailEditor
            plugins={demoWorkspacePlugins}
            value={value}
            onChange={setValue}
            onUploadImage={uploadLocalImage}
            allowLocalImages
            headerActions={
              <div className="demo-actions">
                <label className="demo-template-picker">
                  <span>Template</span>
                  <span className="demo-template-select">
                    <select
                      aria-label="Email template"
                      value={templateId}
                      onChange={(event) => loadTemplate(event.target.value)}
                    >
                      {templateId === "imported" && <option value="imported">Imported MJML</option>}
                      {[...groups.entries()].map(([group, templates]) =>
                        group ? (
                          <optgroup key={group} label={group}>
                            {templates.map((template) => (
                              <option key={template.id} value={template.id}>
                                {template.label}
                              </option>
                            ))}
                          </optgroup>
                        ) : (
                          templates.map((template) => (
                            <option key={template.id} value={template.id}>
                              {template.label}
                            </option>
                          ))
                        ),
                      )}
                    </select>
                    <CaretDownIcon className="demo-template-chevron" aria-hidden="true" />
                  </span>
                </label>
                <span className="demo-divider" />
                <button
                  ref={importButtonRef}
                  type="button"
                  className="demo-import"
                  aria-haspopup="dialog"
                  onClick={() => setImportOpen(true)}
                >
                  <UploadSimpleIcon aria-hidden="true" />
                  Import
                </button>
              </div>
            }
          />
        </DemoWorkspace>
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
