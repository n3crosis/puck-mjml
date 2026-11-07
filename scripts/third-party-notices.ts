import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import type { Plugin } from "vite";

type LicenseFile = { path: string; sha256: string; text: string };
type Override = { source: string; reason: string; files: LicenseFile[] };
type PackageNotice = {
  name: string;
  version: string;
  declaredLicense: string;
  repository?: unknown;
  modules: string[];
  licenseFiles: LicenseFile[];
  inlineNotices: LicenseFile[];
  licenseSource?: string;
  licenseSourceNote?: string;
};
type Supplement = {
  component: {
    name: string;
    version: string;
    bundlePath?: string;
    bundleSha256?: string;
    files?: { path: string; sha256: string }[];
  };
  scope: { kind: string; description: string; [key: string]: unknown };
  packages: {
    name: string;
    version: string;
    licenseFiles: LicenseFile[];
    sourceNotices?: LicenseFile[];
  }[];
  gaps: { name: string; version?: string; reason: string }[];
};

export const sha256 = (text: string | Buffer) => createHash("sha256").update(text).digest("hex");
const slash = (path: string) => path.replaceAll("\\", "/");
const readJson = (path: string) => JSON.parse(readFileSync(path, "utf8"));

function packageRoot(file: string): string | undefined {
  for (let directory = dirname(file); ; directory = dirname(directory)) {
    const manifest = join(directory, "package.json");
    if (existsSync(manifest)) {
      const metadata = readJson(manifest);
      if (metadata.name && metadata.version) return directory;
    }
    if (dirname(directory) === directory) return undefined;
  }
}

function checkLicenseFiles(files: LicenseFile[], identity: string) {
  if (!files.length)
    throw new Error(`Missing license text for ${identity}; audit it before distributing.`);
  for (const file of files) {
    if (!file.text.trim() || sha256(file.text) !== file.sha256) {
      throw new Error(`Invalid license text/hash for ${identity}: ${file.path}`);
    }
  }
}

/** Uses rendered module IDs, not the dependency list or devDependency classification. */
export function collectPackageNotices(moduleIds: string[], root: string) {
  const overrides: Record<string, Override> = readJson(
    join(root, "docs/third-party/license-overrides.json"),
  );
  const packages = new Map<string, PackageNotice>();
  const roots = new Map<string, string>();
  for (const id of [...new Set(moduleIds)].sort()) {
    const file = id.replace(/^\0/, "").split("?")[0];
    if (!isAbsolute(file) || !slash(file).includes("/node_modules/") || !existsSync(file)) continue;
    const directory = packageRoot(file);
    if (!directory) throw new Error(`Cannot identify bundled dependency: ${file}`);
    const metadata = readJson(join(directory, "package.json"));
    const identity = `${metadata.name}@${metadata.version}`;
    let notice = packages.get(identity);
    if (!notice) {
      const licenseFiles = readdirSync(directory)
        .filter(
          (name) =>
            /^(licen[sc]e|copying|notice)(\b|[._-])/i.test(name) &&
            statSync(join(directory, name)).isFile(),
        )
        .sort()
        .map((path) => {
          const text = readFileSync(join(directory, path), "utf8");
          return { path, sha256: sha256(text), text };
        });
      const fallback = licenseFiles.length ? undefined : overrides[identity];
      const verifiedFiles = fallback?.files ?? licenseFiles;
      checkLicenseFiles(verifiedFiles, identity);
      notice = {
        name: metadata.name,
        version: metadata.version,
        declaredLicense: metadata.license ?? "Not declared",
        repository: metadata.repository,
        modules: [],
        licenseFiles: verifiedFiles,
        inlineNotices: [],
        ...(fallback ? { licenseSource: fallback.source, licenseSourceNote: fallback.reason } : {}),
      };
      packages.set(identity, notice);
      roots.set(identity, directory);
    }
    const modulePath = slash(relative(directory, file));
    if (!notice.modules.includes(modulePath)) notice.modules.push(modulePath);
    if (/\.(?:[cm]?js|css)$/.test(file)) {
      const source = readFileSync(file, "utf8");
      for (const comment of source.match(/\/\*[\s\S]*?\*\//g) ?? []) {
        if (!/copyright|@license|@preserve|SPDX-License-Identifier|^\/\*!/i.test(comment)) continue;
        const digest = sha256(comment);
        if (!notice.inlineNotices.some((entry) => entry.sha256 === digest)) {
          notice.inlineNotices.push({ path: modulePath, sha256: digest, text: comment });
        }
      }
    }
  }
  for (const notice of packages.values()) {
    notice.modules.sort();
    notice.inlineNotices.sort((a, b) => a.sha256.localeCompare(b.sha256));
  }
  return {
    packages: [...packages.values()].sort((a, b) =>
      `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`),
    ),
    roots,
  };
}

function collectSupplements(root: string, notices: ReturnType<typeof collectPackageNotices>) {
  const result: { file: string; manifest: Supplement; source: string }[] = [];
  for (const file of ["mjml-browser.json", "puck-core.json", "object-hash.json"]) {
    const source = readFileSync(join(root, "docs/third-party", file), "utf8");
    const manifest: Supplement = JSON.parse(source);
    const { component } = manifest;
    const identity = `${component.name}@${component.version}`;
    const dependency = notices.packages.find((entry) => entry.name === component.name);
    if (!dependency) continue;
    if (dependency.version !== component.version)
      throw new Error(`Re-audit embedded licenses after updating ${component.name}`);
    const files = component.files ?? [
      {
        path: component.bundlePath!.replace(`node_modules/${component.name}/`, ""),
        sha256: component.bundleSha256!,
      },
    ];
    if (!files.some((entry) => dependency.modules.includes(entry.path))) continue;
    for (const entry of files) {
      if (sha256(readFileSync(join(notices.roots.get(identity)!, entry.path))) !== entry.sha256) {
        throw new Error(`Re-audit changed embedded dependency bundle ${identity}/${entry.path}`);
      }
    }
    for (const entry of manifest.packages) {
      const documentedGap = manifest.gaps.some(
        (gap) => gap.name === entry.name && gap.version === entry.version,
      );
      if (entry.licenseFiles.length || !documentedGap)
        checkLicenseFiles(entry.licenseFiles, `${entry.name}@${entry.version}`);
      if (entry.sourceNotices?.length)
        checkLicenseFiles(entry.sourceNotices, `${entry.name}@${entry.version} source notices`);
    }
    result.push({ file, manifest, source });
  }
  return result;
}

export function thirdPartyNotices(): Plugin {
  let root: string;
  let build: string;
  return {
    name: "puck-mjml-third-party-notices",
    apply: "build",
    configResolved(config) {
      root = resolve(config.root);
      build = config.mode === "demo" ? "demo" : "library";
    },
    generateBundle(_options, bundle) {
      const ids = Object.values(bundle).flatMap((entry) =>
        entry.type === "chunk" ? Object.keys(entry.modules) : [],
      );
      const notices = collectPackageNotices(ids, root);
      const supplements = collectSupplements(root, notices);
      for (const supplement of supplements) {
        for (const gap of supplement.manifest.gaps)
          this.warn(
            `Documented upstream license audit gap (${supplement.file}): ${gap.name}: ${gap.reason}`,
          );
      }
      const externalModules = [...this.getModuleIds()]
        .filter((id) => this.getModuleInfo(id)?.isExternal)
        .sort();
      const manifest = {
        schemaVersion: 1,
        build,
        scope:
          "Packages represented by rendered JavaScript/CSS/metadata modules. Separate supplements document prebundled upstream code; see their limits. Host-supplied external modules are not bundled.",
        externalModules,
        packages: notices.packages,
        supplements: supplements.map(({ file, manifest }) => ({
          file: `third-party/${file}`,
          scope: manifest.scope,
          gaps: manifest.gaps,
        })),
      };
      let text = `Third-party licenses: ${build}\n\n${manifest.scope}\n\n`;
      for (const notice of notices.packages) {
        text += `\n${"=".repeat(72)}\n${notice.name}@${notice.version} (${notice.declaredLicense})\n`;
        if (notice.licenseSource)
          text += `Source: ${notice.licenseSource}\n${notice.licenseSourceNote}\n`;
        for (const license of [...notice.licenseFiles, ...notice.inlineNotices])
          text += `\n--- ${license.path} ---\n${license.text}\n`;
      }
      for (const supplement of supplements) {
        text += `\n${"=".repeat(72)}\nSupplement: ${supplement.file}\n${JSON.stringify(supplement.manifest.scope, null, 2)}\n`;
        if (supplement.manifest.gaps.length)
          text += `Audit limitations: ${JSON.stringify(supplement.manifest.gaps)}\n`;
        for (const entry of supplement.manifest.packages) {
          text += `\n--- ${entry.name}@${entry.version} ---\n`;
          for (const license of [...entry.licenseFiles, ...(entry.sourceNotices ?? [])])
            text += `\n${license.path}\n${license.text}\n`;
        }
        this.emitFile({
          type: "asset",
          fileName: `third-party/${supplement.file}`,
          source: supplement.source,
        });
      }
      this.emitFile({
        type: "asset",
        fileName: "THIRD_PARTY_LICENSES.json",
        source: `${JSON.stringify(manifest, null, 2)}\n`,
      });
      this.emitFile({ type: "asset", fileName: "THIRD_PARTY_LICENSES.txt", source: text });
      this.emitFile({
        type: "asset",
        fileName: "THIRD_PARTY_NOTICES.md",
        source: readFileSync(join(root, "THIRD_PARTY_NOTICES.md"), "utf8"),
      });
    },
  };
}
