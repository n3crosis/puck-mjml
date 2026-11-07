import type { EmailBlock, EmailDocument } from "./types";

// Adapted from React Email's Matte product-update example:
// https://github.com/resend/react-email/blob/canary/apps/demo/emails/02-Matte/product-update.tsx
const assets = "https://demo.react.email/static";
const link = "https://example.com/";
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

const block = (type: string, id: string, props: Record<string, unknown>): EmailBlock => ({
  type,
  props: { id, ...props },
});
const text = (id: string, content: string, props: Record<string, unknown> = {}) =>
  block("Text", id, {
    content: `<p>${content}</p>`,
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
    ...props,
  });
const image = (id: string, index: number, props: Record<string, unknown> = {}) =>
  block("Image", id, {
    src: `${assets}/collage/collage-image-${index}.png`,
    alt: "",
    width: 608,
    align: "center",
    padding: "0px",
    ...props,
  });
const button = (id: string, label: string, align: "left" | "center") =>
  block("Button", id, {
    label,
    href: link,
    backgroundColor: palette.heading,
    color: "#FBFFF9",
    align,
    fontFamily: "Inter, Arial, sans-serif",
    fontSize: 15,
    fontWeight: 500,
    lineHeight: 1.5,
    letterSpacing: -0.075,
    borderRadius: "0px",
    innerPadding: "14px 20px",
    padding: "36px 0px 0px",
  });
const section = (
  id: string,
  padding: string,
  column: EmailBlock[],
  props: Record<string, unknown> = {},
) =>
  block("Section1", id, {
    backgroundColor: palette.paper,
    padding,
    column,
    ...props,
  });
const column = (
  id: string,
  width: number,
  content: EmailBlock[],
  props: Record<string, unknown> = {},
) =>
  block("Column", id, {
    width,
    padding: "0px",
    verticalAlign: "top",
    content,
    ...props,
  });

export function createProductUpdateDocument(): EmailDocument {
  const features = [
    {
      id: "search",
      title: "Smarter Search",
      description:
        "Search results are now grouped by intent and ranked by relevance, so teams find the right content faster.",
      cta: "Read the update →",
      image: 6,
    },
    {
      id: "workspaces",
      title: "Shared Workspaces",
      description:
        "You can now organize projects into shared workspaces with clearer ownership and cleaner handoffs.",
      cta: "See what changed →",
      image: 7,
    },
  ];
  const updates = [
    {
      id: "help",
      title: "New Help Center",
      description:
        "A faster docs experience with guided setup, troubleshooting paths, and deeper API references.",
    },
    {
      id: "permissions",
      title: "Permissions",
      description:
        "Granular role controls let admins manage access by workspace, project, and action.",
    },
    {
      id: "discovery",
      title: "New Discovery Tools",
      description:
        "Saved views and smart filters make it easier to surface new ideas and high-signal activity.",
    },
  ];

  return {
    root: {
      props: {
        subject: "Monthly roundup — Collage",
        previewText: "Your monthly Collage product updates",
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
.collage-updates-title > div { max-width: 400px; }
.collage-updates-description > div { max-width: 479px; }
.collage-update-description > div { max-width: 380px; }
.collage-footer-copy > div { max-width: 320px; }
.collage-unsubscribe > div { max-width: 169px; }
`,
          },
          {
            inline: "head",
            css: `
@media only screen and (max-width: 600px) {
  .collage-intro > table > tbody > tr > td { padding: 40px 24px 56px !important; }
  .collage-features > table > tbody > tr > td { padding: 16px 24px 64px !important; }
  .collage-feature-first > table > tbody > tr > td { padding: 0 0 40px !important; }
  .collage-feature-second > table > tbody > tr > td { padding: 0 !important; }
  .collage-updates-heading > table > tbody > tr > td { padding: 64px 24px 0 !important; }
  .collage-updates-list > table > tbody > tr > td { padding: 56px 24px 36px !important; }
  .collage-updates-row > table > tbody > tr > td { padding: 0 24px !important; }
  .collage-updates-end > table > tbody > tr > td { padding: 0 24px 64px !important; }
  .collage-cta > table > tbody > tr > td { padding: 40px 24px 0 !important; }
  .collage-feature-image table { width: 100% !important; }
  .collage-feature-image img { width: 100% !important; }
}
`,
          },
        ],
        htmlAttributes: [],
        rawHead: "",
        rawFileStart: "",
        sections: [
          section("top-space", "0px", [block("Spacer", "top-gap", { height: 64 })], {
            backgroundColor: palette.canvas,
            cssClass: "collage-space",
          }),
          block("Wrapper", "collage-card", {
            backgroundColor: palette.paper,
            padding: "0px",
            border: `1px solid ${palette.stroke}`,
            borderRadius: "8px",
            cssClass: "collage-card",
            sections: [
              section(
                "banner",
                "0px",
                [
                  image("banner-art", 5, {
                    alt: "Green collage of ideas and paper textures",
                    borderRadius: "7px 7px 0px 0px",
                  }),
                ],
                { borderRadius: "7px 7px 0px 0px" },
              ),
              section(
                "intro",
                "80px 40px 56px",
                [
                  heading("intro-title", "Monthly roundup"),
                  text(
                    "intro-copy",
                    "Here's what shipped this month across Collage.<br />We focused on speed, collaboration, and control to help your team move from idea to launch faster.",
                    { padding: "18px 0px 0px" },
                  ),
                  button("explore-button", "Explore", "left"),
                ],
                { cssClass: "collage-intro" },
              ),
              block("Section", "features", {
                backgroundColor: palette.paper,
                padding: "16px 40px 64px",
                cssClass: "collage-features",
                columns: features.map((feature, index) =>
                  column(
                    `feature-${feature.id}`,
                    50,
                    [
                      image(`${feature.id}-image`, feature.image, {
                        alt: feature.title,
                        width: 264,
                        cssClass: "collage-feature-image",
                      }),
                      text(`${feature.id}-title`, feature.title, {
                        color: palette.heading,
                        fontSize: 15,
                        fontWeight: 500,
                        letterSpacing: -0.075,
                        padding: "20px 0px 0px",
                      }),
                      text(`${feature.id}-description`, feature.description, {
                        padding: "8px 0px 0px",
                      }),
                      text(`${feature.id}-link`, `<a href="${link}">${feature.cta}</a>`, {
                        padding: "8px 0px 0px",
                      }),
                    ],
                    {
                      padding: index === 0 ? "0px 16px 0px 0px" : "0px 0px 0px 16px",
                      cssClass: index === 0 ? "collage-feature-first" : "collage-feature-second",
                    },
                  ),
                ),
              }),
              section(
                "updates-heading",
                "80px 40px 0px",
                [
                  heading("updates-title", "Something to be proud of", {
                    cssClass: "collage-updates-title",
                  }),
                  text(
                    "updates-description",
                    "From quality-of-life fixes to major workflow improvements, this release is built around feedback from teams using Collage every day.",
                    { padding: "18px 0px 0px", cssClass: "collage-updates-description" },
                  ),
                ],
                { backgroundColor: palette.canvas, cssClass: "collage-updates-heading" },
              ),
              section(
                "updates-list-intro",
                "56px 40px 36px",
                [
                  text("updates-list-title", "Here's the newest from the month:", {
                    color: palette.heading,
                    fontSize: 15,
                    fontWeight: 500,
                    letterSpacing: -0.075,
                  }),
                ],
                { backgroundColor: palette.canvas, cssClass: "collage-updates-list" },
              ),
              ...updates.flatMap((update, index) => [
                block("Section", `update-${update.id}`, {
                  backgroundColor: palette.canvas,
                  padding: "0px 40px",
                  cssClass: "collage-updates-row",
                  columns: [
                    block("Group", `${update.id}-group`, {
                      width: 100,
                      columns: [
                        column(
                          `${update.id}-copy`,
                          92,
                          [
                            text(`${update.id}-title`, update.title, {
                              color: palette.heading,
                              fontSize: 20,
                              letterSpacing: -0.2,
                            }),
                            text(`${update.id}-description`, update.description, {
                              padding: "4px 0px 0px",
                              cssClass: "collage-update-description",
                            }),
                          ],
                          { padding: "24px 0px" },
                        ),
                        column(
                          `${update.id}-arrow-column`,
                          8,
                          [
                            image(`${update.id}-arrow`, 9, {
                              width: 12,
                              align: "right",
                              href: link,
                              alt: `Learn about ${update.title}`,
                            }),
                          ],
                          { verticalAlign: "middle", padding: "24px 0px" },
                        ),
                      ],
                    }),
                  ],
                }),
                section(
                  `${update.id}-rule-section`,
                  index === updates.length - 1 ? "0px 40px 80px" : "0px 40px",
                  [
                    block("Divider", `${update.id}-rule`, {
                      color: palette.stroke,
                      width: 100,
                      thickness: 1,
                      padding: "0px",
                    }),
                  ],
                  {
                    backgroundColor: palette.canvas,
                    cssClass:
                      index === updates.length - 1
                        ? "collage-updates-row collage-updates-end"
                        : "collage-updates-row",
                  },
                ),
              ]),
              section(
                "cta",
                "80px 40px 0px",
                [
                  heading("cta-title", "Jump back into Collage", { align: "center" }),
                  text(
                    "cta-description",
                    "You're all set—open Collage to explore what's new and keep projects moving.",
                    { align: "center", padding: "18px 0px 0px" },
                  ),
                  button("open-collage-button", "Open Collage", "center"),
                  image("cta-art", 8, {
                    width: 528,
                    alt: "Collage on mobile",
                    padding: "64px 0px 0px",
                  }),
                ],
                { cssClass: "collage-cta" },
              ),
              section("footer-divider", "0px", [
                block("Divider", "footer-rule", {
                  color: palette.stroke,
                  width: 100,
                  thickness: 1,
                  padding: "0px",
                }),
              ]),
              section(
                "footer",
                "64px 40px",
                [
                  text(
                    "footer-copy",
                    "Collage is the workspace where your team keeps projects, context, and updates together—from first idea to launch.",
                    {
                      color: palette.muted,
                      fontSize: 13,
                      fontWeight: 300,
                      letterSpacing: -0.039,
                      cssClass: "collage-footer-copy",
                    },
                  ),
                  block("Social", "footer-social", {
                    align: "left",
                    padding: "32px 0px 0px",
                    iconSize: 20,
                    iconPadding: "0px",
                    borderRadius: "0px",
                    links: [
                      { name: "x", icon: "x", alt: "X" },
                      { name: "linkedin", icon: "in", alt: "LinkedIn" },
                      { name: "youtube", icon: "yt", alt: "YouTube" },
                      { name: "github", icon: "gh", alt: "GitHub" },
                    ].map(({ name, icon, alt }, index) => ({
                      name,
                      href: link,
                      label: "",
                      src: `${assets}/shared/social-${icon}-black.png`,
                      alt,
                      backgroundColor: "transparent",
                      padding: index === 3 ? "0px" : "0px 32px 0px 0px",
                    })),
                  }),
                  text("footer-address", "123 Market Street, Floor 1<br />Tech City, CA, 94102", {
                    fontSize: 11,
                    fontWeight: 300,
                    letterSpacing: -0.033,
                    padding: "32px 0px 0px",
                  }),
                  text(
                    "footer-unsubscribe",
                    `<a href="${link}">Unsubscribe</a> from Collage marketing emails.`,
                    {
                      fontSize: 11,
                      fontWeight: 300,
                      letterSpacing: -0.033,
                      padding: "20px 0px 0px",
                      cssClass: "collage-unsubscribe",
                    },
                  ),
                ],
                { cssClass: "collage-footer", borderRadius: "0px 0px 7px 7px" },
              ),
            ],
          }),
          section("bottom-space", "0px", [block("Spacer", "bottom-gap", { height: 24 })], {
            backgroundColor: palette.canvas,
            cssClass: "collage-space",
          }),
        ],
      },
    },
    content: [],
  };
}
