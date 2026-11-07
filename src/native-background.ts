import type { CSSProperties } from "react";
import type { NativeCanvasAttributes } from "./native-canvas-context";

/** Match mj-section/mj-wrapper's position parser and explicit axis precedence. */
export function sectionBackgroundPosition(attributes: NativeCanvasAttributes): string {
  const parts = (attributes["background-position"] ?? "top center").split(" ");
  let x = "center";
  let y = "top";
  if (parts.length === 1) {
    if (["top", "bottom"].includes(parts[0])) y = parts[0];
    else {
      x = parts[0];
      y = "center";
    }
  } else if (parts.length === 2) {
    const [first, second] = parts;
    if (
      ["top", "bottom"].includes(first) ||
      (first === "center" && ["left", "right"].includes(second))
    ) {
      x = second;
      y = first;
    } else {
      x = first;
      y = second;
    }
  }
  return `${attributes["background-position-x"] || x} ${attributes["background-position-y"] || y}`;
}

export function nativeBackgroundStyle(
  attributes: NativeCanvasAttributes,
  section = true,
): CSSProperties {
  return {
    backgroundColor: attributes["background-color"],
    backgroundImage: attributes["background-url"]
      ? `url("${attributes["background-url"]}")`
      : undefined,
    // One property also makes React updates safe: removing an axis longhand must
    // not clear an unchanged shorthand. Heroes accept the original CSS position.
    backgroundPosition: section
      ? sectionBackgroundPosition(attributes)
      : attributes["background-position"],
    backgroundSize: attributes["background-size"],
    backgroundRepeat: attributes["background-repeat"] as CSSProperties["backgroundRepeat"],
  };
}
