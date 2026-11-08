import { describe, expect, it } from "vitest";
import { createEmptyDocument } from "../src/document";
import { createEmailConfig } from "../src/config";
import type { EmailDocument } from "../src/types";
import { reviewImport, hasUnsavedChanges, documentSnapshot } from "./import-review";
import { assertCompleteMjml } from "./import-structure";
import { fromMjml, toMjml } from "../src/core";

describe("demo import guard", () => {
  it("accepts ordinary MJML", () => {
    expect(
      reviewImport(
        "<mjml><mj-body><mj-section><mj-column><mj-text>Hello</mj-text></mj-column></mj-section></mj-body></mjml>",
      ).document,
    ).toBeDefined();
  });
  it.each([
    ["<mjml><mj-body>", "Missing </mj-body>"],
    ["<mjml><mj-body/>", "Missing </mjml>"],
    ["<mjml><mj-body", "Unfinished <mj-body>"],
    ['<mjml><mj-body width="600px>', "Unfinished <mj-body>"],
    ["<mjml><mj-body></mjml>", "Expected </mj-body> before </mjml>"],
    ["<mjml><mj-body/></mjml></mjml>", "Unexpected </mjml>"],
    ["<mjml><mj-body/></mjml><mjml><mj-body/></mjml>", "single <mjml> root"],
    ["<mjml><mj-body/><mjml><mj-body/></mjml></mjml>", "single <mjml> root"],
    ["<mjml><mj-body/></mjml extra>", "Unexpected text in </mjml>"],
    ["<mjml><mj-body><!-- unfinished </mj-body></mjml>", "Unclosed comment"],
    ["<mjml><mj-body><![CDATA[ unfinished </mj-body></mjml>", "Unclosed CDATA"],
    [
      "<mjml><mj-body><mj-section><mj-column><mj-text><p>Unfinished<br></mj-column></mj-section></mj-body></mjml>",
      "Missing </mj-text>",
    ],
  ])("rejects incomplete or mismatched source before importing: %s", (source, problem) => {
    expect(() => reviewImport(source)).toThrow(problem);
  });
  it.each(["<mjml><mj-body/></mjml>", "<mjml><mj-head/><mj-body></mj-body></mjml>"])(
    "still accepts an intentionally empty email: %s",
    (source) => expect(reviewImport(source).document).toBeDefined(),
  );
  it("does not apply XML rules to ending HTML, void tags, quoted values, or entities", () => {
    const source = `<mjml><mj-body><mj-section><mj-column><mj-text><p title="</mj-text>">A &amp; B &nbsp; &copy;<br><img src="https://example.com/image.png"><p>Next<!-- </mj-text></mj-body> --></mj-text></mj-column></mj-section></mj-body></mjml>`;
    expect(() => assertCompleteMjml(source)).not.toThrow();
    expect(
      reviewImport(
        "<mjml><mj-body><mj-section><mj-column><mj-text><p>A &amp; B &nbsp; &copy;<br><p>Next</mj-text></mj-column></mj-section></mj-body></mjml>",
      ).document,
    ).toBeDefined();
  });
  it("keeps CSS, raw HTML, attribute values, and CDATA opaque at their MJML boundaries", () => {
    const source = `<?xml version="1.0"?><!DOCTYPE mjml [<!ENTITY sample "<mj-body>">]><mjml><mj-head><mj-title>A & B</mj-title><mj-style>.x::before { content: "<mj-body>"; } /* <mj-section> */</mj-style><mj-html-attributes><mj-selector path="[title='>']"><mj-html-attribute name="data-note"><mj-unknown> & value</mj-html-attribute></mj-selector></mj-html-attributes></mj-head><mj-body><mj-raw><!-- </mj-raw> --><![CDATA[ </mj-raw></mj-body> ]]><!DOCTYPE html><html><body><input disabled><br><p>Raw</body></html></mj-raw></mj-body></mjml>`;
    expect(() => assertCompleteMjml(source)).not.toThrow();
    // The demo's existing trust policy still rejects raw HTML. Passing the
    // structure check does not grant permission to import trusted content.
    expect(() => reviewImport(source)).toThrow(/trusted|allowRawHtml/i);
  });
  it.each(["<b x", "<mj-body x", "<? thing", "<!thing", "< b x"])(
    "does not treat CSS string contents as unfinished markup: %s",
    (text) => {
      const source = `<mjml><mj-head><mj-style>.x::before{content:"${text}"}</mj-style></mj-head><mj-body/></mjml>`;
      // The guard must not reject source accepted by the existing importer or
      // change its serialization. Source-fidelity issues are separate work.
      expect(toMjml(reviewImport(source).document)).toBe(toMjml(fromMjml(source).document));
    },
  );
  it("does not interpret CSS string comment/CDATA markers as markup boundaries", () => {
    const source = `<mjml><mj-head><mj-style>.a{content:"<!--"}.b{content:"<![CDATA["}</mj-style></mj-head><mj-body/></mjml>`;
    expect(() => assertCompleteMjml(source)).not.toThrow();
  });
  it("reports the source line and handles many structural and ending tags", () => {
    const repeated =
      "<mj-section><mj-column><mj-text><p>Text<br></mj-text></mj-column></mj-section>";
    expect(() =>
      assertCompleteMjml(`<mjml><mj-body>${repeated.repeat(5_000)}</mj-body></mjml>`),
    ).not.toThrow();
    expect(() => assertCompleteMjml("<!-- heading -->\n<mjml>\n<mj-body>\n")).toThrow(
      "line 3: Missing </mj-body>",
    );
  });
  it("scans long malformed tag prefixes without quadratic whitespace backtracking", () => {
    const source = `<${" ".repeat(100_000)}!<mjml><mj-body>`;
    const start = performance.now();
    expect(() => assertCompleteMjml(source)).toThrow("Missing </mj-body>");
    expect(performance.now() - start).toBeLessThan(1_000);
  });
  it.each(["", "   ", "ordinary selected text", "<html><body>Not MJML</body></html>"])(
    "rejects empty or non-MJML imported text: %j",
    (source) => expect(() => reviewImport(source)).toThrow(/mjml/i),
  );
  it("rejects trusted source before replacing a document", () => {
    expect(() =>
      reviewImport("<mjml><mj-body><mj-raw><div>Trusted</div></mj-raw></mj-body></mjml>"),
    ).toThrow();
  });
  it("retains ordinary import notes for complete unsupported MJML", () => {
    expect(
      reviewImport("<mjml><mj-head><mj-future /></mj-head><mj-body /></mjml>").warnings,
    ).toEqual(["Ignored unsupported head element <mj-future>."]);
    expect(reviewImport("<mjml><mj-body/></mjml><mj-body/>").warnings).toEqual([
      "Ignored element <mj-body> next to <mjml>.",
    ]);
  });
  it("compares document contents rather than identity", () => {
    const initial = createEmptyDocument();
    const baseline = documentSnapshot(initial);
    expect(hasUnsavedChanges(structuredClone(initial), baseline)).toBe(false);
    const changed = structuredClone(initial);
    changed.root.props!.previewText = "Unsaved draft";
    expect(hasUnsavedChanges(changed, baseline)).toBe(true);
  });
  it("ignores Puck's defaulted root fields, reordered keys, and empty zones without mutating data", () => {
    const initial = createEmptyDocument();
    const original = JSON.stringify(initial);
    const restored = {
      content: [],
      zones: {},
      root: { props: { ...createEmailConfig().root!.defaultProps, ...initial.root.props } },
    };
    expect(JSON.stringify(restored)).not.toBe(original);
    expect(hasUnsavedChanges(restored, documentSnapshot(initial))).toBe(false);
    expect(JSON.stringify(initial)).toBe(original);
  });
  it("normalizes plain rich text the same way as the editor", () => {
    const initial: EmailDocument = {
      ...createEmptyDocument(),
      content: [{ type: "Text", props: { id: "text", content: "Hello" } }],
    };
    const normalized = structuredClone(initial);
    normalized.content[0]!.props.content = "<p>Hello</p>";
    expect(hasUnsavedChanges(normalized, documentSnapshot(initial))).toBe(false);
  });
  it("retains actual changes including canvas-only settings, content order, and nonempty zones", () => {
    const initial: EmailDocument = {
      ...createEmptyDocument(),
      content: [
        { type: "Text", props: { id: "first", content: "First" } },
        { type: "Text", props: { id: "second", content: "Second" } },
      ],
    };
    const baseline = documentSnapshot(initial);
    const changed = structuredClone(initial);
    changed.root.props!.tailwind = true;
    expect(hasUnsavedChanges(changed, baseline)).toBe(true);
    const extended = structuredClone(initial);
    extended.content[0]!.props["future-extension"] = "Meaningful custom data";
    expect(hasUnsavedChanges(extended, baseline)).toBe(true);
    expect(
      hasUnsavedChanges({ ...initial, content: [...initial.content].reverse() }, baseline),
    ).toBe(true);
    expect(
      hasUnsavedChanges(
        { ...initial, zones: { "legacy:content": initial.content } } as EmailDocument,
        baseline,
      ),
    ).toBe(true);
  });
});
