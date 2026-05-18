import { defineConfig } from "@playwright/test";

const testApiBaseUrl = "http://127.0.0.1:4100";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: "http://127.0.0.1:4173",
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
