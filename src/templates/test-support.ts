import type { EmailBlock } from "../types";

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
