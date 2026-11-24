import { expect, it } from "vitest";
import { fromMjml } from "./import";
import { toMjml } from "./export";

const oversizedTable =
  '<mj-table><table data-pm-layout="row">' + "<tr/>".repeat(4100) + "</table></mj-table>";

it.each(["mj-breakpoint", "mj-carousel-image"])(
  "ignores intrinsic-looking content inside the compiler ending tag %s",
  (tag) => {
    const head =
      tag === "mj-breakpoint"
        ? `<mj-breakpoint width="480px">${oversizedTable}</mj-breakpoint>`
        : "";
    const carousel =
      tag === "mj-carousel-image"
        ? `<mj-carousel><mj-carousel-image src="https://example.com/a.png">${oversizedTable}</mj-carousel-image></mj-carousel>`
        : "";
    const source = `<mjml><mj-head>${head}<mj-title>Preserved title</mj-title></mj-head><mj-body><mj-section><mj-column>${carousel}<mj-text>After ending content</mj-text></mj-column></mj-section></mj-body></mjml>`;
    const exported = toMjml(fromMjml(source).document);
    expect(exported).toContain("Preserved title");
    expect(exported).toContain("After ending content");
    expect(exported).not.toContain("data-pm-layout");
    expect(exported).toContain(
      tag === "mj-breakpoint" ? '<mj-breakpoint width="480px"' : 'src="https://example.com/a.png"',
    );
  },
);

it("still rejects oversized intrinsic tables outside opaque ending content", () => {
  expect(() =>
    fromMjml(
      `<mjml><mj-body><mj-section><mj-column>${oversizedTable}</mj-column></mj-section></mj-body></mjml>`,
    ),
  ).toThrow("4096");
});
