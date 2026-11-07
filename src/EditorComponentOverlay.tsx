import type { Overrides } from "@puckeditor/core";
import { SpacingOverlay } from "./SpacingOverlay";
import { TableColumnResize } from "./TableColumnResize";

export function EditorComponentOverlay(props: Parameters<Overrides["componentOverlay"]>[0]) {
  return (
    <SpacingOverlay {...props}>
      {props.children}
      <TableColumnResize
        componentId={props.componentId}
        componentType={props.componentType}
        isSelected={props.isSelected}
      />
    </SpacingOverlay>
  );
}
