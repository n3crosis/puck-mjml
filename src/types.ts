export interface MjmlAttribute {
  name: string;
  value?: string;
  /** Preserve a host-trusted template expression instead of validating a concrete native value. */
  template?: boolean;
  /** Omit the element's local attribute so MJML classes/defaults can supply it. */
  inherit?: boolean;
}

export interface MjmlElementOptions {
  mjClass?: string;
  mjmlAttributes?: MjmlAttribute[];
}

export interface MjmlEndingContent {
  /** Trusted ending-tag HTML. Undefined uses the visual fields; empty string clears the content. */
  htmlContent?: string;
}

export interface MjmlComponentDefaults {
  tag: string;
  attributes: MjmlAttribute[];
}

export interface MjmlClassDefinition {
  name: string;
  attributes: MjmlAttribute[];
  components?: MjmlComponentDefaults[];
}

export interface EmailBlock {
  type: string;
  props: Record<string, unknown> & MjmlElementOptions & MjmlEndingContent & { id?: string };
}

export interface EmailSettings {
  subject?: string;
  previewText?: string;
  subjectHtmlContent?: string;
  previewHtmlContent?: string;
  lang?: string;
  dir?: "auto" | "ltr" | "rtl";
  owa?: "none" | "desktop";
  width?: number;
  backgroundColor?: string;
  fontFamily?: string;
  breakpoint?: number;
  /** Native mj-breakpoint width. Overrides the numeric visual setting when present. */
  breakpointWidth?: string;
  fontImports?: { name: string; href: string }[];
  headStyles?: { css: string; inline: "head" | "inline" }[];
  /** Load the Tailwind browser runtime on the editing canvas. Email CSS stays the host's responsibility. */
  tailwind?: boolean | "true" | "";
  /** Custom HTTP(S) URL for the Tailwind runtime script; blank uses the bundled build. */
  tailwindScriptUrl?: string;
  htmlAttributes?: { selector: string; name: string; value: string }[];
  rawHead?: string;
  rawFileStart?: string;
  bodyAttributes?: MjmlAttribute[];
  bodyMjClass?: string;
  attributeDefaults?: MjmlAttribute[];
  componentDefaults?: MjmlComponentDefaults[];
  mjmlClasses?: MjmlClassDefinition[];
  sections?: EmailBlock[];
}

export interface EmailDocument {
  root: { props?: EmailSettings };
  content: EmailBlock[];
}

export interface CompileError {
  line?: number;
  message: string;
  tagName?: string;
}

export interface CompiledEmail {
  mjml: string;
  html: string;
  errors: CompileError[];
}

export interface ExportOptions {
  allowRawHtml?: boolean;
}

export interface EmailEditorProps {
  value: EmailDocument;
  onChange: (value: EmailDocument) => void;
  onPublish?: (value: EmailDocument) => void | Promise<void>;
  onUploadImage?: (file: File) => Promise<string>;
  allowRawHtml?: boolean;
  /** Branding for Puck's existing header. Email metadata is not used as the header title. */
  headerTitle?: string;
  /** Host actions displayed beside preview and Puck's history controls. */
  headerActions?: ReactNode;
  className?: string;
}
import type { ReactNode } from "react";
