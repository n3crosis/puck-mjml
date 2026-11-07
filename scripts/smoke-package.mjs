import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
const require = createRequire(import.meta.url);
function verifyEditorExports(api, entry) {
  if (entry.includes("/core.")) {
    assert.equal(api.EmailEditor, undefined);
    assert.equal(api.emailFieldTypes, undefined);
    return;
  }
  assert.equal(typeof api.createEmailConfig, "function");
  assert.equal(typeof api.emailFieldTypes.array, "function");
  assert.equal(typeof api.emailFieldTypes.object, "function");
  assert.equal(api.emailTemplates.length, 63);
  const templates = api.emailTemplates.filter(({ source }) => source);
  assert.equal(templates.length, 62);
  assert.equal(new Set(templates.map(({ sourcePath }) => sourcePath)).size, 62);
  for (const template of templates) {
    assert.match(template.source, /<mjml/);
    assert.match(template.sourcePath, /^templates\/.+\.mjml$/);
    assert.match(template.upstreamUrl, /^https:\/\/github\.com\/resend\/react-email\/blob\//);
    const first = template.create();
    const second = template.create();
    assert.notEqual(first, second, `${template.id} must create a fresh document`);
    assert.notEqual(first.root, second.root);
    assert.match(api.toMjml(first), /<mjml/);
  }
}
for (const entry of ["../dist/index.js", "../dist/core.js"]) {
  const api = await import(entry);
  assert.match(api.toMjml(api.createEmptyDocument()), /<mjml/);
  verifyEditorExports(api, entry);
  assert.match((await api.compileEmail(api.createEmptyDocument())).html, /<!doctype html>/i);
}
for (const entry of ["../dist/index.cjs", "../dist/core.cjs"]) {
  const api = require(entry);
  assert.match(api.toMjml(api.createEmptyDocument()), /<mjml/);
  verifyEditorExports(api, entry);
}
const server = spawnSync(
  process.execPath,
  [
    "--conditions=react-server",
    "--input-type=module",
    "-e",
    "import('./dist/core.js').then(async m => { if (!(await m.compileEmail(m.createEmptyDocument())).html) process.exit(1); })",
  ],
  { encoding: "utf8" },
);
assert.equal(server.status, 0, server.stderr);
console.log(
  "ESM, CommonJS, editor APIs, 62 templates, compilation, and react-server core smoke tests passed.",
);
