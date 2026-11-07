import { describe, expect, it } from "vitest";
import { createEmptyDocument } from "../src/document";
import { createEmailConfig } from "../src/config";
import type { EmailDocument } from "../src/types";
import { reviewImport, hasUnsavedChanges, documentSnapshot } from "./import-review";

describe("demo import guard", () => {
  it("accepts ordinary MJML", () => {
    expect(
      reviewImport(
        "<mjml><mj-body><mj-section><mj-column><mj-text>Hello</mj-text></mj-column></mj-section></mj-body></mjml>",
      ).document,
    ).toBeDefined();
  });
  it("rejects trusted source before replacing a document", () => {
    expect(() =>
      reviewImport("<mjml><mj-body><mj-raw><div>Trusted</div></mj-raw></mj-body></mjml>"),
    ).toThrow();
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
