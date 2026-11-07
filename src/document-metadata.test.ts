import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { compileEmail, toMjml } from "./export";
import type { EmailDocument, EmailSettings } from "./types";

beforeAll(() => vi.stubGlobal("window", globalThis));
afterAll(() => vi.unstubAllGlobals());

const documentWith = (settings: EmailSettings = {}): EmailDocument => ({
  root: {
    props: {
      ...settings,
      sections: [
        {
          type: "Section2",
          props: {
            left: [{ type: "Text", props: { content: "Hello" } }],
            right: [{ type: "Text", props: { content: "World" } }],
          },
        },
      ],
    },
  },
  content: [],
});

describe("compiled document metadata", () => {
  it.each([
    { lang: "en-US", dir: "ltr" as const },
    { lang: "ar", dir: "rtl" as const },
    { lang: "fr-CA", dir: "auto" as const },
  ])("applies $lang and $dir to the HTML document and article", async (settings) => {
    const result = await compileEmail(documentWith(settings));
    expect(result.errors).toEqual([]);
    expect(result.mjml).toContain(`<mjml lang="${settings.lang}" dir="${settings.dir}">`);
    expect(result.html).toContain(`<html lang="${settings.lang}" dir="${settings.dir}"`);
    const article = result.html.match(/<div[^>]*role="article"[^>]*>/)?.[0];
    expect(article).toContain(`lang="${settings.lang}"`);
    expect(article).toContain(`dir="${settings.dir}"`);
  });

  it("preserves omitted root attributes and the compiler metadata defaults", async () => {
    const result = await compileEmail(documentWith());
    expect(result.errors).toEqual([]);
    expect(result.mjml.startsWith("<mjml>")).toBe(true);
    expect(result.html).toContain('<html lang="und" dir="auto"');
    expect(result.html).not.toContain("[owa]");
  });

  it("enables Outlook Web desktop column rules only when requested", async () => {
    const desktop = await compileEmail(documentWith({ owa: "desktop" }));
    const standard = await compileEmail(documentWith({ owa: "none" }));
    expect(desktop.errors).toEqual([]);
    expect(standard.errors).toEqual([]);
    expect(desktop.mjml).toContain('<mjml owa="desktop">');
    expect(desktop.html).toContain(
      "[owa] .mj-column-per-50 { width:50% !important; max-width: 50%; }",
    );
    expect(standard.html).not.toContain("[owa]");
  });

  it("normalizes malformed persisted metadata before it reaches MJML", async () => {
    const document = documentWith({
      lang: 'en" onclick="injected()',
      dir: "rtl;injected()" as EmailSettings["dir"],
      owa: 'desktop" injected="true' as EmailSettings["owa"],
    });
    const result = await compileEmail(document);
    expect(result.errors).toEqual([]);
    expect(result.mjml).toContain('<mjml lang="und" dir="auto" owa="none">');
    expect(result.html).toContain('<html lang="und" dir="auto"');
    expect(result.html).not.toContain("injected");
    expect(toMjml(documentWith({ lang: " zh-Hant-TW " }))).toContain('lang="zh-Hant-TW"');
  });
});
