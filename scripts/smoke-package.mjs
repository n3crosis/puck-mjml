import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const require = createRequire(import.meta.url);
import { verifyRichTextRuntime } from "./smoke-richtext-runtime.mjs";

function verifyEditorExports(api, entry) {
  if (entry.includes("/core.")) {
    assert.equal(api.EmailEditor, undefined);
    assert.equal(api.emailFieldTypes, undefined);
    assert.equal(api.createNativeDragPreview, undefined);
    assert.equal(api.NativeDragPreviewProvider, undefined);
    return;
  }
  assert.equal(typeof api.createEmailConfig, "function");
  assert.equal(typeof api.createNativeDragPreview, "function");
  assert.equal(typeof api.NativeDragPreviewProvider, "function");
  const dragPreview = api.createNativeDragPreview();
  assert.equal(typeof dragPreview.onAction, "function");
  dragPreview.onAction({}, { ui: { isDragging: true } });
  dragPreview.reset();
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
// npm pack runs prepack and generates the exact build used by the runtime checks below.
verifyPackageConsumers();
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
for (const entry of ["../dist/index.js", "../dist/index.cjs"]) {
  const runtime = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `
    import assert from "node:assert/strict";
    import { createRequire } from "node:module";
    const require = createRequire(import.meta.url);
    await (${verifyRichTextRuntime.toString()})(${JSON.stringify(entry.replace("../", "./"))});
  `,
    ],
    { encoding: "utf8" },
  );
  assert.equal(runtime.status, 0, `${entry} runtime smoke: ${runtime.stderr}\n${runtime.stdout}`);
}

function verifyPackageConsumers() {
  const temporary = mkdtempSync(join(tmpdir(), "puck-mjml-package-"));
  const run = (command, args, cwd = temporary) => {
    const result = spawnSync(command, args, { cwd, encoding: "utf8" });
    assert.equal(
      result.status,
      0,
      `${command} ${args.join(" ")}: ${result.error || ""}\n${result.stderr}\n${result.stdout}`,
    );
  };
  try {
    run("npm", ["pack", "--pack-destination", temporary], process.cwd());
    const archive = readdirSync(temporary).find((file) => file.endsWith(".tgz"));
    assert.ok(archive, "package tarball was created");
    const installed = join(temporary, "node_modules/puck-mjml");
    mkdirSync(installed, { recursive: true });
    run("tar", ["-xzf", join(temporary, archive), "--strip-components=1", "-C", installed]);
    // Exercise the packed public files, while reusing the locked dependencies.
    // This is not a fresh dependency-installation or peer-version-matrix test.
    symlinkSync(resolve("node_modules"), join(installed, "node_modules"), "junction");
    symlinkSync(resolve("node_modules/@types"), join(temporary, "node_modules/@types"), "junction");
    for (const file of ["LICENSE", "THIRD_PARTY_NOTICES.md", "dist/style.css"]) {
      assert.ok(readFileSync(join(installed, file)).length, `${file} is packaged`);
    }
    writeFileSync(join(temporary, "package.json"), '{"type":"module"}\n');
    for (const format of ["module", "commonjs"]) {
      const load = format === "module" ? "await import" : "require";
      run(process.execPath, [
        "--input-type=" + format,
        "-e",
        `
        const root = ${load}("puck-mjml");
        const core = ${load}("puck-mjml/core");
        if (typeof root.EmailEditor !== "function" || core.EmailEditor !== undefined ||
            !core.toMjml(core.createEmptyDocument()).includes("<mjml")) process.exit(1);
      `,
      ]);
    }
    run(process.execPath, [
      "--conditions=react-server",
      "--input-type=module",
      "-e",
      `
      import { compileEmail, createEmptyDocument } from "puck-mjml/core";
      if (!(await compileEmail(createEmptyDocument())).html) process.exit(1);
    `,
    ]);
    const core = `
      import { createEmptyDocument, fromMjml, toMjml, compileEmail, type EmailDocument } from "puck-mjml/core";
      const document: EmailDocument = createEmptyDocument();
      const locks: Partial<Record<string, boolean>> = { src: true };
      document.root.readOnly = locks;
      document.content.push({ type: "Image", props: {}, readOnly: locks });
      const imported: EmailDocument = fromMjml(toMjml(document)).document;
      const html: Promise<string> = compileEmail(imported).then(result => result.html);
      // @ts-expect-error Document factories must not degrade to any.
      const invalid: string = createEmptyDocument();
      // @ts-expect-error Export options remain checked.
      toMjml(document, { allowRawHtml: "yes" });
    `;
    const editor = `
      import "puck-mjml/style.css";
      import { EmailEditor, createEmailConfig, createNativeDragPreview, NativeDragPreviewProvider,
        emailFieldTypes, emailTemplates, type EmailEditorProps, type NativeDragPreview } from "puck-mjml";
      const props: EmailEditorProps = { value: document, onChange: value => { const next: EmailDocument = value; } };
      EmailEditor(props);
      const bridge: NativeDragPreview = createNativeDragPreview();
      NativeDragPreviewProvider({ bridge, children: null });
      createEmailConfig();
      emailFieldTypes?.array;
      const template: EmailDocument = emailTemplates[0].create();
      // @ts-expect-error The editor requires onChange.
      EmailEditor({ value: document });
    `;
    for (const extension of ["mts", "cts"]) {
      writeFileSync(join(temporary, `consumer.${extension}`), core + editor);
      writeFileSync(join(temporary, `core.${extension}`), core);
    }
    for (const module of ["Node16", "NodeNext", "ESNext"]) {
      const moduleResolution = module === "ESNext" ? "Bundler" : module;
      for (const server of [false, true]) {
        writeFileSync(
          join(temporary, "tsconfig.json"),
          JSON.stringify({
            compilerOptions: {
              target: "ES2022",
              module,
              moduleResolution,
              strict: true,
              noUncheckedSideEffectImports: true,
              noEmit: true,
              skipLibCheck: false,
              types: server ? [] : ["node"],
              lib: server ? ["ES2022"] : ["ES2022", "DOM"],
              ...(server ? { customConditions: ["react-server"] } : {}),
            },
            files: server ? ["core.mts", "core.cts"] : ["consumer.mts", "consumer.cts"],
          }),
        );
        run(process.execPath, [
          require.resolve("typescript/bin/tsc"),
          "-p",
          join(temporary, "tsconfig.json"),
        ]);
      }
    }
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}
console.log(
  "ESM, CommonJS, simultaneous rich-text editors, link editing/paste, 62 templates, compilation, react-server core, packed exports, and strict consumer declarations passed.",
);
