import catalog from "../src/native-catalog.json";

const endingTags = new Set([
  ...Object.entries(catalog.components)
    .filter(([, component]) => component.endingTag)
    .map(([name]) => name),
  "mj-html-attribute",
]);

/**
 * The importer deliberately repairs HTML, including incomplete XML. Before the
 * demo replaces a draft, require complete MJML boundaries without interpreting
 * ending-tag HTML, CSS, entities, or void elements as an XML document.
 * This is a boundary check, not an MJML schema or HTML security validator.
 * Complete unsupported elements still receive the importer's ordinary notes.
 */
export function assertCompleteMjml(source: string): void {
  const stack: { name: string; start: number }[] = [];
  // Whitespace after '/' belongs to that branch only: two adjacent optional
  // whitespace runs would backtrack quadratically on a long non-tag prefix.
  const tagStart = /<\s*(\/\s*)?([a-z][\w:-]*)(?=[\s/>]|$)/iy;
  const styleClose = /<\s*\/\s*mj-style(?=[\s/>]|$)/gi;
  let ending: string | undefined;
  let roots = 0;
  let cursor = 0;
  const fail = (message: string, start: number): never => {
    const line = source.slice(0, start).split(/\r\n|\r|\n/).length;
    throw new Error(`Incomplete or mismatched MJML structure on line ${line}: ${message}`);
  };

  while (cursor < source.length) {
    // CSS is raw text, not nested HTML. A '<' inside a CSS string must not
    // start an HTML attribute, comment, or declaration that swallows its close.
    styleClose.lastIndex = cursor;
    const start =
      ending === "mj-style" ? (styleClose.exec(source)?.index ?? -1) : source.indexOf("<", cursor);
    if (start < 0) break;
    if (source.startsWith("<!--", start) || source.startsWith("<![CDATA[", start)) {
      const comment = source.startsWith("<!--", start);
      const terminator = comment ? "-->" : "]]>";
      const end = source.indexOf(terminator, start + (comment ? 4 : 9));
      if (end < 0)
        fail(`Unclosed ${comment ? "comment (missing -->)" : "CDATA (missing ]]>)"}.`, start);
      cursor = end + terminator.length;
      continue;
    }

    tagStart.lastIndex = start;
    const match = tagStart.exec(source);
    // Declarations are not structural tags. Scan their quotes and an optional
    // DOCTYPE subset too, so tag-like text there cannot close the MJML root.
    const declaration = source.startsWith("<!", start) || source.startsWith("<?", start);
    if (!match && !declaration) {
      cursor = start + 1;
      continue;
    }
    const name = match?.[2]?.toLowerCase();
    const closing = Boolean(match?.[1]);
    const structural = name === "mjml" || Boolean(name?.startsWith("mj-"));
    let end = match ? tagStart.lastIndex : start + 2;
    let quote = "";
    let subset = 0;
    for (; end < source.length; end += 1) {
      const character = source[end];
      if (quote) {
        if (character === quote) quote = "";
      } else if (character === '"' || character === "'") quote = character;
      else if (declaration && character === "[") subset += 1;
      else if (declaration && character === "]" && subset > 0) subset -= 1;
      else if (character === ">" && subset === 0) break;
      else if (character === "<" && !declaration) break;
    }
    if (end === source.length || source[end] !== ">") {
      if (declaration || (structural && (!ending || (closing && name === ending))))
        fail(
          `Unfinished ${declaration ? "declaration" : `<${closing ? "/" : ""}${name}> tag`}.`,
          start,
        );
      // Tolerate non-XML ending content. Do not consume a later closing tag.
      cursor = end;
      continue;
    }
    cursor = end + 1;
    if (!structural || !name || (ending && !(closing && name === ending))) continue;
    const tail = source.slice(tagStart.lastIndex, end);
    if (closing) {
      if (tail.trim()) fail(`Unexpected text in </${name}>.`, start);
      const open = stack.at(-1);
      if (!open) return fail(`Unexpected </${name}>.`, start);
      if (open.name !== name) fail(`Expected </${open.name}> before </${name}>.`, start);
      stack.pop();
      ending = undefined;
    } else {
      if (name === "mjml" && roots++ > 0) fail("Expected a single <mjml> root.", start);
      if (!/\/\s*$/.test(tail)) {
        stack.push({ name, start });
        if (endingTags.has(name)) ending = name;
      }
    }
  }
  const open = stack.at(-1);
  if (open) fail(`Missing </${open.name}>.`, open.start);
}
