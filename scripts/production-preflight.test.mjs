import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  checkAiConfig,
  checkEnv,
  checkFiles,
  checkStorage,
  isGoogleWebClientId,
  isHttpsOrigin,
  loadProductionEnv,
  parseDotEnv,
  runProductionPreflight,
} from "./production-preflight.mjs";

const tempRoots = [];

function makeTempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "joinerflow-production-preflight-"));
  tempRoots.push(root);
  return root;
}

function writeFile(filePath, content = "") {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function resultByLabel(results, label) {
  return results.find((result) => result.label === label);
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("production preflight contracts", () => {
  test("parses production env files predictably and applies local override order", () => {
    const root = makeTempRoot();
    const serverDirectory = path.join(root, "server");
    writeFile(path.join(root, ".env"), [
      "# ignored",
      "NODE_ENV=development",
      "PUBLIC_API_ORIGIN=https://from-root.example.com",
      "AUTH_SESSION_SECRET='quoted-secret'",
    ].join("\n"));
    writeFile(path.join(serverDirectory, ".env.local"), [
      "NODE_ENV=production",
      "PUBLIC_API_ORIGIN=\"https://crm.example.com\"",
    ].join("\n"));

    expect(parseDotEnv(path.join(root, ".env"))).toMatchObject({
      NODE_ENV: "development",
      PUBLIC_API_ORIGIN: "https://from-root.example.com",
      AUTH_SESSION_SECRET: "quoted-secret",
    });
    expect(loadProductionEnv({ root, serverDirectory })).toMatchObject({
      NODE_ENV: "production",
      PUBLIC_API_ORIGIN: "https://crm.example.com",
      AUTH_SESSION_SECRET: "quoted-secret",
    });
  });

  test("validates production origin and Google web client ID formats", () => {
    expect(isHttpsOrigin("https://crm.example.com")).toBe(true);
    expect(isHttpsOrigin("https://crm.example.com/")).toBe(true);
    expect(isHttpsOrigin("http://crm.example.com")).toBe(false);
    expect(isHttpsOrigin("https://crm.example.com/app")).toBe(false);
    expect(isGoogleWebClientId("client.apps.googleusercontent.com")).toBe(true);
    expect(isGoogleWebClientId("client.googleusercontent.com")).toBe(false);
  });

  test("reports missing or unsafe production environment values explicitly", () => {
    const results = [];
    checkEnv(results, {
      NODE_ENV: "development",
      DATABASE_DRIVER: "sqlite",
      PUBLIC_API_ORIGIN: "",
      GOOGLE_CLIENT_ID: "client.apps.googleusercontent.com",
      AUTH_SESSION_SECRET: "short",
      AUTH_BOOTSTRAP_ADMIN_EMAILS: "admin@example.test",
      SQLITE_PATH: "./filesystem/joinerflow.sqlite",
      FILESYSTEM_ROOT: "./filesystem",
      TIMECLOCK_KIOSK_KEY: "",
      QDRANT_URL: "http://qdrant:6333",
      ENABLE_TEST_AUTH: "true",
    });

    expect(resultByLabel(results, "Environment PUBLIC_API_ORIGIN")).toMatchObject({ ok: false, detail: "missing" });
    expect(resultByLabel(results, "Environment TIMECLOCK_KIOSK_KEY")).toMatchObject({ ok: false, detail: "missing" });
    expect(resultByLabel(results, "Production mode")).toMatchObject({ ok: false, detail: "NODE_ENV=development" });
    expect(resultByLabel(results, "Public API origin")).toMatchObject({ ok: false, detail: "missing" });
    expect(resultByLabel(results, "Session secret strength")).toMatchObject({ ok: false, detail: "5 characters" });
    expect(resultByLabel(results, "Test auth disabled")).toMatchObject({ ok: false, detail: "ENABLE_TEST_AUTH=true" });
  });

  test("reports AI configuration without requiring Ollama to be online", () => {
    const enabledResults = [];
    checkAiConfig(enabledResults, {
      AI_ENABLED: "true",
      OLLAMA_BASE_URL: "not-a-url",
      OLLAMA_PRIMARY_MODEL: "",
      OLLAMA_FAST_MODEL: "gemma3:1b",
      OLLAMA_EMBED_MODEL: "nomic-embed-text",
      QDRANT_URL: "http://qdrant:6333",
    });

    expect(resultByLabel(enabledResults, "AI subsystem")).toMatchObject({ ok: true, detail: "enabled" });
    expect(resultByLabel(enabledResults, "Ollama base URL")).toMatchObject({ ok: false, detail: "not-a-url" });
    expect(resultByLabel(enabledResults, "Ollama primary model")).toMatchObject({
      ok: true,
      detail: "qwen2.5:3b-instruct-q4_K_M",
    });

    const disabledResults = [];
    checkAiConfig(disabledResults, {
      AI_ENABLED: "false",
      OLLAMA_BASE_URL: "not-a-url",
      QDRANT_URL: "http://qdrant:6333",
    });

    expect(disabledResults).toEqual([
      { ok: true, label: "AI subsystem", detail: "disabled" },
    ]);
  });

  test("requires explicit absolute live storage paths and verifies writable configured directories", () => {
    const root = makeTempRoot();
    const sqlitePath = path.join(root, "data", "joinerflow.sqlite");
    const filesystemRoot = path.join(root, "filesystem");
    const results = [];

    checkStorage(results, {
      SQLITE_PATH: sqlitePath,
      FILESYSTEM_ROOT: filesystemRoot,
      BACKUP_ROOT: path.join(root, "backups"),
      LOG_DIRECTORY: path.join(root, "logs"),
    });

    expect(resultByLabel(results, "SQLite path is absolute")).toMatchObject({ ok: true, detail: sqlitePath });
    expect(resultByLabel(results, "Filesystem root is absolute")).toMatchObject({ ok: true, detail: filesystemRoot });
    expect(resultByLabel(results, "SQLite directory")).toMatchObject({ ok: true, detail: path.dirname(sqlitePath) });
    expect(resultByLabel(results, "Filesystem root")).toMatchObject({ ok: true, detail: filesystemRoot });

    const relativeResults = [];
    checkStorage(relativeResults, {
      SQLITE_PATH: "./filesystem/joinerflow.sqlite",
      FILESYSTEM_ROOT: "./filesystem",
    });
    expect(resultByLabel(relativeResults, "SQLite path is absolute")).toMatchObject({ ok: false });
    expect(resultByLabel(relativeResults, "Filesystem root is absolute")).toMatchObject({ ok: false });
  });

  test("can run file, env, and storage checks without invoking server startup", () => {
    const root = makeTempRoot();
    const serverDirectory = path.join(root, "server");
    writeFile(path.join(root, "package.json"), "{}\n");
    writeFile(path.join(root, "client", "dist", "index.html"), "<html></html>");
    writeFile(path.join(root, "clock-client", "dist", "index.html"), "<html></html>");
    writeFile(path.join(serverDirectory, "dist", "index.js"), "console.log('server');\n");

    const envValues = {
      NODE_ENV: "production",
      DATABASE_DRIVER: "sqlite",
      PUBLIC_API_ORIGIN: "https://crm.example.com",
      GOOGLE_CLIENT_ID: "client.apps.googleusercontent.com",
      AUTH_SESSION_SECRET: "a".repeat(32),
      AUTH_BOOTSTRAP_ADMIN_EMAILS: "admin@example.test",
      SQLITE_PATH: path.join(root, "data", "joinerflow.sqlite"),
      FILESYSTEM_ROOT: path.join(root, "filesystem"),
      TIMECLOCK_KIOSK_KEY: "timeclock-key",
      QDRANT_URL: "http://qdrant:6333",
    };
    const results = runProductionPreflight({
      envValues,
      includeServerConfig: false,
      fileOptions: { root, serverDirectory },
    });

    expect(results.filter((result) => !result.ok)).toEqual([]);

    const missingFileResults = [];
    checkFiles(missingFileResults, { root: makeTempRoot(), serverDirectory: path.join(root, "missing-server") });
    expect(missingFileResults.some((result) => !result.ok)).toBe(true);
  });
});
