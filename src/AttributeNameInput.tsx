import { useEffect, useId, useRef, useState } from "react";

export type AttributeNameGroup = { label: string; values: string[] };
const searchKey = (value: string) => value.toLowerCase().replace(/[\s_-]+/g, "");

/** A free-form property name with suggestions, without changing the stored value while searching. */
export function AttributeNameInput({
  id,
  name,
  value,
  groups,
  disabled = false,
  ariaLabel,
  onChange,
  onCommit,
  contextKey,
}: {
  id?: string;
  name: string;
  value: string;
  groups: AttributeNameGroup[];
  disabled?: boolean;
  ariaLabel: string;
  onChange: (value: string) => void;
  onCommit?: (value: string) => void;
  contextKey?: string;
}) {
  const generatedId = useId();
  const inputId = `${id ?? "pm-attribute-name"}-${generatedId}`;
  const listId = `${inputId}-suggestions`;
  const helpId = `${inputId}-help`;
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState(value);
  const draftRef = useRef(value);
  const dirty = useRef(false);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [active, setActive] = useState(-1);
  const query = searching ? searchKey(draft) : "";
  const options = groups.flatMap((group) =>
    group.values
      .filter((candidate) => !query || searchKey(candidate).includes(query))
      .map((name) => ({ name, group: group.label, custom: false })),
  );
  const custom = draft.trim();
  if (searching && custom && !groups.some((group) => group.values.includes(custom)))
    options.push({ name: custom, group: "Custom property", custom: true });
  const expanded = open && !disabled;
  const selected = expanded && active >= 0 ? options[active] : undefined;

  useEffect(() => {
    draftRef.current = value;
    dirty.current = false;
    setDraft(value);
    setSearching(false);
    setActive(-1);
  }, [value, contextKey, disabled]);
  useEffect(() => {
    if (selected)
      list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: "nearest" });
  }, [active, expanded, selected?.name]);

  const commit = (next: string) => {
    if (disabled) return;
    draftRef.current = next;
    dirty.current = false;
    setDraft(next);
    setOpen(false);
    setSearching(false);
    setActive(-1);
    if (next !== value) onChange(next);
  };
  return (
    <div className="pm-attribute-name-control">
      <input
        ref={input}
        id={inputId}
        className="pm-attribute-name"
        name={name}
        role="combobox"
        aria-label={ariaLabel}
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-describedby={helpId}
        aria-activedescendant={selected ? `${listId}-${active}` : undefined}
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        placeholder="Type a property…"
        title={value || "Search or type a property name"}
        value={draft}
        disabled={disabled}
        onFocus={(event) => {
          setOpen(true);
          setSearching(false);
          setActive(-1);
          event.currentTarget.select();
        }}
        onChange={(event) => {
          dirty.current = true;
          draftRef.current = event.target.value;
          setDraft(event.target.value);
          setSearching(true);
          setOpen(true);
          setActive(0);
        }}
        onBlur={() => {
          if (dirty.current) commit(draftRef.current);
          else setOpen(false);
        }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing || event.ctrlKey || event.metaKey || event.altKey)
            return;
          if (event.key === "Escape" && expanded) {
            event.preventDefault();
            event.stopPropagation();
            dirty.current = false;
            draftRef.current = value;
            setDraft(value);
            setOpen(false);
            setSearching(false);
            setActive(-1);
          } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
            const direction = event.key === "ArrowDown" ? 1 : -1;
            setActive(
              options.length
                ? active < 0
                  ? direction > 0
                    ? 0
                    : options.length - 1
                  : (active + direction + options.length) % options.length
                : -1,
            );
          } else if (event.key === "Enter") {
            event.preventDefault();
            commit(selected?.name ?? draft);
            onCommit?.(selected?.name ?? draft);
          } else if (event.key === "Tab") {
            commit(selected?.name ?? draft);
          }
        }}
      />
      <span className="pm-attribute-search-help" id={helpId}>
        Type to search or enter a custom property. Arrow keys choose, Enter or Tab accepts, Escape
        cancels.
      </span>
      <div
        ref={list}
        id={listId}
        className="pm-attribute-suggestions"
        role="listbox"
        aria-label={`${ariaLabel} suggestions`}
        hidden={!expanded}
      >
        {options.map((option, index) => (
          <div
            key={option.name}
            id={`${listId}-${index}`}
            role="option"
            aria-selected={index === active}
            data-property={option.name}
            className="pm-attribute-suggestion"
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => {
              commit(option.name);
              input.current?.focus();
              onCommit?.(option.name);
            }}
          >
            <span>{option.name}</span>
            <small>{option.custom ? "Use custom name" : option.group}</small>
          </div>
        ))}
        {!options.length && <div className="pm-attribute-no-results">Type a property name</div>}
      </div>
    </div>
  );
}

export const htmlAttributeNameGroups: AttributeNameGroup[] = [
  {
    label: "Common HTML attributes",
    values: [
      "alt",
      "class",
      "dir",
      "height",
      "href",
      "id",
      "lang",
      "name",
      "rel",
      "role",
      "src",
      "style",
      "target",
      "title",
      "width",
    ],
  },
  {
    label: "Accessibility",
    values: ["aria-label", "aria-hidden", "aria-describedby", "aria-labelledby", "tabindex"],
  },
  { label: "Custom data", values: ["data-id", "data-testid"] },
];
