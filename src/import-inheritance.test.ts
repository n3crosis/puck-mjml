import { describe, expect, it } from "vitest";
import { fromMjml } from "./import";
import { toMjml } from "./export";
import { resolveImportedAttributes } from "./import-inheritance";
import type { EmailDocument, EmailBlock } from "./types";
const fixture = () =>
  fromMjml(
    '<mjml><mj-body><mj-section><mj-column><mj-text>Hello</mj-text><mj-image src="https://example.com/a.png" /><mj-social><mj-social-element name="x">X</mj-social-element><mj-social-element name="web">Web</mj-social-element></mj-social></mj-column></mj-section></mj-body></mjml>',
  ).document;
const blocks = (document: EmailDocument) =>
  document.root.props!.sections![0]!.props.column as EmailBlock[];

describe("editable imported inheritance", () => {
  it("hands off only changed controls, including explicit default values", () => {
    const original = fixture();
    const next = structuredClone(original);
    blocks(next)[0]!.props.color = "#ff0000";
    blocks(next)[0]!.props.fontSize = 16;
    blocks(next)[1]!.props.width = 300;
    const output = toMjml(next);
    expect(output).toContain('color="#ff0000"');
    expect(output).toContain('font-size="16px"');
    expect(output).toContain('width="300px"');
    expect(output).not.toContain('padding="10px"');
    expect(toMjml(original)).not.toContain('font-size="16px"');
  });
  it("releases root body and font defaults", () => {
    const original = fixture();
    const next = structuredClone(original);
    Object.assign(next.root.props!, {
      width: 700,
      backgroundColor: "#eeeeee",
      fontFamily: "Georgia",
    });
    const output = toMjml(next);
    expect(output).toContain('width="700px"');
    expect(output).toContain('background-color="#eeeeee"');
    expect(output).toContain('font-family="Georgia"');
  });
  it("does not rewrite controlled echoes, unrelated edits, or reordered items", () => {
    const original = fixture();
    const echo = structuredClone(original);
    expect(resolveImportedAttributes(blocks(echo)[0]!.props)).toBe(
      blocks(echo)[0]!.props.mjmlAttributes,
    );
    blocks(echo)[0]!.props.content = "<p>Changed copy</p>";
    (blocks(echo)[2]!.props.links as unknown[]).reverse();
    expect(resolveImportedAttributes(blocks(echo)[0]!.props)).toBe(
      blocks(echo)[0]!.props.mjmlAttributes,
    );
  });
  it("releases nested item fields without changing its untouched peers", () => {
    const original = fixture();
    const next = structuredClone(original);
    const links = blocks(next)[2]!.props.links as Record<string, unknown>[];
    links[0]!.href = "https://example.com/new";
    const output = toMjml(next);
    expect(output).toContain('href="https://example.com/new"');
    expect(output.match(/href=/g)).toHaveLength(1);
  });
  it("preserves explicit user inheritance and restores undo snapshots", () => {
    const original = fixture();
    blocks(original)[0]!.props.mjmlAttributes!.push({ name: "color", inherit: true });
    const next = structuredClone(original);
    blocks(next)[0]!.props.color = "#ff0000";
    const changed = next;
    expect(toMjml(changed)).not.toContain('color="#ff0000"');
    const undo = structuredClone(original);
    expect(toMjml(undo)).toBe(toMjml(original));
  });
  it("prioritizes an explicitly changed native rule over later visual changes", () => {
    const original = fixture();
    const next = structuredClone(original);
    const entry = blocks(next)[0]!.props.mjmlAttributes!.find((item) => item.name === "color")!;
    delete entry.inherit;
    entry.value = "#00ff00";
    const changed = next;

    const visual = structuredClone(changed);
    blocks(visual)[0]!.props.color = "#ff0000";
    expect(toMjml(visual)).toContain('color="#00ff00"');
  });
});

it("hands off imported native values as well as omitted attributes", () => {
  const original = fromMjml(
    '<mjml><mj-body><mj-section><mj-column><mj-text font-size="90px">Big</mj-text><mj-social><mj-social-element name="facebook">Facebook</mj-social-element></mj-social></mj-column></mj-section></mj-body></mjml>',
  ).document;
  const next = structuredClone(original);
  blocks(next)[0]!.props.fontSize = 20;
  (blocks(next)[1]!.props.links as Record<string, unknown>[])[0]!.name = "web";
  const output = toMjml(next);
  expect(output).toContain('font-size="20px"');
  expect(output).toContain('name="web"');
  expect(output).not.toContain('font-size="90px"');
  expect(output).not.toContain('name="facebook"');
});

it("recognizes explicitly selecting root and layout fallback values", () => {
  const original = fixture();
  const next = structuredClone(original);
  Object.assign(next.root.props!, {
    width: 600,
    backgroundColor: "#f5f5f5",
    fontFamily: "Arial, sans-serif",
  });
  next.root.props!.sections![0]!.props.padding = "0px";
  const output = toMjml(next);
  expect(output).toContain('width="600px"');
  expect(output).toContain('background-color="#f5f5f5"');
  expect(output).toContain('font-family="Arial, sans-serif"');
  expect(output).toContain('<mj-section padding="0px">');
});

it("releases the imported global font without rewriting component defaults", () => {
  const original = fromMjml(
    '<mjml><mj-head><mj-attributes><mj-all font-family="Georgia" /><mj-text color="red" /></mj-attributes></mj-head><mj-body><mj-section><mj-column><mj-text>Hello</mj-text></mj-column></mj-section></mj-body></mjml>',
  ).document;
  const next = structuredClone(original);
  next.root.props!.fontFamily = "Arial, sans-serif";
  const changed = next;
  expect(toMjml(changed)).toContain('font-family="Arial, sans-serif"');
  expect(changed.root.props!.componentDefaults).toEqual(original.root.props!.componentDefaults);
});

it("prioritizes renamed native rules while preserving reorder and undo", () => {
  const original = fixture();
  const next = structuredClone(original);
  const entries = blocks(next)[0]!.props.mjmlAttributes!;
  entries.find((entry) => entry.name === "color")!.name = "container-background-color";
  const changed = next;
  expect(resolveImportedAttributes(blocks(changed)[0]!.props)).toContainEqual(
    blocks(changed)[0]!.props.mjmlAttributes!.find(
      (entry) => entry.name === "container-background-color",
    ),
  );
  const restored = structuredClone(original);
  expect(toMjml(restored)).toBe(toMjml(original));
  const reordered = structuredClone(original);
  blocks(reordered)[0]!.props.mjmlAttributes!.reverse();
  expect(resolveImportedAttributes(blocks(reordered)[0]!.props)).toBe(
    blocks(reordered)[0]!.props.mjmlAttributes,
  );
});

it("keeps baselines stable through saved JSON, later edits, undo, and redo", () => {
  const original = fixture();
  const next = JSON.parse(JSON.stringify(original)) as EmailDocument;
  blocks(next)[0]!.props.fontSize = 16;
  blocks(next)[0]!.props.color = "#ff0000";
  expect(toMjml(next)).toContain('font-size="16px"');
  const later = JSON.parse(JSON.stringify(next)) as EmailDocument;
  blocks(later)[0]!.props.content = "<p>Later text</p>";
  expect(toMjml(later)).toContain('color="#ff0000"');
  const undo = JSON.parse(JSON.stringify(original)) as EmailDocument;
  expect(toMjml(undo)).not.toContain('font-size="16px"');
  expect(toMjml(JSON.parse(JSON.stringify(later)) as EmailDocument)).toBe(toMjml(later));
});

it.each([' table-layout="fixed"', ""])(
  "hands off explicit or omitted table layout to its visual control: %s",
  (attribute) => {
    const original = fromMjml(
      `<mjml><mj-body><mj-section><mj-column><mj-table${attribute}><tr><td>Cell</td></tr></mj-table></mj-column></mj-section></mj-body></mjml>`,
    ).document;
    const edited = structuredClone(original);
    blocks(edited)[0]!.props.tableLayout = "auto";
    expect(toMjml(edited)).toContain('table-layout="auto"');
    expect(toMjml(original)).not.toContain('table-layout="auto"');
  },
);

it.each([null, "bad", [], { native: "bad", controls: null }, { controls: {} }])(
  "ignores malformed ownership metadata: %s",
  (importBaseline) => {
    const entry = { name: "color", value: "red", source: "import", importBaseline };
    const props = { color: "#fff", mjmlAttributes: [entry, null] };
    expect(resolveImportedAttributes(props)).toBe(props.mjmlAttributes);
  },
);
