import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const root = dirname(fileURLToPath(import.meta.url));
export const sourceRoot = join(root, ".cache/upstream");
export const provenance = JSON.parse(readFileSync(join(root, "upstream-provenance.json"), "utf8"));
export const gitBlob = (data) =>
  createHash("sha1").update(`blob ${data.length}\0`).update(data).digest("hex");

export async function ensureSources() {
  if (provenance.ref !== "674d8ec2804b86be5d99156383fb1810179847bf")
    throw new Error("Unexpected upstream source commit");
  for (const entry of provenance.sources) {
    if (
      !/^(apps\/demo\/emails\/[^.][\w/.-]+\.tsx?|LICENSE\.md)$/.test(entry.path) ||
      entry.path.includes("..")
    )
      throw new Error(`Unsafe upstream source path: ${entry.path}`);
    const destination = join(sourceRoot, entry.path);
    let bytes;
    if (existsSync(destination)) {
      bytes = readFileSync(destination);
    } else {
      const url = `https://raw.githubusercontent.com/resend/react-email/${provenance.ref}/${entry.path}`;
      const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error(`Source fetch failed: ${response.status} ${url}`);
      bytes = Buffer.from(await response.arrayBuffer());
      if (gitBlob(bytes) !== entry.gitBlob || bytes.length !== entry.bytes)
        throw new Error(`Downloaded upstream source checksum mismatch: ${entry.path}`);
      mkdirSync(dirname(destination), { recursive: true });
      writeFileSync(destination, bytes);
    }
    if (gitBlob(bytes) !== entry.gitBlob || bytes.length !== entry.bytes)
      throw new Error(`Cached upstream source checksum mismatch: ${entry.path}`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  await ensureSources();
  console.log(
    `Verified ${provenance.sources.length} pinned upstream files, including the license.`,
  );
}
