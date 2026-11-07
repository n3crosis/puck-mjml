import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { createElement } from "react";
import { render } from "@react-email/render";
import { ensureSources, provenance, root, sourceRoot } from "./fetch-source.mjs";

process.env.VERCEL_URL = "demo.react.email";
process.env.TZ = "UTC";
await ensureSources();

const output = join(root, "../../tests/fixtures/react-email-reference");
const sha256 = (data) => createHash("sha256").update(data).digest("hex");
const candidates = provenance.sources.filter((entry) => entry.kind === "email");
if (candidates.length !== 62)
  throw new Error(`Expected 62 email templates, found ${candidates.length}`);
const templates = [];
for (const entry of candidates) {
  const module = await import(pathToFileURL(join(sourceRoot, entry.path)).href);
  const Component = module.default;
  if (typeof Component !== "function") throw new Error(`Invalid default component: ${entry.path}`);
  const props = Component.PreviewProps ?? {};
  const html = await render(createElement(Component, props));
  if (!/<!DOCTYPE html/i.test(html) || !/<html/.test(html) || !/<body/.test(html))
    throw new Error(`Invalid rendered email: ${entry.path}`);
  if (/<script(?:\s|>)/i.test(html)) throw new Error(`Unexpected script in output: ${entry.path}`);
  const second = await render(createElement(Component, props));
  if (html !== second) throw new Error(`Nondeterministic output: ${entry.path}`);
  const relative = entry.path.replace(/^apps\/demo\/emails\//, "").replace(/\.tsx$/, ".html");
  const destination = join(output, relative);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, html);
  templates.push({
    file: relative.replace(/\.html$/, ".mjml"),
    html: relative,
    source: entry.path,
    sourceUrl: `https://github.com/resend/react-email/blob/${provenance.ref}/${entry.path}`,
    sourceGitBlob: entry.gitBlob,
    component: Component.name,
    previewProps: props,
    bytes: Buffer.byteLength(html),
    sha256: sha256(html),
  });
  console.log(`${relative}: ${Buffer.byteLength(html)} bytes`);
}
const dependencies = Object.fromEntries(
  Object.keys(JSON.parse(readFileSync(join(root, "package.json"), "utf8")).dependencies).map(
    (name) => [
      name,
      JSON.parse(readFileSync(join(root, "node_modules", name, "package.json"), "utf8")).version,
    ],
  ),
);
const manifest = {
  schemaVersion: 1,
  repository: "resend/react-email",
  ref: provenance.ref,
  sourceUrl: `https://github.com/resend/react-email/tree/${provenance.ref}/apps/demo/emails`,
  sourceVerification: {
    algorithm: "Git blob SHA-1",
    verifiedFiles: provenance.sources.filter((entry) => entry.kind !== "license").length,
    emails: candidates.length,
    helperFiles: provenance.sources.filter((entry) => entry.kind === "helper").length,
  },
  license: {
    spdx: "MIT",
    source: `https://github.com/resend/react-email/blob/${provenance.ref}/LICENSE.md`,
    sha256: sha256(readFileSync(join(sourceRoot, "LICENSE.md"))),
  },
  renderer: {
    api: "@react-email/render.render(React.createElement(defaultExport, defaultExport.PreviewProps ?? {}))",
    dependencies,
    runtime: { bun: Bun.version, timezone: "UTC", VERCEL_URL: "demo.react.email" },
    options: {},
    sourceChanges: "None. Upstream source and PreviewProps are used verbatim.",
    outputChanges: "None. Raw renderer output is stored byte-for-byte.",
    lockfileSha256: sha256(readFileSync(join(root, "bun.lock"))),
    metadataSha256: sha256(readFileSync(join(root, "upstream-metadata.json"))),
    provenanceSha256: sha256(readFileSync(join(root, "upstream-provenance.json"))),
    deterministicDoubleRender: true,
  },
  totalHtmlBytes: templates.reduce((sum, entry) => sum + entry.bytes, 0),
  templates,
};
mkdirSync(output, { recursive: true });
writeFileSync(join(output, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
writeFileSync(join(output, "LICENSE.md"), readFileSync(join(sourceRoot, "LICENSE.md")));
console.log(
  `Rendered ${templates.length} verified references (${manifest.totalHtmlBytes} total bytes).`,
);
