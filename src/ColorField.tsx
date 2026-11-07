import { ColorInput } from "./ColorInput";
import { PropertyFieldLabel } from "./PropertyInspector";

type ColorFieldProps = {
  id: string;
  name: string;
  value?: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
};

export function colorField(label: string) {
  return {
    type: "custom" as const,
    key: "color",
    label,
    render: ({ id, name, value, onChange, readOnly }: ColorFieldProps) => (
      <PropertyFieldLabel label={label} el="div" readOnly={readOnly}>
        <ColorInput
          id={id}
          name={name}
          value={typeof value === "string" ? value : ""}
          aria-label={label}
          pickerLabel={`Choose ${label.toLowerCase()}`}
          placeholder="Color"
          readOnly={readOnly}
          spellCheck={false}
          onChange={(event) => onChange(event.target.value)}
        />
      </PropertyFieldLabel>
    ),
  };
}
