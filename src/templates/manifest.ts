import source from "../../templates/manifest.json?raw";

export interface TemplateProvenance {
  id: string;
  group: string;
  label: string;
  /** Path relative to the top-level templates directory. */
  file: string;
  upstreamPath: string;
  upstreamBlob: string;
}

export interface TemplateManifest {
  repository: string;
  ref: string;
  license: string;
  copyright: string;
  templates: TemplateProvenance[];
}

/** Complete upstream inventory. Availability is determined by checked-in MJML files. */
export const templateManifest = JSON.parse(source) as TemplateManifest;
