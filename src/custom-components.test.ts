import { expect, it, vi } from "vitest";
import { expandMjmlComponents } from "./custom-components";
import { fromMjml } from "./import";
import { compileEmail, toMjml } from "./export";

it("converts host components into ordinary editable blocks without losing source markup", async () => {
  const source =
    '<mjml><mj-body><brand-card><brand-card><brand-label label="Hello &amp; welcome"/></brand-card></brand-card></mj-body></mjml>';
  const expanded = expandMjmlComponents(source, {
    "brand-card": ({ content }) => content,
    "brand-label": ({ attributes }) =>
      `<mj-section><mj-column><mj-text>${attributes.label!.replaceAll("&", "&amp;")}</mj-text></mj-column></mj-section>`,
  });
  expect(expanded).toBe(
    "<mjml><mj-body><mj-section><mj-column><mj-text>Hello &amp; welcome</mj-text></mj-column></mj-section></mj-body></mjml>",
  );
  const { document, warnings } = fromMjml(expanded);
  expect(warnings).toEqual([]);
  expect(toMjml(document)).toContain("Hello &amp; welcome");
  expect((await compileEmail(document)).errors).toEqual([]);
});

it("expands emitted registered components, but leaves ending tags, comments and unknown tags untouched", () => {
  const source =
    "<mjml><mj-body><!-- <brand-label/> --><mj-text><brand-label/> <br>Untouched</mj-text><unknown-box>Keep</unknown-box><brand-card/></mj-body></mjml>";
  expect(
    expandMjmlComponents(source, {
      "brand-card": () => "<brand-label/>",
      "brand-label": () => "<mj-spacer/>",
    }),
  ).toBe(source.replace("<brand-card/>", "<mj-spacer/>"));
});

it("rejects standard overrides, recursive output and expansion beyond the source budget", () => {
  expect(() => expandMjmlComponents("", { "mj-text": () => "" })).toThrow("Invalid");
  expect(() =>
    expandMjmlComponents("<brand-card/>", { "brand-card": () => "<brand-card/>" }),
  ).toThrow("Circular");
  expect(() =>
    expandMjmlComponents("<brand-card/>", { "brand-card": () => "x".repeat(10 * 1024 * 1024) }),
  ).toThrow("limit");
  const source = "<mjml><mj-body><brand-card/></mj-body></mjml>";
  const document = fromMjml(
    expandMjmlComponents(source, {
      "brand-card": () => "<mj-raw><strong>Trusted</strong></mj-raw>",
    }),
  ).document;
  expect(() => toMjml(document)).toThrow("allowRawHtml");
});

it("rejects custom defaults before invoking adapters and preserves opaque declarations", () => {
  const adapter = vi.fn(() => '<mj-spacer height="24px"/>');
  const head =
    '<mj-head><mj-attributes><mj-class name="space"><brand-spacer height="48px"/></mj-class></mj-attributes></mj-head>';
  const body = "<mj-body><brand-spacer/></mj-body>";
  for (const source of [`<mjml>${head}${body}</mjml>`, `<mjml>${body}${head}</mjml>`])
    expect(() => expandMjmlComponents(source, { "brand-spacer": adapter })).toThrow(
      "Resolve custom MJML defaults",
    );
  expect(adapter).not.toHaveBeenCalled();
  const opaque = `<mj-raw>${head}</mj-raw>`;
  expect(expandMjmlComponents(opaque, { "brand-spacer": adapter })).toBe(opaque);
});
