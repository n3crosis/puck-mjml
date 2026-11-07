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
  reportCanvasNotes,
  scopeDocumentCss,
  type FontAliasMap,
} from "./canvas-css";
import { useCanvasFonts } from "./canvas-fonts";
import {
  resolveTailwindScript,
  mountTailwindCanvas,
  TailwindRuntimeContext,
} from "./canvas-tailwind";
import { NativeLayoutContext } from "./native-layout-context";

type EmailCanvasProps = {
  children: ReactNode;
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
  const aliases = useMemo<FontAliasMap>(
    () =>
      createFontAliases(
        imports
          .map((entry) => (entry as { name?: unknown })?.name)
          .filter((name): name is string => typeof name === "string"),
        scope,
      ),
    [importsKey, scope],
  );
  const scopedCss = useMemo(
    () => scopeDocumentCss(stylesheets, { scope, fontAliases: aliases }),
    [stylesKey, scope, aliases],
  );
  useEffect(() => {
    if (scopedCss.notes.length) reportCanvasNotes(scopedCss.notes);
  }, [scopedCss]);
  const fonts = useCanvasFonts(imports, aliases);
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
  const mobileStyles = `.${scope} .pm-native-navbar-trigger { display: none; }
@media (width < ${responsiveWidth}) {
.${scope} .pm-columns-2, .${scope} .pm-columns-3 { grid-template-columns: 1fr; }
.${scope} .pm-flex-section > div > .pm-flex-column,
.${scope} .pm-flex-section > div > .pm-flex-group { flex-basis: 100% !important; }
.${scope} .pm-native-columns > .pm-native-column { flex-basis: 100% !important; }
.${scope} .pm-native-gutter-stacked { padding: var(--pm-gutter-mobile-padding) !important; }
.${scope} .pm-native-image-fluid > a { width: 100% !important; }
.${scope} .pm-native-navbar-trigger { display: block; }
.${scope} .pm-native-navbar[data-native-navbar-open="false"] > .pm-native-navbar-links { display: none; }
.${scope} .pm-native-navbar[data-native-navbar-open] > .pm-native-navbar-links > a { display: block; }
}`;

  return (
    <div
      ref={canvasRef}
      className={`pm-canvas ${scope}`}
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
      {scopedCss.css ? <style data-pm-canvas-css={scope}>{scopedCss.css}</style> : null}
      {fonts.css ? <style data-pm-canvas-fonts={scope}>{fonts.css}</style> : null}
      <style data-pm-responsive={scope}>{mobileStyles}</style>
      <div
        className={["pm-email", bodyClass].filter(Boolean).join(" ")}
        style={{ maxWidth: emailWidthStyle }}
      >
        <NativeLayoutContext.Provider value={{ width: Number.parseFloat(emailWidthStyle) || 600 }}>
          <NativeCanvasProvider settings={{ ...nativeSettings, fontFamily }} fontAliases={aliases}>
            {children}
          </NativeCanvasProvider>
        </NativeLayoutContext.Provider>
      </div>
    </div>
  );
}
