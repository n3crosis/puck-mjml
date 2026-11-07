import type { AppState, ComponentConfig, Config } from "@puckeditor/core";
import { describe, expect, it } from "vitest";
import { createEmailConfig } from "./config";

type ResolveContext = Parameters<NonNullable<ComponentConfig["resolveFields"]>>[1];

function context(fields: NonNullable<Config["components"][string]["fields"]>): ResolveContext {
  return {
    changed: {},
    fields: fields as ResolveContext["fields"],
    lastFields: fields as ResolveContext["fields"],
    lastData: null,
    metadata: {},
    appState: { data: { root: { props: {} }, content: [] } } as unknown as AppState,
    parent: null,
  };
}

describe("conditional editor fields", () => {
  it("switches the hero height control without mutating fields, values, or native controls", async () => {
    const hero = createEmailConfig().components.Hero;
    const fields = hero.fields!;
    const props = { ...hero.defaultProps, id: "hero", height: 340 };
    const fluid = await hero.resolveFields!(
      { props: { ...props, mode: "fluid-height" } },
      context(fields),
    );
    expect(fluid.height.visible).toBe(false);
    expect(fluid.mjmlAttributes).toBe(fields.mjmlAttributes);
    expect(fluid.mjClass).toBe(fields.mjClass);
    expect(fluid.backgroundWidth.visible).not.toBe(false);
    expect(fluid.backgroundHeight.visible).not.toBe(false);
    expect(fields.height.visible).toBeUndefined();

    const fixed = await hero.resolveFields!(
      { props: { ...props, mode: "fixed-height" } },
      context(fields),
    );
    expect(fixed.height.visible).toBe(true);
    expect(Object.keys(fixed)).toEqual(Object.keys(fluid));
    expect(props.height).toBe(340);
  });

  it("keeps runtime script authorization outside document fields", () => {
    const root = createEmailConfig(undefined, true).root!;
    expect(root.fields!.tailwind).toBeDefined();
    expect(root.fields!.tailwindScriptUrl).toBeUndefined();
  });
});
