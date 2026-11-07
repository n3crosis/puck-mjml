import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { compileEmail } from "../export";
import { emailTemplates } from "./registry";
import { descendants } from "./test-support";

beforeAll(() => vi.stubGlobal("window", globalThis));
afterAll(() => vi.unstubAllGlobals());

describe("template registry", () => {
  it("lists every demo template with unique ids and groups", () => {
    // Blank + 9 Matte + 9 Protocol. Raise back to 60 when the remaining
    // families (01-Barebone, 04-Arcane, 05-Studio, Community) are ported.
    expect(emailTemplates.length).toBeGreaterThanOrEqual(19);
    expect(new Set(emailTemplates.map((template) => template.id)).size).toBe(emailTemplates.length);
    for (const template of emailTemplates) {
      expect(template.id).toMatch(/^[a-z0-9/-]+$/);
      expect(template.label.length).toBeGreaterThan(0);
    }
  });

  it.each(emailTemplates.map((template) => [template.id, template] as const))(
    "%s compiles without MJML errors",
    async (_id, template) => {
      const document = template.create();
      expect(document.content).toEqual([]);
      const blocks = descendants(document.root.props!.sections!);
      if (blocks.length) {
        expect(new Set(blocks.map((block) => block.props.id)).size).toBe(blocks.length);
      }
      expect(blocks.every((block) => block.type !== "Raw")).toBe(true);
      const result = await compileEmail(document);
      expect(result.errors, JSON.stringify(result.errors, null, 2)).toEqual([]);
      expect(result.html).toContain("<body");
    },
    30000,
  );
});
