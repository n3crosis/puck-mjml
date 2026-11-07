import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { formatCss } from "./format-css";

/**
 * Monospace source editor for CSS and HTML fields. Tab inserts two spaces so
 * authors can indent without leaving the field; Shift+Tab still moves focus.
 */
export function CodeArea({
  id,
  value,
  disabled,
  rows = 4,
  format,
  ariaLabel,
  onChange,
}: {
  id?: string;
  value: unknown;
  disabled?: boolean;
  rows?: number;
  format?: "css";
  ariaLabel: string;
  onChange: (value: string) => void;
}) {
  const generatedId = useId();
  const areaId = id ?? generatedId;
  const [expanded, setExpanded] = useState(false);
  const source = typeof value === "string" ? value : "";
  const [draft, setDraft] = useState(() => (format === "css" ? formatCss(source) : source));
  const focused = useRef(false);
  const reported = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (source === reported.current) {
      reported.current = undefined;
      return;
    }
    // External changes, including history, remain authoritative. Only format their
    // presentation when the editor is idle; never rewrite text during active typing.
    setDraft(format === "css" && !focused.current ? formatCss(source) : source);
  }, [source, format]);
  const reportChange = (next: string) => {
    setDraft(next);
    reported.current = next;
    onChange(next);
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Tab" || event.shiftKey || disabled) return;
    event.preventDefault();
    const target = event.currentTarget;
    const { selectionStart, selectionEnd } = target;
    const next = `${target.value.slice(0, selectionStart)}  ${target.value.slice(selectionEnd)}`;
    reportChange(next);
    requestAnimationFrame(() => {
      target.setSelectionRange(selectionStart + 2, selectionStart + 2);
    });
  };
  return (
    <div className="pm-code-field">
      <div className="pm-code-tools">
        {format === "css" && (
          <button
            type="button"
            aria-label={`Format ${ariaLabel}`}
            disabled={disabled}
            onClick={() => {
              const next = formatCss(draft);
              setDraft(next);
              if (next !== source) reportChange(next);
            }}
          >
            Format
          </button>
        )}
        <button
          type="button"
          aria-label={`${expanded ? "Collapse" : "Expand"} ${ariaLabel} editor`}
          aria-expanded={expanded}
          aria-controls={areaId}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "Collapse" : "Expand"}
        </button>
      </div>
      <textarea
        id={areaId}
        className="pm-code"
        aria-label={ariaLabel}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
        wrap="off"
        rows={expanded ? Math.max(16, rows) : rows}
        disabled={disabled}
        value={format === "css" ? draft : source}
        onFocus={() => {
          focused.current = true;
        }}
        onBlur={() => {
          focused.current = false;
        }}
        onChange={(event) => reportChange(event.target.value)}
        onKeyDown={handleKeyDown}
      />
    </div>
  );
}
