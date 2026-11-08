import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import ts from "typescript";

// TypeScript's bundler resolver emits extensionless declarations. Node's ESM
// resolver needs extensions, and a CommonJS entry needs its own declaration graph.
const dist = resolve("dist");
for (const relative of readdirSync(dist, { recursive: true })) {
  if (!relative.endsWith(".d.ts")) continue;
  const file = join(dist, relative);
  const source = readFileSync(file, "utf8");
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const specifiers = [];
  function visit(node) {
    const parent = node.parent;
    if (
      ts.isStringLiteral(node) &&
      (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)
        ? parent.moduleSpecifier === node
        : ts.isExternalModuleReference(parent) ||
          (ts.isLiteralTypeNode(parent) && ts.isImportTypeNode(parent.parent))) &&
      /^\.{1,2}\//.test(node.text)
    ) {
      const base = node.text.replace(/\.js$/, "");
      if (existsSync(resolve(dirname(file), `${base}.d.ts`))) {
        specifiers.push({ start: node.getStart(parsed) + 1, end: node.end - 1, base });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(parsed);
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
