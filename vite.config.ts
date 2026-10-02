import { defineConfig, loadEnv } from "vite";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { resolve } from "node:path";

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), "MAGICBOX_"), ...process.env };
  return {
    root: "demo",
    envDir: ".",
    esbuild: { jsx: "automatic" },
    plugins: [
      {
        name: "local-inference-assets",
        configureServer(server) {
          for (const [mount, directory, allowed] of [
            [
              "/model",
              env.MAGICBOX_MODEL_DIR,
              ["/config.json", "/model.safetensors", "/tokenizer/tokenizer.json"],
            ],
            [
              "/runtime",
              env.MAGICBOX_RUNTIME_DIR,
              ["/minifield_web_demo.js", "/minifield_web_demo_bg.wasm"],
            ],
          ] as const) {
            if (!directory) continue;
            server.middlewares.use(mount, async (request, response, next) => {
              const path = request.url?.split("?")[0];
              if (!path || !allowed.some((file) => file === path)) return next();
              try {
                const file = resolve(directory, `.${path}`);
                const info = await stat(file);
                response.setHeader("Content-Length", info.size);
                response.setHeader(
                  "Content-Type",
                  path.endsWith(".wasm")
                    ? "application/wasm"
                    : path.endsWith(".js")
                      ? "text/javascript"
                      : path.endsWith(".json")
                        ? "application/json"
                        : "application/octet-stream",
                );
                const stream = createReadStream(file);
                stream.on("error", () => response.destroy());
                response.on("close", () => stream.destroy());
                stream.pipe(response);
              } catch {
                response.statusCode = 404;
                response.end("Asset not found");
              }
            });
          }
        },
      },
    ],
    build: { outDir: "../demo-dist", emptyOutDir: true },
  };
});
