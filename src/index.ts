import "@puckeditor/core/puck.css";
import "./style.css";

export { EmailEditor } from "./EmailEditor";
export type { EmailEditorProps } from "./editor-types";
export { createNativeDragPreview, NativeDragPreviewProvider } from "./native-drag-preview";
export type { NativeDragPreview } from "./native-drag-preview";
export { createEmailConfig } from "./config";
export { emailFieldTypes } from "./editor-field-types";
export * from "./core";
export { emailTemplates } from "./templates/registry";
export type { EmailTemplateDefinition } from "./templates/registry";
