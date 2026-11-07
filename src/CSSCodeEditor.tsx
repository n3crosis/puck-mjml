import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from "@codemirror/autocomplete";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
  isolateHistory,
} from "@codemirror/commands";
import { css } from "@codemirror/lang-css";
import {
  bracketMatching,
  HighlightStyle,
  indentOnInput,
  indentUnit,
  syntaxHighlighting,
} from "@codemirror/language";
import { Annotation, Compartment, EditorState, Transaction } from "@codemirror/state";
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { formatCss } from "./format-css";
import "./css-code-editor.css";

const externalSource = Annotation.define<boolean>();
const highlighting = HighlightStyle.define([
  { tag: tags.comment, class: "pm-css-comment" },
  { tag: [tags.keyword, tags.modifier], class: "pm-css-keyword" },
  { tag: [tags.propertyName, tags.attributeName], class: "pm-css-property" },
  {
    tag: [tags.className, tags.tagName, tags.definition(tags.variableName)],
    class: "pm-css-selector",
  },
  { tag: [tags.string, tags.color, tags.literal], class: "pm-css-value" },
  { tag: [tags.number, tags.unit], class: "pm-css-number" },
]);

/** CSS source editor. The view survives host echoes, focus changes, and resizing. */
export function CSSCodeEditor({
  id,
  value,
  disabled = false,
  rows = 4,
  ariaLabel,
  onChange,
}: {
  id?: string;
  value: unknown;
  disabled?: boolean;
  rows?: number;
  ariaLabel: string;
  onChange: (value: string) => void;
}) {
  const generatedId = useId();
  const editorId = `${id ?? "pm-css"}-${generatedId}`;
  const helpId = `${editorId}-help`;
  const source = typeof value === "string" ? value : "";
  const [expanded, setExpanded] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const previousSource = useRef(source);
  const latest = useRef({ source, disabled, onChange });
  latest.current = { source, disabled, onChange };
  const [configuration] = useState(() => ({
    permissions: new Compartment(),
    attributes: new Compartment(),
    history: new Compartment(),
  }));

  useEffect(() => {
    if (!host.current) return;
    const editor = new EditorView({
      parent: host.current,
      state: EditorState.create({
        // Readable initial presentation does not write or normalize the host document.
        doc: formatCss(latest.current.source),
        extensions: [
          css(),
          syntaxHighlighting(highlighting),
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightActiveLine(),
          drawSelection(),
          indentUnit.of("  "),
          EditorState.tabSize.of(2),
          indentOnInput(),
          bracketMatching(),
          closeBrackets(),
          autocompletion(),
          configuration.history.of(history()),
          // CodeMirror groups delete.dedent with adjacent changes by default.
          // Isolate both indent directions so Tab followed by Shift+Tab does
          // not collapse into a no-op history entry or absorb nearby typing.
          EditorState.transactionExtender.of((transaction) =>
            transaction.docChanged &&
            (transaction.isUserEvent("input.indent") || transaction.isUserEvent("delete.dedent"))
              ? { annotations: isolateHistory.of("full") }
              : null,
          ),
          keymap.of([
            ...completionKeymap,
            ...closeBracketsKeymap,
            // Own history shortcuts even when local history is empty: never undo
            // an unrelated Puck field while the code editor has keyboard focus.
            ...historyKeymap.map((binding) => ({
              ...binding,
              preventDefault: true,
              stopPropagation: true,
            })),
            indentWithTab,
            ...defaultKeymap,
          ]),
          configuration.permissions.of([]),
          configuration.attributes.of([]),
          EditorState.transactionFilter.of((transaction) =>
            transaction.docChanged &&
            latest.current.disabled &&
            !transaction.annotation(externalSource)
              ? []
              : transaction,
          ),
          EditorView.updateListener.of((update) => {
            if (
              !update.docChanged ||
              latest.current.disabled ||
              update.transactions.every((transaction) => transaction.annotation(externalSource))
            )
              return;
            latest.current.onChange(update.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = editor;
    return () => {
      view.current = null;
      editor.destroy();
    };
  }, [configuration]);

  useEffect(() => {
    view.current?.dispatch({
      effects: [
        configuration.permissions.reconfigure([
          EditorState.readOnly.of(disabled),
          EditorView.editable.of(!disabled),
        ]),
        configuration.attributes.reconfigure(
          EditorView.contentAttributes.of({
            id: editorId,
            "aria-label": ariaLabel,
            "aria-describedby": helpId,
            "aria-readonly": String(disabled),
            "aria-multiline": "true",
            // Read-only source remains focusable for keyboard selection and copying.
            tabindex: "0",
            spellcheck: "false",
            autocapitalize: "off",
            autocorrect: "off",
          }),
        ),
      ],
    });
  }, [ariaLabel, configuration, disabled, editorId, helpId]);

  useEffect(() => {
    const editor = view.current;
    if (!editor || source === previousSource.current) return;
    previousSource.current = source;
    if (source === editor.state.doc.toString()) return;
    const next = editor.hasFocus ? source : formatCss(source);
    // Host replacements and host history are authoritative. Clear stale local
    // history, but retain the view, focus, scroll, and a valid cursor position.
    const { anchor, head } = editor.state.selection.main;
    editor.dispatch({
      changes: { from: 0, to: editor.state.doc.length, insert: next },
      selection: { anchor: Math.min(anchor, next.length), head: Math.min(head, next.length) },
      effects: configuration.history.reconfigure([]),
      annotations: [externalSource.of(true), Transaction.addToHistory.of(false)],
    });
    editor.dispatch({ effects: configuration.history.reconfigure(history()) });
  }, [configuration, source]);

  const format = () => {
    const editor = view.current;
    if (!editor || latest.current.disabled) return;
    const before = editor.state.doc.toString();
    const next = formatCss(before);
    if (next !== before) {
      editor.dispatch({
        changes: { from: 0, to: editor.state.doc.length, insert: next },
        annotations: [Transaction.userEvent.of("input.format"), isolateHistory.of("full")],
      });
    } else if (next !== latest.current.source) {
      latest.current.onChange(next);
    }
  };

  return (
    <div className="pm-code-field pm-css-field" data-readonly={disabled || undefined}>
      <div className="pm-code-tools">
        <span className="pm-css-language" aria-hidden="true">
          CSS
        </span>
        <button
          type="button"
          aria-label={`Format ${ariaLabel}`}
          disabled={disabled}
          onClick={format}
        >
          Format
        </button>
        <button
          type="button"
          aria-label={`${expanded ? "Collapse" : "Expand"} ${ariaLabel} editor`}
          aria-expanded={expanded}
          aria-controls={editorId}
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? "Collapse" : "Expand"}
        </button>
      </div>
      <div
        ref={host}
        className="pm-css-editor-host"
        style={
          {
            "--pm-code-height": `${Math.max(expanded ? 16 : 4, rows) * 18 + 16}px`,
          } as CSSProperties
        }
      />
      <p id={helpId} className="pm-field-help pm-css-help">
        {disabled
          ? "Read-only CSS. Select and copy with the keyboard."
          : "Tab / Shift+Tab to indent. Esc, then Tab to leave."}
      </p>
    </div>
  );
}
