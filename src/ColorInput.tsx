import { useEffect, useRef, useState, type InputHTMLAttributes } from "react";

type ColorInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value"> & {
  value: string;
  pickerLabel?: string;
};

// The native picker accepts opaque six-digit hex. Keep the document's original
// color string in the text control; conversion only initializes the picker.
function pickerHex(value: string): string | undefined {
  const hex = value.trim().match(/^#([\da-f]{3,8})$/i)?.[1];
  if (hex?.length === 3 || hex?.length === 4)
    return `#${hex
      .slice(0, 3)
      .split("")
      .map((digit) => digit.repeat(2))
      .join("")}`;
  if (hex?.length === 6 || hex?.length === 8) return `#${hex.slice(0, 6)}`;
  const rgb = value.match(/^rgba?\(\s*([\d.]+)(%)?[,\s]+([\d.]+)(%)?[,\s]+([\d.]+)(%)?/i);
  if (!rgb) return undefined;
  return `#${[1, 3, 5]
    .map((index) =>
      Math.round(
        Math.min(255, Math.max(0, (Number(rgb[index]) * 255) / (rgb[index + 1] ? 100 : 255))),
      )
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

/** Native color picker plus text entry for blanks, alpha, named and CSS colors. */
export function ColorInput({
  value,
  pickerLabel,
  disabled,
  readOnly,
  onChange,
  ...props
}: ColorInputProps) {
  const swatch = useRef<HTMLSpanElement>(null);
  const [resolvedHex, setResolvedHex] = useState(() => pickerHex(value) ?? "#000000");
  useEffect(() => {
    // A rendered swatch lets the browser resolve named colors, HSL and inherited
    // colors without evaluating or changing the saved document value.
    const computed = swatch.current ? getComputedStyle(swatch.current).backgroundColor : "";
    setResolvedHex(pickerHex(value) ?? pickerHex(computed) ?? "#000000");
  }, [value]);
  return (
    <div className="pm-color-input">
      <span className="pm-color-swatch-shell">
        <span
          className="pm-color-swatch"
          ref={swatch}
          style={{ backgroundColor: value || "transparent" }}
        />
        <input
          className="pm-color-picker"
          type="color"
          aria-label={pickerLabel ?? `Choose ${props["aria-label"] ?? "color"}`}
          title={disabled || readOnly ? "Read only" : "Choose color"}
          value={resolvedHex}
          disabled={disabled || readOnly}
          onChange={onChange}
        />
      </span>
      <input
        {...props}
        type="text"
        value={value}
        disabled={disabled}
        readOnly={readOnly}
        onChange={onChange}
      />
    </div>
  );
}
