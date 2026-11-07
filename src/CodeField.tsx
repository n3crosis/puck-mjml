import { useId, useState, type KeyboardEvent } from "react";
import { CSSCodeEditor } from "./CSSCodeEditor";

type CodeAreaProps = {
  id?: string;
  value: unknown;
  disabled?: boolean;
  rows?: number;
  format?: "css";
  ariaLabel: string;
  onChange: (value: string) => void;
};

/** CSS gets a full code editor; HTML source retains its existing plain-text field. */
export function CodeArea(props: CodeAreaProps) {
  return props.format === "css" ? <CSSCodeEditor {...props} /> : <SourceArea {...props} />;
}

function SourceArea({ id, value, disabled, rows = 4, ariaLabel, onChange }: CodeAreaProps) {
  const generatedId = useId();
  const areaId = id ?? generatedId;
  const [expanded, setExpanded] = useState(false);
  const source = typeof value === "string" ? value : "";
  const reportChange = (next: string) => {
    if (!disabled) onChange(next);
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
        value={source}
        onChange={(event) => reportChange(event.target.value)}
        onKeyDown={handleKeyDown}
      />
    </div>
  );
}
