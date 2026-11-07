import postcss, { type ChildNode, type Container } from "postcss";

/** Format only CSS structure, retaining values, comments, selector text, and source order. */
export function formatCss(source: string): string {
  if (!source.trim()) return source;
  try {
    const root = postcss.parse(source);
    const formatNode = (node: ChildNode, depth: number, before: string) => {
      // PostCSS can store declaration hacks and extra semicolons in `before`.
      node.raws.before = before + (node.raws.before ?? "").replace(/^\s*/, "");
      if (node.type === "decl") {
        // Custom property whitespace is part of its token stream. Keep it exactly.
        if (!node.prop.startsWith("--") && /^\s*:\s*$/.test(node.raws.between ?? ":")) {
          node.raws.between = ": ";
        }
        if (/^(?:box-shadow|text-shadow)$/i.test(node.prop)) {
          const value = node.raws.value?.value === node.value ? node.raws.value.raw : node.value;
          const shadows = postcss.list.comma(value);
          if (shadows.length > 1) {
            const indent = "  ".repeat(depth + 1);
            // The PostCSS splitter keeps commas in functions, quotes, and comments intact.
            node.raws.between = (node.raws.between ?? ":").replace(/\s*$/, `\n${indent}`);
            node.value = shadows.join(`,\n${indent}`);
            delete node.raws.value;
          }
        }
      } else if (node.type === "rule" || node.type === "atrule") {
        if (node.nodes) {
          if (/^\s*$/.test(node.raws.between ?? "")) node.raws.between = " ";
          formatChildren(node, depth + 1);
          if (/^\s*$/.test(node.raws.after ?? "")) {
            node.raws.after = node.nodes.length ? `\n${"  ".repeat(depth)}` : "";
          }
        }
      }
    };
    const formatChildren = (container: Container, depth: number) => {
      container.raws.semicolon = true;
      container.nodes?.forEach((node, index) => {
        const previous = container.nodes?.[index - 1];
        const before =
          depth > 0
            ? `\n${"  ".repeat(depth)}`
            : index === 0
              ? ""
              : node.type === "comment" || previous?.type === "comment"
                ? "\n"
                : "\n\n";
        formatNode(node, depth, before);
      });
    };
    formatChildren(root, 0);
    root.raws.after = "\n";
    return root.toString();
  } catch {
    // Drafts and template expressions may not parse yet. Never discard or repair them.
    return source;
  }
}
