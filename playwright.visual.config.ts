import { defineConfig } from "@playwright/test";

const testApiBaseUrl = "http://127.0.0.1:4100";

export default defineConfig({
  testDir: "./tests/visual",
  timeout: 45_000,
  fullyParallel: false,
  workers: 1,
  expect: {
    timeout: 10_000,
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.012,
      threshold: 0.2,
    },
  },
  snapshotPathTemplate: "{testDir}/__screenshots__/{testFilePath}/{arg}{ext}",
  use: {
    baseURL: "http://127.0.0.1:4173",
    colorScheme: "light",
    reducedMotion: "reduce",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "npm run dev:test:server",
      url: `${testApiBaseUrl}/health`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: "npm run dev:test:client",
      url: "http://127.0.0.1:4173/login",
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
