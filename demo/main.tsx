import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { createRoot } from "react-dom/client";
import { CaretDownIcon } from "@phosphor-icons/react/dist/csr/CaretDown";
import { DownloadSimpleIcon } from "@phosphor-icons/react/dist/csr/DownloadSimple";
import { UploadSimpleIcon } from "@phosphor-icons/react/dist/csr/UploadSimple";
import {
  EmailEditor,
  compileEmail,
  createExampleDocument,
  emailTemplates,
  toMjml,
  type EmailDocument,
  type EmailTemplateDefinition,
} from "../src";
import "./style.css";
import { reviewImport, hasUnsavedChanges } from "./import-review";

const DEFAULT_TEMPLATE_ID = "02-matte/product-update";

function download(name: string, content: string, mime: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function App() {
  const [templateId, setTemplateId] = useState(DEFAULT_TEMPLATE_ID);
  const [value, setValue] = useState<EmailDocument>(() => createExampleDocument());
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [baseline, setBaseline] = useState(() => JSON.stringify(value));
  const dirty = hasUnsavedChanges(value, baseline);
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
    setBaseline(JSON.stringify(next));
    setImportWarnings([]);
    setStatus("");
  };

  const importMjmlFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const request = ++importRequest.current;
    try {
      const source = await file.text();
      if (request !== importRequest.current) return;
      const { document, warnings } = reviewImport(source);
      if (!canReplace()) return;
      setValue(document);
      setBaseline(JSON.stringify(document));
      setImportWarnings(warnings);
      setTemplateId("imported");
      setStatus(
        warnings.length
          ? `Imported ${file.name} with ${warnings.length} note${warnings.length === 1 ? "" : "s"}: ${warnings.slice(0, 3).join(" ")}${warnings.length > 3 ? " …" : ""}`
          : "",
      );
    } catch (error) {
      if (request === importRequest.current)
        setStatus(
          `Import not loaded. Your previous email is unchanged. ${error instanceof Error ? error.message : "Import failed"}`,
        );
    }
  };

  const exportFile = async (kind: "mjml" | "html") => {
    setBusy(true);
    setStatus("");
    try {
      if (kind === "mjml") {
        download("email.mjml", toMjml(value), "application/xml");
        return;
      }
      const result = await compileEmail(value);
      if (result.errors.length) {
        setStatus(
          `MJML reported ${result.errors.length} warning${result.errors.length === 1 ? "" : "s"}. Check the preview for details.`,
        );
      }
      download(`email.${kind}`, result.html, "text/html");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Export failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="demo-app">
      <div className="demo-notice">
        Demo only: drafts are not saved. Download MJML before leaving.{" "}
        {dirty ? "You have unsaved edits." : ""}
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
      <main>
        <EmailEditor
          value={value}
          onChange={setValue}
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
              <label className="demo-import" title="Import MJML">
                <UploadSimpleIcon aria-hidden="true" />
                Import
                <input
                  aria-label="Import MJML"
                  type="file"
                  accept=".mjml,text/xml,application/xml,text/plain"
                  onChange={importMjmlFile}
                />
              </label>
              <button
                type="button"
                aria-label="Download MJML"
                title="Download MJML"
                disabled={busy}
                onClick={() => exportFile("mjml")}
              >
                <DownloadSimpleIcon aria-hidden="true" />
                MJML
              </button>
              <button
                type="button"
                className="demo-primary"
                aria-label="Download HTML"
                title="Download HTML"
                disabled={busy}
                onClick={() => exportFile("html")}
              >
                <DownloadSimpleIcon aria-hidden="true" />
                HTML
              </button>
            </div>
          }
        />
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
