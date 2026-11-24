import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { verifyRichTextRuntime } from "./smoke-richtext-runtime.mjs";

// Fresh npm installs of the packed tarball against each supported React major.
// Unlike smoke-package.mjs, dependencies are resolved from the registry, so this
// also proves the shared Tiptap packages deduplicate with Puck's copies.
const run = (command, args, cwd) => {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  assert.equal(
    result.status,
    0,
    `${command} ${args.join(" ")}: ${result.error || ""}\n${result.stderr}\n${result.stdout}`,
  );
  return result.stdout;
};

assert.ok(existsSync("dist/index.js"), "run `bun run build` before the peer smoke test");
const packs = mkdtempSync(join(tmpdir(), "puck-mjml-peers-pack-"));
try {
  run("npm", ["pack", "--ignore-scripts", "--pack-destination", packs], process.cwd());
  const archive = readdirSync(packs).find((file) => file.endsWith(".tgz"));
  assert.ok(archive, "package tarball was created");
  for (const react of ["18", "19"]) {
    const host = mkdtempSync(join(tmpdir(), `puck-mjml-react${react}-`));
    try {
      writeFileSync(join(host, "package.json"), '{"private":true,"type":"module"}\n');
      run(
        "npm",
        [
          "install",
          "--no-audit",
          "--no-fund",
          resolve(packs, archive),
          `react@${react}`,
          `react-dom@${react}`,
          "@puckeditor/core@^0.24.0",
          "happy-dom@^21.0.4",
        ],
        host,
      );
      assert.ok(
        !existsSync(join(host, "node_modules/puck-mjml/node_modules/@tiptap")),
        `React ${react}: puck-mjml must share Puck's Tiptap packages`,
      );
      const cjs = run(
        process.execPath,
        ["--input-type=commonjs", "-e", 'process.stdout.write(require.resolve("puck-mjml"))'],
        host,
      );
      for (const entry of ["puck-mjml", cjs]) {
        run(
          process.execPath,
          [
            "--input-type=module",
            "-e",
            `
          import assert from "node:assert/strict";
          import { createRequire } from "node:module";
          const require = createRequire(${JSON.stringify(join(host, "host.js"))});
          assert.equal(require("react/package.json").version.split(".")[0], ${JSON.stringify(react)});
          await (${verifyRichTextRuntime.toString()})(${JSON.stringify(entry)});
        `,
          ],
          host,
        );
      }
      console.log(
        `React ${react}: fresh install, shared Tiptap, ESM and CommonJS rich text passed.`,
      );
    } finally {
      rmSync(host, { recursive: true, force: true });
    }
  }
} finally {
  rmSync(packs, { recursive: true, force: true });
}
