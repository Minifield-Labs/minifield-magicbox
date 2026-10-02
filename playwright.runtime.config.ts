import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/runtime",
  workers: 1,
  timeout: 180_000,
  outputDir: ".local/runtime-test-results",
  reporter: [["list"], ["json", { outputFile: ".local/runtime-report.json" }]],
  use: {
    baseURL: "http://127.0.0.1:4337",
    viewport: { width: 1280, height: 900 },
    launchOptions: process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : {},
  },
  webServer: {
    command: "npm run dev -- --port 4337",
    url: "http://127.0.0.1:4337",
    env: { VITE_MAGICBOX_DEMO: "runtime" },
  },
});
