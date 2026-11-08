import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { emailTemplates } from "./registry";
import { templateManifest } from "./manifest";
import { createEmptyDocument, createExampleDocument } from "../document";
import { createMatteProductUpdateDocument } from "./matte";
import { canonicalManifest, templateInventory } from "../../tests/template-inventory";

const canonicalFiles = readdirSync(new URL("../../templates/", import.meta.url), {
  recursive: true,
  encoding: "utf8",
})
  .filter((file) => file.endsWith(".mjml"))
  .map((file) => file.replaceAll("\\", "/"))
  .sort();

describe("template provenance", () => {
  it("pins the complete upstream inventory, excluding theme and font helpers", () => {
    expect(templateManifest.repository).toBe("https://github.com/resend/react-email");
    expect(templateManifest.ref).toBe("674d8ec2804b86be5d99156383fb1810179847bf");
    expect(templateManifest.license).toBe("MIT");
    expect(templateManifest).toEqual(canonicalManifest);
    expect(new Set(templateManifest.templates.map(({ file }) => file)).size).toBe(
      templateInventory.length,
    );
    expect(new Set(templateManifest.templates.map(({ id }) => id)).size).toBe(
      templateInventory.length,
    );
    for (const entry of templateManifest.templates) {
      expect(entry.file).not.toMatch(/(?:fonts|theme)\.mjml$/);
      expect(entry.upstreamBlob).toMatch(/^[\da-f]{40}$/);
      expect(entry.upstreamPath).toBe(`apps/demo/emails/${entry.file.replace(/\.mjml$/, ".tsx")}`);
      expect(entry.id).toBe(entry.file.replace(/\.mjml$/, "").toLowerCase());
    }
  });

  it("registers exactly the canonical files present, without placeholder emails", () => {
    const available = emailTemplates.filter(({ id }) => id !== "blank");
    expect(
      available.map(({ sourcePath }) => sourcePath!.replace(/^templates\//, "")).sort(),
    ).toEqual(canonicalFiles);
    expect(canonicalFiles).toHaveLength(templateInventory.length);
    expect(emailTemplates).toHaveLength(templateInventory.length + 1);
    expect(canonicalFiles).toEqual(templateManifest.templates.map(({ file }) => file).sort());
    for (const template of available) {
      expect(template.source).toBe(
        readFileSync(new URL(`../../${template.sourcePath}`, import.meta.url), "utf8"),
      );
      expect(template.upstreamUrl).toContain(`/blob/${templateManifest.ref}/apps/demo/emails/`);
      expect(template.source).toContain(template.upstreamUrl);
      for (const [tag] of template.source!.matchAll(
        /<mj(?:ml|-[\w-]+)\b(?:[^"'>]|"[^"]*"|'[^']*')*>/g,
      )) {
        const attributes = [...tag.matchAll(/\b([\w:-]+)\s*=\s*(?:"[^"]*"|'[^']*')/g)].map(
          (match) => match[1],
        );
        expect(
          new Set(attributes).size,
          `${template.sourcePath}: duplicate XML attributes in ${tag}`,
        ).toBe(attributes.length);
      }
    }
  });
});

describe("template registry", () => {
  it("lists only real emails and the blank document, with unique ids and labels", () => {
    expect(emailTemplates).toHaveLength(canonicalFiles.length + 1);
    expect(emailTemplates[0].id).toBe("blank");
    expect(new Set(emailTemplates.map(({ id }) => id)).size).toBe(emailTemplates.length);
    for (const template of emailTemplates) {
      expect(template.id).toMatch(/^[a-z0-9/-]+$/);
      expect(template.label.length).toBeGreaterThan(0);
      expect(template.id).not.toMatch(/-fonts$/);
    }
  });

  it("keeps the public blank and example factories connected to the registry", () => {
    const blank = emailTemplates[0].create();
    expect(blank).toEqual(createEmptyDocument());
    expect(blank.content).toEqual([]);
    expect(blank.root.props!.sections).toEqual([]);
    expect(blank).not.toBe(emailTemplates[0].create());
    const example = createExampleDocument();
    expect(example).toEqual(createMatteProductUpdateDocument());
    expect(example).not.toBe(createExampleDocument());
  });
});

// Public compatibility factories stay covered without a hand-maintained list of
// template names or duplicate review logic. Their names follow create<Group><File>Document.
const adapterModules = import.meta.glob<Record<string, unknown>>(
  ["./*.ts", "!./*.test.ts", "!./test-support.ts"],
  { eager: true },
);
const adapterFactories = Object.values(adapterModules).flatMap((module) =>
  Object.entries(module).filter(
    ([name, value]) => /^create.+Document$/.test(name) && typeof value === "function",
  ),
);
it.each(adapterFactories)("%s delegates to its canonical registered source", (name, factory) => {
  const key = name.replace(/^create|Document$/g, "").toLowerCase();
  const entry = templateInventory.find(
    ({ group, file }) =>
      `${group.replace(/^\d+-/, "")}${file
        .split("/")
        .at(-1)!
        .replace(/\.mjml$/, "")}`
        .replace(/[^a-z0-9]/gi, "")
        .toLowerCase() === key,
  );
  expect(entry, `Missing canonical source for exported factory ${name}`).toBeDefined();
  const template = emailTemplates.find(({ id }) => id === entry!.id)!;
  const create = factory as () => ReturnType<typeof template.create>;
  const first = create(),
    second = create();
  expect(first).toEqual(template.create());
  expect(first).toEqual(second);
  expect(first).not.toBe(second);
});
