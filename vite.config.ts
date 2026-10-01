import { defineConfig } from "vite";

export default defineConfig({
  root: "demo",
  esbuild: { jsx: "automatic" },
  build: { outDir: "../demo-dist", emptyOutDir: true },
});
