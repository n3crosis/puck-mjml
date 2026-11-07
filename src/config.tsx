import type { ReactNode } from "react";
import { ImageSourceField } from "./ImageSourceField";
import type { Config, RichText, Slot } from "@puckeditor/core";
import { renderEmailInlineMenu, renderEmailRichTextMenu } from "./RichTextToolbar";
import { CodeArea } from "./CodeField";
import { colorField } from "./ColorField";
import { safeRichTextUrl } from "./richtext";
import { tableConfig } from "./TableBlock";
import type { TableProps } from "./table";
import { EmailCanvas } from "./EmailCanvas";
import { ImplicitColumnWidth } from "./native-layout-context";
import { TrustedHtmlPreview, withNativeFields } from "./NativeFields";
import { withNativeCanvas } from "./NativeCanvas";
import type { EmailSettings } from "./types";

const alignment = {
  type: "select" as const,
  options: ["left", "center", "right"].map((value) => ({
    label: value[0].toUpperCase() + value.slice(1),
    value,
  })),
};
const paddingField = { type: "text" as const, label: "Padding (px or %)" };
const cssClassField = { type: "text" as const, label: "CSS class" };
const borderFields = {
  border: { type: "text" as const, label: "Border" },
  borderRadius: { type: "text" as const, label: "Corner radius (px or %)" },
  cssClass: cssClassField,
};
const typographyFields = {
  fontFamily: { type: "text" as const, label: "Font family (blank inherits default)" },
  fontWeight: { type: "number" as const, label: "Font weight", min: 100, max: 900, step: 100 },
  lineHeight: {
    type: "number" as const,
    label: "Line height (multiplier)",
    min: 0.5,
    max: 4,
    step: 0.1,
  },
  letterSpacing: {
    type: "number" as const,
    label: "Letter spacing (px)",
    min: -10,
    max: 20,
    step: 0.1,
  },
};
const typographyDefaults = { fontFamily: "", fontWeight: 400, lineHeight: 1.5, letterSpacing: 0 };
const borderDefaults = { border: "", borderRadius: "0px", cssClass: "" };
const classes = (...names: (string | undefined)[]) => names.filter(Boolean).join(" ");
const slotField = {
  type: "slot" as const,
  label: "Content",
  allow: [
    "Text",
    "Image",
    "Button",
    "Spacer",
    "Divider",
    "Social",
    "Navbar",
    "Table",
    "Accordion",
    "Carousel",
  ],
};

type SectionStyleProps = {
  backgroundColor?: string;
  padding?: string;
  border?: string;
  borderRadius?: string;
  cssClass?: string;
};
function SectionFrame({
  children,
  backgroundColor,
  padding,
  border,
  borderRadius,
  cssClass,
}: SectionStyleProps & { children: ReactNode }) {
  return (
    <div
      className={classes("pm-section", cssClass)}
      style={{
        backgroundColor: backgroundColor || "#ffffff",
        padding: padding || "0px",
        border,
        borderRadius,
      }}
    >
      {children}
    </div>
  );
}

export function createEmailConfig(
  onUploadImage?: (file: File) => Promise<string>,
  allowRawHtml = false,
): Config {
  const contentSlotField = allowRawHtml
    ? { ...slotField, allow: [...slotField.allow, "Raw"] }
    : slotField;
  type RootProps = Pick<
    EmailSettings,
    | "bodyAttributes"
    | "bodyMjClass"
    | "attributeDefaults"
    | "componentDefaults"
    | "mjmlClasses"
    | "tailwind"
    | "tailwindScriptUrl"
  > & {
    previewText: string;
    width: number;
    backgroundColor: string;
    fontFamily: string;
    breakpoint: number;
    breakpointWidth?: string;
    subjectHtmlContent?: string;
    previewHtmlContent?: string;
    fontImports: { name: string; href: string }[];
    headStyles: { css: string; inline: "head" | "inline" }[];
    htmlAttributes: { selector: string; name: string; value: string }[];
    rawHead: string;
    rawFileStart: string;
    lang: string;
    dir: "auto" | "ltr" | "rtl";
    owa: "none" | "desktop";
    sections: Slot;
  };
  type Section = {
    backgroundColor: string;
    padding: string;
    border: string;
    borderRadius: string;
    cssClass: string;
  };
  type Typography = {
    fontFamily: string;
    fontWeight: number;
    lineHeight: number;
    letterSpacing: number;
  };
  type Components = {
    Wrapper: Section & { sections: Slot };
    Section: Section & { columns: Slot };
    Column: {
      width: number;
      padding: string;
      cssClass: string;
      verticalAlign: "top" | "middle" | "bottom";
      content: Slot;
    };
    Group: { width: number; cssClass: string; columns: Slot };
    Hero: {
      backgroundUrl: string;
      backgroundColor: string;
      backgroundWidth: number;
      backgroundHeight: number;
      mode: "fluid-height" | "fixed-height";
      height: number;
      padding: string;
      content: Slot;
    };
    Section1: Section & { column: Slot };
    Section2: Section & { left: Slot; right: Slot };
    Section3: Section & { left: Slot; middle: Slot; right: Slot };
    Text: Typography & {
      content: RichText;
      color: string;
      fontSize: number;
      align: "left" | "center" | "right" | "justify";
      padding: string;
      cssClass: string;
    };
    Image: {
      src: string;
      alt: string;
      width: number;
      align: "left" | "center" | "right";
      padding: string;
      href: string;
      borderRadius: string;
      cssClass: string;
    };
    Button: Typography & {
      label: string | ReactNode;
      href: string;
      backgroundColor: string;
      color: string;
      align: "left" | "center" | "right";
      padding: string;
      fontSize: number;
      innerPadding: string;
      borderRadius: string;
      cssClass: string;
    };
    Spacer: { height: number };
    Divider: { color: string; width: number; thickness: number; padding: string };
    Social: {
      align: "left" | "center" | "right";
      padding: string;
      iconSize: number;
      iconPadding: string;
      borderRadius: string;
      links: {
        kind?: "link" | "raw";
        html?: string;
        htmlContent?: string;
        name: string;
        href: string;
        label: string;
        src?: string;
        alt?: string;
        backgroundColor?: string;
        padding?: string;
      }[];
    };
    Navbar: {
      align: "left" | "center" | "right";
      links: {
        label: string;
        href: string;
        kind?: "link" | "raw";
        html?: string;
        htmlContent?: string;
      }[];
    };
    Table: TableProps;
    Accordion: {
      items: {
        title: string;
        content: RichText;
        titleHtmlContent?: string;
        htmlContent?: string;
      }[];
    };
    Carousel: {
      align: "left" | "center" | "right";
      thumbnails: "hidden" | "visible" | "supported";
      images: { src: string; alt: string; href: string }[];
    };
    Raw: { html: string };
  };
  const config: Config<Components, RootProps> = {
    root: {
      fields: {
        previewText: { type: "text", label: "Preview text" },
        lang: { type: "text", label: "Email language (for example en or zh-Hant)" },
        dir: {
          type: "select",
          label: "Text direction",
          options: [
            { label: "Automatic", value: "auto" },
            { label: "Left to right", value: "ltr" },
            { label: "Right to left", value: "rtl" },
          ],
        },
        width: { type: "number", label: "Email width (px)", min: 320, max: 1000 },
        breakpoint: { type: "number", label: "Mobile breakpoint (px)", min: 200, max: 1000 },
        backgroundColor: colorField("Background color (hex)"),
        fontFamily: { type: "text", label: "Default font family" },
        fontImports: {
          type: "array",
          label: "Web fonts",
          arrayFields: {
            name: { type: "text", label: "Font name" },
            href: { type: "text", label: "CSS URL" },
          },
          defaultItemProps: {
            name: "Inter",
            href: "https://fonts.googleapis.com/css2?family=Inter",
          },
          getItemSummary: (item) => item.name,
        },
        headStyles: {
          type: "array",
          label: "Custom CSS",
          arrayFields: {
            css: {
              type: "custom",
              label: "CSS",
              render: ({ value, onChange, readOnly }) => (
                <CodeArea
                  ariaLabel="CSS"
                  format="css"
                  rows={10}
                  value={value}
                  disabled={readOnly}
                  onChange={onChange}
                />
              ),
            },
            inline: {
              type: "select",
              label: "Output",
              options: [
                { label: "In HTML head", value: "head" },
                { label: "Inline declarations", value: "inline" },
              ],
            },
          },
          defaultItemProps: { css: "", inline: "head" },
          getItemSummary: (item, index) => `CSS ${(index ?? 0) + 1} (${item.inline})`,
        },
        htmlAttributes: {
          type: "array",
          label: "Generated HTML attributes",
          arrayFields: {
            selector: { type: "text", label: "CSS selector" },
            name: { type: "text", label: "Attribute name" },
            value: { type: "text", label: "Value" },
          },
          defaultItemProps: { selector: ".promo div", name: "data-id", value: "" },
          getItemSummary: (item) => `${item.selector} · ${item.name}`,
        },
        tailwind: {
          type: "radio",
          label: "Tailwind utilities on canvas",
          options: [
            { label: "Off", value: "" },
            { label: "Enabled", value: "true" },
          ],
        },
        owa: {
          type: "select",
          label: "Legacy Outlook web layout",
          options: [
            { label: "Responsive", value: "none" },
            { label: "Desktop", value: "desktop" },
          ],
        },
        rawHead: {
          type: "custom",
          label: "Trusted HTML in head",
          visible: allowRawHtml,
          render: ({ value, onChange, readOnly }) => (
            <CodeArea
              ariaLabel="Trusted HTML in head"
              value={value}
              disabled={readOnly}
              onChange={onChange}
            />
          ),
        },
        rawFileStart: {
          type: "custom",
          label: "Trusted source before doctype",
          visible: allowRawHtml,
          render: ({ value, onChange, readOnly }) => (
            <CodeArea
              ariaLabel="Trusted source before doctype"
              value={value}
              disabled={readOnly}
              onChange={onChange}
            />
          ),
        },
        sections: {
          type: "slot",
          label: "Sections",
          allow: [
            "Section",
            "Section1",
            "Section2",
            "Section3",
            "Hero",
            "Wrapper",
            ...(allowRawHtml ? ["Raw"] : []),
          ],
        },
      },
      defaultProps: {
        previewText: "",
        lang: "und",
        dir: "auto",
        owa: "none",
        width: 600,
        backgroundColor: "#f5f5f5",
        fontFamily: "Arial, sans-serif",
        breakpoint: 480,
        fontImports: [],
        headStyles: [],
        tailwind: "",
        tailwindScriptUrl: "",
        htmlAttributes: [],
        rawHead: "",
        rawFileStart: "",
        sections: [],
      },
      render: ({
        width,
        breakpoint,
        breakpointWidth,
        backgroundColor,
        fontFamily,
        bodyAttributes,
        bodyMjClass,
        attributeDefaults,
        componentDefaults,
        mjmlClasses,
        fontImports,
        headStyles,
        tailwind,
        tailwindScriptUrl,
        lang,
        dir,
        sections: Sections,
      }) => (
        <EmailCanvas
          width={width}
          breakpoint={breakpoint}
          breakpointWidth={breakpointWidth}
          backgroundColor={backgroundColor}
          fontFamily={fontFamily}
          nativeSettings={{
            bodyAttributes,
            bodyMjClass,
            attributeDefaults,
            componentDefaults,
            mjmlClasses,
            fontFamily,
          }}
          fontImports={fontImports}
          headStyles={headStyles}
          tailwind={tailwind}
          tailwindScriptUrl={tailwindScriptUrl}
          lang={lang}
          dir={dir}
        >
          <Sections minEmptyHeight={240} />
        </EmailCanvas>
      ),
    },
    categories: {
      Layout: {
        components: [
          "Section1",
          "Section2",
          "Section3",
          "Section",
          "Column",
          "Group",
          "Hero",
          "Wrapper",
        ],
      },
      Content: {
        components: [
          "Text",
          "Image",
          "Button",
          "Spacer",
          "Divider",
          "Social",
          "Navbar",
          "Table",
          "Accordion",
          "Carousel",
        ],
      },
      Advanced: { components: ["Raw"], visible: allowRawHtml },
    },
    components: {
      Wrapper: {
        label: "Section wrapper",
        fields: {
          backgroundColor: colorField("Background color (hex)"),
          padding: paddingField,
          ...borderFields,
          sections: {
            type: "slot",
            label: "Sections",
            allow: [
              "Section",
              "Section1",
              "Section2",
              "Section3",
              "Hero",
              ...(allowRawHtml ? ["Raw"] : []),
            ],
          },
        },
        defaultProps: {
          ...borderDefaults,
          backgroundColor: "#f3f4f6",
          padding: "20px",
          sections: [],
        },
        render: ({
          backgroundColor,
          padding,
          border,
          borderRadius,
          cssClass,
          sections: Sections,
        }) => (
          <div
            className={classes("pm-wrapper", cssClass)}
            style={{ backgroundColor, padding, border, borderRadius }}
          >
            <Sections minEmptyHeight={120} />
          </div>
        ),
      },
      Section: {
        label: "Flexible section",
        fields: {
          backgroundColor: colorField("Background color (hex)"),
          padding: paddingField,
          ...borderFields,
          columns: {
            type: "slot",
            label: "Columns",
            allow: ["Column", "Group", ...(allowRawHtml ? ["Raw"] : [])],
          },
        },
        defaultProps: {
          ...borderDefaults,
          backgroundColor: "#ffffff",
          padding: "0px",
          columns: [],
        },
        render: ({
          backgroundColor,
          padding,
          border,
          borderRadius,
          cssClass,
          columns: Columns,
        }) => (
          <SectionFrame
            backgroundColor={backgroundColor}
            padding={padding}
            border={border}
            borderRadius={borderRadius}
            cssClass={cssClass}
          >
            <div className="pm-flex-section">
              <Columns minEmptyHeight={100} style={{ justifyContent: "center" }} />
            </div>
          </SectionFrame>
        ),
      },
      Column: {
        label: "Column",
        inline: true,
        fields: {
          width: { type: "number", label: "Width (%)", min: 1, max: 100 },
          padding: paddingField,
          verticalAlign: {
            type: "select",
            label: "Vertical alignment",
            options: [
              { label: "Top", value: "top" },
              { label: "Middle", value: "middle" },
              { label: "Bottom", value: "bottom" },
            ],
          },
          cssClass: cssClassField,
          content: contentSlotField,
        },
        defaultProps: {
          width: 50,
          padding: "0px",
          cssClass: "",
          verticalAlign: "top",
          content: [],
        },
        render: ({ width, padding, cssClass, verticalAlign, content: Content, puck }) => (
          <div
            ref={puck.dragRef}
            className={classes("pm-flex-column", cssClass)}
            style={{
              flexBasis: `${Number.isFinite(width) ? width : 50}%`,
              padding,
              alignSelf:
                verticalAlign === "middle"
                  ? "center"
                  : verticalAlign === "bottom"
                    ? "flex-end"
                    : undefined,
            }}
          >
            <Content minEmptyHeight={80} />
          </div>
        ),
      },
      Group: {
        label: "Columns grouped on mobile",
        inline: true,
        fields: {
          width: { type: "number", label: "Group width (%)", min: 1, max: 100 },
          cssClass: cssClassField,
          columns: {
            type: "slot",
            label: "Columns",
            allow: ["Column", ...(allowRawHtml ? ["Raw"] : [])],
          },
        },
        defaultProps: { width: 100, cssClass: "", columns: [] },
        render: ({ width, cssClass, columns: Columns, puck }) => (
          <div
            ref={puck.dragRef}
            className={classes("pm-flex-group", cssClass)}
            style={{ flexBasis: `${Number.isFinite(width) ? width : 100}%` }}
          >
            <Columns minEmptyHeight={80} />
          </div>
        ),
      },
      Hero: {
        label: "Hero",
        fields: {
          mode: {
            type: "select",
            label: "Height mode",
            options: [
              { label: "Fluid", value: "fluid-height" },
              { label: "Fixed", value: "fixed-height" },
            ],
          },
          height: { type: "number", label: "Fixed height (px)", min: 1, max: 2000 },
          padding: paddingField,
          backgroundUrl: { type: "text", label: "Background image URL (optional)" },
          backgroundWidth: {
            type: "number",
            label: "Background image width (px)",
            min: 1,
            max: 2000,
          },
          backgroundHeight: {
            type: "number",
            label: "Background image height (px)",
            min: 1,
            max: 2000,
          },
          backgroundColor: colorField("Background color (hex)"),
          content: contentSlotField,
        },
        defaultProps: {
          backgroundUrl: "",
          backgroundColor: "#16324f",
          backgroundWidth: 600,
          backgroundHeight: 300,
          mode: "fluid-height",
          height: 300,
          padding: "40px 20px",
          content: [],
        },
        resolveFields: ({ props }, { fields }) => ({
          ...fields,
          height: { ...fields.height!, visible: props.mode === "fixed-height" },
        }),
        render: ({ backgroundUrl, backgroundColor, mode, height, padding, content: Content }) => (
          <div
            className="pm-hero"
            style={{ backgroundColor, padding, minHeight: mode === "fixed-height" ? height : 180 }}
          >
            {backgroundUrl && <img className="pm-hero-background" src={backgroundUrl} alt="" />}
            <div className="pm-hero-content">
              <Content minEmptyHeight={120} />
            </div>
          </div>
        ),
      },
      Section1: {
        label: "1 column section",
        fields: {
          backgroundColor: colorField("Background color (hex)"),
          padding: paddingField,
          ...borderFields,
          column: { ...contentSlotField, label: "Column" },
        },
        defaultProps: { ...borderDefaults, backgroundColor: "#ffffff", padding: "0px", column: [] },
        render: ({ backgroundColor, padding, border, borderRadius, cssClass, column: Column }) => (
          <SectionFrame
            backgroundColor={backgroundColor}
            padding={padding}
            border={border}
            borderRadius={borderRadius}
            cssClass={cssClass}
          >
            <ImplicitColumnWidth count={1}>
              <Column minEmptyHeight={80} />
            </ImplicitColumnWidth>
          </SectionFrame>
        ),
      },
      Section2: {
        label: "2 column section",
        fields: {
          backgroundColor: colorField("Background color (hex)"),
          padding: paddingField,
          ...borderFields,
          left: { ...contentSlotField, label: "Left column" },
          right: { ...contentSlotField, label: "Right column" },
        },
        defaultProps: {
          ...borderDefaults,
          backgroundColor: "#ffffff",
          padding: "0px",
          left: [],
          right: [],
        },
        render: ({
          backgroundColor,
          padding,
          border,
          borderRadius,
          cssClass,
          left: Left,
          right: Right,
        }) => (
          <SectionFrame
            backgroundColor={backgroundColor}
            padding={padding}
            border={border}
            borderRadius={borderRadius}
            cssClass={cssClass}
          >
            <div className="pm-columns pm-columns-2">
              <ImplicitColumnWidth count={2}>
                <Left minEmptyHeight={80} />
              </ImplicitColumnWidth>
              <ImplicitColumnWidth count={2}>
                <Right minEmptyHeight={80} />
              </ImplicitColumnWidth>
            </div>
          </SectionFrame>
        ),
      },
      Section3: {
        label: "3 column section",
        fields: {
          backgroundColor: colorField("Background color (hex)"),
          padding: paddingField,
          ...borderFields,
          left: { ...contentSlotField, label: "Left column" },
          middle: { ...contentSlotField, label: "Middle column" },
          right: { ...contentSlotField, label: "Right column" },
        },
        defaultProps: {
          ...borderDefaults,
          backgroundColor: "#ffffff",
          padding: "0px",
          left: [],
          middle: [],
          right: [],
        },
        render: ({
          backgroundColor,
          padding,
          border,
          borderRadius,
          cssClass,
          left: Left,
          middle: Middle,
          right: Right,
        }) => (
          <SectionFrame
            backgroundColor={backgroundColor}
            padding={padding}
            border={border}
            borderRadius={borderRadius}
            cssClass={cssClass}
          >
            <div className="pm-columns pm-columns-3">
              <ImplicitColumnWidth count={3}>
                <Left minEmptyHeight={80} />
              </ImplicitColumnWidth>
              <ImplicitColumnWidth count={3}>
                <Middle minEmptyHeight={80} />
              </ImplicitColumnWidth>
              <ImplicitColumnWidth count={3}>
                <Right minEmptyHeight={80} />
              </ImplicitColumnWidth>
            </div>
          </SectionFrame>
        ),
      },
      Text: {
        fields: {
          content: {
            type: "richtext",
            contentEditable: true,
            visible: false,
            renderMenu: renderEmailRichTextMenu,
            renderInlineMenu: renderEmailInlineMenu,
          },
          align: {
            ...alignment,
            options: [...alignment.options, { label: "Justify", value: "justify" }],
          },
          padding: paddingField,
          fontSize: { type: "number", label: "Font size (px)", min: 8, max: 72 },
          ...typographyFields,
          color: colorField("Text color (hex)"),
          cssClass: cssClassField,
        },
        defaultProps: {
          ...typographyDefaults,
          content: "<p>Your text here</p>",
          color: "#222222",
          fontSize: 16,
          align: "left",
          padding: "10px",
          cssClass: "",
        },
        render: ({
          content,
          color,
          fontSize,
          fontFamily = "",
          fontWeight = 400,
          lineHeight = 1.5,
          letterSpacing = 0,
          align,
          padding,
          cssClass,
        }) => (
          <div
            className={classes("pm-text", cssClass)}
            style={{
              color,
              fontSize: `${fontSize}px`,
              fontFamily: fontFamily || undefined,
              fontWeight,
              lineHeight,
              letterSpacing: `${letterSpacing}px`,
              textAlign: align,
              padding,
            }}
          >
            {content}
          </div>
        ),
      },
      Image: {
        fields: {
          src: {
            type: "custom",
            label: "Image",
            render: ({ id, value, onChange, readOnly }) => (
              <ImageSourceField
                key={id}
                id={id}
                value={value}
                onChange={onChange}
                readOnly={readOnly}
                upload={onUploadImage}
              />
            ),
          },
          alt: { type: "text", label: "Alternative text" },
          href: { type: "text", label: "Link URL (optional)" },
          width: { type: "number", label: "Width (px)", min: 1, max: 1200 },
          align: alignment,
          padding: paddingField,
          borderRadius: borderFields.borderRadius,
          cssClass: cssClassField,
        },
        defaultProps: {
          src: "",
          alt: "",
          href: "",
          width: 560,
          align: "center",
          padding: "10px",
          borderRadius: "0px",
          cssClass: "",
        },
        render: ({
          src,
          alt,
          href,
          width,
          align,
          padding,
          borderRadius = "0px",
          cssClass,
          puck,
        }) => (
          <div className={classes("pm-image", cssClass)} style={{ textAlign: align, padding }}>
            {src ? (
              <a
                href={safeRichTextUrl(href) || undefined}
                onClick={puck.isEditing ? (event) => event.preventDefault() : undefined}
              >
                <img src={src} alt={alt} style={{ maxWidth: "100%", width, borderRadius }} />
              </a>
            ) : (
              <div className="pm-image-empty">Select an image URL</div>
            )}
          </div>
        ),
      },
      Button: {
        fields: {
          label: { type: "text", label: "Button text", contentEditable: true, visible: false },
          href: { type: "text", label: "Link URL" },
          align: alignment,
          padding: paddingField,
          innerPadding: { ...paddingField, label: "Inner padding (px or %)" },
          fontSize: { type: "number", label: "Font size (px)", min: 8, max: 72 },
          ...typographyFields,
          color: colorField("Text color (hex)"),
          backgroundColor: colorField("Background color (hex)"),
          borderRadius: borderFields.borderRadius,
          cssClass: cssClassField,
        },
        defaultProps: {
          ...typographyDefaults,
          label: "Click here",
          href: "https://example.com",
          backgroundColor: "#2563eb",
          color: "#ffffff",
          align: "center",
          padding: "10px",
          fontSize: 13,
          innerPadding: "10px 25px",
          borderRadius: "3px",
          lineHeight: 1.2,
          cssClass: "",
        },
        render: ({
          label,
          backgroundColor,
          color,
          align,
          padding,
          fontFamily = "",
          fontSize = 13,
          fontWeight = 400,
          lineHeight = 1.2,
          letterSpacing = 0,
          innerPadding = "10px 25px",
          borderRadius = "3px",
          cssClass,
        }) => (
          <div
            className={classes("pm-button-block", cssClass)}
            style={{ textAlign: align, padding }}
          >
            <span
              className="pm-button"
              style={{
                backgroundColor,
                color,
                fontFamily: fontFamily || undefined,
                fontSize: `${fontSize}px`,
                fontWeight,
                lineHeight,
                letterSpacing: `${letterSpacing}px`,
                padding: innerPadding,
                borderRadius,
              }}
            >
              {label}
            </span>
          </div>
        ),
      },
      Spacer: {
        fields: { height: { type: "number", label: "Height (px)", min: 1, max: 500 } },
        defaultProps: { height: 24 },
        render: ({ height }) => (
          <div className="pm-spacer" style={{ height: Number(height) || 24 }} aria-label="Spacer" />
        ),
      },
      Divider: {
        fields: {
          width: { type: "number", label: "Width (%)", min: 1, max: 100 },
          thickness: { type: "number", label: "Thickness (px)", min: 1, max: 20 },
          padding: paddingField,
          color: colorField("Line color (hex)"),
        },
        defaultProps: { color: "#d1d5db", width: 100, thickness: 1, padding: "10px" },
        render: ({ color, width, thickness, padding }) => (
          <div style={{ padding }}>
            <hr
              style={{
                border: 0,
                borderTop: `${thickness}px solid ${color}`,
                width: `${width}%`,
                margin: "auto",
              }}
            />
          </div>
        ),
      },
      Social: {
        fields: {
          links: {
            type: "array",
            label: "Social links",
            arrayFields: {
              name: {
                type: "select",
                label: "Network",
                options: ["facebook", "x", "instagram", "linkedin", "youtube", "github", "web"].map(
                  (value) => ({ label: value, value }),
                ),
              },
              href: { type: "text", label: "Link URL" },
              label: { type: "text", label: "Label" },
              src: { type: "text", label: "Custom icon URL (optional)" },
              alt: { type: "text", label: "Alternative text" },
              backgroundColor: colorField("Icon background color (optional)"),
              padding: { ...paddingField, label: "Link padding (blank uses 4px)" },
            },
            defaultItemProps: { name: "web", href: "https://example.com", label: "Website" },
            getItemSummary: (item) => item.label || item.name,
          },
          align: alignment,
          padding: paddingField,
          iconSize: { type: "number", label: "Icon size (px)", min: 1, max: 200 },
          iconPadding: { ...paddingField, label: "Icon padding" },
          borderRadius: { type: "text", label: "Icon corner radius (px)" },
        },
        defaultProps: {
          align: "center",
          padding: "10px 25px",
          iconSize: 20,
          iconPadding: "0px",
          borderRadius: "3px",
          links: [{ name: "web", href: "https://example.com", label: "Website" }],
        },
        render: ({
          align,
          padding = "10px 25px",
          iconSize = 20,
          iconPadding = "0px",
          borderRadius = "3px",
          links,
          puck,
        }) => (
          <div className="pm-social" style={{ textAlign: align, padding }}>
            {links.map((link, index) =>
              link.kind === "raw" ? (
                <TrustedHtmlPreview key={index} html={link.html ?? ""} label="Raw HTML" />
              ) : typeof link.htmlContent === "string" ? (
                <TrustedHtmlPreview key={index} html={link.htmlContent} />
              ) : (
                <a
                  key={index}
                  className="pm-social-item"
                  href={safeRichTextUrl(link.href) || undefined}
                  onClick={puck.isEditing ? (event) => event.preventDefault() : undefined}
                  style={{ padding: link.padding || "4px" }}
                >
                  {link.src ? (
                    <>
                      <span
                        className="pm-social-icon"
                        style={{
                          backgroundColor: link.backgroundColor || "transparent",
                          padding: iconPadding,
                          borderRadius,
                        }}
                      >
                        <img
                          src={link.src}
                          alt={link.alt || link.label || link.name}
                          width={iconSize}
                          height={iconSize}
                        />
                      </span>
                      {link.label && <span className="pm-social-label">{link.label}</span>}
                    </>
                  ) : (
                    link.label || link.name
                  )}
                </a>
              ),
            )}
          </div>
        ),
      },
      Navbar: {
        fields: {
          links: {
            type: "array",
            label: "Navigation links",
            arrayFields: {
              label: { type: "text", label: "Label" },
              href: { type: "text", label: "Link URL" },
            },
            defaultItemProps: { label: "Link", href: "https://example.com" },
            getItemSummary: (item) => item.label,
          },
          align: alignment,
        },
        defaultProps: { align: "center", links: [{ label: "Home", href: "https://example.com" }] },
        render: ({ align, links }) => (
          <nav className="pm-link-list" style={{ textAlign: align }}>
            {links.map((link, index) =>
              link.kind === "raw" ? (
                <TrustedHtmlPreview key={index} html={link.html ?? ""} label="Raw HTML" />
              ) : typeof link.htmlContent === "string" ? (
                <TrustedHtmlPreview key={index} html={link.htmlContent} />
              ) : (
                <span key={index}>{link.label}</span>
              ),
            )}
          </nav>
        ),
      },
      Table: tableConfig,
      Accordion: {
        fields: {
          items: {
            type: "array",
            label: "Accordion items",
            arrayFields: {
              title: { type: "text", label: "Title" },
              content: {
                type: "richtext",
                label: "Content",
                contentEditable: true,
                renderMenu: renderEmailRichTextMenu,
                renderInlineMenu: renderEmailInlineMenu,
              },
            },
            defaultItemProps: { title: "Question", content: "<p>Answer</p>" },
            getItemSummary: (item) => item.title,
          },
        },
        defaultProps: { items: [{ title: "Question", content: "<p>Answer</p>" }] },
        render: ({ items }) => (
          <div className="pm-accordion">
            {items.map((item, index) => (
              <details key={index} open>
                <summary>
                  {typeof item.titleHtmlContent === "string" ? (
                    <TrustedHtmlPreview
                      html={item.titleHtmlContent}
                      label="Trusted title HTML"
                      inline
                    />
                  ) : (
                    item.title
                  )}
                </summary>
                <div>
                  {typeof item.htmlContent === "string" ? (
                    <TrustedHtmlPreview html={item.htmlContent} />
                  ) : (
                    item.content
                  )}
                </div>
              </details>
            ))}
          </div>
        ),
      },
      Carousel: {
        fields: {
          images: {
            type: "array",
            label: "Carousel images",
            arrayFields: {
              src: { type: "text", label: "Image URL" },
              alt: { type: "text", label: "Alternative text" },
              href: { type: "text", label: "Link URL (optional)" },
            },
            defaultItemProps: { src: "", alt: "", href: "" },
            getItemSummary: (item, index) => item.alt || `Image ${(index ?? 0) + 1}`,
          },
          align: alignment,
          thumbnails: {
            type: "select",
            label: "Thumbnails",
            options: [
              { label: "Hidden", value: "hidden" },
              { label: "Visible", value: "visible" },
              { label: "Supported clients", value: "supported" },
            ],
          },
        },
        defaultProps: {
          align: "center",
          thumbnails: "visible",
          images: [
            {
              src: "https://static.mailjet.com/mjml-website/documentation/carousel-1.jpg",
              alt: "First image",
              href: "",
            },
            {
              src: "https://static.mailjet.com/mjml-website/documentation/carousel-2.jpg",
              alt: "Second image",
              href: "",
            },
          ],
        },
        render: ({ align, images }) => (
          <div className="pm-carousel" style={{ textAlign: align }}>
            {images[0]?.src ? (
              <img className="pm-carousel-main" src={images[0].src} alt={images[0].alt} />
            ) : (
              <div className="pm-image-empty">Add carousel images</div>
            )}
            <div className="pm-carousel-thumbnails">
              {images.map((item, index) =>
                item.src ? <img key={index} src={item.src} alt={item.alt} /> : null,
              )}
            </div>
          </div>
        ),
      },
      Raw: {
        label: "Trusted raw HTML",
        fields: {
          html: {
            type: "custom",
            label: "HTML source",
            render: ({ value, onChange, readOnly }) => (
              <CodeArea
                ariaLabel="HTML source"
                rows={10}
                value={value}
                disabled={readOnly}
                onChange={onChange}
              />
            ),
          },
        },
        defaultProps: { html: "<p>Custom HTML</p>" },
        render: ({ html }) => (
          <div className="pm-raw">
            <strong>Raw HTML</strong>
            <code>{html}</code>
          </div>
        ),
      },
    },
  };
  return withNativeCanvas(withNativeFields(config, allowRawHtml));
}
