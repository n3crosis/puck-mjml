import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const fixtures = join(root, "../../.cache/react-email-reference");
const baseline = join(root, "../../tests/fixtures/react-email-reference");
const manifest = JSON.parse(readFileSync(join(baseline, "manifest.json"), "utf8"));
assert.deepEqual(JSON.parse(readFileSync(join(fixtures, "manifest.json"), "utf8")), manifest);
const canonical = JSON.parse(
  readFileSync(join(root, "../../src/templates/upstream-content.json"), "utf8"),
);
const sha256 = (data) => createHash("sha256").update(data).digest("hex");
assert.equal(manifest.ref, "674d8ec2804b86be5d99156383fb1810179847bf");
assert.equal(manifest.ref, canonical.ref);
assert.equal(manifest.templates.length, 62);
assert.deepEqual(
  manifest.templates.map(({ file }) => file).sort(),
  canonical.templates.map(({ file }) => file).sort(),
);
const walk = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(directory, entry.name)) : [join(directory, entry.name)],
  );
assert.equal(
  walk(baseline).filter((file) => file.endsWith(".html")).length,
  0,
  "Reference HTML must remain in the ignored cache, not the committed fixtures",
);
assert.equal(walk(fixtures).filter((file) => file.endsWith(".html")).length, 62);
let total = 0;
for (const entry of manifest.templates) {
  assert.equal(entry.html, entry.file.replace(/\.mjml$/, ".html"));
  assert.ok(!entry.html.includes("..") && !entry.html.startsWith("/"));
  const bytes = readFileSync(join(fixtures, entry.html));
  assert.equal(bytes.length, entry.bytes, `${entry.html}: size`);
  assert.equal(sha256(bytes), entry.sha256, `${entry.html}: SHA-256`);
  total += bytes.length;
}
assert.equal(total, manifest.totalHtmlBytes);
assert.equal(sha256(readFileSync(join(fixtures, "LICENSE.md"))), manifest.license.sha256);
for (const [file, key] of [
  ["bun.lock", "lockfileSha256"],
  ["upstream-metadata.json", "metadataSha256"],
  ["upstream-provenance.json", "provenanceSha256"],
])
  assert.equal(sha256(readFileSync(join(root, file))), manifest.renderer[key], `${file}: SHA-256`);
console.log(
  `Verified ${manifest.templates.length} original HTML references, ${total} bytes, and provenance without network or renderer dependencies.`,
);
