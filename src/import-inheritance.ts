import type { EmailDocument, MjmlAttribute } from "./types";

type RecordValue = Record<string, unknown>;
const isRecord = (value: unknown): value is RecordValue =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

// Compare raw controls, not their normalized export defaults: selecting 16px
// after an omitted fontSize must count as an edit even when the fallback is 16.
const controls: Record<string, string[]> = {
  color: ["color", "border-color"],
  thickness: ["border-width"],
  backgroundColor: ["background-color"],
  containerBackgroundColor: ["container-background-color"],
  tableLayout: ["table-layout"],
  fontFamily: ["font-family"],
  fontSize: ["font-size"],
  fontWeight: ["font-weight"],
  lineHeight: ["line-height"],
  letterSpacing: ["letter-spacing"],
  borderRadius: ["border-radius"],
  cssClass: ["css-class"],
  verticalAlign: ["vertical-align"],
  innerPadding: ["inner-padding"],
  iconSize: ["icon-size"],
  iconPadding: ["icon-padding"],
  backgroundUrl: ["background-url"],
  backgroundWidth: ["background-width"],
  backgroundHeight: ["background-height"],
};
const directControls = [
  "width",
  "height",
  "padding",
  "border",
  "align",
  "src",
  "alt",
  "href",
  "name",
  "mode",
  "thumbnails",
  "cellpadding",
  "cellspacing",
];
for (const name of directControls) controls[name] = [name];
const nativeSignature = (entry: MjmlAttribute): string =>
  JSON.stringify({
    name: entry.name,
    value: entry.value,
    inherit: entry.inherit,
    template: entry.template,
  });
const controlNames = (name: string): string[] =>
  Object.entries(controls)
    .filter(([, attributes]) => attributes.includes(name))
    .map(([prop]) => prop);

/** Attach immutable baselines only to fresh importer-owned rules. The source
 * model remains unchanged during editing, so Puck undo/redo needs no patching.
 */
export function captureImportedAttributeBaselines(document: EmailDocument): void {
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!isRecord(value)) return;
    Object.values(value).forEach(visit);
    for (const key of ["mjmlAttributes", "bodyAttributes", "attributeDefaults"]) {
      if (!Array.isArray(value[key])) continue;
      for (const entry of value[key] as MjmlAttribute[]) {
        if (entry.source !== "import") continue;
        const original: Record<string, unknown> = {};
        for (const prop of controlNames(entry.name)) {
          if (value[prop] !== undefined) original[prop] = value[prop];
        }
        entry.importBaseline = { native: nativeSignature(entry), controls: original };
      }
    }
  };
  visit(document);
}

/** Resolve importer-owned rules against current raw visual values without
 * mutating document data or history. Explicit native edits always win.
 */
export function resolveImportedAttributes(
  props: object,
  key = "mjmlAttributes",
): MjmlAttribute[] | undefined {
  const values = props as RecordValue;
  const entries = values[key];
  if (!Array.isArray(entries)) return entries as undefined;
  const resolved = entries.filter((entry: MjmlAttribute) => {
    if (!entry || entry.source !== "import" || !entry.importBaseline) return true;
    const baseline = entry.importBaseline;
    if (!isRecord(baseline) || !isRecord(baseline.controls) || typeof baseline.native !== "string")
      return true;
    if (nativeSignature(entry) !== baseline.native) return true;
    return controlNames(entry.name).every((prop) =>
      Object.is(values[prop], baseline.controls[prop]),
    );
  });
  return resolved.length === entries.length ? entries : resolved;
}
