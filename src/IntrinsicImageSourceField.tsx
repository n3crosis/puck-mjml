import { createUsePuck } from "@puckeditor/core";
import { useMemo } from "react";
import { ImageSourceField } from "./ImageSourceField";
import {
  validateIntrinsicContent,
  validateIntrinsicStructure,
  type IntrinsicOptions,
} from "./intrinsic-layout";
import { applyNativeAttributes, createNativeContext, type NativeContext } from "./native-cascade";
import type { EmailBlock, EmailDocument, EmailSettings } from "./types";

const usePuck = createUsePuck();

export function findIntrinsicOwner(
  value: unknown,
  id: string,
  owner?: EmailBlock,
): EmailBlock | undefined {
  if (!value || typeof value !== "object") return undefined;
  if (Array.isArray(value)) {
    for (const child of value) {
      const result = findIntrinsicOwner(child, id, owner);
      if (result) return result;
    }
    return undefined;
  }
  const block = value as EmailBlock;
  const next = block.type === "IntrinsicRow" ? (owner ?? block) : owner;
  if (block.props?.id === id) return next;
  for (const child of Object.values(value)) {
    const result = findIntrinsicOwner(child, id, next);
    if (result) return result;
  }
  return undefined;
}

export function preflightIntrinsicImage(
  owner: EmailBlock,
  id: string,
  src: string,
  options?: IntrinsicOptions,
) {
  const replace = (block: EmailBlock): EmailBlock => {
    if (block.props.id === id) return { ...block, props: { ...block.props, src } };
    const slot =
      block.type === "IntrinsicRow"
        ? "cells"
        : block.type === "IntrinsicCell"
          ? "content"
          : undefined;
    if (!slot || !Array.isArray(block.props[slot])) return block;
    return {
      ...block,
      props: { ...block.props, [slot]: (block.props[slot] as EmailBlock[]).map(replace) },
    };
  };
  const next = replace(owner);
  validateIntrinsicStructure(next);
  if (options) validateIntrinsicContent(next, options);
}

/** Follow the same public slots and native class scopes as the exporter. */
function owningScope(document: EmailDocument, id: string, context: NativeContext) {
  const settings = document.root.props ?? {};
  const descend = (tag: string, props: Record<string, unknown>, ancestorClasses?: string) =>
    applyNativeAttributes(tag, props, {}, { ...context, allowRawHtml: false }, ancestorClasses)
      .childClasses;
  const body = descend("mj-body", {
    mjClass: settings.bodyMjClass,
    mjmlAttributes: settings.bodyAttributes,
  });
  const visit = (
    blocks: unknown,
    ancestorClasses?: string,
    owner?: { block: EmailBlock; ancestorClasses?: string },
  ): typeof owner => {
    if (!Array.isArray(blocks)) return undefined;
    for (const block of blocks as EmailBlock[]) {
      if (!block?.props) continue;
      const current = block.type === "IntrinsicRow" ? (owner ?? { block, ancestorClasses }) : owner;
      if (block.props.id === id) return current;
      const layouts: Record<string, [string, string]> = {
        Wrapper: ["mj-wrapper", "sections"],
        Section: ["mj-section", "columns"],
        Column: ["mj-column", "content"],
        Group: ["mj-group", "columns"],
        Hero: ["mj-hero", "content"],
      };
      const simple: Record<string, string[]> = {
        Section1: ["column"],
        Section2: ["left", "right"],
        Section3: ["left", "middle", "right"],
      };
      let found: typeof owner;
      if (block.type === "IntrinsicRow" || block.type === "IntrinsicCell")
        found = visit(
          block.props[block.type === "IntrinsicRow" ? "cells" : "content"],
          ancestorClasses,
          current,
        );
      else if (Object.hasOwn(layouts, block.type)) {
        const [tag, slot] = layouts[block.type];
        found = visit(block.props[slot], descend(tag, block.props, ancestorClasses), current);
      } else if (Object.hasOwn(simple, block.type)) {
        const section = descend("mj-section", block.props, ancestorClasses);
        for (const slot of simple[block.type]) {
          found = visit(
            block.props[slot],
            descend(
              "mj-column",
              {
                mjClass: block.props[`${slot}MjClass`],
                mjmlAttributes: block.props[`${slot}Attributes`],
              },
              section,
            ),
            current,
          );
          if (found) break;
        }
      }
      if (found) return found;
    }
    return undefined;
  };
  return visit(settings.sections, body);
}

/** Mounted only by the selected intrinsic Image's public resolveFields hook. */
export function IntrinsicImageSourceField(props: React.ComponentProps<typeof ImageSourceField>) {
  const data = usePuck((state) => state.appState.data);
  const selectedId = usePuck((state) => state.selectedItem?.props.id);
  const settings = (data.root.props ?? {}) as EmailSettings;
  const validation = useMemo(() => {
    try {
      return {
        context: createNativeContext(settings, {
          allowRawHtml: true,
          allowLocalImages: props.allowLocalImages,
        }),
      };
    } catch (cause) {
      return { error: cause instanceof Error ? cause.message : "Invalid native head settings" };
    }
  }, [
    settings.fontFamily,
    settings.attributeDefaults,
    settings.componentDefaults,
    settings.mjmlClasses,
    props.allowLocalImages,
  ]);
  return (
    <ImageSourceField
      {...props}
      validationError={validation.error}
      validateSource={(src, kind) => {
        if (!validation.context) throw new Error(validation.error);
        if (!selectedId) return;
        const context = validation.context;
        const owner = owningScope(data as EmailDocument, selectedId, context);
        if (owner)
          preflightIntrinsicImage(
            owner.block,
            selectedId,
            src,
            kind === "input"
              ? undefined
              : {
                  nativeContext: context,
                  ancestorClasses: owner.ancestorClasses,
                  allowLocalImages: props.allowLocalImages,
                },
          );
      }}
    />
  );
}
