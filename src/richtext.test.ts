import { describe, expect, it } from "vitest";
import { safeRichTextUrl, sanitizeEmailRichText } from "./richtext";

describe("sanitizeEmailRichText", () => {
  it("preserves every heading and paragraph alignment emitted by Puck", () => {
    const headings = [1, 2, 3, 4, 5, 6]
      .map((level) => `<h${level} style="text-align: right;">Heading ${level}</h${level}>`)
      .join("");
    expect(sanitizeEmailRichText(headings)).toBe(
      headings.replaceAll("text-align: right;", "text-align:right"),
    );
    for (const align of ["left", "center", "right", "justify"]) {
      expect(sanitizeEmailRichText(`<p style="text-align: ${align};">Text</p>`)).toBe(
        `<p style="text-align:${align}">Text</p>`,
      );
    }
  });

  it("keeps nested lists, start numbers, and supported numbering types", () => {
    const content =
      '<ol start="4" type="A"><li><p>Fourth</p><ul><li><p>Child</p></li></ul></li></ol>';
    expect(sanitizeEmailRichText(content)).toBe(content);
    expect(sanitizeEmailRichText('<ol start="-2" type="i"><li>Item</li></ol>')).toBe(
      '<ol start="-2" type="i"><li>Item</li></ol>',
    );
    expect(sanitizeEmailRichText('<ol start="1e2" type="unexpected"><li>Item</li></ol>')).toBe(
      "<ol><li>Item</li></ol>",
    );
  });

  it("keeps Puck marks, quotes, horizontal rules, and code whitespace", () => {
    const content =
      '<blockquote><p><strong>Bold</strong> <em>Italic</em> <u>Underlined</u> <s>Struck</s><br />Next <code>inline</code></p></blockquote><pre><code class="language-js">if (x) {\n  run();\n}</code></pre><hr />';
    expect(sanitizeEmailRichText(content)).toBe(content);
  });

  it("allows only alignment styles on paragraphs and headings", () => {
    expect(
      sanitizeEmailRichText(
        '<p style="text-align:center;color:red;background:url(https://example.com/track)">Safe</p><h4 style="position:fixed;text-align:justify">Heading</h4><blockquote style="text-align:right">Quote</blockquote><p style="text-align:expression(alert(1))">Bad</p>',
      ),
    ).toBe(
      '<p style="text-align:center">Safe</p><h4 style="text-align:justify">Heading</h4><blockquote>Quote</blockquote><p>Bad</p>',
    );
  });

  it("removes active content, handlers, and unrelated classes", () => {
    expect(
      sanitizeEmailRichText(
        '<h6 onclick="bad()">Safe</h6><img src="x" onerror="bad()"><script>bad()</script><iframe src="https://example.com"></iframe><pre class="layout"><code class="language-js other" onmouseover="bad()">Code</code></pre>',
      ),
    ).toBe('<h6>Safe</h6><pre><code class="language-js">Code</code></pre>');
  });

  it("keeps safe links and protects links opened in new tabs", () => {
    expect(
      sanitizeEmailRichText(
        '<a href="https://example.com/?a=1&amp;b=2" target="_blank" rel="opener" title="A &amp; B">Link</a>',
      ),
    ).toBe(
      '<a href="https://example.com/?a=1&amp;b=2" target="_blank" rel="noopener noreferrer" title="A &amp; B">Link</a>',
    );
    expect(
      sanitizeEmailRichText(
        '<a href="mailto:hello@example.com">Email</a><a href="tel:+12345">Call</a>',
      ),
    ).toBe('<a href="mailto:hello@example.com">Email</a><a href="tel:+12345">Call</a>');
  });

  it.each([
    "javascript:alert(1)",
    "java&#x0a;script:alert(1)",
    "data:text/html,bad",
    "//example.com",
    "https://user:password@example.com",
  ])("removes unsafe link %s", (href) => {
    expect(sanitizeEmailRichText(`<a href="${href}" target="_blank">Link</a>`)).toBe("<a>Link</a>");
  });

  it("is idempotent so imported content can be sanitized before editing and export", () => {
    const once = sanitizeEmailRichText(
      '<h6 style="text-align:right;color:red">Hello</h6><a href="https://example.com" target="_blank">Link</a>',
    );
    expect(sanitizeEmailRichText(once)).toBe(once);
    expect(sanitizeEmailRichText(undefined)).toBe("");
  });
});

describe("safeRichTextUrl", () => {
  it("uses the same accepted protocols for toolbar links and exported links", () => {
    expect(safeRichTextUrl(" https://example.com ")).toBe("https://example.com/");
    expect(safeRichTextUrl("mailto:user@example.com")).toBe("mailto:user@example.com");
    expect(safeRichTextUrl("tel:+12345")).toBe("tel:+12345");
    expect(safeRichTextUrl("mailto:")).toBe("");
    expect(safeRichTextUrl("https://example.com/\nattack")).toBe("");
  });
});
