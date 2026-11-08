import { readFileSync } from "node:fs";
import * as cheerio from "cheerio";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { fromMjml } from "./import";
import { compileEmail } from "./export";

// These fixtures are actual React Email render() output at the pinned upstream revision,
// not HTML inferred from the MJML port or copied from TSX source strings.
const names = [
  "magic-links/slack-confirm",
  "reset-password/twitch-reset-password",
  "notifications/vercel-invite-user",
  "reviews/amazon-review",
] as const;
type Name = (typeof names)[number];
const rendered = new Map<
  Name,
  {
    source: string;
    original: cheerio.CheerioAPI;
    direct: cheerio.CheerioAPI;
    port: cheerio.CheerioAPI;
  }
>();
const style = (value: string | undefined) =>
  Object.fromEntries(
    (value ?? "").split(";").flatMap((entry) => {
      const colon = entry.indexOf(":");
      return colon < 0 ? [] : [[entry.slice(0, colon).trim(), entry.slice(colon + 1).trim()]];
    }),
  );
const image = ($: cheerio.CheerioAPI, filename: string) => $(`img[src$="/${filename}"]`).last();
const textBlock = ($: cheerio.CheerioAPI, text: string) =>
  $("p,h1,div[style*='font-size']")
    .filter((_, node) => $(node).text().replace(/\s+/g, " ").trim() === text)
    .last();
const links = ($: cheerio.CheerioAPI) =>
  $("a")
    .map((_, node) => {
      const href = $(node).attr("href");
      return href ? new URL(href, "https://demo.react.email").href : "[no href]";
    })
    .toArray();
const assets = ($: cheerio.CheerioAPI) =>
  $("img")
    .map((_, node) => $(node).attr("src"))
    .toArray();

beforeAll(async () => {
  vi.stubGlobal("window", globalThis);
  const { default: mjml2html } = await import("mjml-browser");
  for (const name of names) {
    const source = readFileSync(
      new URL(`../templates/Community/${name}.mjml`, import.meta.url),
      "utf8",
    );
    const original = cheerio.load(
      readFileSync(
        new URL(`../.cache/react-email-reference/Community/${name}.html`, import.meta.url),
        "utf8",
      ),
    );
    const { document, warnings } = fromMjml(source);
    expect(warnings, name).toEqual([]);
    expect(source, name).not.toContain("mj-raw");
    expect(JSON.stringify(document), name).not.toContain('"htmlContent"');
    const direct = await mjml2html(source, { validationLevel: "strict" });
    const port = await compileEmail(document);
    expect(direct.errors, name).toEqual([]);
    expect(port.errors, name).toEqual([]);
    rendered.set(name, {
      source,
      original,
      direct: cheerio.load(direct.html),
      port: cheerio.load(port.html),
    });
  }
});
afterAll(() => vi.unstubAllGlobals());

describe("Community ports against emitted React Email HTML", () => {
  it.each(names)("preserves %s assets and actual link targets through safe compilation", (name) => {
    const { original, direct, port } = rendered.get(name)!;
    expect(assets(port)).toEqual(assets(original));
    expect(links(port)).toEqual(links(original));
    expect(assets(port)).toEqual(assets(direct));
    expect(links(port)).toEqual(links(direct));
  });

  it.each([
    [
      "magic-links/slack-confirm",
      ["slack-logo.png", "slack-twitter.png", "slack-facebook.png", "slack-linkedin.png"],
    ],
    [
      "reset-password/twitch-reset-password",
      ["twitch-icon-twitter.png", "twitch-icon-facebook.png"],
    ],
    [
      "notifications/vercel-invite-user",
      ["vercel-user.png", "vercel-arrow.png", "vercel-team.png"],
    ],
    [
      "reviews/amazon-review",
      ["amazon-logo.png", "amazon-instagram.jpg", "amazon-facebook.jpg", "amazon-twitter.jpg"],
    ],
  ] as const)(
    "keeps the original %s image row inline below the stacking breakpoint",
    (name, filenames) => {
      const { original, port } = rendered.get(name)!;
      const originalRows = filenames.map((filename) =>
        image(original, filename).closest("tr").get(0),
      );
      expect(new Set(originalRows).size).toBe(1);
      const groups = filenames.map((filename) => {
        const column = image(port, filename).closest("div.mj-outlook-group-fix");
        // mj-group emits a non-stacking percentage width inline, not width:100%
        // waiting for the desktop media query to change it.
        expect(style(column.attr("style")).width).not.toBe("100%");
        const group = column.parent("div.mj-outlook-group-fix");
        expect(group).toHaveLength(1);
        expect(style(group.attr("style"))["line-height"]).toBe("0");
        return group.get(0);
      });
      expect(new Set(groups).size).toBe(1);
    },
  );

  it("keeps Slack's 28px intro leading and inset code panel with its paragraph spacing", () => {
    const { original, port } = rendered.get("magic-links/slack-confirm")!;
    const text =
      "Your confirmation code is below - enter it in your open browser window and we'll help you get signed in.";
    expect(style(textBlock(original, text).attr("style"))["line-height"]).toBe("28px");
    expect(style(textBlock(port, text).attr("style"))["line-height"]).toBe("28px");
    const originalCode = textBlock(original, "DJZ-TLX");
    expect(style(originalCode.attr("style"))["margin-top"]).toBe("16px");
    const code = textBlock(port, "DJZ-TLX");
    expect(style(code.closest("td").attr("style")).padding).toBe("16px 0px");
    const panel = code
      .parents("div")
      .filter((_, node) => style(port(node).attr("style"))["background-color"] === "#f5f4f5")
      .first();
    expect(style(panel.attr("style"))["max-width"]).toBe("560px");
  });

  it("keeps Twitch's accent divider as one row and restores spacing, link color, and native icon dimensions", () => {
    const { original, port } = rendered.get("reset-password/twitch-reset-password")!;
    const originalAccent = original("td[style*='145,71,255']");
    expect(originalAccent.closest("tr").children("td")).toHaveLength(3);
    const accent = port("p[style*='#9147ff']");
    const group = accent.closest("div.mj-outlook-group-fix").parent("div.mj-outlook-group-fix");
    expect(group.children("div.mj-outlook-group-fix")).toHaveLength(3);
    expect(port("td[style*='padding:30px 0px']")).toHaveLength(1);
    expect(port("td[style*='padding:21px 20px 10px']")).toHaveLength(1);
    expect(style(original("a").first().attr("style")).color).toBe("#067df7");
    expect(style(port("a").first().attr("style")).color).toBe("#067df7");
    // Downloaded from the exact original asset URLs: PNG headers are 24x20 and 11x20.
    expect(image(port, "twitch-icon-twitter.png").attr("width")).toBe("24");
    expect(image(port, "twitch-icon-facebook.png").attr("width")).toBe("11");
    expect(image(port, "twitch-icon-facebook.png").attr("height")).toBe("20");
    const footer =
      "© 2022 Twitch, All Rights Reserved350 Bush Street, 2nd Floor, San Francisco, CA, 94104 - USA";
    expect(style(textBlock(port, footer).attr("style"))["line-height"]).toBe("24px");
  });

  it("preserves Vercel's system typography, outer spacing, un-underlined blue links, and dark details", () => {
    const { original, port } = rendered.get("notifications/vercel-invite-user")!;
    const originalFont = style(original("td[style*='font-family']").first().attr("style"))[
      "font-family"
    ];
    const portFont = style(textBlock(port, "Hello alanturing,").attr("style"))["font-family"];
    expect(portFont.replaceAll("'", '"')).toBe(originalFont);
    expect(original("table[style*='margin-top:40px']")).toHaveLength(1);
    const css = port("style").text();
    expect(css).toMatch(/body\s*\{\s*padding:\s*40px 8px !important/);
    expect(style(original("a").first().attr("style"))["text-decoration-line"]).toBe("none");
    expect(css).toMatch(
      /\.community-rich-0 a:nth-of-type\(1\)\s*\{\s*color:\s*#155dfc;\s*text-decoration:\s*none/,
    );
    expect(
      port(".vercel-invite-details b")
        .map((_, node) => port(node).text())
        .toArray(),
    ).toEqual(
      original("span[style='color:rgb(0,0,0)']")
        .map((_, node) => original(node).text())
        .toArray(),
    );
    expect(css).toMatch(
      /\.vercel-invite-details b\s*,\s*\.vercel-invite-details strong\s*\{\s*color:\s*#000000;\s*font-weight:\s*400/,
    );
  });

  it("matches Amazon's inherited 24px leading and actual star size without losing readable mobile stacking", () => {
    const { original, port } = rendered.get("reviews/amazon-review")!;
    for (const text of [
      "Start with rating this product",
      "Customer reviews must adhere to the Community Guidelines .",
      "Reference: 706784740",
    ]) {
      expect(style(textBlock(original, text).attr("style"))["line-height"]).toBe("24px");
      expect(style(textBlock(port, text).attr("style"))["line-height"]).toBe("24px");
    }
    // GIF header from the original amazon-rating.gif is 35x33, not the port's old 32x32 guess.
    expect(image(port, "amazon-rating.gif").attr("width")).toBe("35");
    expect(image(port, "amazon-rating.gif").closest("td").attr("style")).toContain("height:33px");
    const publicName = port("a").filter(
      (_, node) => port(node).text() === "Check your public name.",
    );
    expect(style(publicName.attr("style")).color).toBe("#067df7");
    expect(style(publicName.attr("style"))["text-decoration"]).toBe("none");
    // Deliberate responsive adaptation: the upstream fixed-width book/copy table
    // stays side by side on narrow screens; the port stacks to keep the copy legible.
    expect(style(port(".amazon-review-copy").attr("style")).width).toBe("100%");
    expect(port("style").text()).toMatch(
      /@media only screen and \(max-width: 479px\)[\s\S]*\.amazon-review-copy[^}]+padding-left:\s*0px !important/,
    );
  });
});
