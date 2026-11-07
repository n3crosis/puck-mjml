import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
const require = createRequire(import.meta.url);
for (const entry of ["../dist/index.js", "../dist/core.js"]) {
  const api = await import(entry);
  assert.match(api.toMjml(api.createEmptyDocument()), /<mjml/);
  assert.match((await api.compileEmail(api.createEmptyDocument())).html, /<!doctype html>/i);
}
for (const entry of ["../dist/index.cjs", "../dist/core.cjs"]) {
  const api = require(entry);
  assert.match(api.toMjml(api.createEmptyDocument()), /<mjml/);
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
console.log("ESM, CommonJS, compilation, and react-server core smoke tests passed.");
