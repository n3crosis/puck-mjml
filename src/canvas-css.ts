import postcss, { type AtRule, type Declaration, type Root, type Rule } from "postcss";

/** Lowercased font family name mapped to a canvas-scoped alias family name. */
export type FontAliasMap = Record<string, string>;

/** A custom CSS entry as stored on the document, tolerating incomplete sidebar drafts. */
export type CanvasStyleSheet = { css: unknown; inline?: unknown };

export interface ScopedCss {
  css: string;
  notes: string[];
  /** Includes head-only @font-face registrations, for native inline typography. */
  fontAliases: FontAliasMap;
}

const scopeIdent = /^(?:pm-canvas-)?[a-z0-9-]+$/i;
const rootCompound = /^(html|body|:root)(.*)$/i;
const customIdent = /^-?[a-zA-Z_\u0080-\uFFFF][\w\u0080-\uFFFF-]*$/;
const cssWideKeywords = ["initial", "inherit", "unset", "revert", "revert-layer", "default"];
const reservedKeyframesNames = new Set(["none", ...cssWideKeywords]);
const reservedFontNames = new Set([
  ...cssWideKeywords,
  "serif",
  "sans-serif",
  "monospace",
  "cursive",
  "fantasy",
  "system-ui",
  "math",
  "ui-serif",
  "ui-sans-serif",
  "ui-monospace",
  "ui-rounded",
  "caption",
  "icon",
  "menu",
  "message-box",
  "small-caption",
  "status-bar",
]);
const supportedKeyframeName = (name: string) =>
  customIdent.test(name) && !reservedKeyframesNames.has(name.toLowerCase());
const animationKeywords = new Set([
  "linear",
  "ease",
  "ease-in",
  "ease-out",
  "ease-in-out",
  "step-start",
  "step-end",
  "normal",
  "reverse",
  "alternate",
  "alternate-reverse",
  "none",
  "forwards",
  "backwards",
  "both",
  "infinite",
  "running",
  "paused",
  "initial",
  "inherit",
  "unset",
  "revert",
  "revert-layer",
]);
type AtRuleKind = "group" | "keyframes" | "font-face" | "layer" | "unsupported";

const atRuleKind = (name: string): AtRuleKind => {
  switch (name.toLowerCase()) {
    case "media":
    case "supports":
    case "container":
      return "group";
    case "keyframes":
      return "keyframes";
    case "font-face":
      return "font-face";
    case "layer":
      return "layer";
    default:
      return "unsupported";
  }
};

/** Normalize a font family name for case-insensitive matching. */
export const familyKey = (name: string) => name.replace(/\s+/g, " ").trim().toLowerCase();
const aliasIdent = (name: string) => name.replace(/[^a-zA-Z0-9-]+/g, "");
const aliasFor = (name: string, scope: string) => `${aliasIdent(name) || "font"}-${scope}`;

/** Distinct families such as "OpenSans" and "Open Sans" must not share a face. */
function registerFontAlias(name: string, scope: string, aliases: FontAliasMap): void {
  const key = familyKey(name);
  if (!key || Object.hasOwn(aliases, key)) return;
  const used = new Set(Object.values(aliases).map(familyKey));
  let alias = aliasFor(name, scope);
  let suffix = 2;
  while (used.has(familyKey(alias)))
    alias = aliasFor(`${aliasIdent(name) || "font"}-${suffix++}`, scope);
  // CSS family names may legally coincide with Object.prototype property names.
  Object.defineProperty(aliases, key, {
    value: alias,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

/** Build a per-instance alias for every declared font family so registrations never collide. */
export function createFontAliases(names: string[], scope: string): FontAliasMap {
  if (!scopeIdent.test(scope)) return {};
  const aliases: FontAliasMap = {};
  for (const name of names) {
    if (typeof name !== "string") continue;
    const trimmed = name.trim();
    if (!trimmed) continue;
    registerFontAlias(trimmed, scope, aliases);
  }
  return aliases;
}

/**
 * Split a declaration value on top-level separators, preserving parentheses,
 * brackets, and quoted strings.
 */
function splitTopLevel(value: string, separator: "," | " ", preserveEmpty = false): string[] {
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  let quote = "";
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (quote) {
      current += character;
      if (character === quote && value[index - 1] !== "\\") quote = "";
    } else if (character === '"' || character === "'") {
      current += character;
      quote = character;
    } else if (character === "(" || character === "[") {
      depth += 1;
      current += character;
    } else if (character === ")" || character === "]") {
      depth = Math.max(0, depth - 1);
      current += character;
    } else if (depth === 0 && (separator === "," ? character === "," : /\s/.test(character))) {
      if (separator === "," ? preserveEmpty || current.trim() : current) parts.push(current);
      current = "";
    } else {
      current += character;
    }
  }
  if (separator === "," ? preserveEmpty || current.trim() : current) parts.push(current);
  return parts;
}

/**
 * A deliberately bounded family grammar, shared by registration and reference
 * rewriting. Escapes/comments and noncanonical whitespace in strings need CSS
 * token decoding; guessing can merge distinct family names or create a face.
 * Keywords are family names only when quoted.
 */
function literalFontFamily(value: string): string | undefined {
  const trimmed = value.trim();
  const quoted = trimmed.match(/^"([^"\\\r\n\f]*)"$|^'([^'\\\r\n\f]*)'$/);
  const name = quoted
    ? (quoted[1] ?? quoted[2])
    : trimmed
          .split(/[ \t\r\n\f]+/)
          .every((token) => customIdent.test(token) && !reservedFontNames.has(token.toLowerCase()))
      ? trimmed.split(/[ \t\r\n\f]+/).join(" ")
      : undefined;
  if (
    !name ||
    [...name].some(
      (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    ) ||
    familyKey(name) !== name.toLowerCase()
  )
    return undefined;
  return name;
}

/** Rewrite font-family lists so canvas styles reference the per-instance alias. */
export function aliasFontFamilyList(value: string, aliases: FontAliasMap): string {
  if (!value.trim() || !Object.keys(aliases).length) return value;
  return splitTopLevel(value, ",")
    .map((part) => {
      const family = literalFontFamily(part);
      const key = family === undefined ? undefined : familyKey(family);
      const alias = key !== undefined && Object.hasOwn(aliases, key) ? aliases[key] : undefined;
      return alias ? `"${alias}"` : part;
    })
    .join(",");
}

function aliasFontFace(rule: AtRule, aliases: FontAliasMap): void {
  // Collection has already rejected unsupported faces and retained exactly
  // one family descriptor. CSS descriptor names are case-insensitive.
  for (const node of rule.nodes ?? []) {
    if (node.type === "decl" && node.prop.toLowerCase() === "font-family")
      node.value = aliasFontFamilyList(node.value, aliases);
  }
}

function rewriteKeyframeNames(
  value: string,
  names: Map<string, string>,
  shorthand: boolean,
): string {
  if (!names.size) return value;
  return splitTopLevel(value, ",")
    .map((group) =>
      splitTopLevel(group, " ")
        .map((token) => {
          const trimmed = token.trim();
          if (
            supportedKeyframeName(trimmed) &&
            (!shorthand || !animationKeywords.has(trimmed.toLowerCase())) &&
            names.has(trimmed)
          ) {
            return names.get(trimmed);
          }
          return token;
        })
        .join(" "),
    )
    .join(",");
}

interface ScopeState {
  scope: string;
  notes: string[];
  aliases: FontAliasMap;
  keyframes: Map<string, string>;
  fontFaces: Map<AtRule, string>;
}

function rewriteDeclaration(declaration: Declaration, state: ScopeState): void {
  const property = declaration.prop.toLowerCase();
  if (property === "font-family") {
    declaration.value = aliasFontFamilyList(declaration.value, state.aliases);
  } else if (property === "animation" || property === "animation-name") {
    declaration.value = rewriteKeyframeNames(
      declaration.value,
      state.keyframes,
      property === "animation",
    );
  }
}

/**
 * Decide which nested structure is retained before collecting registrations.
 * Nested selectors stay untouched: CSS nesting resolves them against the
 * already-scoped parent selector. Declaration values are rewritten afterward.
 */
function prepareRule(rule: Rule | AtRule, state: ScopeState, label: string): void {
  for (const child of rule.nodes?.slice() ?? []) {
    if (child.type === "rule") {
      prepareNestedRule(child, state, label);
    } else if (child.type === "atrule") {
      prepareNestedAtRule(child, state, label);
    }
  }
}

function prepareNestedAtRule(atRule: AtRule, state: ScopeState, label: string): void {
  switch (atRuleKind(atRule.name)) {
    case "group":
      prepareRule(atRule, state, label);
      break;
    case "keyframes":
      prepareKeyframes(atRule, state);
      break;
    case "font-face":
      prepareFontFace(atRule, state, label);
      break;
    case "layer": {
      const children = atRule.nodes?.slice() ?? [];
      atRule.replaceWith(...children);
      for (const child of children) {
        if (child.type === "rule") prepareNestedRule(child, state, label);
        else if (child.type === "atrule") prepareNestedAtRule(child, state, label);
      }
      state.notes.push(
        `${label} uses @layer; layer semantics are not preserved on the canvas, but its rules are applied.`,
      );
      break;
    }
    default:
      state.notes.push(
        `${label} contains an unsupported @${atRule.name} rule, which is not applied on the canvas.`,
      );
      atRule.remove();
  }
}

function prepareKeyframes(atRule: AtRule, state: ScopeState): void {
  const name = atRule.params.trim();
  if (!supportedKeyframeName(name) || !atRule.nodes) {
    state.notes.push(
      `@keyframes name "${name}" is outside the supported plain-name subset or has no block and is not applied on the canvas.`,
    );
    atRule.remove();
    return;
  }
}

/** Rewrite only valid direct font declarations; step selectors are not nesting. */
function namespaceKeyframes(atRule: AtRule, state: ScopeState): void {
  atRule.params = `${state.scope}-${atRule.params.trim()}`;
  for (const step of atRule.nodes ?? []) {
    if (step.type !== "rule") continue;
    for (const node of step.nodes ?? []) {
      if (
        node.type === "decl" &&
        node.prop.toLowerCase() === "font-family" &&
        !node.important &&
        // This bounded path does not decode escapes or raw token comments.
        !/[\\]|\/\*/.test(node.raws.value?.raw ?? node.value) &&
        // Do not turn an invalid empty-item list into an active keyframe value.
        splitTopLevel(node.value, ",", true).every((family) => family.trim())
      )
        node.value = aliasFontFamilyList(node.value, state.aliases);
    }
  }
}

/** Rewrite the retained AST once, without scoping or revalidating selectors. */
function rewritePreparedCss(
  container: Root | AtRule | Rule,
  state: ScopeState,
  declarations = false,
): void {
  for (const node of container.nodes ?? []) {
    if (node.type === "decl" && declarations) {
      rewriteDeclaration(node, state);
    } else if (node.type === "rule") {
      rewritePreparedCss(node, state, true);
    } else if (node.type === "atrule") {
      switch (atRuleKind(node.name)) {
        case "keyframes":
          namespaceKeyframes(node, state);
          break;
        case "font-face":
          aliasFontFace(node, state.aliases);
          break;
        case "group":
          rewritePreparedCss(node, state, declarations);
          break;
      }
    }
  }
}

/** Tokenize one complex selector into compounds and the combinators between them. */
function tokenizeSelector(
  selector: string,
): { compounds: string[]; combinators: string[] } | undefined {
  const compounds: string[] = [];
  const combinators: string[] = [];
  let compound = "";
  let combinator = "";
  let depth = 0;
  let quote = "";
  for (let index = 0; index < selector.length; index += 1) {
    const character = selector[index];
    if (quote) {
      compound += character;
      if (character === quote && selector[index - 1] !== "\\") quote = "";
      continue;
    }
    if (character === '"' || character === "'") {
      compound += character;
      quote = character;
    } else if (character === "(" || character === "[") {
      depth += 1;
      compound += character;
    } else if (character === ")" || character === "]") {
      if (depth === 0) return undefined;
      depth -= 1;
      compound += character;
    } else if (
      depth === 0 &&
      (/\s/.test(character) || character === ">" || character === "+" || character === "~")
    ) {
      if (compound.trim()) {
        compounds.push(compound.trim());
        compound = "";
      }
      if (character.trim()) combinator += character;
      else if (compounds.length && compounds.length > combinators.length) combinator += " ";
    } else {
      if (combinator) {
        combinators.push(combinator.trim() || " ");
        combinator = "";
      }
      compound += character;
    }
  }
  if (quote || depth) return undefined;
  if (compound.trim()) compounds.push(compound.trim());
  if (compounds.length !== combinators.length + 1) return undefined;
  return { compounds, combinators };
}

/**
 * Keep a bounded subset of native CSS nesting whose subject cannot leave the
 * scoped parent. A descendant may select its siblings, but the parent itself
 * may not: it can be the canvas root. Embedded/functional & forms need a fuller
 * selector analysis and are deliberately not made forgiving or reinterpreted.
 */
function nestedSelectorList(selector: string): string[] | undefined {
  // The lightweight tokenizer does not model CSS escapes, comments, or column
  // combinators. Refuse them here instead of misclassifying a nesting boundary.
  if (/\\|\/\*|\*\/|\|\|/.test(selector)) return undefined;
  const selectors: string[] = [];
  const brackets: string[] = [];
  let quote = "";
  let start = 0;
  for (let index = 0; index < selector.length; index += 1) {
    const character = selector[index];
    if (quote) {
      if (character === quote) quote = "";
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === "(" || character === "[") {
      brackets.push(character);
    } else if (character === ")" || character === "]") {
      if (brackets.pop() !== (character === ")" ? "(" : "[")) return undefined;
    } else if (character === "," && brackets.length === 0) {
      const part = selector.slice(start, index).trim();
      if (!part) return undefined;
      selectors.push(part);
      start = index + 1;
    }
  }
  const last = selector.slice(start).trim();
  if (quote || brackets.length || !last) return undefined;
  selectors.push(last);
  return selectors;
}

function isContainedNestedSelector(selector: string): boolean {
  const trimmed = selector.trim();
  const ampersands = trimmed.match(/&/g)?.length ?? 0;
  if (ampersands > 1 || (ampersands === 1 && !trimmed.startsWith("&"))) return false;
  const tokens = tokenizeSelector(ampersands ? trimmed : `& ${trimmed}`);
  if (
    !tokens ||
    !tokens.compounds[0].startsWith("&") ||
    (tokens.compounds[0].length > 1 && !/^[.#:[]/.test(tokens.compounds[0].slice(1))) ||
    tokens.combinators.some((combinator) => ![" ", ">", "+", "~"].includes(combinator))
  )
    return false;
  return tokens.combinators[0] !== "+" && tokens.combinators[0] !== "~";
}

function prepareNestedRule(rule: Rule, state: ScopeState, label: string): void {
  const raw = rule.raws.selector;
  const selector = raw?.value === rule.selector ? raw.raw : rule.selector;
  const selectors = nestedSelectorList(selector);
  if (!selectors || selectors.some((selector) => !isContainedNestedSelector(selector))) {
    state.notes.push(
      `${label} nested selector "${selector}" is outside the supported canvas-safe nesting subset and was not applied.`,
    );
    // Drop the whole list, rather than making a previously invalid selector
    // list valid by salvaging its other branches.
    rule.remove();
    return;
  }
  prepareRule(rule, state, label);
}

/**
 * Scope one selector to the canvas. html, body, and :root map to the canvas
 * root; anything else becomes a descendant. Returns undefined when the selector
 * could still reach elements outside the canvas, which the caller drops.
 */
function scopeSelector(selector: string, state: ScopeState, label: string): string | undefined {
  const { scope } = state;
  const tokenized = tokenizeSelector(selector);
  if (!tokenized) return `.${scope} ${selector.trim()}`;
  const { compounds, combinators } = tokenized;
  let consumed = 0;
  let mapped = "";
  const roots: string[] = [];
  let suffix = "";
  while (consumed < compounds.length) {
    const match = compounds[consumed].match(rootCompound);
    const rest = match ? match[2] : "";
    if (!match || (rest !== "" && !/^[.:[]/.test(rest))) break;
    mapped = `.${scope}${rest}`;
    roots.push(match[1].toLowerCase());
    suffix = rest;
    consumed += 1;
  }
  if (consumed === 0) return `.${scope} ${selector.trim()}`;
  // A sibling of the canvas root lives on the host page, outside this canvas.
  const combinator = combinators[consumed - 1];
  if (consumed < compounds.length && (combinator === "+" || combinator === "~")) return undefined;
  const simpleBodyChain =
    consumed === 2 &&
    /^(html|:root)$/i.test(compounds[0]) &&
    roots[1] === "body" &&
    (combinators[0] === " " || combinators[0] === ">");
  if (consumed === 1 || simpleBodyChain) {
    // Every ordinary selector gains one scope class. Retain the consumed root
    // tokens' specificity as well, without adding matches: :is(token, *) is
    // always true. Keep authored suffixes OUTSIDE the forgiving function so
    // pseudo-elements and invalid selectors retain their existing behavior.
    mapped = `.${scope}${roots.map((root) => `:is(${root}, *)`).join("")}${suffix}`;
  } else {
    state.notes.push(
      `${label} root selector "${selector}" uses an unsupported html/body chain; its existing canvas mapping does not preserve specificity.`,
    );
  }
  if (consumed === compounds.length) return mapped;
  const renderCombinator = (value: string) => (value === " " ? " " : ` ${value} `);
  const remainder = compounds
    .slice(consumed)
    .reduce(
      (result, part, index) => result + renderCombinator(combinators[consumed - 1 + index]) + part,
      "",
    );
  return mapped + remainder;
}

/**
 * Only these exact MJML-generated padding cells have native equivalents.
 * Background sections/wrappers add one div; full-width layouts add a different
 * table hierarchy and deliberately receive neither of these renderer markers.
 */
function nativePaddingAlias(selector: string, scoped: string, scope: string): string | undefined {
  const tokens = tokenizeSelector(selector);
  if (
    !tokens ||
    !/^\.[A-Za-z_][\w-]*$/.test(tokens.compounds[0]) ||
    tokens.combinators.some((combinator) => combinator !== ">")
  )
    return undefined;
  const chain = tokens.compounds.slice(1).join(" ").toLowerCase();
  const anchor = `.${scope} ${tokens.compounds[0]}`;
  let target: string;
  if (chain === "table tbody tr td") {
    target = `:where(${anchor}[data-pm-mjml-padding="self"], ${anchor}[data-pm-mjml-padding="child"] > [data-pm-mjml-padding-target])`;
  } else if (chain === "div table tbody tr td") {
    target = `:where(${anchor}[data-pm-mjml-padding="background"])`;
  } else {
    return undefined;
  }
  // :is retains the original selector's specificity. The final :where limits
  // matches to renderer-owned targets, leaving authored table cells untouched.
  return `:is(${scoped}, ${target})${target}`;
}

/** The native image anchor corresponds to MJML's image sizing table. */
function nativeImageWidthAlias(
  selector: string,
  scoped: string,
  scope: string,
): string | undefined {
  const tokens = tokenizeSelector(selector);
  if (
    !tokens ||
    tokens.compounds.length !== 2 ||
    !/^\.[A-Za-z_][\w-]*$/.test(tokens.compounds[0]) ||
    tokens.compounds[1].toLowerCase() !== "table" ||
    tokens.combinators[0] !== " "
  )
    return undefined;
  const target = `:where(.${scope} ${tokens.compounds[0]} [data-pm-mjml-image-width])`;
  return `:is(${scoped}, ${target})${target}`;
}

function scopeRule(rule: Rule, state: ScopeState, label: string): void {
  const scoped: string[] = [];
  const aliases: string[] = [];
  const imageAliases: string[] = [];
  for (const part of splitTopLevel(rule.selector, ",")) {
    const selector = scopeSelector(part.trim(), state, label);
    if (selector === undefined) {
      state.notes.push(
        `${label} selector "${part.trim()}" can match elements outside the canvas and was not applied.`,
      );
    } else {
      scoped.push(selector);
      const alias = nativePaddingAlias(part.trim(), selector, state.scope);
      if (alias) aliases.push(alias);
      const imageAlias = nativeImageWidthAlias(part.trim(), selector, state.scope);
      if (imageAlias) imageAliases.push(imageAlias);
    }
  }
  if (scoped.length) rule.selector = scoped.join(", ");
  else rule.remove();
  // Nested rules and resets have ordering/box semantics this bounded adapter
  // does not model. Keep them on the existing scoped stylesheet path only.
  if (
    (!aliases.length && !imageAliases.length) ||
    rule.nodes.some(
      (node) =>
        node.type === "rule" ||
        node.type === "atrule" ||
        (node.type === "decl" && node.prop.toLowerCase() === "all"),
    )
  )
    return;
  const padding = rule.nodes.filter(
    (node) => node.type === "decl" && /^padding(?:-(?:top|right|bottom|left))?$/i.test(node.prop),
  );
  if (aliases.length && padding.length) {
    rule.cloneAfter({ selector: aliases.join(", "), nodes: padding.map((node) => node.clone()) });
  }
  // Only the known important responsive expansion overrides the native
  // anchor's inline width without inventing stronger cascade precedence.
  // Arbitrary widths also differ because the anchor retains max-width: 100%.
  const imageWidth = rule.nodes.filter(
    (node): node is Declaration => node.type === "decl" && node.prop.toLowerCase() === "width",
  );
  if (
    imageAliases.length &&
    imageWidth.length &&
    imageWidth.every((node) => node.value.trim() === "100%" && node.important)
  ) {
    rule.cloneAfter({
      selector: imageAliases.join(", "),
      nodes: imageWidth.map((node) => node.clone()),
    });
  }
}

/** Process one node of a group container (stylesheet root or a group at-rule). */
function processNode(node: Rule | AtRule, state: ScopeState, label: string): void {
  if (node.type === "rule") {
    scopeRule(node, state, label);
    prepareRule(node, state, label);
    return;
  }
  switch (atRuleKind(node.name)) {
    case "group":
      scopeGroup(node, state, label);
      break;
    case "keyframes":
      prepareKeyframes(node, state);
      break;
    case "font-face":
      prepareFontFace(node, state, label);
      break;
    case "layer": {
      const children = node.nodes?.slice() ?? [];
      node.replaceWith(...children);
      for (const child of children) {
        if (child.type === "rule" || child.type === "atrule") processNode(child, state, label);
      }
      state.notes.push(
        `${label} uses @layer; layer semantics are not preserved on the canvas, but its rules are applied.`,
      );
      break;
    }
    default:
      state.notes.push(
        `${label} contains an unsupported @${node.name} rule, which is not applied on the canvas.`,
      );
      node.remove();
  }
}

function scopeGroup(container: Root | AtRule, state: ScopeState, label: string): void {
  for (const node of container.nodes?.slice() ?? []) {
    if (node.type === "rule" || node.type === "atrule") processNode(node, state, label);
  }
}

/** Select only an unambiguous effective descriptor, before creating any alias. */
function prepareFontFace(rule: AtRule, state: ScopeState, label: string): void {
  const families: { declaration: Declaration; family: string }[] = [];
  let supported = !rule.params.trim() && Boolean(rule.nodes);
  for (const node of rule.nodes ?? []) {
    if (node.type === "comment") continue;
    // An escaped property could be another font-family descriptor that wins
    // in the browser. PostCSS also moves invalid `_`/`*` property prefixes into
    // raws.before; do not mistake those for effective descriptors either.
    if (
      node.type !== "decl" ||
      node.prop.includes("\\") ||
      /[^ \t\r\n\f]/.test(node.raws.before ?? "")
    ) {
      supported = false;
      continue;
    }
    if (node.prop.toLowerCase() !== "font-family") continue;
    const family = literalFontFamily(node.value);
    const raw = node.raws.value?.raw ?? node.value;
    if (family === undefined || node.important || raw.includes("/*")) supported = false;
    else families.push({ declaration: node, family });
  }
  if (!supported || !families.length) {
    state.notes.push(
      `${label} contains an @font-face with an unsupported or ambiguous font-family descriptor; the whole face is not applied on the canvas.`,
    );
    rule.remove();
    return;
  }
  // All descriptors are in the supported grammar, so the last one wins.
  // Registering earlier, ineffective families would redirect unrelated text.
  const selected = families[families.length - 1];
  for (const entry of families.slice(0, -1)) entry.declaration.remove();
  state.fontFaces.set(rule, selected.family);
}

function collectGlobalRegistrations(container: Root | AtRule | Rule, state: ScopeState): void {
  for (const node of container.nodes ?? []) {
    if (node.type === "rule") {
      collectGlobalRegistrations(node, state);
    } else if (node.type === "atrule") {
      switch (atRuleKind(node.name)) {
        case "font-face": {
          const family = state.fontFaces.get(node);
          if (family !== undefined) registerFontAlias(family, state.scope, state.aliases);
          break;
        }
        case "keyframes": {
          const name = node.params.trim();
          state.keyframes.set(name, `${state.scope}-${name}`);
          break;
        }
        case "group":
          collectGlobalRegistrations(node, state);
          break;
      }
      // Registration bodies cannot contain other valid global registrations.
    }
  }
}

function stylesheetLabel(index: number): string {
  return `Custom CSS ${index + 1}`;
}

/**
 * Scope document custom CSS to one canvas instance. Rules are prefixed with the
 * canvas scope class, html/body/:root map to the canvas root, and global
 * registrations (keyframes, font faces) are namespaced per instance. Both head
 * and inline output modes apply as a scoped stylesheet; the compiled email
 * preview remains the rendering reference.
 */
export function scopeDocumentCss(
  stylesheets: CanvasStyleSheet[],
  options: { scope: string; fontAliases?: FontAliasMap },
): ScopedCss {
  const notes: string[] = [];
  if (!scopeIdent.test(options.scope)) {
    return {
      css: "",
      notes: ["Canvas scope is invalid; custom CSS was not applied."],
      fontAliases: {},
    };
  }
  const state: ScopeState = {
    scope: options.scope,
    notes,
    aliases: { ...options.fontAliases },
    keyframes: new Map(),
    fontFaces: new Map(),
  };
  const roots: { root: Root; label: string }[] = [];
  stylesheets.forEach((entry, index) => {
    if (typeof entry?.css !== "string" || !entry.css.trim()) return;
    try {
      roots.push({ root: postcss.parse(entry.css), label: stylesheetLabel(index) });
    } catch (error) {
      notes.push(
        `${stylesheetLabel(index)} could not be parsed and is not applied on the canvas${
          error instanceof Error ? ` (${error.message.split("\n")[0]})` : ""
        }.`,
      );
    }
  });
  // Decide retained structure first: names inside omitted ancestors must not
  // redirect unrelated retained rules to registrations that will never exist.
  for (const { root, label } of roots) scopeGroup(root, state, label);
  // Collect across every retained stylesheet before rewriting values so forward
  // references still work. Browser conditions are preserved, never evaluated.
  for (const { root } of roots) collectGlobalRegistrations(root, state);
  const css = roots.map(({ root }) => {
    rewritePreparedCss(root, state);
    return root.toString();
  });
  return { css: css.join("\n"), notes, fontAliases: state.aliases };
}

const reportedNotes = new Set<string>();

/** Surface canvas CSS limitations once per note instead of on every re-render. */
export function reportCanvasNotes(notes: string[]): void {
  for (const note of notes) {
    if (reportedNotes.has(note)) continue;
    reportedNotes.add(note);
    console.warn(`[puck-mjml] ${note}`);
  }
}

/** Test helper: forget reported notes so suites can assert on fresh warnings. */
export function resetReportedCanvasNotes(): void {
  reportedNotes.clear();
}
