import { describe, expect, it } from "vitest";
import { loadMjmlTemplate } from "./loader";
import source from "../../templates/02-Matte/welcome.mjml?raw";
import { descendants } from "./test-support";

describe("canonical MJML loader", () => {
  it("imports fresh nested block trees without changing the source", () => {
    const first = loadMjmlTemplate(source, "02-Matte/welcome.mjml");
    const second = loadMjmlTemplate(source, "02-Matte/welcome.mjml");
    const blocks = descendants(first.root.props!.sections!);
    const otherBlocks = descendants(second.root.props!.sections!);
    const text = blocks.find((block) => block.type === "Text")!;
    const otherText = otherBlocks.find((block) => block.type === "Text")!;
    expect(text).not.toBe(otherText);
    text.props.content = "<p>Changed only in the first document</p>";
    expect(otherText.props.content).not.toContain("Changed only in the first document");
    expect(source).not.toContain("Changed only in the first document");
  });

  it("names the source file and rejects imports that need trusted raw HTML", () => {
    expect(() =>
      loadMjmlTemplate(
        "<mjml><mj-body><mj-raw><div>Not editable</div></mj-raw></mj-body></mjml>",
        "broken-example.mjml",
      ),
    ).toThrow(/Template broken-example\.mjml could not be imported without changes/);
  });
});
