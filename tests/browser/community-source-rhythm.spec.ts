import { expect, test, type Locator } from "@playwright/test";
import { sourceTemplateRepresentations } from "./source-template-representations";
import { canvasOverflowFailures, measureCanvasGeometry } from "./template-overflow";

test.describe.configure({ timeout: 120_000 });

/** Line-box edges exclude authored padding, so original padded paragraphs and
 * native editable wrappers are measured in the same coordinate system. */
async function textBox(root: Locator, prefix: string) {
  return root.evaluate((root, prefix) => {
    const normalized = (element: Element) =>
      (element.textContent ?? "").replace(/\s+/g, " ").trim();
    const candidates = Array.from(root.querySelectorAll("p,h1,h2,div"));
    const matches = candidates.filter(
      (element) =>
        normalized(element).startsWith(prefix) &&
        element.getBoundingClientRect().height > 0 &&
        !Array.from(element.querySelectorAll("p,h1,h2,div")).some((child) =>
          normalized(child).startsWith(prefix),
        ),
    );
    if (matches.length !== 1)
      throw new Error(`Expected one visible block for ${prefix}, found ${matches.length}`);
    const element = matches[0];
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const value = (property: string) => parseFloat(style.getPropertyValue(property)) || 0;
    const x = box.x + value("padding-left") + value("border-left-width");
    const y = box.y + value("padding-top") + value("border-top-width");
    const right = box.right - value("padding-right") - value("border-right-width");
    const bottom = box.bottom - value("padding-bottom") - value("border-bottom-width");
    return {
      x,
      y,
      right,
      bottom,
      width: right - x,
      height: bottom - y,
      lineHeight: style.lineHeight,
      fontSize: style.fontSize,
    };
  }, prefix);
}
async function box(locator: Locator) {
  return locator.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return {
      x: bounds.x,
      y: bounds.y,
      right: bounds.right,
      bottom: bounds.bottom,
      width: bounds.width,
      height: bounds.height,
    };
  });
}
async function paint(locator: Locator, background: string) {
  return locator.evaluate((element, background) => {
    for (let ancestor: Element | null = element; ancestor; ancestor = ancestor.parentElement) {
      const style = getComputedStyle(ancestor);
      if (style.backgroundColor !== background) continue;
      const bounds = ancestor.getBoundingClientRect();
      return {
        x: bounds.x,
        y: bounds.y,
        right: bounds.right,
        bottom: bounds.bottom,
        width: bounds.width,
        height: bounds.height,
        radius: parseFloat(style.borderTopLeftRadius),
      };
    }
    throw new Error(`Missing painted ancestor with ${background}`);
  }, background);
}
function equal(actual: number, expected: number, label: string) {
  // Subpixel line-box rounding may differ across table and editable DOM nodes.
  expect(Math.abs(actual - expected), label).toBeLessThanOrEqual(1);
}
const cases = [
  ["newsletters/google-play-policy-update", "Thank you,"],
  ["reviews/airbnb-review", "Common questions"],
  ["newsletters/codepen-challengers", "IDEAS!"],
  ["notifications/github-access-token", "View your token"],
  ["notifications/vercel-invite-user", "Join the team"],
] as const;

for (const width of [800, 390])
  for (const [name, ready] of cases) {
    test(`Community ${name} preserves independent source gaps and card edges at ${width}px`, async ({
      page,
    }, testInfo) => {
      const { reference, compiled, canvas, roots } = await sourceTemplateRepresentations(
        page,
        "Community",
        name,
        width,
        ready,
      );
      const ref = reference.locator("body");
      const evidence: unknown[] = [];
      try {
        expect(canvasOverflowFailures(await canvas.evaluate(measureCanvasGeometry))).toEqual([]);
        expect(
          await compiled.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        ).toBe(true);
        if (name.includes("google-play")) {
          const measure = async (root: Locator, original: boolean) => {
            const clarification = await textBox(root, "We've added clarifications");
            const exceptions = await textBox(root, "We're noting exceptions");
            const deadline = await textBox(root, "We're also extending");
            const rule = await box(
              root
                .locator(
                  original
                    ? "hr"
                    : ".google-play-deadline p[style*='border-top'], .google-play-deadline hr",
                )
                .last(),
            );
            const thanks = await textBox(root, "Thank you,");
            return {
              clarification,
              exceptions,
              deadline,
              rule,
              thanks,
              firstGap: exceptions.y - clarification.bottom,
              secondGap: deadline.y - exceptions.bottom,
              rightExpansion: exceptions.right - deadline.right,
              beforeRule: rule.y - deadline.bottom,
              afterRule: thanks.y - rule.bottom,
            };
          };
          const expected = await measure(ref, true);
          evidence.push({ source: expected });
          expect(expected.firstGap).toBe(32);
          expect(expected.secondGap).toBe(32);
          expect(expected.rightExpansion).toBe(40);
          for (const root of roots) {
            const actual = await measure(root, false);
            evidence.push(actual);
            for (const key of [
              "firstGap",
              "secondGap",
              "rightExpansion",
              "beforeRule",
              "afterRule",
            ] as const)
              equal(actual[key], expected[key], key);
            equal(
              actual.exceptions.x - actual.deadline.x,
              expected.exceptions.x - expected.deadline.x,
              "independent left inset",
            );
          }
        } else if (name.includes("airbnb")) {
          const measure = async (root: Locator, original: boolean) => {
            const avatar = await box(root.getByAltText("Alex", { exact: true }));
            const title = await textBox(root, "Here's what Alex wrote");
            const quoteText = await textBox(root, "“Alan was a great guest!");
            const quote = await paint(
              root.getByText(/^“Alan was a great guest!/),
              "rgb(242, 243, 243)",
            );
            const next = await textBox(root, "Now that the review period");
            const common = await textBox(root, "Common questions");
            const question = await textBox(root, "Can I leave a review after 14 days?");
            const address = await textBox(root, "Airbnb, Inc.,");
            const rules = root.locator(original ? "hr" : "p[style*='border-top'], hr");
            const firstRule = await box(rules.nth(0));
            const lastRule = await box(rules.nth(1));
            return {
              avatar,
              title,
              quote,
              quoteText,
              next,
              common,
              question,
              address,
              firstRule,
              lastRule,
              avatarTitle: title.y - avatar.bottom,
              titleQuote: quote.y - title.bottom,
              quoteNext: next.y - quote.bottom,
              ruleCommon: common.y - firstRule.bottom,
              questionRule: lastRule.y - question.bottom,
              ruleAddress: address.y - lastRule.bottom,
              quoteLeft: quoteText.x - quote.x,
              quoteRight: quote.right - quoteText.right,
              quoteTop: quoteText.y - quote.y,
              quoteBottom: quote.bottom - quoteText.bottom,
            };
          };
          const expected = await measure(ref, true);
          evidence.push({ source: expected });
          expect(expected.quote.radius).toBe(4);
          for (const root of roots) {
            const actual = await measure(root, false);
            evidence.push(actual);
            expect(actual.quote.radius).toBe(expected.quote.radius);
            for (const key of [
              "avatarTitle",
              "titleQuote",
              "quoteNext",
              "ruleCommon",
              "questionRule",
              "ruleAddress",
              "quoteLeft",
              "quoteRight",
              "quoteTop",
              "quoteBottom",
            ] as const)
              equal(actual[key], expected[key], key);
            // The source overflows mobile. Keep the intentional 24px safe gutters.
            if (width === 800)
              equal(actual.quote.width, expected.quote.width, "desktop quote width");
          }
        } else if (name.includes("codepen")) {
          const cardEdges = async (root: Locator, original: boolean) =>
            root
              .locator(
                original
                  ? 'table[style*="border-radius:10px"]'
                  : ".codepen-card-idea, .codepen-card-resource",
              )
              .evaluateAll(
                (cards, original) =>
                  cards.map((card) => {
                    const outer = card.getBoundingClientRect();
                    // Native content is a ProseMirror paragraph; compiled content is a div.
                    const paragraph = original
                      ? card.querySelector("p")
                      : (card.querySelector(".tiptap p") ?? card.querySelector("div"));
                    if (!paragraph) throw new Error("Missing source or editable card paragraph");
                    const text = paragraph.getBoundingClientRect();
                    const style = getComputedStyle(paragraph);
                    return {
                      y: outer.y,
                      bottom: outer.bottom,
                      width: outer.width,
                      left: text.x - outer.x,
                      right: outer.right - text.right,
                      bottomInset: outer.bottom - text.bottom,
                      fontSize: style.fontSize,
                      lineHeight: style.lineHeight,
                    };
                  }),
                original,
              );
          const participation = async (root: Locator) => {
            const yellow = await paint(root.getByText(/^To participate:/), "rgb(245, 210, 71)");
            const text = await textBox(root, "To participate:");
            const ideas = await textBox(root, "IDEAS!");
            const pro = await paint(
              root.getByText("Learn More", { exact: true }),
              "rgb(255, 255, 255)",
            );
            return {
              yellow,
              text,
              ideas,
              before: yellow.y - pro.bottom,
              after: ideas.y - yellow.bottom,
            };
          };
          const expectedCards = await cardEdges(ref, true);
          const expected = await participation(ref);
          evidence.push({ source: { cards: expectedCards, participation: expected } });
          expect(expectedCards).toHaveLength(6);
          for (const root of roots) {
            const cards = await cardEdges(root, false);
            const actual = await participation(root);
            evidence.push({ cards, participation: actual });
            expect(cards).toHaveLength(6);
            equal(actual.before, expected.before, "grey margin before participation");
            equal(
              actual.after,
              expected.after,
              "grey margin after participation plus heading margin",
            );
            equal(
              actual.text.y - actual.yellow.y,
              expected.text.y - expected.yellow.y,
              "yellow top padding",
            );
            equal(
              actual.yellow.bottom - actual.text.bottom,
              expected.yellow.bottom - expected.text.bottom,
              "yellow bottom padding",
            );
            for (const [index, card] of cards.entries()) {
              const source = expectedCards[index];
              for (const key of ["left", "right", "bottomInset"] as const)
                equal(card[key], source[key], `card ${index} ${key}`);
              expect(card.fontSize).toBe(source.fontSize);
              expect(card.lineHeight).toBe(source.lineHeight);
              if (width === 800) equal(card.width, source.width, `card ${index} desktop width`);
              if (index % 3 !== 0)
                equal(
                  card.y - cards[index - 1].bottom,
                  source.y - expectedCards[index - 1].bottom,
                  `card ${index} independent neighbor gap`,
                );
            }
          }
        } else if (name.includes("github")) {
          const measure = async (root: Locator) => {
            const logo = await box(root.getByAltText("Github", { exact: true }));
            const title = await textBox(root, "@alanturing,");
            const greeting = await textBox(root, "Hey alanturing!");
            const token = await textBox(root, "A fine-grained personal access token (resend)");
            const button = await paint(
              root.getByText("View your token", { exact: true }),
              "rgb(40, 167, 69)",
            );
            const card = await root.getByText(/^Hey alanturing!$/).evaluate((element) => {
              for (let node: Element | null = element; node; node = node.parentElement) {
                const style = getComputedStyle(node);
                if (
                  style.borderTopColor !== "rgb(222, 222, 222)" ||
                  parseFloat(style.borderTopWidth) !== 1
                )
                  continue;
                const box = node.getBoundingClientRect();
                return { y: box.y, bottom: box.bottom };
              }
              throw new Error("Missing GitHub bordered card");
            });
            const audit = await textBox(root, "Your security audit log ・ Contact support");
            return {
              logo,
              title,
              greeting,
              token,
              button,
              card,
              audit,
              logoTitle: title.y - logo.bottom,
              titleCard: card.y - title.bottom,
              cardGreeting: greeting.y - card.y,
              greetingToken: token.y - greeting.bottom,
              tokenButton: button.y - token.bottom,
              buttonCard: card.bottom - button.bottom,
              cardAudit: audit.y - card.bottom,
            };
          };
          const expected = await measure(ref);
          evidence.push({ source: expected });
          for (const root of roots) {
            const actual = await measure(root);
            evidence.push(actual);
            for (const key of [
              "logoTitle",
              "titleCard",
              "cardGreeting",
              "greetingToken",
              "tokenButton",
              "buttonCard",
              "cardAudit",
            ] as const)
              equal(actual[key], expected[key], key);
            for (const key of ["greeting", "token", "audit"] as const) {
              expect(actual[key].fontSize).toBe(expected[key].fontSize);
              expect(actual[key].lineHeight).toBe(expected[key].lineHeight);
            }
            equal(actual.button.height, expected.button.height, "unchanged source button paint");
          }
        } else {
          const measure = async (root: Locator, original: boolean) => {
            const url = await textBox(root, "or copy and paste");
            const rule = await box(
              root.locator(original ? "hr" : ".vercel-source-divider p, .vercel-source-divider hr"),
            );
            const footer = await textBox(root, "This invitation was intended");
            return {
              url,
              rule,
              footer,
              before: rule.y - url.bottom,
              after: footer.y - rule.bottom,
            };
          };
          const expected = await measure(ref, true);
          evidence.push({ source: expected });
          expect(expected.before).toBe(26);
          expect(expected.after).toBe(26);
          expect(expected.rule.height).toBe(2);
          for (const root of roots) {
            const actual = await measure(root, false);
            evidence.push(actual);
            equal(actual.before, expected.before, "independent upper divider margin");
            equal(actual.after, expected.after, "independent lower divider margin");
            expect(actual.rule.height, "both source 1px edges must paint exactly 2px").toBe(2);
            equal(
              actual.footer.y - actual.url.bottom,
              expected.footer.y - expected.url.bottom,
              "combined source footer span",
            );
          }
        }
      } finally {
        await testInfo.attach("source-relative-rhythm.json", {
          body: JSON.stringify({ name, width, evidence }, null, 2),
          contentType: "application/json",
        });
        await reference.close();
        await compiled.close();
      }
    });
  }
