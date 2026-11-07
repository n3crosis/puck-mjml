import { createEmptyDocument } from "../document";
import type { EmailDocument } from "../types";
import { loadMjmlTemplate } from "./loader";
import { templateManifest } from "./manifest";

export interface EmailTemplateDefinition {
  /** Stable slug, for example "02-matte/welcome". */
  id: string;
  /** Display group shown in the demo picker; empty string renders ungrouped. */
  group: string;
  label: string;
  /** Canonical standalone MJML. The blank document has no source file. */
  source?: string;
  /** Repository-relative canonical source path. */
  sourcePath?: string;
  /** Pinned React Email example adapted by this template. */
  upstreamUrl?: string;
  create: () => EmailDocument;
}

const sources = import.meta.glob<string>("../../templates/**/*.mjml", {
  query: "?raw",
  import: "default",
  eager: true,
});

const knownPaths = new Set(templateManifest.templates.map(({ file }) => `../../templates/${file}`));
for (const path of Object.keys(sources)) {
  if (!knownPaths.has(path)) throw new Error(`MJML template ${path} is missing provenance`);
}

/** Complete canonical MJML suite, imported into editable documents on demand. */
export const emailTemplates: readonly EmailTemplateDefinition[] = [
  { id: "blank", group: "", label: "Blank email", create: createEmptyDocument },
  ...templateManifest.templates.map(({ id, group, label, file, upstreamPath }) => {
    const source = sources[`../../templates/${file}`];
    if (source === undefined) throw new Error(`Canonical MJML template ${file} is missing`);
    return {
      id,
      group,
      label,
      source,
      sourcePath: `templates/${file}`,
      upstreamUrl: `${templateManifest.repository}/blob/${templateManifest.ref}/${upstreamPath}`,
      create: () => loadMjmlTemplate(source, file),
    };
  }),
];
