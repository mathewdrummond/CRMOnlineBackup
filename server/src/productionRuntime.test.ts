import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeAll, describe, expect, test } from "vitest";

let createApp: typeof import("./index")["createApp"];
let closeDatabase: typeof import("./db")["closeDatabase"];
let tempRoot = "";

const originalEnv = {
  NODE_ENV: process.env.NODE_ENV,
  ENABLE_TEST_AUTH: process.env.ENABLE_TEST_AUTH,
  AUTH_SESSION_SECRET: process.env.AUTH_SESSION_SECRET,
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  AUTH_BOOTSTRAP_ADMIN_EMAILS: process.env.AUTH_BOOTSTRAP_ADMIN_EMAILS,
  PUBLIC_API_ORIGIN: process.env.PUBLIC_API_ORIGIN,
  CORS_ORIGIN: process.env.CORS_ORIGIN,
  ALLOWED_HOSTS: process.env.ALLOWED_HOSTS,
  SQLITE_PATH: process.env.SQLITE_PATH,
  FILESYSTEM_ROOT: process.env.FILESYSTEM_ROOT,
  LOG_DIRECTORY: process.env.LOG_DIRECTORY,
};

function applyProductionEnv(overrides: Record<string, string | undefined> = {}) {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "joinerflow-production-runtime-"));
  process.env.NODE_ENV = "production";
  process.env.ENABLE_TEST_AUTH = "false";
  process.env.AUTH_SESSION_SECRET = "0123456789abcdef0123456789abcdef";
  process.env.GOOGLE_CLIENT_ID = "production-google-client-id.apps.googleusercontent.com";
  process.env.AUTH_BOOTSTRAP_ADMIN_EMAILS = "owner@example.com";
  process.env.PUBLIC_API_ORIGIN = "https://crm.example.com";
  process.env.CORS_ORIGIN = "";
  process.env.ALLOWED_HOSTS = "";
  process.env.SQLITE_PATH = path.join(tempRoot, "joinerflow.sqlite");
  process.env.FILESYSTEM_ROOT = path.join(tempRoot, "filesystem");
  process.env.LOG_DIRECTORY = path.join(tempRoot, "logs");

  Object.entries(overrides).forEach(([key, value]) => {
    if (typeof value === "undefined") {
      delete process.env[key];
      return;
    }

    process.env[key] = value;
  });
}

beforeAll(async () => {
  createApp = (await import("./index")).createApp;
  closeDatabase = (await import("./db")).closeDatabase;
});

afterEach(() => {
  closeDatabase?.();
  if (tempRoot) {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
  tempRoot = "";

  Object.entries(originalEnv).forEach(([key, value]) => {
    if (typeof value === "undefined") {
      delete process.env[key];
      return;
    }

    process.env[key] = value;
  });
});

describe("production runtime validation", () => {
  test("rejects production startup when PUBLIC_API_ORIGIN is missing", async () => {
    applyProductionEnv({ PUBLIC_API_ORIGIN: undefined });

    await expect(createApp()).rejects.toThrow("PUBLIC_API_ORIGIN must be configured in production.");
  });

  test("rejects production startup when Google sign-in is not configured", async () => {
    applyProductionEnv({ GOOGLE_CLIENT_ID: "" });

    await expect(createApp()).rejects.toThrow("GOOGLE_CLIENT_ID must be configured in production.");
  });

  test("rejects production startup when PUBLIC_API_ORIGIN includes a path", async () => {
    applyProductionEnv({ PUBLIC_API_ORIGIN: "https://crm.example.com/app" });

    await expect(createApp()).rejects.toThrow(
      "PUBLIC_API_ORIGIN must be an origin only with no path, query, or hash in production."
    );
  });

  test("rejects production startup when GOOGLE_CLIENT_ID is not a web client id", async () => {
    applyProductionEnv({ GOOGLE_CLIENT_ID: "invalid-client-id" });

    await expect(createApp()).rejects.toThrow(
      "GOOGLE_CLIENT_ID must be a Google web client ID ending in .apps.googleusercontent.com."
    );
  });

  test("rejects production startup when SQLITE_PATH is not explicitly configured", async () => {
    applyProductionEnv({ SQLITE_PATH: undefined });

    await expect(createApp()).rejects.toThrow("SQLITE_PATH must be configured explicitly in production.");
  });

  test("rejects production startup when FILESYSTEM_ROOT is not explicitly configured", async () => {
    applyProductionEnv({ FILESYSTEM_ROOT: undefined });

    await expect(createApp()).rejects.toThrow("FILESYSTEM_ROOT must be configured explicitly in production.");
  });

  test("rejects production startup when CORS_ORIGIN omits the CRM public origin", async () => {
    applyProductionEnv({ CORS_ORIGIN: "https://clock.example.com" });

    await expect(createApp()).rejects.toThrow(
      "CORS_ORIGIN must include PUBLIC_API_ORIGIN when CORS_ORIGIN is configured."
    );
  });

  test("rejects production startup when no bootstrap admin or invited user exists", async () => {
    applyProductionEnv({ AUTH_BOOTSTRAP_ADMIN_EMAILS: "" });

    await expect(createApp()).rejects.toThrow("Configure AUTH_BOOTSTRAP_ADMIN_EMAILS or create an invited AppUser before starting in production.");
  });

  test("allows production startup when required auth settings are configured", async () => {
    applyProductionEnv();

    await expect(createApp()).resolves.toBeTruthy();
    expect(fs.existsSync(process.env.FILESYSTEM_ROOT || "")).toBe(true);
  });

  test("writes production logs to the configured LOG_DIRECTORY", async () => {
    applyProductionEnv();

    await expect(createApp()).resolves.toBeTruthy();
    expect(fs.existsSync(path.join(String(process.env.LOG_DIRECTORY), "app.jsonl"))).toBe(true);
  });
});
