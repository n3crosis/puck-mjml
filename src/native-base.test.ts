import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getNativeBaseAttributes as base } from "./native-base";
import { nativeCatalog, readNativeAttributes } from "./native-attributes";
import { applyNativeAttributes, createNativeContext } from "./native-cascade";
import { getTableCellStyle, renderTableContent } from "./table";

beforeAll(() => vi.stubGlobal("window", globalThis));
afterAll(() => vi.unstubAllGlobals());

const src = "https://example.com/image.png";
const href = "https://example.com/read";
const bodyTags = Object.entries(nativeCatalog)
  .filter(([, spec]) => spec.kind === "body")
  .map(([tag]) => tag);

describe("native base attributes", () => {
  it.each(["navy", "transparent", "rgb(12, 34, 56)", "rgba(12, 34, 56, 0.5)"])(
    "keeps typed color %s consistent between visual controls, table cells, and export",
    (color) => {
      expect(base("mj-text", { color }).color).toBe(color);
      expect(base("mj-button", { backgroundColor: color, href })["background-color"]).toBe(color);
      expect(base("mj-table", { color }).color).toBe(color);
      const cell = { content: "<p>Color</p>", color, backgroundColor: color };
      expect(getTableCellStyle(cell)).toMatchObject({ color, backgroundColor: color });
      expect(renderTableContent({ bodyRows: [{ cells: [cell] }] })).toContain(`color:${color}`);
    },
  );

  it("does not treat CSS declarations or active content as a color", () => {
    for (const color of ["red;position:fixed", "url(javascript:alert(1))", "var(--unresolved)"]) {
      expect(base("mj-text", { color }).color).toBe("#222222");
      expect(getTableCellStyle({ content: "Safe", color }).color).toBeUndefined();
    }
  });

  it.each(bodyTags)("supplies native-compatible visual defaults for %s", (tag) => {
    const values = base(tag, { src, href, name: "web" });
    const attributes = Object.entries(values)
      .filter(([, value]) => value !== undefined && value !== "")
      .map(([name, value]) => ({ name, value: String(value) }));
    expect(() => readNativeAttributes(tag, attributes)).not.toThrow();
  });

  it("retains text typography limits without introducing rich-text classes", () => {
    const props = Object.freeze({
      fontSize: 100,
      fontWeight: 649.8,
      lineHeight: 9,
      letterSpacing: -20,
      align: "justify",
      fontFamily: " Georgia, serif ",
      cssClass: "copy primary",
    });
    expect(base("mj-text", props)).toEqual({
      color: "#222222",
      "font-size": "72px",
      "font-family": "Georgia, serif",
      "font-weight": 650,
      "line-height": 4,
      "letter-spacing": "-10px",
      align: "justify",
      padding: "10px",
      "css-class": "copy primary",
    });
    expect(base("mj-text", {})["css-class"]).toBeUndefined();
    expect(
      base("mj-text", {
        fontSize: "24",
        fontWeight: Number.NaN,
        lineHeight: Infinity,
        fontFamily: "serif; color:red",
      }),
    ).toMatchObject({
      "font-size": "16px",
      "font-weight": 400,
      "line-height": 1.5,
      "font-family": undefined,
    });
  });

  it("keeps button, spacer, image, and divider control ranges", () => {
    expect(
      base("mj-button", { href, fontSize: 0, lineHeight: 0, innerPadding: "0", align: "justify" }),
    ).toMatchObject({
      href,
      "font-size": "8px",
      "line-height": 0.5,
      "inner-padding": "10px 25px",
      align: "center",
      "background-color": "#2563eb",
    });
    expect(base("mj-spacer", { height: 0 })).toEqual({ height: "1px" });
    expect(base("mj-spacer", { height: 1000 })).toEqual({ height: "500px" });
    expect(base("mj-image", { src, width: 1500, borderRadius: "25%" })).toMatchObject({
      width: "1200px",
      "border-radius": "25%",
      alt: "",
      href: undefined,
    });
    expect(
      base("mj-divider", { thickness: 99, width: 0, color: "red", padding: " 4px 3% " }),
    ).toEqual({
      "border-width": "20px",
      width: "1%",
      "border-color": "red",
      padding: "4px 3%",
    });
  });

  it("retains distinct body and layout defaults with bounded dimensions", () => {
    expect(base("mj-body", {})).toEqual({ width: "600px", "background-color": "#f5f5f5" });
    expect(base("mj-body", { width: 2000, backgroundColor: "#abc" })).toEqual({
      width: "1000px",
      "background-color": "#abc",
    });
    expect(base("mj-body", { width: 1 }).width).toBe("320px");
    expect(base("mj-wrapper", {})).toMatchObject({
      "background-color": "#f3f4f6",
      padding: "20px",
    });
    expect(
      base("mj-section", {
        border: " 2px dashed #123456 ",
        borderRadius: "8px",
        cssClass: "layout",
      }),
    ).toEqual({
      "background-color": "#ffffff",
      padding: "0px",
      border: "2px dashed #123456",
      "border-radius": "8px",
      "css-class": "layout",
    });
    expect(
      base("mj-section", { border: "2px solid red", borderRadius: "malformed" }),
    ).toMatchObject({ border: undefined, "border-radius": "0px" });
    expect(base("mj-column", { width: 200, verticalAlign: "bottom" })).toMatchObject({
      width: "100%",
      "vertical-align": "bottom",
      padding: "0px",
    });
    expect(base("mj-group", { width: -1 })).toMatchObject({ width: "1%" });
  });

  it("leaves implicit columns and accordion elements free of visual overrides", () => {
    expect(
      base(
        "mj-column",
        { width: 50, padding: "20px", cssClass: "invalid class!" },
        { implicitColumn: true },
      ),
    ).toEqual({});
    for (const tag of [
      "mj-accordion",
      "mj-accordion-element",
      "mj-accordion-title",
      "mj-accordion-text",
    ]) {
      expect(base(tag, { color: "#ffffff", fontSize: 24 })).toEqual({});
    }
    expect(base("mj-raw", {}, { rawPosition: "file-start" })).toEqual({ position: "file-start" });
    expect(base("mj-raw", { position: "file-start" }).position).toBeUndefined();
  });

  it("sets hero height only in fixed-height mode", () => {
    expect(base("mj-hero", { height: 700 })).toMatchObject({
      mode: "fluid-height",
      height: undefined,
      "background-width": "600px",
      "background-height": "300px",
      padding: "40px 20px",
    });
    expect(
      base("mj-hero", {
        mode: "fixed-height",
        height: 3000,
        backgroundWidth: 0,
        backgroundHeight: Infinity,
        backgroundUrl: src,
      }),
    ).toMatchObject({
      mode: "fixed-height",
      height: "2000px",
      "background-width": "1px",
      "background-height": "300px",
      "background-url": src,
    });
  });

  it("uses the table validator while keeping its internal style class out of the base", () => {
    expect(
      base("mj-table", {
        fontSize: "24px",
        lineHeight: "150%",
        cellpadding: "5",
        cellspacing: 2,
        padding: "0",
        tableLayout: "fixed",
        cssClass: "data-table",
      }),
    ).toMatchObject({
      "font-size": "24px",
      "line-height": "150%",
      cellpadding: 5,
      cellspacing: 2,
      padding: "0px",
      "table-layout": "fixed",
      "css-class": "data-table",
    });
    expect(base("mj-table", {})["css-class"]).toBeUndefined();
    expect(base("mj-table", { fontSize: 500, cellpadding: 1001 })).toMatchObject({
      "font-size": "200px",
      cellpadding: 0,
    });
    for (const tag of [
      "mj-text",
      "mj-table",
      "mj-button",
      "mj-image",
      "mj-section",
      "mj-wrapper",
      "mj-column",
      "mj-group",
    ]) {
      expect(() => base(tag, { href, src, cssClass: "invalid  spacing" })).toThrow(/CSS class/);
    }
  });

  it("retains social no-share names and custom-icon background behavior", () => {
    for (const name of ["facebook", "x", "linkedin"])
      expect(base("mj-social-element", { name, href }).name).toBe(`${name}-noshare`);
    expect(base("mj-social-element", { name: "web", href })).toMatchObject({
      name: "web",
      "background-color": "",
      src: undefined,
      padding: undefined,
    });
    expect(base("mj-social-element", { name: "web", href, src, padding: "bad" })).toMatchObject({
      "background-color": "transparent",
      padding: "4px",
    });
    expect(
      base("mj-social-element", { name: "web", href, src, backgroundColor: "#123" })[
        "background-color"
      ],
    ).toBe("#123");
    expect(() => base("mj-social-element", { name: "custom", href, src })).toThrow(
      /Unsupported social network/,
    );
    expect(
      base("mj-social-element", { name: "custom", href, src }, { nativeEnabled: true }).name,
    ).toBe("custom");
    expect(
      base("mj-social", { iconSize: 300, borderRadius: "25%", iconPadding: " 2px " }),
    ).toMatchObject({ "icon-size": "200px", "border-radius": "3px", "icon-padding": "2px" });
  });

  it("normalizes legacy URLs and rejects invalid required and optional targets", () => {
    expect(base("mj-image", { src: " HTTPS://EXAMPLE.COM/photo a.png " }).src).toBe(
      "https://example.com/photo%20a.png",
    );
    expect(base("mj-button", { href: "mailto:reader@example.com" }).href).toBe(
      "mailto:reader@example.com",
    );
    expect(base("mj-navbar-link", { href: "tel:+12025550123" }).href).toBe("tel:+12025550123");
    for (const value of [
      undefined,
      "",
      "relative",
      "javascript:alert(1)",
      "https://user:secret@example.com",
      "https://example.com/\n",
    ]) {
      expect(() => base("mj-image", { src: value })).toThrow(/Image source/);
      expect(() => base("mj-button", { href: value })).toThrow(/Button link/);
    }
    expect(() => base("mj-image", { src, href: "invalid" })).toThrow(/Image link/);
    expect(() => base("mj-hero", { backgroundUrl: "invalid" })).toThrow(/Hero background/);
    expect(() => base("mj-carousel-image", { src, href: "invalid" })).toThrow(/Carousel link/);
  });

  it("defers native-mode URL validation until after overrides and inheritance", () => {
    const unfinished = "unfinished convenience URL";
    expect(base("mj-image", { src: unfinished }, { nativeEnabled: true }).src).toBe(unfinished);
    expect(base("mj-image", { src: unfinished, mjClass: "photo" }).src).toBe(unfinished);
    expect(
      base("mj-image", { src: unfinished, mjmlAttributes: [{ name: "src", value: src }] }).src,
    ).toBe(unfinished);
    expect(base("mj-image", {}, { nativeEnabled: true }).src).toBe("");
    expect(() => base("mj-image", { mjmlAttributes: [{ name: "", value: "" }] })).toThrow(
      /Image source/,
    );
    const props = { src: unfinished, mjmlAttributes: [{ name: "src", value: src }] };
    const resolved = applyNativeAttributes(
      "mj-image",
      props,
      base("mj-image", props),
      createNativeContext({}),
    );
    expect(resolved.attributes.src).toBe(src);
    expect(base("mj-navbar-link", { href: "offers" }, { nativeEnabled: true }).href).toBe("offers");
  });

  it("retains carousel thumbnail modes and rejects unsupported native tags", () => {
    expect(base("mj-carousel", { thumbnails: "supported", align: "right" })).toEqual({
      thumbnails: "supported",
      align: "right",
    });
    expect(base("mj-carousel", { thumbnails: "invalid" }).thumbnails).toBe("hidden");
    expect(base("mj-carousel-image", { src, alt: "Photo" })).toEqual({
      src,
      alt: "Photo",
      href: undefined,
    });
    for (const tag of ["mj-title", "mj-unknown", "constructor", "__proto__"])
      expect(() => base(tag, {})).toThrow(/Unsupported native body component/);
  });

  it("compiles the shared values into native typography, sizing, links, and layout", async () => {
    const attrs = (tag: string, props: Record<string, unknown>) =>
      Object.entries(base(tag, props))
        .filter(([, value]) => value !== undefined && value !== "")
        .map(
          ([name, value]) =>
            ` ${name}="${String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;")}"`,
        )
        .join("");
    const mjml = `<mjml><mj-body${attrs("mj-body", { width: 720 })}><mj-section${attrs("mj-section", {})}><mj-column${attrs("mj-column", { width: 100 })}><mj-text${attrs("mj-text", { fontSize: 100, fontFamily: "Georgia, serif", lineHeight: 2, color: "#123456" })}>Shared text</mj-text><mj-button${attrs("mj-button", { href, backgroundColor: "#fedcba" })}>Read</mj-button><mj-image${attrs("mj-image", { src, width: 240 })}/><mj-table${attrs("mj-table", { cellpadding: 5, cellspacing: 2 })}><tr><td>Cell</td></tr></mj-table></mj-column></mj-section></mj-body></mjml>`;
    const { default: mjml2html } = await import("mjml-browser");
    const result = await mjml2html(mjml, { validationLevel: "soft" });
    expect(result.errors).toEqual([]);
    for (const fragment of [
      "max-width:720px",
      "font-size:72px",
      "font-family:Georgia, serif",
      "line-height:2",
      "color:#123456",
      "background:#fedcba",
      `href="${href}"`,
      'width="240"',
      'cellpadding="5"',
      'cellspacing="2"',
    ]) {
      expect(result.html.includes(fragment), fragment).toBe(true);
    }
  });
});
