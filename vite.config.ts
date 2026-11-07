import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ command, mode }) => ({
  plugins: [react()],
  build:
    command === "build" && mode === "demo"
      ? { outDir: "demo-dist" }
      : command === "build"
        ? {
            lib: {
              entry: "src/index.ts",
              name: "PuckMjml",
              formats: ["es", "cjs"],
              cssFileName: "style",
              fileName: (format) => (format === "es" ? "index.js" : "index.cjs"),
            },
            rollupOptions: {
              external: ["react", "react-dom", "react/jsx-runtime", "@puckeditor/core"],
              output: { globals: { react: "React", "react-dom": "ReactDOM" } },
            },
            cssCodeSplit: false,
          }
        : undefined,
}));
