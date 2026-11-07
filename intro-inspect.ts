import { scopeDocumentCss, createFontAliases } from "./src/canvas-css";
import { createExampleDocument } from "./src/document";
import type { EmailDocument, EmailSettings } from "./src/types";

const document = createExampleDocument() as EmailDocument;
const settings = document.root.props as EmailSettings;
const aliases = createFontAliases(
  (settings.fontImports ?? []).map((f) => f.name),
  "pm-canvas-demo",
);
const scoped = scopeDocumentCss(settings.headStyles ?? [], {
  scope: "pm-canvas-demo",
  fontAliases: aliases,
});
console.log("=== scoped document CSS ===");
console.log(scoped.css);
console.log("=== notes ===", scoped.notes);
