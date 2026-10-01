import { build } from "esbuild";
import { copyFile, mkdir, rm } from "node:fs/promises";

await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });
await build({
  entryPoints: [
    "src/index.ts",
    "src/magicbox.tsx",
    "src/use-magicbox.ts",
    "src/headless.ts",
    "src/spans.ts",
  ],
  outdir: "dist",
  format: "esm",
  platform: "neutral",
  target: "es2022",
  jsx: "automatic",
  sourcemap: true,
});
await copyFile("src/styles.css", "dist/styles.css");
