import { describe, expect, it, vi } from "vitest";
import { mjmlDefaultFonts } from "../src/canvas-font-resolver";
import { withDefaultFontFixtures } from "./fixtures/font-css";

describe("detached-DOM default-font fixtures", () => {
  it.each(mjmlDefaultFonts)(
    "returns deterministic local CSS only for the exact $name URL",
    async ({ name, href }) => {
      const fallback = vi.fn<typeof fetch>();
      const response = await withDefaultFontFixtures(fallback)(href);
      expect(response.ok).toBe(true);
      expect(response.headers.get("content-type")).toBe("text/css");
      expect(await response.text()).toBe(
        `@font-face { font-family: ${JSON.stringify(name)}; font-style: normal; font-weight: 100 900; src: local("puck-mjml-unit-test-font"); }`,
      );
      expect(fallback).not.toHaveBeenCalled();
    },
  );

  it("passes modified font URLs and non-font requests through without changing arguments", async () => {
    const response = new Response("unchanged", { status: 418 });
    const fallback = vi.fn<typeof fetch>(async () => response);
    const fixture = withDefaultFontFixtures(fallback);
    for (const input of [
      `${mjmlDefaultFonts[0].href}&display=swap`,
      "https://fonts.googleapis.com/css2?family=Inter",
      "https://example.com/api/data",
      new URL("https://example.com/image.png"),
      new Request("https://example.com/request"),
    ]) {
      const init = { headers: { "x-test": "preserved" } };
      expect(await fixture(input, init)).toBe(response);
      expect(fallback).toHaveBeenLastCalledWith(input, init);
    }
    expect(fallback).toHaveBeenCalledTimes(5);
  });

  it("recognizes URL and Request inputs without broadening the allowed URLs", async () => {
    const fallback = vi.fn<typeof fetch>();
    const fixture = withDefaultFontFixtures(fallback);
    for (const input of [
      new URL(mjmlDefaultFonts[0].href),
      new Request(mjmlDefaultFonts[1].href),
    ]) {
      expect((await fixture(input)).ok).toBe(true);
    }
    expect(fallback).not.toHaveBeenCalled();
  });

  it("does not install the Happy DOM fixture in the ordinary Node test environment", () => {
    expect(typeof window).toBe("undefined");
    expect(vi.isMockFunction(fetch)).toBe(false);
  });
});
