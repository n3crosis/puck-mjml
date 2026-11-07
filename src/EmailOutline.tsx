import { Children, cloneElement, isValidElement, type ReactNode } from "react";
import { createUsePuck, type Config } from "@puckeditor/core";

const usePuck = createUsePuck();

type OutlineNode = { componentType: string; childZones: OutlineTree[] };
type OutlineTree = { zoneCompound: string; label?: string; items: OutlineNode[] };
type OutlineChildren = { children?: ReactNode; trees?: unknown };

function isTree(tree: unknown): tree is OutlineTree {
  if (!tree || typeof tree !== "object") return false;
  const value = tree as Partial<OutlineTree>;
  return (
    typeof value.zoneCompound === "string" &&
    Array.isArray(value.items) &&
    value.items.every(
      (item) =>
        item &&
        typeof item === "object" &&
        typeof item.componentType === "string" &&
        Array.isArray(item.childZones) &&
        item.childZones.every(isTree),
    )
  );
}

function orderTrees(trees: OutlineTree[], fields: Record<string, { type: string }> = {}) {
  const slots = [
    "default-zone",
    ...Object.keys(fields).filter((key) => fields[key].type === "slot"),
  ];
  const rank = (tree: OutlineTree) => {
    const index = slots.indexOf(tree.zoneCompound.split(":")[1]);
    return index < 0 ? slots.length : index;
  };
  return [...trees].sort((a, b) => rank(a) - rank(b));
}

function arrangeTrees(trees: OutlineTree[], config: Config, emptyRoot: boolean): OutlineTree[] {
  return trees
    .filter(
      (tree) =>
        !(emptyRoot && tree.zoneCompound === "root:default-zone" && tree.items.length === 0),
    )
    .map((tree) => ({
      ...tree,
      label:
        tree.zoneCompound === "root:sections"
          ? (config.root?.fields?.sections?.label ?? "Sections")
          : tree.zoneCompound === "root:default-zone"
            ? "Content"
            : tree.label,
      items: tree.items.map((node) => ({
        ...node,
        childZones: orderTrees(
          arrangeTrees(node.childZones, config, false),
          config.components[node.componentType]?.fields,
        ),
      })),
    }));
}

function adaptOutline(children: ReactNode, config: Config, emptyRoot: boolean): ReactNode {
  return Children.map(children, (child) => {
    if (!isValidElement<OutlineChildren>(child)) return child;
    // The public wrapper receives Puck's existing tree element. Check its shape
    // before adapting descriptors; retain that component and all native handlers.
    if (Array.isArray(child.props.trees) && child.props.trees.every(isTree)) {
      return cloneElement(child, {
        trees: orderTrees(arrangeTrees(child.props.trees, config, emptyRoot), config.root?.fields),
      });
    }
    return child.props.children === undefined
      ? child
      : cloneElement(child, {
          children: adaptOutline(child.props.children, config, emptyRoot),
        });
  });
}

/** Keep Puck's outline, selection, and drag handlers while presenting email slots. */
export function EmailOutline({ children }: { children: ReactNode }) {
  const config = usePuck((state) => state.config);
  const emailSlots = usePuck(
    (state) =>
      state.config.root?.fields?.sections?.type === "slot" &&
      Array.isArray(state.appState.data.root.props?.sections),
  );
  const emptyRoot = usePuck((state) => state.appState.data.content.length === 0);
  return (
    <div className="pm-outline">
      {emailSlots ? adaptOutline(children, config, emptyRoot) : children}
    </div>
  );
}
