import type { Overrides } from "@puckeditor/core";
import { permissionFieldTypes } from "./FieldPermissions";
import { TableArrayField } from "./TableEditor";

/** Pair with createEmailConfig when mounting a custom Puck editor. */
export const emailFieldTypes: Overrides["fieldTypes"] = {
  ...permissionFieldTypes,
  array: TableArrayField,
};
