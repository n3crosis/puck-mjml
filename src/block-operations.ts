import type { ComponentData, Config, Field, PuckApi } from "@puckeditor/core";
import { hasReadOnlyDescendant, isReadOnlyPath } from "./field-permissions";
import { isEmailEditorBlockOperationsPolicy, type BlockOperationsPolicy } from "./config";

// An internal, deliberately bounded controller for EmailEditor's own config, not a
// general Puck extension. In particular, render-time slot constraints are not
// available through PuckApi and must never be inferred for arbitrary hosts.
const slotsByType: Record<string, readonly string[]> = {
  root: ["sections"],
  Wrapper: ["sections"],
  Section: ["columns"],
  Column: ["content"],
  Group: ["columns"],
  Hero: ["content"],
  Section1: ["column"],
  Section2: ["left", "right"],
  Section3: ["left", "middle", "right"],
  Text: [],
  Image: [],
  Button: [],
  Spacer: [],
  Divider: [],
  Social: [],
  Navbar: [],
  Table: [],
  Accordion: [],
  Carousel: [],
  Raw: [],
};
type SlotField = Extract<Field, { type: "slot" }>;
type Owner = { item: ComponentData | null; path: string };
type Zone = {
  id: string;
  label: string;
  items: ComponentData[];
  field: SlotField;
  owners: Owner[];
};
type Node = { item: ComponentData; zone: Zone; index: number; children: Node[] };
export type BlockOperationResult = { ok: boolean; message: string };
export type BlockOperationsModel = {
  destinations: { id: string; label: string; types: { name: string; label: string }[] }[];
  selected: { id: string; label: string; earlier: boolean; later: boolean } | null;
  reason: string;
};
const refused = (message: string): BlockOperationResult => ({ ok: false, message });
const unavailable = "Block operations are unavailable for this document or configuration.";

function hasNestedSlot(field: Field): boolean {
  if (field.type === "slot") return true;
  const fields =
    field.type === "object" ? field.objectFields : field.type === "array" ? field.arrayFields : {};
  return Object.values(fields).some(hasNestedSlot);
}
function knownComponent(config: Config, type: string) {
  return (
    typeof type === "string" &&
    type !== "root" &&
    Object.hasOwn(slotsByType, type) &&
    Object.hasOwn(config.components, type)
  );
}
function configSupported(config: Config) {
  if (
    Object.keys(config.components).some(
      (type) => !Object.hasOwn(slotsByType, type) || type === "root",
    )
  )
    return false;
  for (const [type, component] of [
    ["root", config.root],
    ...Object.entries(config.components),
  ] as const) {
    if (!component) return false;
    const names = slotsByType[type];
    const fields = component.fields ?? {};
    const actual = Object.entries(fields)
      .filter(([, field]) => field.type === "slot")
      .map(([key]) => key);
    if (actual.length !== names.length || names.some((key) => fields[key]?.type !== "slot"))
      return false;
    if (Object.values(fields).some((field) => field.type !== "slot" && hasNestedSlot(field)))
      return false;
    for (const key of actual) {
      const field = fields[key] as SlotField;
      if (!Array.isArray(field.allow) || field.allow.some((name) => !knownComponent(config, name)))
        return false;
      if (
        field.disallow &&
        (!Array.isArray(field.disallow) ||
          field.disallow.some((name) => !knownComponent(config, name)))
      )
        return false;
    }
  }
  return true;
}
function dynamic(config: Config, item: ComponentData | null) {
  const component = item ? config.components[item.type] : config.root;
  if (!component || component.resolveData || component.resolvePermissions) return true;
  // inspect() has verified the entire factory-issued policy first. Only its
  // exact Hero resolver is known to preserve static slots. Even a resolver on
  // a currently slot-free component could introduce new dynamic slots.
  return Boolean(component.resolveFields && item?.type !== "Hero");
}
function locks(
  api: PuckApi,
  item: ComponentData | null,
): Record<string, boolean | undefined> | null {
  const rules: unknown = (item ?? api.appState.data.root).readOnly;
  if (rules === undefined) return {};
  if (
    !rules ||
    typeof rules !== "object" ||
    Array.isArray(rules) ||
    Object.values(rules).some((value) => typeof value !== "boolean" && value !== undefined)
  )
    return null;
  return rules as Record<string, boolean | undefined>;
}
function ownerEditable(api: PuckApi, owner: Owner) {
  const rules = locks(api, owner.item);
  if (!rules) return false;
  const permissions = api.getPermissions(owner.item ? { item: owner.item } : { root: true });
  return (
    !dynamic(api.config, owner.item) &&
    permissions.edit === true &&
    !isReadOnlyPath(owner.path, rules) &&
    !hasReadOnlyDescendant(owner.path, rules)
  );
}
function slotAllows(field: SlotField, type: string) {
  // Puck's documented precedence: explicit allow wins over disallow; when
  // disallow exists, all types outside that deny list are accepted.
  return field.disallow
    ? !field.disallow.includes(type) || Boolean(field.allow?.includes(type))
    : Boolean(field.allow?.includes(type));
}
function subtreeEditable(api: PuckApi, node: Node): boolean {
  const rules = locks(api, node.item);
  return (
    Boolean(rules) &&
    !dynamic(api.config, node.item) &&
    api.getPermissions({ item: node.item }).drag === true &&
    api.getPermissions({ item: node.item }).edit === true &&
    !Object.values(rules!).some((value) => value !== false && value !== undefined) &&
    node.children.every((child) => subtreeEditable(api, child))
  );
}
function inspect(api: PuckApi, policy: BlockOperationsPolicy) {
  if (
    !isEmailEditorBlockOperationsPolicy(api.config, policy) ||
    !configSupported(api.config) ||
    api.appState.ui.isDragging ||
    api.appState.data.content.length ||
    Object.keys(api.appState.data.zones ?? {}).length
  )
    return null;
  const zones = new Map<string, Zone>();
  const nodes = new Map<string, Node>();
  const ids = new Set<string>(["root"]);
  let valid = true;
  function visit(item: ComponentData | null, parents: Owner[], label: string): Node[] {
    const props = (item ?? api.appState.data.root).props;
    const config = item ? api.config.components[item.type] : api.config.root;
    if (!config || !props || !locks(api, item)) {
      valid = false;
      return [];
    }
    const descendants: Node[] = [];
    for (const path of slotsByType[item?.type ?? "root"]) {
      const items = props[path];
      if (!Array.isArray(items)) {
        valid = false;
        continue;
      }
      const field = config.fields![path] as SlotField;
      const zone: Zone = {
        id: `${item?.props.id ?? "root"}:${path}`,
        label: `${label} / ${field.label ?? path}`,
        items,
        field,
        owners: [...parents, { item, path }],
      };
      zones.set(zone.id, zone);
      items.forEach((child: ComponentData, index: number) => {
        if (
          !child ||
          typeof child.type !== "string" ||
          !Object.hasOwn(slotsByType, child.type) ||
          !knownComponent(api.config, child.type) ||
          !slotAllows(field, child.type) ||
          typeof child.props?.id !== "string" ||
          !child.props.id ||
          child.props.id.includes(":") ||
          ids.has(child.props.id)
        ) {
          valid = false;
          return;
        }
        ids.add(child.props.id);
        const node: Node = { item: child, zone, index, children: [] };
        nodes.set(child.props.id, node);
        const childLabel = `${zone.label} / ${api.config.components[child.type].label ?? child.type} ${index + 1}`;
        node.children = visit(child, zone.owners, childLabel);
        descendants.push(node);
      });
    }
    return descendants;
  }
  visit(null, [], "Email");
  return valid ? { zones, nodes } : null;
}
function canAdd(api: PuckApi, zone: Zone, type: string) {
  return (
    knownComponent(api.config, type) &&
    !dynamic(api.config, { type, props: { id: "" } }) &&
    api.getPermissions({ type }).insert === true &&
    slotAllows(zone.field, type) &&
    zone.owners.every((owner) => ownerEditable(api, owner))
  );
}
function canMove(api: PuckApi, node: Node, direction: -1 | 1, nodes: Map<string, Node>) {
  return (
    node.index + direction >= 0 &&
    node.index + direction < node.zone.items.length &&
    slotAllows(node.zone.field, node.item.type) &&
    node.zone.owners.every((owner) => ownerEditable(api, owner)) &&
    subtreeEditable(api, node) &&
    subtreeEditable(api, nodes.get(node.zone.items[node.index + direction].props.id)!)
  );
}

/** The getter must be useGetPuck(), so event handlers never act on stale renders. */
export function createBlockOperations(getPuck: () => PuckApi, policy: BlockOperationsPolicy) {
  return {
    model(): BlockOperationsModel {
      const api = getPuck();
      const tree = inspect(api, policy);
      if (!tree) return { destinations: [], selected: null, reason: unavailable };
      const node = api.selectedItem ? tree.nodes.get(api.selectedItem.props.id) : undefined;
      const destinations = [...tree.zones.values()]
        .map((zone) => ({
          id: zone.id,
          label: zone.label,
          types: Object.keys(api.config.components)
            .filter((type) => canAdd(api, zone, type))
            .map((name) => ({ name, label: api.config.components[name].label ?? name })),
        }))
        .filter((zone) => zone.types.length > 0);
      return {
        destinations,
        selected: node
          ? {
              id: node.item.props.id,
              label: api.config.components[node.item.type].label ?? node.item.type,
              earlier: canMove(api, node, -1, tree.nodes),
              later: canMove(api, node, 1, tree.nodes),
            }
          : null,
        reason: destinations.length ? "" : "No editable destinations are available.",
      };
    },
    add(zoneId: string, type: string): BlockOperationResult {
      const api = getPuck();
      const zone = inspect(api, policy)?.zones.get(zoneId);
      if (!zone || !canAdd(api, zone, type))
        return refused(
          "This block cannot be added here. Choose an editable destination and an allowed block.",
        );
      const index = zone.items.length;
      api.dispatch({
        type: "insert",
        componentType: type,
        destinationZone: zoneId,
        destinationIndex: index,
        recordHistory: false,
      });
      api.dispatch({
        type: "setUi",
        ui: { itemSelector: { zone: zoneId, index } },
        recordHistory: true,
      });
      return {
        ok: true,
        message: `${api.config.components[type].label ?? type} added to ${zone.label} at position ${index + 1}.`,
      };
    },
    move(id: string, direction: -1 | 1): BlockOperationResult {
      if (direction !== -1 && direction !== 1)
        return refused("The selected block cannot move in that direction.");
      const api = getPuck();
      const tree = inspect(api, policy);
      const node = tree?.nodes.get(id);
      if (
        !tree ||
        !node ||
        api.selectedItem?.props.id !== id ||
        !canMove(api, node, direction, tree.nodes)
      )
        return refused("The selected block cannot move in that direction.");
      const index = node.index + direction;
      api.dispatch({
        type: "reorder",
        sourceIndex: node.index,
        destinationIndex: index,
        destinationZone: node.zone.id,
        recordHistory: false,
      });
      api.dispatch({
        type: "setUi",
        ui: { itemSelector: { zone: node.zone.id, index } },
        recordHistory: true,
      });
      return {
        ok: true,
        message: `${api.config.components[node.item.type].label ?? node.item.type} moved ${direction < 0 ? "earlier" : "later"} to position ${index + 1}.`,
      };
    },
  };
}
