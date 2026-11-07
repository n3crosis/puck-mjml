import {
  cloneElement,
  createContext,
  useContext,
  isValidElement,
  useCallback,
  useRef,
  type ComponentType,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  createUsePuck,
  type Config,
  type CustomField,
  type Field,
  type Overrides,
} from "@puckeditor/core";
import { isReadOnlyPath, hasReadOnlyDescendant, hasReadOnlyRule } from "./field-permissions";
import { sanitizeEmailRichText } from "./richtext";

const usePuck = createUsePuck();
const FieldPathContext = createContext<string | undefined>(undefined);

/** Public AutoField uses a local generated name; keep its document path separately. */
export function FieldPathScope({ path, children }: { path: string; children: ReactNode }) {
  return <FieldPathContext.Provider value={path}>{children}</FieldPathContext.Provider>;
}
type Props = Record<string, unknown>;
type PermissionFieldProps = Omit<
  Parameters<NonNullable<Overrides["fieldTypes"]["text"]>>[0],
  "children"
>;

function useFieldPermission(props: PermissionFieldProps) {
  const api = usePuck((state) => state);
  const item = api.selectedItem;
  const fields = item ? (item.readOnly ?? {}) : (api.appState.data.root.readOnly ?? {});
  const editable = api.getPermissions(item ? { item } : { root: true }).edit;
  const scope = useContext(FieldPathContext);
  const local = props.name ?? props.id ?? "";
  const path = scope && !local.startsWith(scope) ? scope + local.replace(/^[^.[]+/, "") : local;
  const readOnly =
    !editable ||
    (hasReadOnlyRule(path, fields) ? isReadOnlyPath(path, fields) : Boolean(props.readOnly));
  const structureLocked = readOnly || hasReadOnlyDescendant(path, fields);
  const latest = useRef({ onChange: props.onChange, readOnly });
  latest.current = { onChange: props.onChange, readOnly };
  // Rich-text synchronization must not replay a value when permission/UI changes.
  const change = useCallback<PermissionFieldProps["onChange"]>((value, ui) => {
    if (!latest.current.readOnly) latest.current.onChange(value, ui);
  }, []);
  return { name: path, readOnly, structureLocked, onChange: change };
}

/** Retain Puck's native field components, resolving full paths before rendering. */
export function PermissionField({
  children,
  ...props
}: PermissionFieldProps & { children: ReactNode }) {
  const permission = useFieldPermission(props);
  return isValidElement(children) ? (
    cloneElement(children as ReactElement<PermissionFieldProps>, {
      readOnly: props.field.type === "array" ? permission.structureLocked : permission.readOnly,
      onChange: permission.onChange,
    })
  ) : (
    <>{children}</>
  );
}

export const permissionFieldTypes: Overrides["fieldTypes"] = {
  array: PermissionField,
  object: PermissionField,
  text: PermissionField,
  textarea: PermissionField,
  number: PermissionField,
  select: PermissionField,
  radio: PermissionField,
  richtext: PermissionField,
};

function PermissionCustomField({
  render: Render,
  ...props
}: Parameters<CustomField<unknown>["render"]>[0] & { render: CustomField<unknown>["render"] }) {
  const permission = useFieldPermission(props);
  return (
    <Render
      {...props}
      name={permission.name}
      readOnly={permission.readOnly}
      onChange={permission.onChange}
    />
  );
}

/** Keep nested custom renderers on the scoped permission path, including standalone AutoField. */
export function withFieldPermissionFields(fields: Record<string, Field>): Record<string, Field> {
  return Object.fromEntries(
    Object.entries(fields).map(([name, field]) => {
      if (field.type === "array")
        return [name, { ...field, arrayFields: withFieldPermissionFields(field.arrayFields) }];
      if (field.type === "object")
        return [name, { ...field, objectFields: withFieldPermissionFields(field.objectFields) }];
      if (field.type !== "custom") return [name, field];
      const Render = field.render;
      return [
        name,
        {
          ...field,
          render: (props: Parameters<CustomField<unknown>["render"]>[0]) =>
            props.name?.includes(".") || props.name?.includes("[") ? (
              <PermissionCustomField {...props} render={Render} />
            ) : (
              <Render {...props} />
            ),
        },
      ];
    }),
  );
}

function protectInlineFields(
  rendered: Props,
  source: Props,
  fields: Record<string, Field>,
  locks: Record<string, boolean | undefined>,
  editable: boolean,
  prefix = "",
): Props {
  let next = rendered;
  const replace = (name: string, value: unknown) => {
    if (value !== rendered[name]) next = { ...next, [name]: value };
  };
  for (const [name, field] of Object.entries(fields)) {
    const path = prefix ? `${prefix}.${name}` : name;
    if (field.type === "array" && Array.isArray(rendered[name]) && Array.isArray(source[name])) {
      const rows = rendered[name] as Props[];
      const originals = source[name] as Props[];
      const mapped = rows.map((row, index) =>
        row && originals[index]
          ? protectInlineFields(
              row,
              originals[index],
              field.arrayFields,
              locks,
              editable,
              `${path}[${index}]`,
            )
          : row,
      );
      if (mapped.some((row, index) => row !== rows[index])) replace(name, mapped);
    } else if (field.type === "object" && rendered[name] && source[name]) {
      replace(
        name,
        protectInlineFields(
          rendered[name] as Props,
          source[name] as Props,
          field.objectFields,
          locks,
          editable,
          path,
        ),
      );
    } else if (
      (!editable || isReadOnlyPath(path, locks)) &&
      (field.type === "richtext" || (field.type === "text" && field.contentEditable))
    ) {
      replace(
        name,
        field.type === "richtext" ? (
          <div dangerouslySetInnerHTML={{ __html: sanitizeEmailRichText(source[name]) }} />
        ) : (
          source[name]
        ),
      );
    }
  }
  return next;
}

function PermissionBlock({
  render: Render,
  fields,
  defaults,
  props,
}: {
  render: ComponentType<Props>;
  fields: Record<string, Field>;
  defaults: Props;
  props: Props;
}) {
  const api = usePuck((state) => state);
  const item = api.getItemById(String(props.id));
  const protectedProps = item
    ? protectInlineFields(
        props,
        { ...defaults, ...item.props },
        fields,
        item.readOnly ?? {},
        Boolean(api.getPermissions({ item }).edit),
      )
    : props;
  return <Render {...protectedProps} />;
}

/** Lock inline descendants without adding derived readOnly flags to document data. */
export function withFieldPermissions(config: Config): Config {
  return {
    ...config,
    root: config.root
      ? {
          ...config.root,
          fields: withFieldPermissionFields((config.root.fields ?? {}) as Record<string, Field>),
        }
      : config.root,
    components: Object.fromEntries(
      Object.entries(config.components).map(([name, component]) => {
        const fields = (component.fields ?? {}) as Record<string, Field>;
        const Render = component.render as ComponentType<Props>;
        return [
          name,
          {
            ...component,
            fields: withFieldPermissionFields(fields),
            render: (props: Props) =>
              (props.puck as { isEditing?: boolean } | undefined)?.isEditing ? (
                <PermissionBlock
                  render={Render}
                  fields={fields}
                  defaults={component.defaultProps ?? {}}
                  props={props}
                />
              ) : (
                <Render {...props} />
              ),
          },
        ];
      }),
    ),
  };
}
