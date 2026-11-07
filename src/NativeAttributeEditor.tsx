import { useEffect, useRef, type DragEvent } from "react";
import { DotsSixVertical } from "@phosphor-icons/react/dist/csr/DotsSixVertical";
import { DotsThree } from "@phosphor-icons/react/dist/csr/DotsThree";
import { BracketsCurly } from "@phosphor-icons/react/dist/csr/BracketsCurly";
import { Plus } from "@phosphor-icons/react/dist/csr/Plus";
import { ColorInput } from "./ColorInput";
import { nativeAttributeNames, nativeCatalog } from "./native-attributes";
import type { MjmlAttribute } from "./types";

const pathSegments = (path: string) => path.replace(/\[(\d+|\*)\]/g, ".$1").split(".");
const pathPrefix = (pattern: string[], path: string[]) =>
  pattern.length <= path.length &&
  pattern.every(
    (part, index) => part === path[index] || (part === "*" && /^\d+$/.test(path[index])),
  );

/** Resolve exact/wildcard rules at each ancestor; a locked parent stays locked. */
function lockedPath(path: string, fields: Record<string, boolean | undefined>) {
  const parts = pathSegments(path);
  const matching = new Map<number, { specificity: number; locked: boolean }>();
  for (const [pattern, locked] of Object.entries(fields)) {
    if (locked === undefined) continue;
    const rule = pathSegments(pattern);
    if (!pathPrefix(rule, parts)) continue;
    const specificity = rule.filter((part) => part !== "*").length;
    const previous = matching.get(rule.length);
    if (!previous || specificity > previous.specificity)
      matching.set(rule.length, { specificity, locked });
    else if (specificity === previous.specificity && locked) previous.locked = true;
  }
  return [...matching.values()].some((rule) => rule.locked);
}

const groups: [string, RegExp][] = [
  [
    "Content and links",
    /^(src|srcset|sizes|href|alt|title|name|target|rel|usemap|base-url|thumbnails-src)$/,
  ],
  [
    "Layout and spacing",
    /^(width|height|max-height|padding(?:-|$)|inner-padding|align|text-align|vertical-align|direction|mode|gutter|full-width|fluid-on-mobile)/,
  ],
  ["Typography", /^(font-|line-height|letter-spacing|text-decoration|text-transform)/],
  [
    "Appearance",
    /^(color|background-|container-background-|inner-background-|border(?:-|$)|inner-border)/,
  ],
  ["Component options", /^(?!css-class$|mj-class$|id$)/],
  ["Classes and identifiers", /./],
];

function attributeDescriptors(tag: string, name: string): string[] {
  return tag === "*"
    ? Object.values(nativeCatalog).flatMap((component) =>
        Object.hasOwn(component.allowedAttributes, name) ? [component.allowedAttributes[name]] : [],
      )
    : nativeCatalog[tag] && Object.hasOwn(nativeCatalog[tag].allowedAttributes, name)
      ? [nativeCatalog[tag].allowedAttributes[name]]
      : [];
}

function colorAttribute(tag: string, name: string): boolean {
  const descriptors = attributeDescriptors(tag, name);
  return descriptors.length > 0 && descriptors.every((descriptor) => descriptor === "color");
}

function valueChoices(tag: string, name: string): string[] | undefined {
  const descriptors = attributeDescriptors(tag, name);
  if (!descriptors.length) return undefined;
  const choices = new Set<string>();
  for (const descriptor of descriptors) {
    if (descriptor === "boolean") {
      choices.add("true");
      choices.add("false");
    } else if (descriptor.startsWith("enum(") && descriptor.endsWith(")")) {
      descriptor
        .slice(5, -1)
        .split(",")
        .forEach((value) => choices.add(value));
    } else return undefined;
  }
  return [...choices];
}

function placeholder(tag: string, entry: MjmlAttribute): string {
  if (entry.template) return "{{ value }}";
  if (entry.name === "width")
    return tag === "mj-column" || tag === "mj-group" ? "e.g. 50%" : "e.g. 600px";
  if (/padding|gutter|height|radius/.test(entry.name)) return "e.g. 16px";
  if (/color/.test(entry.name)) return "e.g. #ffffff";
  if (entry.name === "font-size") return "e.g. 16px";
  if (entry.name === "line-height") return "e.g. 1.5";
  const fallback = nativeCatalog[tag]?.defaultAttributes?.[entry.name];
  return typeof fallback === "string" && fallback ? `e.g. ${fallback}` : "Value";
}

export function NativeAttributeEditor({
  id,
  name,
  label,
  tag,
  value,
  onChange,
  readOnly = false,
  readOnlyFields = {},
  allowRawHtml = false,
}: {
  id: string;
  name: string;
  label: string;
  tag: string;
  value: MjmlAttribute[] | undefined;
  onChange: (value: MjmlAttribute[]) => void;
  readOnly?: boolean;
  readOnlyFields?: Record<string, boolean | undefined>;
  allowRawHtml?: boolean;
}) {
  const entries = Array.isArray(value) ? value : [];
  const locked = (index: number, property: keyof MjmlAttribute) =>
    readOnly || lockedPath(`${name}[${index}].${property}`, readOnlyFields);
  const fieldLocked = readOnly || lockedPath(name, readOnlyFields);
  // Reordering/deleting would assign another row to a locked index; appending
  // could create a later override of a protected attribute. Keep structure fixed
  // whenever this list contains any protected descendant.
  const structureLocked =
    fieldLocked ||
    Object.entries(readOnlyFields).some(([pattern, value]) => {
      if (!value) return false;
      const rule = pathSegments(pattern);
      const prefix = pathSegments(name);
      return rule.length > prefix.length && pathPrefix(rule.slice(0, prefix.length), prefix);
    });
  const editorRef = useRef<HTMLDivElement>(null);
  const dragIndex = useRef<number | null>(null);
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const document = editor.ownerDocument;
    const openMenus = () => editor.querySelectorAll<HTMLDetailsElement>(".pm-attribute-menu[open]");
    const dismissOutside = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      for (const menu of openMenus()) {
        if (!menu.contains(event.target)) menu.open = false;
      }
    };
    const dismissEscape = (event: KeyboardEvent) => {
      if (
        event.key !== "Escape" ||
        !(event.target instanceof Node) ||
        !editor.contains(event.target)
      )
        return;
      const menus = openMenus();
      if (!menus.length) return;
      for (const menu of menus) menu.open = false;
      menus[0].querySelector("summary")?.focus();
      event.preventDefault();
      event.stopPropagation();
    };
    document.addEventListener("pointerdown", dismissOutside, true);
    document.addEventListener("keydown", dismissEscape, true);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside, true);
      document.removeEventListener("keydown", dismissEscape, true);
    };
  }, []);
  const supportedTag = tag === "*" || Object.hasOwn(nativeCatalog, tag) ? tag : "*";
  const names = nativeAttributeNames(supportedTag);
  const remaining = new Set(names);
  const options = groups.map(([label, pattern]) => {
    const values = [...remaining].filter((attribute) => pattern.test(attribute));
    values.forEach((attribute) => remaining.delete(attribute));
    return { label, values };
  });
  const update = (index: number, patch: Partial<MjmlAttribute>) => {
    if (!Object.keys(patch).some((property) => locked(index, property as keyof MjmlAttribute)))
      onChange(
        entries.map((entry, current) => {
          if (current !== index) return entry;
          // Deliberate native edits become user-owned, even if a later edit
          // restores the imported value. Moving a row retains its ownership.
          const { source: _source, importBaseline: _baseline, ...explicit } = entry;
          return { ...explicit, ...patch };
        }),
      );
  };
  const move = (from: number, to: number) => {
    if (
      structureLocked ||
      from === to ||
      from < 0 ||
      to < 0 ||
      from >= entries.length ||
      to >= entries.length
    )
      return;
    const next = [...entries];
    next.splice(to, 0, next.splice(from, 1)[0]);
    onChange(next);
  };
  const drop = (event: DragEvent, to: number) => {
    if (dragIndex.current === null) return;
    event.preventDefault();
    const from = dragIndex.current;
    dragIndex.current = null;
    move(from, to);
  };
  const closeMenu = (target: EventTarget & HTMLElement) => {
    target.closest("details")?.removeAttribute("open");
  };
  return (
    <div
      ref={editorRef}
      className="pm-attribute-editor"
      role="group"
      aria-labelledby={`${id}-label`}
    >
      <div className="pm-attribute-heading">
        <span id={`${id}-label`}>{label}</span>
        {entries.length ? <span className="pm-attribute-count">{entries.length}</span> : null}
      </div>
      <div className="pm-attribute-list">
        {entries.map((entry, index) => {
          const rowId = `${id}-${index}`;
          const attributeName = typeof entry.name === "string" ? entry.name : "";
          const current = typeof entry.value === "string" ? entry.value : "";
          const choices = entry.template
            ? undefined
            : valueChoices(supportedTag, attributeName.trim());
          return (
            <div
              key={index}
              className="pm-attribute-row"
              data-mode={entry.inherit ? "inherit" : entry.template ? "template" : "value"}
              onDragOver={(event) => {
                if (!structureLocked && dragIndex.current !== null) event.preventDefault();
              }}
              onDrop={(event) => drop(event, index)}
            >
              <button
                className="pm-attribute-grip"
                type="button"
                title="Drag to reorder; use the row menu to move with the keyboard"
                aria-label={`Drag attribute ${index + 1}`}
                disabled={structureLocked || entries.length < 2}
                draggable={!structureLocked && entries.length > 1}
                onDragStart={(event) => {
                  if (structureLocked) return;
                  dragIndex.current = index;
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", String(index));
                }}
                onDragEnd={() => {
                  dragIndex.current = null;
                }}
              >
                <DotsSixVertical size={14} weight="bold" aria-hidden="true" />
              </button>
              <select
                className="pm-attribute-name"
                id={`${rowId}-name`}
                name={`${name}[${index}].name`}
                aria-label={`Attribute ${index + 1}`}
                title={attributeName || "Choose an attribute"}
                value={attributeName}
                disabled={locked(index, "name")}
                onChange={(event) => update(index, { name: event.target.value })}
              >
                <option value="">Property…</option>
                {attributeName && !names.includes(attributeName) ? (
                  <option value={attributeName}>{attributeName} (unsupported)</option>
                ) : null}
                {options
                  .filter((group) => group.values.length > 0)
                  .map((group) => (
                    <optgroup key={group.label} label={group.label}>
                      {group.values.map((attribute) => (
                        <option key={attribute} value={attribute}>
                          {attribute}
                        </option>
                      ))}
                    </optgroup>
                  ))}
              </select>
              <span className="pm-attribute-colon" aria-hidden="true">
                :
              </span>
              {entry.inherit ? (
                <input
                  className="pm-attribute-value"
                  aria-label={`Value for ${attributeName || `attribute ${index + 1}`}`}
                  value="Inherited"
                  disabled
                  title="Uses the defaults or MJML classes; the local value is preserved"
                />
              ) : choices ? (
                <select
                  className="pm-attribute-value"
                  id={`${rowId}-value`}
                  name={`${name}[${index}].value`}
                  aria-label={`Value for ${attributeName || `attribute ${index + 1}`}`}
                  title={current}
                  value={current}
                  disabled={locked(index, "value")}
                  onChange={(event) => update(index, { value: event.target.value })}
                >
                  {!choices.includes(current) ? (
                    <option value={current}>
                      {current ? `${current} (current value)` : "Choose value…"}
                    </option>
                  ) : null}
                  {choices.map((choice) => (
                    <option key={choice} value={choice}>
                      {choice || "Empty value"}
                    </option>
                  ))}
                </select>
              ) : !entry.template && colorAttribute(supportedTag, attributeName.trim()) ? (
                <ColorInput
                  className="pm-attribute-value"
                  id={`${rowId}-value`}
                  name={`${name}[${index}].value`}
                  aria-label={`Value for ${attributeName}`}
                  pickerLabel={`Choose ${attributeName} color`}
                  value={current}
                  title={current || placeholder(supportedTag, entry)}
                  placeholder={placeholder(supportedTag, entry)}
                  disabled={locked(index, "value")}
                  spellCheck={false}
                  onChange={(event) => update(index, { value: event.target.value })}
                />
              ) : (
                <input
                  className="pm-attribute-value"
                  id={`${rowId}-value`}
                  name={`${name}[${index}].value`}
                  aria-label={`Value for ${attributeName || `attribute ${index + 1}`}`}
                  value={current}
                  title={current || placeholder(supportedTag, entry)}
                  placeholder={placeholder(supportedTag, entry)}
                  disabled={locked(index, "value")}
                  spellCheck={false}
                  onChange={(event) => update(index, { value: event.target.value })}
                />
              )}
              <details
                className="pm-attribute-menu"
                onToggle={(event) => {
                  const menu = event.currentTarget;
                  if (!menu.open) return;
                  editorRef.current
                    ?.querySelectorAll<HTMLDetailsElement>(".pm-attribute-menu[open]")
                    .forEach((other) => {
                      if (other !== menu) other.open = false;
                    });
                }}
              >
                <summary
                  aria-label={`Options for attribute ${index + 1}`}
                  title={`Attribute options${entry.template ? " · template" : ""}`}
                >
                  {entry.template && !entry.inherit ? (
                    <BracketsCurly size={14} aria-hidden="true" />
                  ) : (
                    <DotsThree size={16} weight="bold" aria-hidden="true" />
                  )}
                </summary>
                <div className="pm-attribute-popover">
                  <label>
                    <input
                      type="checkbox"
                      aria-label={`Inherit attribute ${index + 1}`}
                      checked={Boolean(entry.inherit)}
                      disabled={locked(index, "inherit")}
                      onChange={(event) => update(index, { inherit: event.target.checked })}
                    />{" "}
                    Inherit from defaults
                  </label>
                  {allowRawHtml && !entry.inherit ? (
                    <label>
                      <input
                        type="checkbox"
                        aria-label={`Template value for attribute ${index + 1}`}
                        checked={Boolean(entry.template)}
                        disabled={locked(index, "template")}
                        onChange={(event) => update(index, { template: event.target.checked })}
                      />{" "}
                      Template value
                    </label>
                  ) : null}
                  {entry.template && !entry.inherit ? (
                    <p>
                      Preserved without evaluation. Resolve layout-dependent values before compiling
                      HTML.
                    </p>
                  ) : null}
                  <div className="pm-attribute-order">
                    <button
                      type="button"
                      disabled={structureLocked || index === 0}
                      onClick={(event) => {
                        closeMenu(event.currentTarget);
                        move(index, index - 1);
                      }}
                    >
                      Move up
                    </button>
                    <button
                      type="button"
                      disabled={structureLocked || index === entries.length - 1}
                      onClick={(event) => {
                        closeMenu(event.currentTarget);
                        move(index, index + 1);
                      }}
                    >
                      Move down
                    </button>
                  </div>
                  <button
                    className="pm-attribute-remove"
                    type="button"
                    disabled={structureLocked}
                    onClick={(event) => {
                      closeMenu(event.currentTarget);
                      if (!structureLocked)
                        onChange(entries.filter((_entry, current) => current !== index));
                    }}
                  >
                    Remove attribute
                  </button>
                </div>
              </details>
            </div>
          );
        })}
      </div>
      {!entries.length ? <span className="pm-attribute-empty">No overrides</span> : null}
      {!fieldLocked ? (
        <button
          className="pm-attribute-add"
          type="button"
          disabled={structureLocked}
          onClick={() => {
            if (!structureLocked) onChange([...entries, { name: "", value: "", inherit: false }]);
          }}
        >
          <Plus size={13} aria-hidden="true" /> Add attribute
        </button>
      ) : null}
    </div>
  );
}
