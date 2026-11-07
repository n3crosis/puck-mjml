import { describe, expect, it } from "vitest";
import { reviewImport, hasUnsavedChanges } from "./import-review";

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
    expect(hasUnsavedChanges({ text: "a" }, JSON.stringify({ text: "a" }))).toBe(false);
    expect(hasUnsavedChanges({ text: "b" }, JSON.stringify({ text: "a" }))).toBe(true);
  });
});
