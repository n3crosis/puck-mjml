import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { Render, type Data } from "@puckeditor/core";
import { load } from "cheerio";
import { Window } from "happy-dom";
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

const typographyTags = ["p", "h1", "h2", "h3", "h4", "h5", "h6"];
const hostTypographyReset = `${typographyTags.join(",")} {
  margin:37px; font-size:38px; font-weight:100; line-height:9px;
}`;

function styledCanvas(document: EmailDocument, appStylesLast = false, hostReset = true) {
  const window = new Window({
    settings: {
      enableJavaScriptEvaluation: false,
      disableCSSFileLoading: true,
      disableJavaScriptFileLoading: true,
      enableImageFileLoading: false,
      disableIframePageLoading: true,
    },
  });
  const dom = window.document;
  dom.body.innerHTML = canvas(document).html();
  const stylesheet = dom.createElement("style");
  stylesheet.textContent = readFileSync(new URL("./style.css", import.meta.url), "utf8");
  (appStylesLast ? dom.body : dom.head).append(stylesheet);
  const host = dom.createElement("style");
  host.textContent = hostReset ? hostTypographyReset : "";
  dom.body.append(host);
  return { window, dom };
}

describe("imported typography cascade", () => {
  for (const type of ["Text", "Table"]) {
    it.each([false, true])(
      `lets authored tag rules override ${type} defaults before and after edits, app styles last=%s`,
      (appStylesLast) => {
        const html = typographyTags.map((tag) => `<${tag}>${tag}</${tag}>`).join("");
        const content =
          type === "Text"
            ? `<mj-text>${html}</mj-text>`
            : `<mj-table><tr><td>${html}</td></tr></mj-table>`;
        const document = fromMjml(
          `<mjml><mj-head><mj-style>${typographyTags.join(",")} {
            margin:2px 3px 4px 5px; font-size:18px; font-weight:500; line-height:24px;
          }</mj-style></mj-head><mj-body><mj-section><mj-column>${content}</mj-column></mj-section></mj-body></mjml>`,
        ).document;
        const block = textBlock(document);
        const text =
          type === "Text" ? block.props : (block.props.bodyRows as TableRow[])[0]!.cells[0]!;
        for (const edited of [false, true]) {
          if (edited) text.content = html.replace("</p>", " edited</p>");
          const { window, dom } = styledCanvas(document, appStylesLast);
          const paragraphs = dom.querySelectorAll(".pm-imported-text > div > *");
          expect(paragraphs).toHaveLength(typographyTags.length);
          for (const paragraph of paragraphs) {
            const style = window.getComputedStyle(paragraph);
            expect(style.margin).toBe("2px 3px 4px 5px");
            expect(style.fontSize).toBe("18px");
            expect(style.fontWeight).toBe("500");
            expect(style.lineHeight).toBe("24px");
          }
          window.happyDOM.abort();
        }
      },
    );
  }

  it("keeps native fallbacks above host tag resets and preserves synthetic wrapper margins", () => {
    const document = fixture("<h2>Heading</h2><p>First</p><p>Last</p>");
    const { window, dom } = styledCanvas(document);
    for (const paragraph of dom.querySelectorAll(".pm-imported-text > div > *")) {
      const style = window.getComputedStyle(paragraph);
      // Happy DOM exposes revert rather than computing the UA stylesheet.
      // Browser coverage checks the resulting native spacing and typography.
      expect(style.margin).toBe("revert");
      expect(style.fontSize).toBe("revert");
      expect(style.fontWeight).toBe("revert");
    }
    const synthetic = dom.createElement("div");
    synthetic.className = "pm-text pm-imported-text pm-imported-inline-text";
    synthetic.innerHTML = "<p>Synthetic paragraph</p>";
    dom.body.append(synthetic);
    expect(window.getComputedStyle(synthetic.firstElementChild!).margin).toBe("0px");
    window.happyDOM.abort();
  });

  it("retains editor-created paragraph and heading defaults", () => {
    const { window, dom } = styledCanvas(fixture("Plain text"), false, false);
    const legacy = dom.createElement("div");
    legacy.className = "pm-text";
    legacy.innerHTML = "<p>First</p><h1>Heading</h1><h2>Last</h2>";
    dom.body.append(legacy);
    expect(window.getComputedStyle(legacy.querySelector("p")!).margin).toBe("0px");
    const heading = window.getComputedStyle(legacy.querySelector("h1")!);
    expect(heading.marginTop).toBe("0px");
    expect(heading.marginRight).toBe("0px");
    expect(Number.parseFloat(heading.marginBottom)).toBeGreaterThan(0);
    expect(heading.fontWeight).toBe("bold");
    expect(heading.lineHeight).toBe("1.15");
    expect(window.getComputedStyle(legacy.querySelector("h2")!).marginBottom).toBe("0px");
    window.happyDOM.abort();
  });

  it.each([false, true])(
    "preserves installed Puck boundary spacing, Puck CSS last=%s",
    (puckLast) => {
      const { window, dom } = styledCanvas(
        fixture("<p>First</p><h2>Heading</h2><p>Middle</p><p>Last</p>"),
        false,
        false,
      );
      const puckCss = readFileSync(
        createRequire(import.meta.url).resolve("@puckeditor/core/puck.css"),
        "utf8",
      );
      const editorClass = /\.(_RichTextEditor_\w+)\s+\.ProseMirror\s*\{/.exec(puckCss)![1];
      const content = dom.querySelector(".pm-imported-text > div")!;
      content.innerHTML = `<div class="${editorClass}"><div class="rich-text"><div class="tiptap ProseMirror" role="textbox" contenteditable="true">${content.innerHTML}</div></div></div>`;
      const style = dom.createElement("style");
      style.textContent = puckCss;
      if (puckLast) dom.head.append(style);
      else dom.head.prepend(style);
      const paragraphs = [...content.querySelectorAll("p")];
      const margins = () =>
        paragraphs.map((paragraph) => {
          const computed = window.getComputedStyle(paragraph);
          return [computed.marginTop, computed.marginBottom];
        });
      // Puck already trims these edges with 0,3,1 specificity, above both the
      // former 0,2,1 imported reset and the new 0,1,0 native fallback.
      expect(margins()).toEqual([
        ["0px", "revert"],
        ["revert", "revert"],
        ["revert", "0px"],
      ]);
      const authored = dom.createElement("style");
      authored.textContent = ".pm-canvas p { margin:0; }";
      dom.body.append(authored);
      expect(margins()).toEqual([
        ["0px", "0px"],
        ["0px", "0px"],
        ["0px", "0px"],
      ]);
      window.happyDOM.abort();
    },
  );
});

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
