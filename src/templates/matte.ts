import type { EmailBlock, EmailDocument } from "../types";
import {
  button,
  column,
  columns,
  divider,
  email,
  group,
  image,
  section,
  socialRow,
  spacer,
  text,
  wrapper,
} from "./shared";

// Adapted from React Email's Matte welcome example:
// https://github.com/resend/react-email/blob/canary/apps/demo/emails/02-Matte/welcome.tsx
const palette = {
  canvas: "#FBFCFB",
  paper: "#FFFFFF",
  heading: "#103B05",
  body: "#194A07",
  muted: "#869C7F",
  stroke: "#D8E1D4",
};
const shadow =
  "0px 76px 21px 0px rgba(193,195,193,0), 0px 49px 19px 0px rgba(193,195,193,0.01), 0px 27px 16px 0px rgba(193,195,193,0.05), 0px 12px 12px 0px rgba(193,195,193,0.09), 0px 3px 7px 0px rgba(193,195,193,0.1)";
const link = "https://example.com/";

const body = (id: string, content: string, props: Record<string, unknown> = {}) =>
  text(id, content, {
    fontFamily: "Inter, Arial, sans-serif",
    fontSize: 14,
    fontWeight: 400,
    lineHeight: 1.5,
    letterSpacing: 0,
    color: palette.body,
    align: "left",
    padding: "0px",
    ...props,
  });
const heading = (id: string, content: string, props: Record<string, unknown> = {}) =>
  text(id, content, {
    fontFamily: "Arial, Helvetica, sans-serif",
    fontSize: 48,
    lineHeight: 1,
    letterSpacing: -1.44,
    color: palette.heading,
    align: "left",
    padding: "0px",
    ...props,
  });

export function createMatteWelcomeDocument(): EmailDocument {
  const tips = [
    {
      id: "profile",
      title: "Complete your profile",
      description:
        "Add a photo and a short bio so teammates recognize you in comments and mentions.",
    },
    {
      id: "notifications",
      title: "Turn on notifications",
      description: "Choose email or in-app alerts so you never miss a review request or deadline.",
    },
    {
      id: "templates",
      title: "Browse templates",
      description:
        "Starter layouts and snippets help your team ship polished work without reinventing the wheel.",
    },
  ];

  return email({
    subject: "Welcome to Collage",
    previewText: "Welcome to Collage",
    lang: "en",
    dir: "ltr",
    owa: "none",
    width: 608,
    backgroundColor: palette.canvas,
    fontFamily: "Inter, Arial, sans-serif",
    breakpoint: 601,
    fontImports: [
      {
        name: "Inter",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500&display=swap",
      },
    ],
    headStyles: [
      {
        inline: "inline",
        css: `
body { padding: 0 16px !important; }
.collage-card { box-shadow: ${shadow}; }
.collage-card a { color: inherit; text-decoration: none; }
.collage-week-title > div { max-width: 400px; }
.collage-week-description > div { max-width: 479px; }
.collage-tip-description > div { max-width: 380px; }
.collage-footer-copy > div { max-width: 320px; }
.collage-unsubscribe > div { max-width: 169px; }
`,
      },
      {
        inline: "head",
        css: `
@media only screen and (max-width: 600px) {
  .collage-intro > table > tbody > tr > td { padding: 40px 24px 56px !important; }
  .collage-week-heading > table > tbody > tr > td { padding: 40px 24px 0px !important; }
  .collage-week-copy > table > tbody > tr > td { padding: 18px 24px 0px !important; }
  .collage-try-first > table > tbody > tr > td { padding: 56px 24px 36px !important; }
  .collage-tip-row > table > tbody > tr > td { padding: 24px 24px !important; }
  .collage-tip-rule > table > tbody > tr > td { padding: 0px 24px !important; }
}
`,
      },
    ],
    htmlAttributes: [],
    rawHead: "",
    rawFileStart: "",
    sections: [
      section("top-space", "0px", [spacer("top-gap", 64)], {
        backgroundColor: palette.canvas,
        cssClass: "collage-space",
      }),
      wrapper(
        "collage-card",
        [
          section(
            "banner",
            "0px",
            [
              image("banner-art", "collage/collage-image-5.png", {
                alt: "",
                width: 608,
                borderRadius: "7px 7px 0px 0px",
              }),
            ],
            { borderRadius: "7px 7px 0px 0px" },
          ),
          section(
            "intro",
            "80px 40px 56px",
            [
              heading("welcome-title", "Welcome to Collage"),
              body("intro-copy", "Thank you for signing up for Collage.", {
                padding: "18px 0px 0px",
              }),
              body(
                "intro-copy-2",
                "You're all set—explore what's new and get your first project going.",
              ),
              button("explore-button", "Explore", {
                href: link,
                backgroundColor: palette.heading,
                color: "#FBFFF9",
                align: "left",
                fontFamily: "Inter, Arial, sans-serif",
                fontSize: 15,
                fontWeight: 500,
                lineHeight: 1.5,
                letterSpacing: -0.075,
                borderRadius: "0px",
                innerPadding: "14px 20px",
                padding: "36px 0px 0px",
              }),
            ],
            { cssClass: "collage-intro" },
          ),
          section(
            "week-title-section",
            "80px 40px 0px",
            [
              heading("week-title", "Your first week in Collage", {
                cssClass: "collage-week-title",
              }),
            ],
            { backgroundColor: palette.canvas, cssClass: "collage-week-heading" },
          ),
          section(
            "week-description-section",
            "18px 40px 0px",
            [
              body(
                "week-description",
                "Small steps add up. Use this short checklist to get comfortable—everything here is optional, but it helps you feel at home faster.",
                { cssClass: "collage-week-description" },
              ),
            ],
            { backgroundColor: palette.canvas, cssClass: "collage-week-copy" },
          ),
          section(
            "try-first-section",
            "56px 40px 36px",
            [
              body("try-first", "Here's what to try first:", {
                color: palette.heading,
                fontSize: 15,
                fontWeight: 500,
                letterSpacing: -0.075,
              }),
            ],
            { backgroundColor: palette.canvas, cssClass: "collage-try-first" },
          ),
          ...tips.flatMap((tip): EmailBlock[] => [
            columns(
              `tip-${tip.id}`,
              [
                group(`tip-${tip.id}-group`, [
                  column(`tip-${tip.id}-copy`, 92, [
                    body(`${tip.id}-title`, tip.title, {
                      color: palette.heading,
                      fontSize: 20,
                      lineHeight: 1.2,
                      letterSpacing: -0.2,
                    }),
                    body(`${tip.id}-description`, tip.description, {
                      padding: "4px 0px 0px",
                      cssClass: "collage-tip-description",
                    }),
                  ]),
                  column(
                    `tip-${tip.id}-arrow-column`,
                    8,
                    [
                      image(`${tip.id}-arrow`, "collage/collage-image-9.png", {
                        width: 12,
                        align: "right",
                        alt: "",
                      }),
                    ],
                    { verticalAlign: "middle" },
                  ),
                ]),
              ],
              {
                backgroundColor: palette.canvas,
                padding: "24px 40px",
                cssClass: "collage-tip-row",
              },
            ),
            section(
              `${tip.id}-rule-section`,
              "0px 40px",
              [divider(`${tip.id}-rule`, { color: palette.stroke, width: 100, thickness: 1 })],
              { backgroundColor: palette.canvas, cssClass: "collage-tip-rule" },
            ),
          ]),
          section("closing-art", "0px", [
            image("closing-image", "collage/collage-image-4.png", { alt: "", width: 608 }),
          ]),
          section("footer-divider", "0px", [
            divider("footer-rule", { color: palette.stroke, width: 100, thickness: 1 }),
          ]),
          section(
            "footer",
            "64px 40px",
            [
              text(
                "footer-copy",
                "Collage is the workspace where your team keeps projects, context, and updates together—from first idea to launch.",
                {
                  fontFamily: "Inter, Arial, sans-serif",
                  fontSize: 13,
                  fontWeight: 300,
                  lineHeight: 1.5,
                  letterSpacing: -0.039,
                  color: palette.muted,
                  align: "left",
                  cssClass: "collage-footer-copy",
                },
              ),
              socialRow("footer-social", link, ["x", "linkedin", "youtube", "github"]),
              text("footer-address", "123 Market Street, Floor 1<br />Tech City, CA, 94102", {
                fontFamily: "Inter, Arial, sans-serif",
                fontSize: 11,
                fontWeight: 300,
                lineHeight: 1.5,
                letterSpacing: -0.033,
                color: palette.body,
                align: "left",
                padding: "32px 0px 0px",
              }),
              text(
                "footer-unsubscribe",
                `<a href="${link}">Unsubscribe</a> from Collage marketing emails.`,
                {
                  fontFamily: "Inter, Arial, sans-serif",
                  fontSize: 11,
                  fontWeight: 300,
                  lineHeight: 1.5,
                  letterSpacing: -0.033,
                  color: palette.body,
                  align: "left",
                  padding: "20px 0px 0px",
                  cssClass: "collage-unsubscribe",
                },
              ),
            ],
            { cssClass: "collage-footer", borderRadius: "0px 0px 7px 7px" },
          ),
        ],
        {
          backgroundColor: palette.paper,
          padding: "0px",
          border: `1px solid ${palette.stroke}`,
          borderRadius: "8px",
          cssClass: "collage-card",
        },
      ),
      section("bottom-space", "0px", [spacer("bottom-gap", 24)], {
        backgroundColor: palette.canvas,
        cssClass: "collage-space",
      }),
    ],
  });
}

// The remaining Matte ports below share the palette, typography helpers, and
// bordered card chrome introduced by the welcome port above.

const matteHeadStyles = (inlineCss: string, mobileCss: string) => {
  const styles: { inline: "inline" | "head"; css: string }[] = [
    {
      inline: "inline",
      css: `
body { padding: 0 16px !important; }
.collage-card { box-shadow: ${shadow}; }
.collage-card a { color: inherit; text-decoration: none; }
.collage-footer-copy > div { max-width: 320px; }
.collage-unsubscribe > div { max-width: 169px; }${inlineCss ? `\n${inlineCss.trim()}` : ""}
`,
    },
  ];
  if (mobileCss.trim()) {
    styles.push({
      inline: "head",
      css: `
@media only screen and (max-width: 600px) {${mobileCss}}
`,
    });
  }
  return styles;
};

const matteDocument = (options: {
  subject: string;
  previewText: string;
  inlineCss?: string;
  mobileCss?: string;
  sections: EmailBlock[];
}): EmailDocument =>
  email({
    subject: options.subject,
    previewText: options.previewText,
    lang: "en",
    dir: "ltr",
    owa: "none",
    width: 608,
    backgroundColor: palette.canvas,
    fontFamily: "Inter, Arial, sans-serif",
    breakpoint: 601,
    fontImports: [
      {
        name: "Inter",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500&display=swap",
      },
    ],
    headStyles: matteHeadStyles(options.inlineCss ?? "", options.mobileCss ?? ""),
    htmlAttributes: [],
    rawHead: "",
    rawFileStart: "",
    sections: options.sections,
  });

const brandButton = (id: string, label: string, props: Record<string, unknown> = {}) =>
  button(id, label, {
    href: link,
    backgroundColor: palette.heading,
    color: "#FBFFF9",
    align: "left",
    fontFamily: "Inter, Arial, sans-serif",
    fontSize: 15,
    fontWeight: 500,
    lineHeight: 1.5,
    letterSpacing: -0.075,
    borderRadius: "0px",
    innerPadding: "14px 20px",
    padding: "0px",
    ...props,
  });

const tiny = (id: string, content: string, props: Record<string, unknown> = {}) =>
  text(id, content, {
    fontFamily: "Inter, Arial, sans-serif",
    fontSize: 11,
    fontWeight: 300,
    lineHeight: 1.5,
    letterSpacing: -0.033,
    color: palette.muted,
    align: "left",
    padding: "0px",
    ...props,
  });

const lead = (id: string, content: string, props: Record<string, unknown> = {}) =>
  text(id, content, {
    fontFamily: "Inter, Arial, sans-serif",
    fontSize: 15,
    fontWeight: 500,
    lineHeight: 1.5,
    letterSpacing: -0.075,
    color: palette.heading,
    align: "left",
    padding: "0px",
    ...props,
  });

// Subscription confirmation is set entirely in the sans stack (theme font-sans).
const sans = "Arial, Helvetica, sans-serif";
const sansBody = (id: string, content: string, props: Record<string, unknown> = {}) =>
  text(id, content, {
    fontFamily: sans,
    fontSize: 14,
    fontWeight: 400,
    lineHeight: 1.5,
    letterSpacing: 0,
    color: palette.body,
    align: "left",
    padding: "0px",
    ...props,
  });
const sansLead = (id: string, content: string, props: Record<string, unknown> = {}) =>
  text(id, content, {
    fontFamily: sans,
    fontSize: 15,
    fontWeight: 500,
    lineHeight: 1.5,
    letterSpacing: -0.075,
    color: palette.heading,
    align: "left",
    padding: "0px",
    ...props,
  });
const sansItem = (id: string, content: string, props: Record<string, unknown> = {}) =>
  text(id, content, {
    fontFamily: sans,
    fontSize: 20,
    fontWeight: 500,
    lineHeight: 1.2,
    letterSpacing: -0.2,
    color: palette.heading,
    align: "left",
    padding: "0px",
    ...props,
  });
const sansHeading = (id: string, content: string, props: Record<string, unknown> = {}) =>
  text(id, content, {
    fontFamily: sans,
    fontSize: 32,
    fontWeight: 400,
    lineHeight: 1.2,
    letterSpacing: -0.6,
    color: palette.heading,
    align: "left",
    padding: "0px",
    ...props,
  });

const FOOTER_BLURB =
  "Collage is the workspace where your team keeps projects, context, and updates together—from first idea to launch.";

const footerSections = (key: string, family = "Inter, Arial, sans-serif"): EmailBlock[] => [
  section(`${key}-footer-divider`, "0px", [
    divider(`${key}-footer-rule`, { color: palette.stroke, width: 100, thickness: 1 }),
  ]),
  section(
    `${key}-footer`,
    "64px 40px",
    [
      text(`${key}-footer-copy`, FOOTER_BLURB, {
        fontFamily: family,
        fontSize: 13,
        fontWeight: 300,
        lineHeight: 1.5,
        letterSpacing: -0.039,
        color: palette.muted,
        align: "left",
        cssClass: "collage-footer-copy",
      }),
      socialRow(`${key}-footer-social`, link, ["x", "linkedin", "youtube", "github"]),
      text(`${key}-footer-address`, "123 Market Street, Floor 1<br />Tech City, CA, 94102", {
        fontFamily: family,
        fontSize: 11,
        fontWeight: 300,
        lineHeight: 1.5,
        letterSpacing: -0.033,
        color: palette.body,
        align: "left",
        padding: "32px 0px 0px",
      }),
      text(
        `${key}-footer-unsubscribe`,
        `<a href="${link}">Unsubscribe</a> from Collage marketing emails.`,
        {
          fontFamily: family,
          fontSize: 11,
          fontWeight: 300,
          lineHeight: 1.5,
          letterSpacing: -0.033,
          color: palette.body,
          align: "left",
          padding: "20px 0px 0px",
          cssClass: "collage-unsubscribe",
        },
      ),
    ],
    { cssClass: "collage-footer", borderRadius: "0px 0px 7px 7px" },
  ),
];

const collageCard = (key: string, sections: EmailBlock[]): EmailBlock =>
  wrapper(`${key}-card`, sections, {
    backgroundColor: palette.paper,
    padding: "0px",
    border: `1px solid ${palette.stroke}`,
    borderRadius: "8px",
    cssClass: "collage-card",
  });

const canvasGap = (key: string, height: number): EmailBlock =>
  section(`${key}-space`, "0px", [spacer(`${key}-gap`, height)], {
    backgroundColor: palette.canvas,
  });

// Port of React Email's Matte activation email:
// https://github.com/resend/react-email/blob/canary/apps/demo/emails/02-Matte/activation.tsx
export function createMatteActivationDocument(): EmailDocument {
  return matteDocument({
    subject: "Confirm your email address",
    previewText: "Confirm your email address",
    inlineCss: `
.collage-activation-note > div { max-width: 310px; }
`,
    mobileCss: `
  .collage-activation-logo > table > tbody > tr > td { padding: 64px 24px 0px !important; }
  .collage-activation-main > table > tbody > tr > td { padding: 32px 24px 0px !important; }
  .collage-activation-cta > table > tbody > tr > td { padding: 36px 24px 0px !important; }
  .collage-activation-note-section > table > tbody > tr > td { padding: 64px 24px 32px !important; }
`,
    sections: [
      canvasGap("activation-top", 64),
      collageCard("activation", [
        section(
          "activation-logo",
          "64px 40px 0px",
          [
            image("activation-logo-art", "collage/collage-image-1.png", {
              width: 148,
              align: "left",
            }),
          ],
          { cssClass: "collage-activation-logo" },
        ),
        section(
          "activation-main",
          "32px 40px 0px",
          [
            heading("activation-title", "Almost there"),
            body("activation-copy", "Thank you for signing up for Collage.", {
              padding: "18px 0px 0px",
            }),
            body("activation-copy-2", "To verify your account, we just need to confirm your email"),
          ],
          { cssClass: "collage-activation-main" },
        ),
        section(
          "activation-cta",
          "36px 40px 0px",
          [brandButton("activation-button", "Confirm Email")],
          {
            cssClass: "collage-activation-cta",
          },
        ),
        section(
          "activation-note-section",
          "64px 40px 32px",
          [
            tiny(
              "activation-note",
              "If you didn't create an account, you can safely ignore this email.",
              { cssClass: "collage-activation-note" },
            ),
          ],
          { cssClass: "collage-activation-note-section" },
        ),
        ...footerSections("activation"),
      ]),
      canvasGap("activation-bottom", 24),
    ],
  });
}

// Port of React Email's Matte feature announcement email:
// https://github.com/resend/react-email/blob/canary/apps/demo/emails/02-Matte/feature-announcement.tsx
export function createMatteFeatureAnnouncementDocument(): EmailDocument {
  const featureRows = [
    {
      key: "faster",
      title: "Faster by default",
      description:
        "The new flow cuts steps in half so your team can publish changes without bouncing between screens.",
      cta: "See how it works →",
      image: "collage/collage-image-6.png",
    },
    {
      key: "clearer",
      title: "Clearer for everyone",
      description:
        "Permissions and activity are easier to read, so admins spend less time answering who changed this.",
      cta: "View the details →",
      image: "collage/collage-image-7.png",
    },
  ];
  const highlights = [
    {
      key: "review",
      title: "One place to review",
      description: "A single summary screen shows status, owners, and next steps for each release.",
    },
    {
      key: "notifications",
      title: "Smarter notifications",
      description: "You only get pinged when something needs your attention—not on every edit.",
    },
    {
      key: "stack",
      title: "Works with your stack",
      description: "Connects to the tools you already use so context stays in sync across teams.",
    },
  ];
  return matteDocument({
    subject: "Something new is live in Collage",
    previewText: "Something new is live in Collage",
    inlineCss: `
.collage-feedback-title > div { max-width: 400px; }
.collage-feedback-copy > div { max-width: 479px; }
.collage-highlight-description > div { max-width: 380px; }
`,
    mobileCss: `
  .collage-feature-intro > table > tbody > tr > td { padding: 40px 24px 0px !important; }
  .collage-feature-cta > table > tbody > tr > td { padding: 36px 24px 56px !important; }
  .collage-feature-lead > table > tbody > tr > td { padding: 16px 24px 0px !important; }
  .collage-feature-row > table > tbody > tr > td { padding: 48px 24px 0px !important; }
  .collage-feature-row-last > table > tbody > tr > td { padding: 48px 24px 64px !important; }
  .collage-feature-image-column > table > tbody > tr > td { padding: 0px 0px 24px !important; }
  .collage-feature-image table { width: 100% !important; }
  .collage-feature-image img { width: 100% !important; }
  .collage-feedback-heading > table > tbody > tr > td { padding: 64px 24px 0px !important; }
  .collage-feedback-highlights > table > tbody > tr > td { padding: 56px 24px 36px !important; }
  .collage-feature-highlight > table > tbody > tr > td { padding: 24px 24px !important; }
  .collage-feature-highlight-rule > table > tbody > tr > td { padding: 0px 24px !important; }
  .collage-feature-highlight-rule-last > table > tbody > tr > td { padding: 0px 24px 64px !important; }
`,
    sections: [
      canvasGap("feature-top", 64),
      collageCard("feature", [
        section(
          "feature-banner",
          "0px",
          [
            image("feature-banner-art", "collage/collage-image-5.png", {
              width: 608,
              borderRadius: "7px 7px 0px 0px",
            }),
          ],
          { borderRadius: "7px 7px 0px 0px" },
        ),
        section(
          "feature-intro",
          "80px 40px 0px",
          [
            heading("feature-title", "Meet your next favorite feature"),
            body(
              "feature-copy",
              "We're rolling out an update that makes Collage faster, clearer, and easier to use every day.",
              { padding: "18px 0px 0px" },
            ),
            body(
              "feature-copy-2",
              "It's available now—open Collage to try it, or read on for what changed and why it matters.",
            ),
          ],
          { cssClass: "collage-feature-intro" },
        ),
        section("feature-cta", "36px 40px 56px", [brandButton("feature-button", "Try it now")], {
          cssClass: "collage-feature-cta",
        }),
        section(
          "feature-lead",
          "16px 40px 0px",
          [
            lead("feature-lead-title", "One workspace for the whole picture"),
            body(
              "feature-lead-copy",
              "Bring briefs, files, feedback, and status into Collage so your team spends less time chasing context across tools.",
              { padding: "8px 0px 0px" },
            ),
            body("feature-lead-link", `<a href="${link}">See what's new →</a>`, {
              color: palette.heading,
              padding: "8px 0px 0px",
            }),
          ],
          { cssClass: "collage-feature-lead" },
        ),
        ...featureRows.map((row, index): EmailBlock =>
          columns(
            `feature-row-${row.key}`,
            [
              column(
                `${row.key}-image-column`,
                48,
                [
                  image(`${row.key}-art`, row.image, {
                    width: 264,
                    align: "left",
                    cssClass: "collage-feature-image",
                  }),
                ],
                { cssClass: "collage-feature-image-column" },
              ),
              column(
                `${row.key}-copy-column`,
                52,
                [
                  lead(`${row.key}-title`, row.title),
                  body(`${row.key}-description`, row.description, {
                    padding: "8px 0px 0px",
                  }),
                  body(`${row.key}-link`, `<a href="${link}">${row.cta}</a>`, {
                    color: palette.heading,
                    padding: "8px 0px 0px",
                  }),
                ],
                { padding: "0px 0px 0px 16px" },
              ),
            ],
            {
              padding: index === featureRows.length - 1 ? "48px 40px 64px" : "48px 40px 0px",
              cssClass:
                index === featureRows.length - 1
                  ? "collage-feature-row collage-feature-row-last"
                  : "collage-feature-row",
            },
          ),
        ),
        section(
          "feedback-heading",
          "80px 40px 0px",
          [
            heading("feedback-title", "Built from real feedback", {
              cssClass: "collage-feedback-title",
            }),
            body(
              "feedback-copy",
              "Teams told us where Collage felt slow or opaque. This release tightens those loops so you spend less time coordinating and more time shipping.",
              { padding: "18px 0px 0px", cssClass: "collage-feedback-copy" },
            ),
          ],
          { backgroundColor: palette.canvas, cssClass: "collage-feedback-heading" },
        ),
        section(
          "feedback-highlights",
          "56px 40px 36px",
          [lead("feedback-highlights-title", "Highlights from this release:")],
          { backgroundColor: palette.canvas, cssClass: "collage-feedback-highlights" },
        ),
        ...highlights.flatMap((item, index): EmailBlock[] => [
          columns(
            `feature-highlight-${item.key}`,
            [
              group(`feature-highlight-${item.key}-group`, [
                column(`feature-highlight-${item.key}-copy`, 92, [
                  body(`${item.key}-title`, item.title, {
                    color: palette.heading,
                    fontSize: 20,
                    lineHeight: 1.5,
                    letterSpacing: -0.2,
                  }),
                  body(`${item.key}-description`, item.description, {
                    padding: "4px 0px 0px",
                    cssClass: "collage-highlight-description",
                  }),
                ]),
                column(
                  `feature-highlight-${item.key}-arrow-column`,
                  8,
                  [
                    image(`${item.key}-arrow`, "collage/collage-image-9.png", {
                      width: 12,
                      align: "right",
                      alt: "",
                    }),
                  ],
                  { verticalAlign: "middle" },
                ),
              ]),
            ],
            {
              backgroundColor: palette.canvas,
              padding: "24px 40px",
              cssClass: "collage-feature-highlight",
            },
          ),
          section(
            `feature-highlight-${item.key}-rule-section`,
            index === highlights.length - 1 ? "0px 40px 80px" : "0px 40px",
            [
              divider(`feature-highlight-${item.key}-rule`, {
                color: palette.stroke,
                width: 100,
                thickness: 1,
              }),
            ],
            {
              backgroundColor: palette.canvas,
              cssClass:
                index === highlights.length - 1
                  ? "collage-feature-highlight-rule collage-feature-highlight-rule-last"
                  : "collage-feature-highlight-rule",
            },
          ),
        ]),
        section("feature-closing", "0px", [
          image("feature-closing-art", "collage/collage-image-4.png", { width: 608 }),
        ]),
        ...footerSections("feature"),
      ]),
      canvasGap("feature-bottom", 24),
    ],
  });
}

// Port of React Email's Matte password reset email:
// https://github.com/resend/react-email/blob/canary/apps/demo/emails/02-Matte/password-reset.tsx
export function createMattePasswordResetDocument(): EmailDocument {
  return matteDocument({
    subject: "Reset your password",
    previewText: "Reset your password",
    inlineCss: `
.collage-reset-note > div { max-width: 310px; }
`,
    mobileCss: `
  .collage-reset-logo > table > tbody > tr > td { padding: 64px 24px 0px !important; }
  .collage-reset-main > table > tbody > tr > td { padding: 32px 24px 0px !important; }
  .collage-reset-cta > table > tbody > tr > td { padding: 36px 24px 0px !important; }
  .collage-reset-note-section > table > tbody > tr > td { padding: 64px 24px 32px !important; }
`,
    sections: [
      canvasGap("reset-top", 64),
      collageCard("reset", [
        section(
          "reset-logo",
          "64px 40px 0px",
          [image("reset-logo-art", "collage/collage-image-2.png", { width: 148, align: "left" })],
          { cssClass: "collage-reset-logo" },
        ),
        section(
          "reset-main",
          "32px 40px 0px",
          [
            heading("reset-title", "Reset your password"),
            body(
              "reset-copy",
              "Someone requested a password reset for your Collage account. Use the button below to choose a new password.",
              { padding: "18px 0px 0px" },
            ),
          ],
          { cssClass: "collage-reset-main" },
        ),
        section("reset-cta", "36px 40px 0px", [brandButton("reset-button", "Change password")], {
          cssClass: "collage-reset-cta",
        }),
        section(
          "reset-note-section",
          "64px 40px 32px",
          [
            tiny(
              "reset-note",
              "If you didn't request this, please ignore this email. Your password won't change until you access the link above and create a new one.",
              { cssClass: "collage-reset-note" },
            ),
          ],
          { cssClass: "collage-reset-note-section" },
        ),
        ...footerSections("reset"),
      ]),
      canvasGap("reset-bottom", 24),
    ],
  });
}

// Port of React Email's Matte subscription confirmation email:
// https://github.com/resend/react-email/blob/canary/apps/demo/emails/02-Matte/subscription-confirmation.tsx
export function createMatteSubscriptionConfirmationDocument(): EmailDocument {
  const totalsShade = "#EDF0E9";
  const totalsAccent = "#D3D9CB";
  const steps = [
    {
      key: "setup",
      title: "Set up your workspace",
      copy: "Complete the basics to get the most out of your account.",
      cta: "Complete Setup",
    },
    {
      key: "invite",
      title: "Invite your team",
      copy: "Collaboration works best when everyone's in.",
      cta: "Invite Teammates",
    },
  ];
  const totalRow = (key: string, label: string, value: string, background: string): EmailBlock =>
    columns(
      `confirm-total-${key}`,
      [
        column(`confirm-total-${key}-label`, 50, [
          sansBody(`confirm-total-${key}-label-text`, label, { color: palette.heading }),
        ]),
        column(`confirm-total-${key}-value`, 50, [
          sansBody(`confirm-total-${key}-value-text`, value, {
            color: palette.heading,
            align: "right",
          }),
        ]),
      ],
      { backgroundColor: background, padding: "12px 40px", cssClass: "collage-confirm-total" },
    );
  const totalGap = (key: string): EmailBlock =>
    section(`confirm-total-${key}-gap`, "0px", [spacer(`confirm-total-${key}-gap-spacer`, 3)]);

  return matteDocument({
    subject: "You're subscribed to Collage Pro",
    previewText: "You're subscribed to Collage Pro",
    inlineCss: `
.collage-confirm-copy > div { max-width: 480px; }
.collage-confirm-narrow > div { max-width: 490px; }
`,
    mobileCss: `
  .collage-confirm-logo > table > tbody > tr > td { padding: 64px 24px 0px !important; }
  .collage-confirm-main > table > tbody > tr > td { padding: 32px 24px 0px !important; }
  .collage-confirm-total > table > tbody > tr > td { padding: 12px 24px !important; }
  .collage-confirm-cta > table > tbody > tr > td { padding: 40px 24px 0px !important; }
  .collage-confirm-start > table > tbody > tr > td { padding: 64px 24px 8px !important; }
  .collage-confirm-step > table > tbody > tr > td { padding: 40px 24px !important; }
  .collage-confirm-rule > table > tbody > tr > td { padding: 0px 24px !important; }
  .collage-confirm-help > table > tbody > tr > td { padding: 56px 24px !important; }
`,
    sections: [
      canvasGap("confirm-top", 64),
      collageCard("confirm", [
        section(
          "confirm-logo",
          "64px 40px 0px",
          [image("confirm-logo-art", "collage/collage-image-2.png", { width: 148, align: "left" })],
          { cssClass: "collage-confirm-logo" },
        ),
        section(
          "confirm-main",
          "32px 40px 0px",
          [
            heading("confirm-title", "Subscription confirmed", {
              cssClass: "collage-confirm-copy",
            }),
            sansBody(
              "confirm-copy",
              "Hi Alex, thanks for subscribing to the Pro plan with Collage. Your subscription is active and you have access to everything included in your plan.",
              { padding: "18px 0px 0px", cssClass: "collage-confirm-copy" },
            ),
            sansBody(
              "confirm-copy-2",
              "You're billed $29 per month. Your next charge is on April 22, 2026. You can update payment details or cancel anytime from your account.",
              { padding: "18px 0px 0px", cssClass: "collage-confirm-copy" },
            ),
            sansBody(
              "confirm-copy-3",
              "Questions about billing or your plan? Reply to this email and we're happy to help.",
              { padding: "18px 0px 0px", cssClass: "collage-confirm-copy" },
            ),
          ],
          { cssClass: "collage-confirm-main" },
        ),
        totalRow("subtotal", "Subtotal", "$29.00", totalsShade),
        totalGap("subtotal"),
        totalRow("tax", "Tax", "$0.00", totalsShade),
        totalGap("tax"),
        totalRow("total", "Total", "$29.00", totalsAccent),
        section(
          "confirm-cta",
          "40px 40px 0px",
          [
            brandButton("confirm-button", "Manage subscription", {
              fontFamily: "Arial, Helvetica, sans-serif",
            }),
          ],
          { cssClass: "collage-confirm-cta" },
        ),
        section(
          "confirm-start",
          "64px 40px 8px",
          [
            sansHeading("confirm-start-title", "Get started", {
              cssClass: "collage-confirm-narrow",
            }),
          ],
          { cssClass: "collage-confirm-start" },
        ),
        ...steps.flatMap((step): EmailBlock[] => [
          section(
            `confirm-step-${step.key}`,
            "40px 40px",
            [
              sansItem(`${step.key}-title`, step.title, { cssClass: "collage-confirm-narrow" }),
              sansBody(`${step.key}-copy`, step.copy, {
                padding: "12px 0px 0px",
                cssClass: "collage-confirm-narrow",
              }),
              sansLead(`${step.key}-link`, `<a href="${link}">${step.cta}</a>`, {
                padding: "12px 0px 0px",
                cssClass: "collage-confirm-narrow",
              }),
            ],
            { cssClass: "collage-confirm-step" },
          ),
          section(
            `${step.key}-rule-section`,
            "0px 40px",
            [divider(`${step.key}-rule`, { color: palette.stroke, width: 100, thickness: 1 })],
            { cssClass: "collage-confirm-rule" },
          ),
        ]),
        section(
          "confirm-help",
          "56px 40px 56px",
          [
            sansLead("confirm-help-title", "Need help?", { cssClass: "collage-confirm-narrow" }),
            sansBody(
              "confirm-help-copy",
              `Find guides, tips, and best practices anytime, visit our <a href="${link}">Help Center</a>.`,
              { padding: "2px 0px 0px", cssClass: "collage-confirm-narrow" },
            ),
          ],
          { cssClass: "collage-confirm-help" },
        ),
        ...footerSections("confirm", "Arial, Helvetica, sans-serif"),
      ]),
      canvasGap("confirm-bottom", 24),
    ],
  });
}

// Port of React Email's Matte subscription update email:
// https://github.com/resend/react-email/blob/canary/apps/demo/emails/02-Matte/subscription-update.tsx
export function createMatteSubscriptionUpdateDocument(): EmailDocument {
  return matteDocument({
    subject: "Your Collage plan renewed (Pro)",
    previewText: "Your Collage plan renewed (Pro)",
    inlineCss: `
.collage-renew-copy > div { max-width: 480px; }
`,
    mobileCss: `
  .collage-renew-logo > table > tbody > tr > td { padding: 64px 24px 0px !important; }
  .collage-renew-main > table > tbody > tr > td { padding: 32px 24px 0px !important; }
  .collage-renew-cta > table > tbody > tr > td { padding: 48px 24px 56px !important; }
`,
    sections: [
      canvasGap("renew-top", 64),
      collageCard("renew", [
        section(
          "renew-logo",
          "64px 40px 0px",
          [image("renew-logo-art", "collage/collage-image-2.png", { width: 148, align: "left" })],
          { cssClass: "collage-renew-logo" },
        ),
        section(
          "renew-main",
          "32px 40px 0px",
          [
            heading("renew-title", "Plan renewed", { cssClass: "collage-renew-copy" }),
            body(
              "renew-copy",
              "Hi Alex. Your Collage subscription renewed for another month. Here's a quick summary of your plan and billing.",
              { padding: "18px 0px 0px", cssClass: "collage-renew-copy" },
            ),
            body(
              "renew-copy-2",
              "You're on the Pro plan at $29 per month. Your next charge is on April 22, 2026. Review invoices, update payment details, or change plans anytime in your account.",
              { padding: "18px 0px 0px", cssClass: "collage-renew-copy" },
            ),
            body(
              "renew-copy-3",
              "Something look off? Reply to this email and we'll help sort it out.",
              { padding: "18px 0px 0px", cssClass: "collage-renew-copy" },
            ),
          ],
          { cssClass: "collage-renew-main" },
        ),
        section(
          "renew-cta",
          "48px 40px 56px",
          [brandButton("renew-button", "Manage subscription")],
          { cssClass: "collage-renew-cta" },
        ),
        ...footerSections("renew"),
      ]),
      canvasGap("renew-bottom", 24),
    ],
  });
}

// Port of React Email's Matte text-only email:
// https://github.com/resend/react-email/blob/canary/apps/demo/emails/02-Matte/text-only.tsx
export function createMatteTextOnlyDocument(): EmailDocument {
  return matteDocument({
    subject: "A short note from the Collage team",
    previewText: "A short note from the Collage team",
    inlineCss: `
.collage-note-copy > div { max-width: 480px; }
`,
    mobileCss: `
  .collage-note-main > table > tbody > tr > td { padding: 64px 24px 56px !important; }
`,
    sections: [
      canvasGap("note-top", 64),
      collageCard("note", [
        section(
          "note-main",
          "64px 40px 56px",
          [
            heading("note-title", "A note from us"),
            body(
              "note-paragraph-1",
              "We don't send long emails often—when we do, we want them to feel direct. No hero image, no noise: just a quick word from the team behind Collage.",
              { padding: "18px 0px 0px", cssClass: "collage-note-copy" },
            ),
            body(
              "note-paragraph-2",
              "We're building Collage so your team can keep projects, context, and updates in one place. If you've been in the product lately, thank you—what we hear from you shapes what we ship next.",
              { padding: "18px 0px 0px", cssClass: "collage-note-copy" },
            ),
            body(
              "note-paragraph-3",
              "Here's to fewer tabs and clearer handoffs. When you're ready to dive back in, we'll be there.",
              { padding: "18px 0px 0px", cssClass: "collage-note-copy" },
            ),
            body("note-signoff", "— The Collage team", {
              padding: "18px 0px 0px",
              cssClass: "collage-note-copy",
            }),
            body("note-link", `<a href="${link}">Open your workspace</a>`, {
              color: palette.heading,
              padding: "18px 0px 0px",
              cssClass: "collage-note-copy",
            }),
          ],
          { cssClass: "collage-note-main" },
        ),
        ...footerSections("note"),
      ]),
      canvasGap("note-bottom", 24),
    ],
  });
}

// Port of React Email's Matte shared font loader:
// https://github.com/resend/react-email/blob/canary/apps/demo/emails/02-Matte/collage-fonts.tsx
// The source is a <Head>-only component (no body content), so the port carries
// the same Inter web fonts on a minimal Collage-colored body.
export function createMatteCollageFontsDocument(): EmailDocument {
  return matteDocument({
    subject: "Collage email fonts",
    previewText: "Web fonts for the Collage email family",
    sections: [canvasGap("collage-fonts", 24)],
  });
}
