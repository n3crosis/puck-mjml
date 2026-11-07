import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { compileEmail } from "../export";
import type { EmailBlock, EmailDocument } from "../types";

export function descendants(blocks: EmailBlock[]): EmailBlock[] {
  return blocks.flatMap((block) => [
    block,
    ...Object.values(block.props).flatMap((value) =>
      Array.isArray(value) &&
      value.every((item) => item && typeof item === "object" && "type" in item && "props" in item)
        ? descendants(value as EmailBlock[])
        : [],
    ),
  ]);
}

/**
 * Register a compile check for one ported template: unique IDs, no raw HTML,
 * and a clean MJML compilation with zero validation errors.
 */
export function checkTemplate(
  name: string,
  factory: () => EmailDocument,
  render: (result: Awaited<ReturnType<typeof compileEmail>>) => void = () => {},
) {
  describe(`${name} template`, () => {
    beforeAll(() => vi.stubGlobal("window", globalThis));
    afterAll(() => vi.unstubAllGlobals());

    it("creates editable block trees with unique IDs and compiles without MJML errors", async () => {
      const document = factory();
      expect(document.content).toEqual([]);
      const blocks = descendants(document.root.props!.sections!);
      expect(blocks.length).toBeGreaterThan(0);
      expect(blocks.every((block) => block.type !== "Raw" && Boolean(block.props.id))).toBe(true);
      expect(new Set(blocks.map((block) => block.props.id)).size).toBe(blocks.length);
      const result = await compileEmail(document);
      expect(result.errors, JSON.stringify(result.errors, null, 2)).toEqual([]);
      expect(result.html).toContain("<body");
      render(result);
    });
  });
}
