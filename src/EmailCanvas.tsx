import {
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { normalizeEmailBreakpoint, normalizeEmailWidth } from "./layout";
import { normalizeEmailDirection, normalizeEmailLanguage } from "./metadata";
import { resolveBreakpointWidth } from "./head";
import type { EmailSettings } from "./types";
import { NativeCanvasProvider, createCanvasScope, getCanvasElement } from "./native-canvas-context";
import {
  aliasFontFamilyList,
  createFontAliases,
  familyKey,
  reportCanvasNotes,
  scopeDocumentCss,
  type FontAliasMap,
} from "./canvas-css";
import { useCanvasFonts } from "./canvas-fonts";
import { mjmlDefaultFonts, useImplicitCanvasFonts } from "./canvas-font-resolver";
import {
  resolveTailwindScript,
  mountTailwindCanvas,
  TailwindRuntimeContext,
} from "./canvas-tailwind";
import { NativeLayoutContext } from "./native-layout-context";

type EmailCanvasProps = {
  children: ReactNode;
  allowLocalImages?: boolean;
  width?: unknown;
  breakpoint?: unknown;
  breakpointWidth?: string;
  backgroundColor?: string;
  fontFamily?: string;
  lang?: unknown;
  dir?: unknown;
  nativeSettings?: EmailSettings;
  headStyles?: unknown;
  fontImports?: unknown;
  tailwind?: unknown;
  tailwindScriptUrl?: unknown;
};

export function EmailCanvas({
  children,
  allowLocalImages = false,
  width,
  breakpoint,
  breakpointWidth,
  backgroundColor,
  fontFamily,
  lang,
  dir,
  nativeSettings,
  headStyles,
  fontImports,
  tailwind,
  tailwindScriptUrl,
}: EmailCanvasProps) {
  const id = useId();
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const scope = `pm-canvas-${Array.from(id, (character) => character.codePointAt(0)!.toString(16)).join("-")}`;
  let responsiveWidth = `${normalizeEmailBreakpoint(breakpoint)}px`;
  let emailWidth: string | number = normalizeEmailWidth(width);
  let canvasBackground = backgroundColor || "#f5f5f5";
  let canvasFont = fontFamily || "Arial, sans-serif";
  let bodyClass = "";
  try {
    responsiveWidth =
      resolveBreakpointWidth({
        breakpoint: normalizeEmailBreakpoint(breakpoint),
        breakpointWidth,
      }) || responsiveWidth;
  } catch {
    // Keep incomplete sidebar values editable; the compiled preview reports validation errors.
  }
  if (nativeSettings) {
    try {
      const parent = createCanvasScope({
        ...nativeSettings,
        bodyMjClass: undefined,
        bodyAttributes: undefined,
        fontFamily,
      });
      const node = getCanvasElement(
        "mj-body",
        {
          width,
          backgroundColor,
          mjClass: nativeSettings.bodyMjClass,
          mjmlAttributes: nativeSettings.bodyAttributes,
        },
        parent,
      );
      if (node) {
        emailWidth = node.attributes.width ?? "600px";
        canvasBackground = node.attributes["background-color"] ?? "transparent";
        canvasFont = parent.context.all["font-family"] || "Arial, sans-serif";
        bodyClass = node.attributes["css-class"] ?? "";
      }
    } catch {
      // Native fields can be temporarily invalid while the user types.
    }
  }
  const imports = Array.isArray(fontImports) ? fontImports : [];
  const stylesheets = Array.isArray(headStyles) ? headStyles : [];
  // Document data is plain, but host-controlled input must never break rendering.
  const stableKey = (value: unknown) => {
    try {
      return JSON.stringify(value) ?? "null";
    } catch {
      return "invalid";
    }
  };
  const importsKey = stableKey(imports);
  const stylesKey = stableKey(stylesheets);
  const importedAliases = useMemo<FontAliasMap>(
    () =>
      createFontAliases(
        [
          ...imports
            .map((entry) => (entry as { name?: unknown })?.name)
            .filter((name): name is string => typeof name === "string"),
          ...mjmlDefaultFonts.map(({ name }) => name),
        ],
        scope,
      ),
    [importsKey, scope],
  );
  const scopedCss = useMemo(
    () => scopeDocumentCss(stylesheets, { scope, fontAliases: importedAliases }),
    [stylesKey, scope, importedAliases],
  );
  const aliases = scopedCss.fontAliases;
  useEffect(() => {
    if (scopedCss.notes.length) reportCanvasNotes(scopedCss.notes);
  }, [scopedCss]);
  const implicit = useImplicitCanvasFonts(canvasRef, imports, aliases, stylesheets);
  const fonts = useCanvasFonts([...imports, ...implicit.imports], aliases);
  const importedFamilies = [...imports, ...implicit.imports]
    .map((entry) => (entry as { name?: unknown })?.name)
    .filter((name): name is string => typeof name === "string")
    .map((name) => aliases[familyKey(name)])
    .filter(Boolean);
  const tailwindRuntime = useContext(TailwindRuntimeContext);
  const tailwindScriptSrc = resolveTailwindScript(tailwind, tailwindRuntime);
  const [tailwindCss, setTailwindCss] = useState("");
  useEffect(() => {
    if (tailwindScriptUrl) {
      reportCanvasNotes([
        "Document tailwindScriptUrl is ignored. Configure the host's tailwindRuntime prop instead.",
      ]);
    }
  }, [tailwindScriptUrl]);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!tailwindScriptSrc || !canvas) return;
    return mountTailwindCanvas(canvas, scope, tailwindScriptSrc, setTailwindCss);
  }, [tailwindScriptSrc, scope]);
  const emailWidthStyle = typeof emailWidth === "number" ? `${emailWidth}px` : emailWidth;
  const aliasedCanvasFont = aliasFontFamilyList(canvasFont, aliases);
  // MJML's desktop width class also supplies a normal max-width. Emit this
  // before authored CSS at equivalent scoped class specificity, so a normal
  // author max-width can replace the cap without affecting mobile widths.
  const desktopWidthStyles = `@media (width >= ${responsiveWidth}) {
.${scope} .pm-native-inline-column,
.${scope} .pm-native-inline-group { max-width: var(--pm-native-desktop-width); }
}`;
  const mobileStyles = `.${scope} .pm-native-navbar-trigger { display: none; }
@media (width < ${responsiveWidth}) {
.${scope} .pm-native-inline-section > div { --pm-native-empty-drag-axis: y; }
.${scope} .pm-columns-2, .${scope} .pm-columns-3 { grid-template-columns: 1fr; }
.${scope} .pm-flex-section:not(.pm-native-inline-section) > div > .pm-flex-column,
.${scope} .pm-flex-section:not(.pm-native-inline-section) > div > .pm-flex-group { flex-basis: 100% !important; }
:where(.${scope} .pm-native-inline-section > div > .pm-native-inline-column),
:where(.${scope} .pm-native-inline-section > div > .pm-native-inline-group),
:where(.${scope} .pm-native-columns > .pm-native-column) { width: 100% !important; }
:where(.${scope} .pm-native-inline-group > div > .pm-native-inline-column) { width: var(--pm-group-column-width) !important; }
:where(.${scope} .pm-native-gutter-stacked) { padding: var(--pm-gutter-mobile-padding) !important; }
.${scope} .pm-native-image-fluid > a { width: 100% !important; }
.${scope} .pm-native-navbar-trigger { display: block; }
.${scope} .pm-native-navbar[data-native-navbar-open="false"] > .pm-native-navbar-links { display: none; }
.${scope} .pm-native-navbar[data-native-navbar-open] > .pm-native-navbar-links > a { display: block; }
}`;

  return (
    <div
      ref={canvasRef}
      className={`pm-canvas ${scope}`}
      data-pm-canvas-font-status={implicit.settled ? fonts.status : "loading"}
      data-pm-canvas-font-families={JSON.stringify(importedFamilies)}
      data-pm-canvas-font-inputs={implicit.fingerprint}
      data-pm-canvas-font-errors={
        fonts.failures.length ? JSON.stringify(fonts.failures) : undefined
      }
      lang={normalizeEmailLanguage(lang)}
      dir={normalizeEmailDirection(dir)}
      style={
        {
          backgroundColor: canvasBackground,
          fontFamily: aliasedCanvasFont,
          // Full-width sections size against the canvas container, not the email column.
          containerType: "inline-size",
          "--pm-email-width": emailWidthStyle,
        } as CSSProperties
      }
    >
      {tailwindCss ? <style data-pm-tailwind-css={scope}>{tailwindCss}</style> : null}
      {fonts.status !== "idle" ? (
        <style data-pm-canvas-fonts={scope} data-pm-font-status={fonts.status}>
          {fonts.css}
        </style>
      ) : null}
      <style data-pm-native-widths={scope}>{desktopWidthStyles}</style>
      {scopedCss.css ? <style data-pm-canvas-css={scope}>{scopedCss.css}</style> : null}
      <style data-pm-responsive={scope}>{mobileStyles}</style>
      <div
        className={["pm-email", bodyClass].filter(Boolean).join(" ")}
        style={{ maxWidth: emailWidthStyle }}
      >
        <NativeLayoutContext.Provider value={{ width: Number.parseFloat(emailWidthStyle) || 600 }}>
          <NativeCanvasProvider
            settings={{ ...nativeSettings, fontFamily }}
            fontAliases={aliases}
            allowLocalImages={allowLocalImages}
          >
            {children}
          </NativeCanvasProvider>
        </NativeLayoutContext.Provider>
      </div>
    </div>
  );
}
