import "@puckeditor/core/puck.css";
import "./style.css";

export { EmailEditor } from "./EmailEditor";
export { createEmailConfig } from "./config";
export { emailFieldTypes } from "./editor-field-types";
export { createEmptyDocument, createExampleDocument } from "./document";
export { toMjml, compileEmail } from "./export";
export { fromMjml } from "./import";
export type { ImportedEmail, ImportOptions } from "./import";
export { emailTemplates } from "./templates/registry";
export type { EmailTemplateDefinition } from "./templates/registry";
export type {
  EmailBlock,
  EmailDocument,
  EmailSettings,
  CompileError,
  CompiledEmail,
  EmailEditorProps,
  ExportOptions,
  MjmlAttribute,
  MjmlElementOptions,
  MjmlEndingContent,
  MjmlComponentDefaults,
  MjmlClassDefinition,
} from "./types";
