/**
 * Refresh semantic fixtures from the exact, pinned upstream source.
 * Usage: node scripts/refresh-template-fixtures.mjs /path/to/react-email
 *
 * This is not a React Email renderer or an MJML generator. It evaluates the
 * hash-verified examples with their public PreviewProps and lightweight JSX
 * records, extracting text, artwork, and link destinations for regression tests.
 * Theme/font imports are not evaluated; visual fidelity needs separate review.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

const upstreamRoot = process.argv[2];
if (!upstreamRoot) throw new Error("Pass a checkout of the pinned React Email repository");
const manifest = JSON.parse(
  readFileSync(new URL("../templates/manifest.json", import.meta.url), "utf8"),
);
process.env.TZ = "UTC";

const jsx = (type, props) => ({ type, props: props ?? {} });
const components = new Proxy({}, { get: (_target, name) => String(name) });
const ignoredHelpers = new Proxy({}, { get: () => () => null });
const requireReference = (name) => {
  if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "fragment" };
  if (name === "react-email") return components;
  if (name.startsWith(".")) return ignoredHelpers;
  throw new Error(`Unexpected upstream dependency: ${name}`);
};

function plainText(node) {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(plainText).join("");
  if (typeof node.type === "function") return plainText(node.type(node.props));
  if (node.type === "br") return " ";
  return plainText(node.props.children);
}

const templates = manifest.templates.map(({ file, upstreamPath, upstreamBlob }) => {
  const buffer = readFileSync(resolve(upstreamRoot, upstreamPath));
  const hash = createHash("sha1").update(`blob ${buffer.length}\0`).update(buffer).digest("hex");
  if (hash !== upstreamBlob) throw new Error(`${upstreamPath} does not match the pinned Git blob`);
  const { outputText } = ts.transpileModule(buffer.toString("utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const exports = {};
  new Function("require", "exports", "process", outputText)(requireReference, exports, {
    env: { VERCEL_URL: "demo.react.email" },
  });
  const component = exports.default;
  const tree = component(component.PreviewProps ?? {});
  const content = [];
  const images = [];
  const links = [];
  let preview = "";
  function walk(node) {
    if (node == null || typeof node === "boolean") return;
    if (Array.isArray(node)) return node.forEach(walk);
    if (typeof node !== "object") return;
    if (typeof node.type === "function") return walk(node.type(node.props));
    if (node.type === "Preview") {
      preview = plainText(node);
      return;
    }
    if (["Text", "Heading", "Button", "code", "li"].includes(node.type))
      content.push(plainText(node));
    if (["Img", "img"].includes(node.type) && node.props.src) images.push(node.props.src);
    if (["Button", "Link", "a"].includes(node.type) && node.props.href) links.push(node.props.href);
    walk(node.props.children);
  }
  walk(tree);
  return { file, preview, content, images: [...new Set(images)], links: [...new Set(links)] };
});

writeFileSync(
  new URL("../src/templates/upstream-content.json", import.meta.url),
  `${JSON.stringify({ ref: manifest.ref, previewTimeZone: "UTC", templates }, null, 2)}\n`,
);
console.log(`Refreshed ${templates.length} fixtures from ${manifest.ref}`);
