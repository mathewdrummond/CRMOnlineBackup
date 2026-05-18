import path from "node:path";
import { defineConfig } from "vitest/config";

const clientTestFiles = ["client/src/**/*.test.{js,jsx,ts,tsx}"];
const nodeTestFiles = ["server/src/**/*.test.{js,ts}", "scripts/**/*.test.mjs"];
const testExclude = [
  "**/node_modules/**",
  "**/dist/**",
  "joinerflow-source/**",
  "clock-client/dist/**",
];
const alias = {
  "@": path.resolve(__dirname, "client/src"),
};

export default defineConfig({
  resolve: {
    alias,
  },
  test: {
    projects: [
      {
        resolve: {
          alias,
        },
        test: {
          name: "client",
          globals: true,
          environment: "jsdom",
          setupFiles: ["./vitest.setup.ts"],
          include: clientTestFiles,
          exclude: testExclude,
        },
      },
      {
        resolve: {
          alias,
        },
        test: {
          name: "node",
          globals: true,
          environment: "node",
          setupFiles: ["./vitest.setup.ts"],
          include: nodeTestFiles,
          exclude: testExclude,
        },
      },
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      reportsDirectory: "./coverage",
      exclude: [
        "**/node_modules/**",
        "**/dist/**",
        "**/coverage/**",
        "joinerflow-source/**",
        "client/dist/**",
        "clock-client/dist/**",
        "server/dist/**",
        "tests/**",
        "playwright.config.ts",
        "client/postcss.config.js",
        "clock-client/postcss.config.js",
        "joinerflow-source/postcss.config.js",
        "client/tailwind.config.js",
        "clock-client/tailwind.config.cjs",
        "joinerflow-source/tailwind.config.js",
        "prisma/**",
      ],
    },
  },
});
