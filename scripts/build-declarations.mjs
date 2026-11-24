import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parseSync } from "oxc-parser";

// TypeScript's bundler resolver emits extensionless declarations. Node's ESM
// resolver needs extensions, and a CommonJS entry needs its own declaration graph.
const dist = resolve("dist");
for (const relative of readdirSync(dist, { recursive: true })) {
  if (!relative.endsWith(".d.ts")) continue;
  const file = join(dist, relative);
  // Vite extracts side-effect CSS imports. The JS entry and its declarations
  // do not import those source stylesheets at runtime.
  const source = readFileSync(file, "utf8").replace(/^import ["'][^"'\n]+\.css["'];\r?\n/gm, "");
  const parsed = parseSync(file, source);
  if (parsed.errors.length) throw new Error(`Cannot parse declarations in ${file}`);
  const specifiers = [];
  function visit(node) {
    if (!node || typeof node !== "object") return;
    const literal = [
      "ImportDeclaration",
      "ExportNamedDeclaration",
      "ExportAllDeclaration",
      "TSImportType",
    ].includes(node.type)
      ? node.source
      : node.type === "TSExternalModuleReference"
        ? node.expression
        : undefined;
    if (literal && typeof literal.value === "string" && /^\.{1,2}\//.test(literal.value)) {
      const base = literal.value.replace(/\.js$/, "");
      if (existsSync(resolve(dirname(file), `${base}.d.ts`))) {
        specifiers.push({ start: literal.start + 1, end: literal.end - 1, base });
      }
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === "object") visit(value);
    }
  }
  visit(parsed.program);
  specifiers.sort((a, b) => a.start - b.start);
  function declarations(extension) {
    let output = source;
    for (const { start, end, base } of specifiers.toReversed()) {
      output = output.slice(0, start) + base + extension + output.slice(end);
    }
    return output;
  }
  writeFileSync(file, declarations(".js"));
  writeFileSync(file.replace(/\.d\.ts$/, ".d.cts"), declarations(".cjs"));
}
// Consumers can import the exported stylesheet with noUncheckedSideEffectImports.
writeFileSync(join(dist, "style.d.cts"), "export {};\n");
