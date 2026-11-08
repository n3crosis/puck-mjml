import type { ReactNode } from "react";
import type { EmailDocument } from "./types";

export interface EmailEditorProps {
  value: EmailDocument;
  onChange: (value: EmailDocument) => void;
  onPublish?: (value: EmailDocument) => void | Promise<void>;
  /** Host-owned upload. Return a public HTTP(S) URL; bounded raster data URLs require allowLocalImages. */
  onUploadImage?: (file: File) => Promise<string>;
  /** Explicitly permit embedded raster images for local demos. Never inferred from document data. */
  allowLocalImages?: boolean;
  allowRawHtml?: boolean;
  /** Opt in to the canvas Tailwind runtime: true uses the pinned CDN build, or supply a trusted HTTP(S) script URL. Never derive this prop from document data. */
  tailwindRuntime?: true | string;
  /** Branding for Puck's existing header. Email metadata is not used as the header title. */
  headerTitle?: string;
  /** Host actions displayed beside preview and Puck's history controls. */
  headerActions?: ReactNode;
  /** Public Puck plugin additions and overrides by name. Keep the array and render functions stable across document edits. */
  plugins?: import("@puckeditor/core").Plugin[];
  className?: string;
}
