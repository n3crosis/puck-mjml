import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { thirdPartyNotices } from "./scripts/third-party-notices.ts";

export default defineConfig(({ command, mode }) => ({
  plugins: [react(), thirdPartyNotices()],
  test: {
    setupFiles: ["./tests/happy-dom-fonts.setup.ts"],
    // The compiler and real-editor suites are memory-heavy. Bound concurrent
    // forks instead of letting high-core machines terminate test workers.
    maxWorkers: 2,
    // Real editor mounts and compiler fixtures are functional checks, not
    // latency benchmarks. Allow bounded headroom on shared CI runners so a
    // timeout does not interrupt React act and contaminate subsequent cases.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Reference-rendering tools have their own isolated dependencies/cache.
    // Retain Vitest's recursive defaults so their package tests never run here.
    exclude: [
      ...configDefaults.exclude,
      "tests/browser/**",
      "dist/**",
      "demo-dist/**",
      "**/.cache/**",
    ],
  },
  build:
    command === "build" && mode === "demo"
      ? { outDir: "demo-dist" }
      : command === "build"
        ? {
            lib: {
              entry: { index: "src/index.ts", core: "src/core.ts" },
              formats: ["es", "cjs"],
              cssFileName: "style",
              fileName: (format, entryName) => `${entryName}.${format === "es" ? "js" : "cjs"}`,
            },
            rolldownOptions: {
              external: [
                "react",
                "react-dom",
                "react/jsx-runtime",
                "@puckeditor/core",
                "@tiptap/extension-bold",
                "@tiptap/extension-link",
              ],
            },
            cssCodeSplit: false,
          }
        : undefined,
}));
