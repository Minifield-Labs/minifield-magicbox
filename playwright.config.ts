import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: true,
  workers: 2,
  reporter: [["list"], ["json", { outputFile: ".local/browser-report.json" }]],
  use: {
    baseURL: "http://127.0.0.1:4327",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 900 },
        ...(process.env.CHROME_BIN
          ? { launchOptions: { executablePath: process.env.CHROME_BIN } }
          : {}),
      },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"], viewport: { width: 1280, height: 900 } },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"], viewport: { width: 1280, height: 900 } },
    },
  ],
  webServer: {
    command: "npm run dev",
    env: { VITE_MAGICBOX_DEMO: "sample" },
    url: "http://127.0.0.1:4327",
    reuseExistingServer: !process.env.CI,
  },
});
