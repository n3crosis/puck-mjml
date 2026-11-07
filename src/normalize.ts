import { sanitizeEmailRichText } from "./richtext";
import { normalizeTableRows } from "./table";
import type { EmailBlock, EmailDocument } from "./types";

const slots: Record<string, string[]> = {
  Wrapper: ["sections"],
  Section: ["columns"],
  Section1: ["column"],
  Section2: ["left", "right"],
  Section3: ["left", "middle", "right"],
  Column: ["content"],
  Group: ["columns"],
  Hero: ["content"],
};

function sanitizeForEditor(value: string): string {
  const html = sanitizeEmailRichText(value);
  // Puck escapes tag-free rich text as plain text; wrap encoded text once.
  return html && !html.includes("<") ? `<p>${html}</p>` : html;
}

function mapShared<T>(items: T[], map: (item: T) => T): T[] {
  const next = items.map(map);
  return next.some((item, index) => item !== items[index]) ? next : items;
}

function sanitizeBlock(block: EmailBlock): EmailBlock {
  if (!block || typeof block !== "object" || !block.props || typeof block.props !== "object")
    return block;
  let props = block.props;
  const replace = (key: string, value: unknown) => {
    if (props[key] !== value) props = { ...props, [key]: value };
  };
  if (block.type === "Text" && typeof props.content === "string") {
    replace("content", sanitizeForEditor(props.content));
  }
  if (block.type === "Accordion" && Array.isArray(props.items)) {
    replace(
      "items",
      mapShared(props.items, (item: unknown) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return item;
        const entry = item as Record<string, unknown>;
        if (typeof entry.content !== "string") return item;
        const content = sanitizeForEditor(entry.content);
        return content === entry.content ? item : { ...entry, content };
      }),
    );
  }
  if (block.type === "Table") {
    const groups = ["headerRows", "bodyRows", "footerRows"] as const;
    // Existing host documents keep their two-column content when opened in the new table editor.
    if (groups.every((key) => props[key] === undefined)) {
      const migrated = normalizeTableRows(props);
      for (const key of groups) replace(key, migrated[key]);
    }
    for (const key of groups) {
      const rows = props[key];
      if (!Array.isArray(rows)) continue;
      replace(
        key,
        mapShared(rows, (row: unknown) => {
          if (!row || typeof row !== "object" || Array.isArray(row)) return row;
          const entry = row as Record<string, unknown>;
          if (!Array.isArray(entry.cells)) return row;
          const cells = mapShared(entry.cells, (cell: unknown) => {
            if (!cell || typeof cell !== "object" || Array.isArray(cell)) return cell;
            const value = cell as Record<string, unknown>;
            if (typeof value.content !== "string") return cell;
            const content = sanitizeForEditor(value.content);
            return content === value.content ? cell : { ...value, content };
          });
          return cells === entry.cells ? row : { ...entry, cells };
        }),
      );
    }
  }
  for (const key of Object.hasOwn(slots, block.type) ? slots[block.type] : []) {
    const children = props[key];
    if (Array.isArray(children)) replace(key, mapShared(children as EmailBlock[], sanitizeBlock));
  }
  return props === block.props ? block : { ...block, props };
}

/** Sanitize serialized rich text before Puck's lazy render fallback sees it. */
export function sanitizeDocumentRichText(document: EmailDocument): EmailDocument {
  const settings = document.root?.props;
  const content = Array.isArray(document.content)
    ? mapShared(document.content, sanitizeBlock)
    : document.content;
  const sections = Array.isArray(settings?.sections)
    ? mapShared(settings.sections, sanitizeBlock)
    : settings?.sections;
  if (sections === settings?.sections && content === document.content) return document;
  return {
    ...document,
    content,
    root:
      sections === settings?.sections
        ? document.root
        : { ...document.root, props: { ...settings, sections } },
  };
}
