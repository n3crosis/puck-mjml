import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { thirdPartyNotices } from "./scripts/third-party-notices";

export default defineConfig(({ command, mode }) => ({
  plugins: [react(), thirdPartyNotices()],
  test: { exclude: ["tests/browser/**", "node_modules/**", "dist/**", "demo-dist/**"] },
  build:
    command === "build" && mode === "demo"
      ? { outDir: "demo-dist" }
      : command === "build"
        ? {
            lib: {
              entry: { index: "src/index.ts", core: "src/core.ts" },
              name: "PuckMjml",
              formats: ["es", "cjs"],
              cssFileName: "style",
              fileName: (format, entryName) => `${entryName}.${format === "es" ? "js" : "cjs"}`,
            },
            rollupOptions: {
              external: ["react", "react-dom", "react/jsx-runtime", "@puckeditor/core"],
              output: { globals: { react: "React", "react-dom": "ReactDOM" } },
            },
            cssCodeSplit: false,
          }
        : undefined,
}));
