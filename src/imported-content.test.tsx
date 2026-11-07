import { Render, type Data } from "@puckeditor/core";
import { load } from "cheerio";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createEmailConfig } from "./config";
import { fromMjml } from "./import";
import { importedRichText } from "./imported-content";
import type { EmailBlock, EmailDocument } from "./types";
import type { TableRow } from "./table";

const fixture = (html: string) =>
  fromMjml(
    `<mjml><mj-body><mj-section><mj-column><mj-text>${html}</mj-text></mj-column></mj-section></mj-body></mjml>`,
  ).document;
const textBlock = (document: EmailDocument) =>
  (document.root.props!.sections![0]!.props.column as EmailBlock[])[0]!;
const canvas = (document: EmailDocument) =>
  load(renderToStaticMarkup(<Render config={createEmailConfig()} data={document as Data} />));

describe("safe imported Text provenance", () => {
  it.each([false, true])(
    "preserves native accordion answers in the canvas through edits, ordered=%s",
    (ordered) => {
      const title = "<mj-accordion-title>Question</mj-accordion-title>";
      const answer = '<mj-accordion-text css-class="answer">Plain answer</mj-accordion-text>';
      const document = fromMjml(
        `<mjml><mj-body><mj-section><mj-column><mj-accordion><mj-accordion-element>${ordered ? answer + title : title + answer}</mj-accordion-element></mj-accordion></mj-column></mj-section></mj-body></mjml>`,
      ).document;
      expect(canvas(document)(".answer").text()).toBe("Plain answer");
      expect(canvas(document)(".answer p")).toHaveLength(0);
      const accordion = textBlock(document);
      const item = (accordion.props.items as Record<string, unknown>[])[0]!;
      const text = ordered ? (item.children as Record<string, unknown>[])[0]! : item;
      text.content = "<p>Edited answer</p>";
      expect(canvas(document)(".answer").text()).toBe("Edited answer");
      expect(canvas(document)(".answer p")).toHaveLength(0);
      text.content = "<p>First</p><p>Second</p>";
      expect(canvas(document)(".answer.pm-imported-text p")).toHaveLength(2);
      expect(canvas(document)(".answer.pm-imported-inline-text")).toHaveLength(0);
    },
  );
  it("renders source paragraphs and headings with native styling while unchanged", () => {
    const document = fixture("<h1>Heading</h1><p>First</p><p>Second</p>");
    const $ = canvas(document);
    expect($(".pm-imported-text h1").text()).toBe("Heading");
    expect($(".pm-imported-text p")).toHaveLength(2);
    expect($(".pm-imported-inline-text")).toHaveLength(0);
  });

  it("does not insert a paragraph into untouched plain text in the read-only canvas", () => {
    const $ = canvas(fixture("Plain text"));
    expect($(".pm-imported-text").text()).toBe("Plain text");
    expect($(".pm-imported-text p")).toHaveLength(0);
  });

  it("keeps synthesized plain-text paragraphs margin-free when alignment is edited", () => {
    const document = fixture("Plain text");
    textBlock(document).props.content = '<p style="text-align: center">Edited</p>';
    expect(importedRichText(textBlock(document).props)).toBe(
      '<p style="text-align:center;margin:0">Edited</p>',
    );
    expect(canvas(document)(".pm-imported-inline-text p").attr("style")).toBe(
      "text-align:center;margin:0",
    );
  });

  it.each(["Text", "Table"])(
    "does not mistake real %s paragraphs for wrappers after toolbar alignment",
    (type) => {
      const document =
        type === "Text"
          ? fixture("<p>First</p><p>Second</p>")
          : fromMjml(
              "<mjml><mj-body><mj-section><mj-column><mj-table><tr><td><p>First</p><p>Second</p></td></tr></mj-table></mj-column></mj-section></mj-body></mjml>",
            ).document;
      const block = textBlock(document);
      const text =
        type === "Text" ? block.props : (block.props.bodyRows as TableRow[])[0]!.cells[0]!;
      text.content = '<p style="text-align: center;">First</p><p>Second</p>';
      const $ = canvas(document);
      expect($(".pm-imported-text p")).toHaveLength(2);
      expect($(".pm-imported-inline-text")).toHaveLength(0);
      expect($(".pm-imported-text p").first().attr("style")).toBe("text-align:center");
      expect(importedRichText(text)).not.toContain("margin:0");
    },
  );

  it("keeps the original through unrelated changes and restores it after undo", () => {
    const document = fixture("<p>Original</p>");
    const changed = structuredClone(document);
    textBlock(changed).props.fontSize = 22;
    expect(canvas(changed)(".pm-imported-text")).toHaveLength(1);
    textBlock(changed).props.content = "<p>Changed</p>";
    expect(canvas(changed)(".pm-imported-text")).toHaveLength(1);
    expect(canvas(changed)(".pm-imported-text").text()).toBe("Changed");
    expect(canvas(document)(".pm-imported-text")).toHaveLength(1);
  });

  it("validates metadata shape and re-sanitizes persisted source", () => {
    expect(importedRichText({ content: "x", importedRichText: [] })).toBeUndefined();
    expect(
      importedRichText({ content: "x", importedRichText: { baseline: 1, source: "x" } }),
    ).toBeUndefined();
    expect(
      importedRichText({
        content: "x",
        importedRichText: {
          baseline: "x",
          source: '<img src=x onerror="alert(1)"><p onclick="alert(1)">Safe</p>',
        },
      }),
    ).toBe("<p>Safe</p>");
  });

  it("retains native table headings, spacing, and cell omissions after edits", () => {
    const document = fromMjml(
      "<mjml><mj-body><mj-section><mj-column><mj-table><tr><th>Heading</th><td><p>One</p><p>Two</p></td></tr></mj-table></mj-column></mj-section></mj-body></mjml>",
    ).document;
    const table = textBlock(document);
    const rows = table.props.bodyRows as TableRow[];
    rows[0]!.cells[0]!.content = "<p>Edited heading</p>";
    rows[0]!.cells[1]!.width = "60%";
    const $ = canvas(document);
    expect($(".pm-native-table")).toHaveLength(1);
    expect($(".pm-native-table").attr("style")).toContain("border-collapse:separate");
    expect($(".pm-native-table th").text()).toBe("Edited heading");
    expect($(".pm-native-table th").attr("style")).toBeUndefined();
    expect($(".pm-native-table th").attr("scope")).toBeUndefined();
    expect($(".pm-native-table th p")).toHaveLength(0);
    expect($(".pm-native-table td").attr("style")).toBe("width:60%");
    expect($(".pm-native-table td .pm-imported-text p")).toHaveLength(2);
    rows[0]!.cells[0]!.align = "left";
    expect(canvas(document)(".pm-native-table th").attr("style")).toBe("text-align:left");
  });
});
