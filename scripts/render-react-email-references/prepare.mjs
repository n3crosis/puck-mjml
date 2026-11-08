import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const verify = () => spawnSync(process.execPath, [join(root, "verify.mjs")], { encoding: "utf8" });
const cached = verify();
if (cached.status === 0) {
  process.stdout.write(cached.stdout);
} else {
  console.log("Preparing original React Email references from pinned upstream source...");
  // Keep upstream tooling and its dependency graph outside the application install.
  for (const args of [
    ["install", "--frozen-lockfile", "--ignore-scripts"],
    ["run", "render"],
  ]) {
    const result = spawnSync(process.execPath, args, { cwd: root, stdio: "inherit" });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
  const generated = verify();
  process.stdout.write(generated.stdout ?? "");
  process.stderr.write(generated.stderr ?? "");
  if (generated.error) throw generated.error;
  if (generated.status !== 0) process.exit(generated.status ?? 1);
}
