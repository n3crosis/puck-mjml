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

  it.each([true, "true", false, "", undefined])(
    "shows the Tailwind URL only when its runtime is enabled (%s)",
    async (tailwind) => {
      const root = createEmailConfig(undefined, true).root!;
      const fields = root.fields!;
      const props = {
        ...root.defaultProps,
        tailwind,
        tailwindScriptUrl: "https://example.com/tailwind.js",
      };
      const resolved = await root.resolveFields!({ props }, context(fields));
      expect(resolved.tailwindScriptUrl.visible).toBe(tailwind === true || tailwind === "true");
      expect(resolved.bodyAttributes).toBe(fields.bodyAttributes);
      expect(resolved.attributeDefaults).toBe(fields.attributeDefaults);
      expect(resolved.rawHead).toBe(fields.rawHead);
      expect(fields.tailwindScriptUrl.visible).toBeUndefined();
      expect(props.tailwindScriptUrl).toBe("https://example.com/tailwind.js");
    },
  );
});
