import type { EmailBlock, EmailDocument } from "../types";
import {
  ASSETS,
  block,
  button,
  column,
  columns,
  divider,
  email,
  image,
  section,
  spacer,
  text,
} from "./shared";

// Adapted from React Email's Protocol (Dither) examples:
// https://github.com/resend/react-email/tree/canary/apps/demo/emails/03-Protocol
const palette = {
  canvas: "#212121",
  paper: "#131313",
  heading: "#FFFFFF",
  body: "#C4C4C4",
  faint: "#818181",
  muted: "#4A4A4A",
  stroke: "#2B2B2B",
};
const sans = "Inter, Arial, sans-serif";
// Multi-word family names stay unquoted: mjml-browser's style inliner crashes
// when merging inline CSS into elements whose font-family contains quotes.
const condensed = "IBM Plex Sans Condensed, Arial Narrow, Arial, sans-serif";
const link = "https://example.com/";
const fonts = [
  {
    name: "IBM Plex Sans Condensed",
    href: "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Condensed:wght@500&display=swap",
  },
  {
    name: "Inter",
    href: "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500&display=swap",
  },
];

const body = (id: string, content: string, props: Record<string, unknown> = {}) =>
  text(id, content, {
    fontFamily: sans,
    fontSize: 14,
    fontWeight: 350,
    lineHeight: 1.5,
    letterSpacing: 0.3,
    color: palette.body,
    align: "left",
    padding: "0px",
    ...props,
  });
const small = (id: string, content: string, props: Record<string, unknown> = {}) =>
  text(id, content, {
    fontFamily: sans,
    fontSize: 13,
    fontWeight: 300,
    lineHeight: 1.5,
    letterSpacing: 0.2,
    color: palette.body,
    align: "left",
    padding: "0px",
    ...props,
  });
const tiny = (id: string, content: string, props: Record<string, unknown> = {}) =>
  text(id, content, {
    fontFamily: sans,
    fontSize: 11,
    fontWeight: 300,
    lineHeight: 1.5,
    letterSpacing: 0.3,
    color: palette.body,
    align: "left",
    padding: "0px",
    ...props,
  });
const lead = (id: string, content: string, props: Record<string, unknown> = {}) =>
  text(id, content, {
    fontFamily: sans,
    fontSize: 15,
    fontWeight: 450,
    lineHeight: 1.5,
    letterSpacing: -0.075,
    color: palette.heading,
    align: "left",
    padding: "0px",
    ...props,
  });
const emphasis = (id: string, content: string, props: Record<string, unknown> = {}) =>
  text(id, content, {
    fontFamily: sans,
    fontSize: 20,
    fontWeight: 500,
    lineHeight: 1.1,
    letterSpacing: 0,
    color: palette.heading,
    align: "left",
    padding: "0px",
    ...props,
  });
const display = (id: string, content: string, props: Record<string, unknown> = {}) =>
  text(id, content, {
    fontFamily: condensed,
    fontSize: 56,
    fontWeight: 500,
    lineHeight: 1,
    letterSpacing: -1.68,
    color: palette.heading,
    align: "left",
    padding: "0px",
    cssClass: "dither-display",
    ...props,
  });
const heading40 = (id: string, content: string, props: Record<string, unknown> = {}) =>
  text(id, content, {
    fontFamily: condensed,
    fontSize: 40,
    fontWeight: 500,
    lineHeight: 1,
    letterSpacing: -1.2,
    color: palette.heading,
    align: "left",
    padding: "0px",
    cssClass: "dither-h3",
    ...props,
  });
const heading2 = (id: string, content: string, props: Record<string, unknown> = {}) =>
  text(id, content, {
    fontFamily: condensed,
    fontSize: 32,
    fontWeight: 500,
    lineHeight: 0.9,
    letterSpacing: 0.4,
    color: palette.heading,
    align: "left",
    padding: "0px",
    cssClass: "dither-h2",
    ...props,
  });
const item = (id: string, content: string, props: Record<string, unknown> = {}) =>
  text(id, content, {
    fontFamily: condensed,
    fontSize: 20,
    fontWeight: 500,
    lineHeight: 1.1,
    letterSpacing: 0,
    color: palette.heading,
    align: "left",
    padding: "0px",
    ...props,
  });

const primaryButton = (id: string, label: string, props: Record<string, unknown> = {}) =>
  button(id, label, {
    href: link,
    backgroundColor: palette.heading,
    color: palette.paper,
    align: "left",
    fontFamily: sans,
    fontSize: 15,
    fontWeight: 450,
    lineHeight: 1.5,
    letterSpacing: -0.075,
    borderRadius: "0px",
    innerPadding: "14px 20px",
    ...props,
  });

const dark = (
  id: string,
  padding: string,
  content: EmailBlock[],
  props: Record<string, unknown> = {},
) => section(id, padding, content, { backgroundColor: palette.paper, ...props });

const logoSection = () =>
  dark(
    "logo",
    "24px 24px",
    [image("logo-art", "shared/logo-white.png", { width: 32, align: "left" })],
    { cssClass: "dither-logo" },
  );

const FOOTER_ICONS = [
  { name: "x", file: "x", alt: "X" },
  { name: "linkedin", file: "li", alt: "LinkedIn" },
  { name: "youtube", file: "yt", alt: "YouTube" },
  { name: "github", file: "gh", alt: "GitHub" },
];

const footerSocial = (id: string, href: string) =>
  block("Social", id, {
    align: "left",
    padding: "32px 0px 0px",
    iconSize: 20,
    iconPadding: "0px",
    borderRadius: "0px",
    links: FOOTER_ICONS.map((icon, index) => ({
      name: icon.name,
      href,
      label: "",
      src: `${ASSETS}/shared/social-${icon.file}-white.png`,
      alt: icon.alt,
      backgroundColor: "transparent",
      padding: index === FOOTER_ICONS.length - 1 ? "0px" : "0px 24px 0px 0px",
    })),
  });

const FOOTER_BLURB =
  "Dither helps teams cut through noise—clear priorities, fewer tabs, and less busywork from idea to shipped work.";

const footerSections = (padding: string): EmailBlock[] => [
  dark("footer-rule-section", "0px 24px", [divider("footer-rule", { color: palette.stroke })], {
    cssClass: "dither-footer-rule",
  }),
  dark(
    "footer",
    padding,
    [
      small("footer-copy", FOOTER_BLURB, { cssClass: "dither-footer-copy" }),
      footerSocial("footer-social", link),
      tiny("footer-address", "123 Market Street, Floor 1<br />Tech City, CA, 94102", {
        padding: "32px 0px 0px",
      }),
      tiny(
        "footer-unsubscribe",
        `<a href="${link}">Unsubscribe</a> from Dither marketing emails.`,
        {
          padding: "20px 0px 0px",
          cssClass: "dither-footer-unsubscribe",
        },
      ),
    ],
    { cssClass: "dither-footer" },
  ),
];

const STEPS = [
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
] as const;

/** The bordered "Get started" checklist shared by welcome and subscription confirmation. */
const steps = (key: string, cls: string): EmailBlock[] => [
  dark(`${key}-start`, "0px 24px", [heading2(`${key}-start-title`, "GET STARTED")], {
    cssClass: `${cls}-start`,
  }),
  ...STEPS.flatMap((step): EmailBlock[] => [
    dark(
      `${key}-${step.key}`,
      "40px 24px 0px",
      [
        item(`${key}-${step.key}-title`, step.title),
        body(`${key}-${step.key}-copy`, step.copy, { padding: "16px 0px 0px" }),
        lead(`${key}-${step.key}-link`, `<a href="${link}">${step.cta}</a>`, {
          padding: "12px 0px 0px",
        }),
      ],
      { cssClass: `${cls}-row` },
    ),
    dark(
      `${key}-${step.key}-rule-section`,
      "0px 24px",
      [divider(`${key}-${step.key}-rule`, { color: palette.stroke })],
      { cssClass: `${cls}-rule` },
    ),
  ]),
  dark(
    `${key}-help`,
    "56px 24px 56px",
    [
      lead(`${key}-help-title`, "Need help?"),
      small(
        `${key}-help-copy`,
        `Find guides, tips, and best practices anytime, visit our <a href="${link}">Help Center</a>.`,
        { padding: "2px 0px 0px", cssClass: `${cls}-help-copy` },
      ),
    ],
    { cssClass: `${cls}-help` },
  ),
];

const stepsInlineCss = (cls: string) => `
.${cls}-help-copy > div { max-width: 490px; }
`;
const stepsMobileCss = (cls: string) => `
  .${cls}-start > table > tbody > tr > td { padding: 0px 16px !important; }
  .${cls}-row > table > tbody > tr > td { padding: 32px 16px 0px !important; }
  .${cls}-rule > table > tbody > tr > td { padding: 0px 16px !important; }
  .${cls}-help > table > tbody > tr > td { padding: 40px 16px 40px !important; }
  .${cls}-help-copy > div { max-width: 100% !important; }
`;

const SHARED_MOBILE_CSS = `
  .dither-logo > table > tbody > tr > td { padding: 24px 16px !important; }
  .dither-hero > table > tbody > tr > td { padding: 0px 16px !important; }
  .dither-img-fluid table { width: 100% !important; }
  .dither-img-fluid img { width: 100% !important; }
  .dither-display > div { font-size: 40px !important; letter-spacing: -1.2px !important; }
  .dither-h2 > div { font-size: 24px !important; line-height: 1.5 !important; letter-spacing: -0.072px !important; }
  .dither-h3 > div { font-size: 32px !important; line-height: 0.9 !important; letter-spacing: 0.4px !important; }
  .dither-footer-rule > table > tbody > tr > td { padding: 0px 16px !important; }
  .dither-footer > table > tbody > tr > td { padding: 48px 16px !important; }
`;

const headStyles = (inlineCss: string, mobileCss: string) => [
  {
    inline: "inline" as const,
    css: `
a { color: inherit; text-decoration: none; }
.dither-footer-copy > div { max-width: 320px; }
.dither-footer-unsubscribe > div { max-width: 160px; }
${inlineCss}
`,
  },
  {
    inline: "head" as const,
    css: `
@media (max-width: 600px) {${SHARED_MOBILE_CSS}${mobileCss}
}
`,
  },
];

const protocolDocument = (options: {
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
    width: 640,
    backgroundColor: palette.canvas,
    fontFamily: sans,
    breakpoint: 601,
    fontImports: fonts,
    headStyles: headStyles(options.inlineCss ?? "", options.mobileCss ?? ""),
    htmlAttributes: [],
    rawHead: "",
    rawFileStart: "",
    sections: options.sections,
  });

// Port of React Email's Protocol welcome email:
// https://github.com/resend/react-email/blob/canary/apps/demo/emails/03-Protocol/welcome.tsx
export function createProtocolWelcomeDocument(): EmailDocument {
  return protocolDocument({
    subject: "Welcome to Dither",
    previewText: "Welcome to Dither",
    inlineCss: `
.dither-welcome-title > div { max-width: 490px; }
.dither-welcome-copy > div { max-width: 490px; }
.dither-welcome-assist-copy > div { max-width: 310px; }
${stepsInlineCss("dither-welcome")}`,
    mobileCss: `
  .dither-welcome-intro > table > tbody > tr > td { padding: 40px 16px 32px !important; }
  .dither-welcome-assist > table > tbody > tr > td { padding: 40px 16px 32px !important; }
  .dither-welcome-title > div { max-width: 100% !important; }
  .dither-welcome-copy > div { max-width: 100% !important; }
  .dither-welcome-assist-copy > div { max-width: 100% !important; }
${stepsMobileCss("dither-welcome")}`,
    sections: [
      logoSection(),
      dark(
        "welcome-intro",
        "64px 24px 48px",
        [
          display("welcome-title", "WELCOME TO DITHER", {
            cssClass: "dither-display dither-welcome-title",
          }),
          body(
            "welcome-copy",
            "You can start exploring right away, set up your workspace, and invite your team if you're working with others.",
            { padding: "40px 0px 0px", cssClass: "dither-welcome-copy" },
          ),
        ],
        { cssClass: "dither-welcome-intro" },
      ),
      dark(
        "welcome-hero",
        "0px 24px",
        [
          image("welcome-hero-art", "dither/dither-image-1.png", {
            width: 592,
            cssClass: "dither-img-fluid",
          }),
        ],
        { cssClass: "dither-hero" },
      ),
      dark(
        "welcome-assist",
        "64px 24px 48px",
        [
          tiny(
            "welcome-assist-copy",
            `If you need help getting started, we've got you covered. Find guides, tips, and best practices anytime, visit our <a href="${link}">Help Center</a>.`,
            { color: palette.muted, cssClass: "dither-welcome-assist-copy" },
          ),
        ],
        { cssClass: "dither-welcome-assist" },
      ),
      ...steps("welcome", "dither-welcome"),
      ...footerSections("64px 24px"),
    ],
  });
}

// Port of React Email's Protocol activation email:
// https://github.com/resend/react-email/blob/canary/apps/demo/emails/03-Protocol/activation.tsx
export function createProtocolActivationDocument(): EmailDocument {
  return protocolDocument({
    subject: "Confirm your email address",
    previewText: "Confirm your email address",
    mobileCss: `
  .dither-activation-main > table > tbody > tr > td { padding: 40px 16px !important; }
  .dither-activation-button { padding: 32px 0px 0px !important; }
`,
    sections: [
      logoSection(),
      dark(
        "activation-hero",
        "0px 24px",
        [
          image("activation-hero-art", "dither/dither-image-1.png", {
            width: 592,
            cssClass: "dither-img-fluid",
          }),
        ],
        { cssClass: "dither-hero" },
      ),
      dark(
        "activation-main",
        "56px 24px",
        [
          display("activation-title", "ALMOST THERE"),
          body("activation-copy", "Thank you for signing up for Dither.", {
            padding: "18px 0px 0px",
          }),
          body("activation-copy-2", "To verify your account, we just need to confirm your email."),
          small(
            "activation-note",
            "If you didn't create an account, you can safely ignore this email.",
            {
              color: palette.faint,
              padding: "18px 0px 0px",
            },
          ),
          primaryButton("activation-button", "Confirm Email", {
            padding: "48px 0px 0px",
            cssClass: "dither-activation-button",
          }),
        ],
        { cssClass: "dither-activation-main" },
      ),
      ...footerSections("64px 24px"),
    ],
  });
}

// Port of React Email's Protocol feature announcement email:
// https://github.com/resend/react-email/blob/canary/apps/demo/emails/03-Protocol/feature-announcement.tsx
export function createProtocolFeatureAnnouncementDocument(): EmailDocument {
  const benefits = [
    {
      key: "less-manual-work",
      title: "Less manual work",
      copy: "Fewer status updates, more automated work.",
    },
    {
      key: "clear-focus",
      title: "Clear focus",
      copy: "Always know what to do next—less thrash, more momentum.",
    },
    {
      key: "better-alignment",
      title: "Better alignment",
      copy: "Your team stays in sync automatically.",
    },
  ];
  return protocolDocument({
    subject: "Meet Smart Tasks",
    previewText: "Meet Smart Tasks",
    inlineCss: `
.dither-feature-title > div { max-width: 490px; }
.dither-feature-copy > div { max-width: 490px; }
.dither-smart-copy > div { max-width: 456px; }
.dither-feature-help-copy > div { max-width: 490px; }
`,
    mobileCss: `
  .dither-feature-intro > table > tbody > tr > td { padding: 40px 16px 32px !important; }
  .dither-feature-heading > table > tbody > tr > td { padding: 32px 16px 0px !important; }
  .dither-feature-showcase > table > tbody > tr > td { padding: 48px 16px 0px !important; }
  .dither-feature-benefit-first > table > tbody > tr > td { padding: 40px 16px 0px !important; }
  .dither-feature-benefit > table > tbody > tr > td { padding: 32px 16px 0px !important; }
  .dither-benefit-image > table > tbody > tr > td { padding: 0px 0px 24px !important; }
  .dither-benefit-copy > table > tbody > tr > td { padding: 0px !important; }
  .dither-feature-smart > table > tbody > tr > td { padding: 0px 16px !important; }
  .dither-feature-quote-art > table > tbody > tr > td { padding: 48px 16px 24px !important; }
  .dither-quote-box > table > tbody > tr > td { padding: 48px 24px !important; }
  .dither-feature-try > table > tbody > tr > td { padding: 48px 16px 0px !important; }
  .dither-feature-help > table > tbody > tr > td { padding: 40px 16px 48px !important; }
  .dither-feature-title > div { max-width: 100% !important; }
  .dither-feature-copy > div { max-width: 100% !important; }
  .dither-smart-copy > div { max-width: 100% !important; }
  .dither-feature-help-copy > div { max-width: 100% !important; }
`,
    sections: [
      logoSection(),
      dark(
        "feature-hero",
        "0px 24px",
        [
          image("feature-hero-art", "dither/dither-image-2.png", {
            width: 592,
            cssClass: "dither-img-fluid",
          }),
        ],
        { cssClass: "dither-hero" },
      ),
      dark(
        "feature-intro",
        "56px 24px 48px",
        [
          display("feature-title", "MEET A NEW WAY TO MANAGE WORK", {
            cssClass: "dither-display dither-feature-title",
          }),
          body(
            "feature-copy",
            "Introducing Smart Tasks: a calmer way to organize work, surface what matters next, and keep your team aligned without the noise.",
            { padding: "40px 0px 0px", cssClass: "dither-feature-copy" },
          ),
          primaryButton("feature-button", "Explore Smart Tasks", { padding: "40px 0px 0px" }),
        ],
        { cssClass: "dither-feature-intro" },
      ),
      dark(
        "feature-heading",
        "40px 24px 0px",
        [heading2("feature-heading-title", "MEET SMART TASKS")],
        { cssClass: "dither-feature-heading" },
      ),
      dark(
        "feature-showcase",
        "48px 24px 0px",
        [
          image("feature-showcase-art", "dither/dither-image-2.png", {
            width: 592,
            cssClass: "dither-img-fluid",
          }),
          item("feature-showcase-title", "Auto-prioritization", { padding: "32px 0px 0px" }),
          body(
            "feature-showcase-copy",
            "All your tasks for the week are surfaced based on urgency and impact.",
            {
              padding: "12px 0px 0px",
            },
          ),
          lead("feature-showcase-link", `<a href="${link}">Explore Smart Tasks</a>`, {
            padding: "12px 0px 0px",
          }),
        ],
        { cssClass: "dither-feature-showcase" },
      ),
      ...benefits.map((benefit, index) =>
        columns(
          `feature-benefit-${benefit.key}`,
          [
            column(
              `feature-${benefit.key}-image-column`,
              48,
              [
                image(`feature-${benefit.key}-art`, "dither/dither-image-2.png", {
                  width: 269,
                  align: "left",
                  cssClass: "dither-img-fluid",
                }),
              ],
              { cssClass: "dither-benefit-image" },
            ),
            column(
              `feature-${benefit.key}-copy-column`,
              52,
              [
                item(`feature-${benefit.key}-title`, benefit.title),
                body(`feature-${benefit.key}-copy`, benefit.copy, { padding: "12px 0px 0px" }),
              ],
              {
                padding: "0px 0px 0px 24px",
                verticalAlign: "middle",
                cssClass: "dither-benefit-copy",
              },
            ),
          ],
          {
            padding: index === 0 ? "64px 24px 0px" : "48px 24px 0px",
            cssClass: index === 0 ? "dither-feature-benefit-first" : "dither-feature-benefit",
          },
        ),
      ),
      dark(
        "feature-smart",
        "0px 24px",
        [
          emphasis(
            "feature-smart-copy",
            "Smart Tasks analyzes your projects in real time and helps organize your workload automatically. As things change, your task list updates so you're always focused on what matters most.",
            { padding: "48px 0px 0px", cssClass: "dither-smart-copy" },
          ),
        ],
        { cssClass: "dither-feature-smart" },
      ),
      dark(
        "feature-quote-art",
        "48px 24px 24px",
        [
          image("feature-quote-art-image", "dither/dither-image-2.png", {
            width: 592,
            cssClass: "dither-img-fluid",
          }),
        ],
        { cssClass: "dither-feature-quote-art" },
      ),
      dark(
        "feature-quote-box",
        "80px 40px",
        [
          body(
            "feature-quote",
            '"Smart Tasks helps me know what to do next without thinking about it."',
            {
              color: palette.heading,
              align: "center",
            },
          ),
          small("feature-quote-author", "Alex, Product Designer at Studio", {
            align: "center",
            padding: "16px 0px 0px",
          }),
        ],
        { border: `1px solid ${palette.stroke}`, cssClass: "dither-quote-box" },
      ),
      dark(
        "feature-try",
        "72px 24px 0px",
        [
          heading2("feature-try-title", "TRY SMART TASKS"),
          body("feature-try-copy", "See how much easier work can be.", { padding: "20px 0px 0px" }),
          primaryButton("feature-try-button", "Explore Smart Tasks", { padding: "32px 0px 0px" }),
        ],
        { cssClass: "dither-feature-try" },
      ),
      dark(
        "feature-help",
        "56px 24px 64px",
        [
          small("feature-help-title", "Need help?", { color: palette.heading }),
          small(
            "feature-help-copy",
            `Find guides, tips, and best practices anytime, visit our <a href="${link}">Help Center</a>.`,
            { padding: "2px 0px 0px", cssClass: "dither-feature-help-copy" },
          ),
        ],
        { cssClass: "dither-feature-help" },
      ),
      ...footerSections("64px 24px"),
    ],
  });
}

// Port of React Email's Protocol password reset email:
// https://github.com/resend/react-email/blob/canary/apps/demo/emails/03-Protocol/password-reset.tsx
export function createProtocolPasswordResetDocument(): EmailDocument {
  return protocolDocument({
    subject: "Reset your password",
    previewText: "Reset your password",
    mobileCss: `
  .dither-reset-main > table > tbody > tr > td { padding: 48px 16px 40px !important; }
  .dither-reset-button { padding: 32px 0px 0px !important; }
`,
    sections: [
      logoSection(),
      dark(
        "reset-main",
        "80px 24px 56px",
        [
          display("reset-title", "PASSWORD RESET"),
          body("reset-copy", "We received a request to reset your password for Dither.", {
            padding: "32px 0px 0px",
          }),
          small("reset-note", "If you didn't request a reset, you can safely ignore this email.", {
            color: palette.faint,
            padding: "18px 0px 0px",
          }),
          primaryButton("reset-button", "Create New Password", {
            padding: "48px 0px 0px",
            cssClass: "dither-reset-button",
          }),
        ],
        { cssClass: "dither-reset-main" },
      ),
      ...footerSections("80px 24px 64px"),
    ],
  });
}

// Port of React Email's Protocol product update email:
// https://github.com/resend/react-email/blob/canary/apps/demo/emails/03-Protocol/product-update.tsx
export function createProtocolProductUpdateDocument(): EmailDocument {
  return protocolDocument({
    subject: "What's new in Dither",
    previewText: "What's new in Dither",
    inlineCss: `
.dither-update-title > div { max-width: 480px; }
.dither-smart-copy > div { max-width: 456px; }
`,
    mobileCss: `
  .dither-update-banner > table > tbody > tr > td { padding: 32px 16px 8px !important; }
  .dither-update-letter > table > tbody > tr > td { padding: 0px 16px 64px !important; }
  .dither-update-launch > table > tbody > tr > td { padding: 0px 16px 64px !important; }
  .dither-update-smart > table > tbody > tr > td { padding: 0px 16px 48px !important; }
  .dither-update-blog-heading > table > tbody > tr > td { padding: 0px 16px !important; }
  .dither-update-blog-row > table > tbody > tr > td { padding: 48px 16px 64px !important; }
  .dither-blog-first > table > tbody > tr > td { padding: 0px 0px 40px !important; }
  .dither-blog-last > table > tbody > tr > td { padding: 0px !important; }
  .dither-update-help > table > tbody > tr > td { padding: 0px 16px 64px !important; }
  .dither-update-title > div { max-width: 100% !important; }
  .dither-smart-copy > div { max-width: 100% !important; }
`,
    sections: [
      logoSection(),
      dark(
        "update-banner",
        "48px 24px 8px",
        [
          image("update-banner-art", "dither/dither-image-6.png", {
            width: 592,
            cssClass: "dither-img-fluid",
          }),
          display("update-title", "THE WORK BEHIND THE WORK", {
            padding: "48px 0px 24px",
            cssClass: "dither-display dither-update-title",
          }),
        ],
        { cssClass: "dither-update-banner" },
      ),
      dark(
        "update-letter",
        "0px 24px 64px",
        [
          body("update-letter-1", "Here from the Dither team.", { padding: "0px 0px 16px" }),
          body(
            "update-letter-2",
            "This month was about making Dither feel smoother, faster, and easier to use in everyday work.",
            { padding: "0px 0px 16px" },
          ),
          body(
            "update-letter-3",
            "We shipped new features, improved key workflows, and made small but meaningful updates that reduce friction across the product.",
            { padding: "0px 0px 16px" },
          ),
          body(
            "update-letter-4",
            "A lot of our focus was on simplifying actions, improving performance, and responding to feedback from teams using the product day to day.",
            { padding: "0px 0px 16px" },
          ),
          body(
            "update-letter-5",
            "We're continuing to shape Dither around real workflows—not just features—so everything feels more connected and effortless over time.",
          ),
        ],
        { cssClass: "dither-update-letter" },
      ),
      dark(
        "update-launch",
        "0px 24px 64px",
        [
          heading2("update-launch-title", "WE LAUNCHED SMART TASKS"),
          image("update-launch-art", "dither/dither-image-7.png", {
            width: 560,
            cssClass: "dither-img-fluid",
            padding: "48px 0px 0px",
          }),
          item("update-launch-feature-title", "Auto-prioritization", { padding: "32px 0px 0px" }),
          body(
            "update-launch-feature-copy",
            "All your tasks for the week are surfaced based on urgency and impact.",
            {
              padding: "14px 0px 0px",
            },
          ),
          lead("update-launch-feature-link", `<a href="${link}">Explore Smart Tasks</a>`, {
            color: palette.body,
            padding: "12px 0px 0px",
          }),
        ],
        { cssClass: "dither-update-launch" },
      ),
      dark(
        "update-smart",
        "0px 24px 48px",
        [
          emphasis(
            "update-smart-copy",
            "Smart Tasks analyzes your projects in real time and helps organize your workload automatically. As things change, your task list updates so you're always focused on what matters most.",
            { padding: "48px 0px 0px", cssClass: "dither-smart-copy" },
          ),
        ],
        { cssClass: "dither-update-smart" },
      ),
      dark(
        "update-blog-heading",
        "0px 24px",
        [heading2("update-blog-title", "READ MORE ON OUR BLOG")],
        { cssClass: "dither-update-blog-heading" },
      ),
      columns(
        "update-blog-row",
        [
          column(
            "update-blog-first-column",
            50,
            [
              image("update-blog-art-1", "dither/dither-image-4.png", {
                width: 269,
                align: "left",
                cssClass: "dither-img-fluid",
              }),
              item("update-blog-title-1", "Less manual work", { padding: "24px 0px 0px" }),
              body("update-blog-copy-1", "Fewer status updates, more automated work.", {
                padding: "8px 0px 0px",
              }),
              lead("update-blog-link-1", `<a href="${link}">Read more</a>`, {
                color: palette.body,
                padding: "12px 0px 0px",
              }),
            ],
            { padding: "0px 10px 0px 0px", cssClass: "dither-blog-first" },
          ),
          column(
            "update-blog-second-column",
            50,
            [
              image("update-blog-art-2", "dither/dither-image-5.png", {
                width: 269,
                align: "left",
                cssClass: "dither-img-fluid",
              }),
              item("update-blog-title-2", "Less manual work", { padding: "24px 0px 0px" }),
              body("update-blog-copy-2", "Fewer status updates, more automated work.", {
                padding: "8px 0px 0px",
              }),
              lead("update-blog-link-2", `<a href="${link}">Read more</a>`, {
                color: palette.body,
                padding: "12px 0px 0px",
              }),
            ],
            { padding: "0px 0px 0px 10px", cssClass: "dither-blog-last" },
          ),
        ],
        { padding: "48px 24px 64px", cssClass: "dither-update-blog-row" },
      ),
      dark(
        "update-help",
        "0px 24px 64px",
        [
          small("update-help-title", "Need help?", { color: palette.heading }),
          small(
            "update-help-copy",
            "Find guides, tips, and best practices anytime, visit our Help Center.",
            {
              padding: "2px 0px 0px",
            },
          ),
        ],
        { cssClass: "dither-update-help" },
      ),
      ...footerSections("64px 24px"),
    ],
  });
}

// Port of React Email's Protocol subscription confirmation email:
// https://github.com/resend/react-email/blob/canary/apps/demo/emails/03-Protocol/subscription-confirmation.tsx
export function createProtocolSubscriptionConfirmationDocument(): EmailDocument {
  return protocolDocument({
    subject: "You're on Pro with Dither",
    previewText: "You're on Pro with Dither",
    inlineCss: `
.dither-confirm-title > div { max-width: 490px; }
${stepsInlineCss("dither-confirm")}`,
    mobileCss: `
  .dither-confirm-main > table > tbody > tr > td { padding: 40px 16px 64px !important; }
  .dither-confirm-button { padding: 32px 0px 0px !important; }
  .dither-confirm-title > div { max-width: 100% !important; }
${stepsMobileCss("dither-confirm")}`,
    sections: [
      logoSection(),
      dark(
        "confirm-hero",
        "0px 24px",
        [
          image("confirm-hero-art", "dither/dither-image-1.png", {
            width: 592,
            cssClass: "dither-img-fluid",
          }),
        ],
        { cssClass: "dither-hero" },
      ),
      dark(
        "confirm-main",
        "64px 24px 96px",
        [
          display("confirm-title", "WELCOME TO PRO", {
            cssClass: "dither-display dither-confirm-title",
          }),
          body("confirm-copy", "Thanks for starting your Pro subscription, Alex.", {
            padding: "24px 0px 0px",
          }),
          body(
            "confirm-billing",
            "Your payment method has been charged. The next charge will be on <strong>April 22, 2026.</strong>",
            { padding: "18px 0px 0px" },
          ),
          body(
            "confirm-settings",
            `You can modify your payment method or cancel your subscription anytime by visiting the Dither <a href="${link}">billing settings</a> page.`,
            { padding: "18px 0px 0px" },
          ),
          primaryButton("confirm-button", "Open Dither", {
            padding: "48px 0px 0px",
            cssClass: "dither-confirm-button",
          }),
        ],
        { cssClass: "dither-confirm-main" },
      ),
      ...steps("confirm", "dither-confirm"),
      ...footerSections("80px 24px 64px"),
    ],
  });
}

// Port of React Email's Protocol subscription update email:
// https://github.com/resend/react-email/blob/canary/apps/demo/emails/03-Protocol/subscription-update.tsx
export function createProtocolSubscriptionUpdateDocument(): EmailDocument {
  return protocolDocument({
    subject: "Your Pro plan with Dither renewed",
    previewText: "Your Pro plan with Dither renewed",
    inlineCss: `
.dither-renew-title > div { max-width: 480px; }
`,
    mobileCss: `
  .dither-renew-main > table > tbody > tr > td { padding: 48px 16px 40px !important; }
  .dither-renew-button { padding: 32px 0px 0px !important; }
  .dither-renew-title > div { max-width: 100% !important; }
`,
    sections: [
      logoSection(),
      dark(
        "renew-main",
        "80px 24px 56px",
        [
          display("renew-title", "PLAN RENEWED", { cssClass: "dither-display dither-renew-title" }),
          body("renew-copy", "Hi Name Surname, your subscription has been renewed.", {
            padding: "32px 0px 0px",
          }),
          body(
            "renew-billing",
            "Your payment method has been charged. The next charge will be on Jun 15, 2026. You can modify your payment method or cancel your subscription anytime by visiting the Dither billing settings page.",
            { padding: "18px 0px 0px" },
          ),
          primaryButton("renew-button", "Manage subscription", {
            padding: "48px 0px 0px",
            cssClass: "dither-renew-button",
          }),
        ],
        { cssClass: "dither-renew-main" },
      ),
      ...footerSections("80px 24px 64px"),
    ],
  });
}

// Port of React Email's Protocol text-only email:
// https://github.com/resend/react-email/blob/canary/apps/demo/emails/03-Protocol/text-only.tsx
export function createProtocolTextOnlyDocument(): EmailDocument {
  return protocolDocument({
    subject: "A short note from the Dither team",
    previewText: "A short note from the Dither team",
    inlineCss: `
.dither-note-title > div { max-width: 490px; }
`,
    mobileCss: `
  .dither-note-main > table > tbody > tr > td { padding: 48px 16px 40px !important; }
  .dither-note-title > div { max-width: 100% !important; }
`,
    sections: [
      logoSection(),
      dark(
        "note-main",
        "80px 24px 56px",
        [
          heading40("note-title", "A NOTE FROM US", {
            padding: "0px 0px 24px",
            cssClass: "dither-h3 dither-note-title",
          }),
          body(
            "note-paragraph-1",
            "We don't send long emails often. When we do, we keep them plain—no hero, no clutter—just a direct word from the team behind Dither.",
          ),
          body(
            "note-paragraph-2",
            "We're building Dither so your team can see what matters, drop what doesn't, and ship without living in fifteen tabs. If you've been in the product lately, thank you—your feedback sharpens what we ship next.",
            { padding: "18px 0px 0px" },
          ),
          body(
            "note-paragraph-3",
            "Here's to clearer priorities and less noise. When you're ready to jump back in, we'll be there.",
            { padding: "18px 0px 0px" },
          ),
          body("note-signoff", "— The Dither team", { padding: "18px 0px 0px" }),
          body("note-link", `<a href="${link}">Open Dither</a>`, {
            color: palette.heading,
            padding: "18px 0px 0px",
          }),
        ],
        { cssClass: "dither-note-main" },
      ),
      ...footerSections("80px 24px 64px"),
    ],
  });
}

// Port of React Email's Protocol shared font loader:
// https://github.com/resend/react-email/blob/canary/apps/demo/emails/03-Protocol/dither-fonts.tsx
// The source is a <Head>-only component (no body content), so the port carries
// the same web fonts on a minimal Dither-colored body.
export function createProtocolDitherFontsDocument(): EmailDocument {
  return protocolDocument({
    subject: "Dither email fonts",
    previewText: "Web fonts for the Dither email family",
    sections: [
      section("dither-fonts-space", "0px", [spacer("dither-fonts-gap", 24)], {
        backgroundColor: palette.canvas,
      }),
    ],
  });
}
