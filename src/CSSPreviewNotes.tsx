import { useEffect, useMemo, useState } from "react";
import { scopeDocumentCss } from "./canvas-css";

/** Preview diagnostics only: never rewrite source, publish CSS, or fetch fonts. */
export function CSSPreviewNotes({
  source,
  descriptionId,
  ariaLabel,
}: {
  source: string;
  descriptionId: string;
  ariaLabel: string;
}) {
  const notes = useMemo(
    () =>
      Array.from(
        new Set(
          scopeDocumentCss([{ css: source }], { scope: "pm-css-diagnostics" }).notes.map((note) => {
            // Each field diagnoses its own sheet. Do not label every array item
            // "Custom CSS 1", or maintain another copy of the scoping rules here.
            const text = note.replace(/^Custom CSS 1 /, "");
            return text.charAt(0).toUpperCase() + text.slice(1);
          }),
        ),
      ),
    [source],
  );
  const count = notes.length;
  const [announcement, setAnnouncement] = useState("");
  useEffect(() => {
    // Wait for a pause in typing. Announce only a changed count/clear state, not
    // every changing parser offset or selector in an unfinished draft.
    const timer = setTimeout(() => {
      setAnnouncement((previous) =>
        count
          ? `${ariaLabel}: ${count} native preview ${count === 1 ? "note" : "notes"}. Source CSS and export are unchanged.`
          : previous
            ? `${ariaLabel}: Native preview notes cleared.`
            : "",
      );
    }, 700);
    return () => clearTimeout(timer);
  }, [ariaLabel, count, source]);

  return (
    <>
      <div className={count ? "pm-css-preview-notes" : undefined}>
        <p id={descriptionId} hidden={count === 0}>
          {count > 0 && "Native editor preview may differ. Source CSS and export are unchanged."}
        </p>
        {count > 0 && (
          <details>
            <summary>
              {count} preview {count === 1 ? "note" : "notes"}
            </summary>
            <ul>
              {notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
            <p>Check the compiled email preview. These notes are not a full CSS validation.</p>
          </details>
        )}
      </div>
      <span className="pm-css-status" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </span>
    </>
  );
}
