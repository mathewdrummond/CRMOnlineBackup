import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const serverRoot = path.join(repoRoot, "server");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

export const requiredEnv = [
  "NODE_ENV",
  "PUBLIC_API_ORIGIN",
  "GOOGLE_CLIENT_ID",
  "AUTH_SESSION_SECRET",
  "AUTH_BOOTSTRAP_ADMIN_EMAILS",
  "DATABASE_DRIVER",
  "FILESYSTEM_ROOT",
  "TIMECLOCK_KIOSK_KEY",
  "QDRANT_URL",
];

export function parseDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const values = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
    values[key] = value;
  }
  return values;
}

export function loadProductionEnv({
  root = repoRoot,
  serverDirectory = serverRoot,
} = {}) {
  const files = [
    path.join(root, ".env"),
    path.join(serverDirectory, ".env"),
    path.join(root, ".env.local"),
    path.join(serverDirectory, ".env.local"),
  ];
  return files.reduce((merged, filePath) => ({ ...merged, ...parseDotEnv(filePath) }), {});
}

export function run(args, options = {}) {
  return execFileSync(npmCommand, args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: options.stdio || ["ignore", "pipe", "pipe"],
    env: options.env || process.env,
  });
}

export function isGoogleWebClientId(value) {
  return /\.apps\.googleusercontent\.com$/i.test(String(value || ""));
}

export function isHttpsOrigin(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" && url.origin === String(value || "").replace(/\/$/, "") && url.pathname === "/";
  } catch {
    return false;
  }
}

export function ensureWritableDirectory(directoryPath) {
  fs.mkdirSync(directoryPath, { recursive: true });
  const probePath = path.join(directoryPath, `.joinerflow-preflight-${process.pid}.tmp`);
  fs.writeFileSync(probePath, new Date().toISOString());
  fs.rmSync(probePath, { force: true });
}

export function checkNodeVersion(results) {
  const [major, minor] = process.versions.node.split(".").map(Number);
  const ok = major > 20 || (major === 20 && minor >= 19);
  results.push({
    ok,
    label: "Node.js runtime",
    detail: ok ? `Node ${process.versions.node}` : `Node ${process.versions.node}; expected 20.19+ or 22.12+`,
  });
}

export function checkFiles(results, {
  root = repoRoot,
  serverDirectory = serverRoot,
} = {}) {
  const files = [
    ["Root package", path.join(root, "package.json")],
    ["Client build", path.join(root, "client", "dist", "index.html")],
    ["Time clock build", path.join(root, "clock-client", "dist", "index.html")],
    ["Server build", path.join(serverDirectory, "dist", "index.js")],
  ];

  files.forEach(([label, filePath]) => {
    results.push({
      ok: fs.existsSync(filePath),
      label,
      detail: path.relative(root, filePath),
    });
  });
}

export function checkEnv(results, envValues) {
  const databaseDriver = String(envValues.DATABASE_DRIVER || "sqlite").trim().toLowerCase();
  requiredEnv.forEach((key) => {
    results.push({
      ok: Boolean(String(envValues[key] || "").trim()),
      label: `Environment ${key}`,
      detail: String(envValues[key] || "").trim() ? "configured" : "missing",
    });
  });

  results.push({
    ok: envValues.NODE_ENV === "production",
    label: "Production mode",
    detail: `NODE_ENV=${envValues.NODE_ENV || ""}`,
  });
  results.push({
    ok: isHttpsOrigin(envValues.PUBLIC_API_ORIGIN),
    label: "Public API origin",
    detail: envValues.PUBLIC_API_ORIGIN || "missing",
  });
  results.push({
    ok: isGoogleWebClientId(envValues.GOOGLE_CLIENT_ID),
    label: "Google web client ID",
    detail: envValues.GOOGLE_CLIENT_ID ? "web client format" : "missing",
  });
  results.push({
    ok: String(envValues.AUTH_SESSION_SECRET || "").length >= 32,
    label: "Session secret strength",
    detail: `${String(envValues.AUTH_SESSION_SECRET || "").length} characters`,
  });
  results.push({
    ok: String(envValues.ENABLE_TEST_AUTH || "").toLowerCase() !== "true",
    label: "Test auth disabled",
    detail: `ENABLE_TEST_AUTH=${envValues.ENABLE_TEST_AUTH || ""}`,
  });
  results.push({
    ok: databaseDriver === "sqlite" || databaseDriver === "postgres",
    label: "Database driver value",
    detail: envValues.DATABASE_DRIVER || "sqlite",
  });
  if (databaseDriver === "postgres") {
    const hasDatabaseUrl = Boolean(String(envValues.DATABASE_URL || "").trim());
    const hasPgComponents = ["PGHOST", "PGPORT", "PGDATABASE", "PGUSER", "PGPASSWORD"].every((key) => Boolean(String(envValues[key] || "").trim()));
    results.push({
      ok: hasDatabaseUrl || hasPgComponents,
      label: "PostgreSQL connection settings",
      detail: hasDatabaseUrl
        ? "DATABASE_URL configured"
        : hasPgComponents
          ? "PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD configured"
          : "missing DATABASE_URL and incomplete PG* settings",
    });
    results.push({
      ok: false,
      label: "PostgreSQL primary runtime",
      detail: "Not enabled yet. Use DATABASE_DRIVER=sqlite with DATABASE_SHADOW_WRITE=true for staged parity.",
    });
  }
}

export function checkAiConfig(results, envValues) {
  const aiEnabledValue = String(envValues.AI_ENABLED ?? "true").trim().toLowerCase();
  const aiEnabled = !["0", "false", "no", "off", "disabled"].includes(aiEnabledValue);
  const ollamaBaseUrl = String(envValues.OLLAMA_BASE_URL || "http://localhost:11434").trim();
  const primaryModel = String(envValues.OLLAMA_PRIMARY_MODEL || "qwen2.5:3b-instruct-q4_K_M").trim();
  const fastModel = String(envValues.OLLAMA_FAST_MODEL || "gemma3:1b").trim();
  const embedModel = String(envValues.OLLAMA_EMBED_MODEL || "nomic-embed-text").trim();
  const qdrantUrl = String(envValues.QDRANT_URL || "http://localhost:6333").trim();
  const qdrantTimeout = Number(envValues.QDRANT_REQUEST_TIMEOUT_MS || 3000);
  const vectorQueueMax = Number(envValues.AI_VECTOR_QUEUE_MAX || 5000);
  const embedQueueMax = Number(envValues.AI_EMBED_QUEUE_MAX || 5000);
  const knowledgeQueueMax = Number(envValues.AI_KNOWLEDGE_QUEUE_MAX || 15000);

  results.push({
    ok: true,
    label: "AI subsystem",
    detail: aiEnabled ? "enabled" : "disabled",
  });

  if (!aiEnabled) {
    return;
  }

  results.push({
    ok: /^https?:\/\//i.test(ollamaBaseUrl),
    label: "Ollama base URL",
    detail: ollamaBaseUrl || "missing",
  });
  results.push({
    ok: Boolean(primaryModel),
    label: "Ollama primary model",
    detail: primaryModel || "missing",
  });
  results.push({
    ok: Boolean(fastModel),
    label: "Ollama fast model",
    detail: fastModel || "missing",
  });
  results.push({
    ok: Boolean(embedModel),
    label: "Ollama embed model",
    detail: embedModel || "missing",
  });
  results.push({
    ok: /^https?:\/\//i.test(qdrantUrl),
    label: "Qdrant URL",
    detail: qdrantUrl || "missing",
  });
  results.push({
    ok: Number.isFinite(qdrantTimeout) && qdrantTimeout > 0 && qdrantTimeout <= 60_000,
    label: "Qdrant request timeout",
    detail: `${qdrantTimeout}ms`,
  });
  results.push({
    ok: Number.isFinite(vectorQueueMax) && vectorQueueMax >= 100 && vectorQueueMax <= 50_000,
    label: "Vector queue max",
    detail: String(vectorQueueMax),
  });
  results.push({
    ok: Number.isFinite(embedQueueMax) && embedQueueMax >= 100 && embedQueueMax <= 20_000,
    label: "Embedding queue max",
    detail: String(embedQueueMax),
  });
  results.push({
    ok: Number.isFinite(knowledgeQueueMax) && knowledgeQueueMax >= 200 && knowledgeQueueMax <= 100_000,
    label: "Knowledge queue max",
    detail: String(knowledgeQueueMax),
  });
}

export function checkStorage(results, envValues) {
  const databaseDriver = String(envValues.DATABASE_DRIVER || "sqlite").trim().toLowerCase();
  const configuredPaths = [
    ["SQLite path", "SQLITE_PATH", databaseDriver === "sqlite"],
    ["Filesystem root", "FILESYSTEM_ROOT", true],
    ["Backup root", "BACKUP_ROOT", false],
    ["Log directory", "LOG_DIRECTORY", false],
  ];

  configuredPaths.forEach(([label, key, required]) => {
    const value = String(envValues[key] || "").trim();
    if (!value) {
      results.push({
        ok: !required,
        label,
        detail: required ? `${key} is required before storage can be checked` : `${key} not set; server default will be used`,
      });
      return;
    }

    const resolvedValue = path.resolve(value);
    results.push({
      ok: required ? path.isAbsolute(value) : true,
      label: required ? `${label} is absolute` : `${label} path`,
      detail: required || path.isAbsolute(value) ? value : `${value} -> ${resolvedValue}`,
    });
  });

  if (!envValues.FILESYSTEM_ROOT) {
    return;
  }

  const storageChecks = [["Filesystem root", path.resolve(String(envValues.FILESYSTEM_ROOT))]];
  if (databaseDriver === "sqlite" && envValues.SQLITE_PATH) {
    storageChecks.unshift(["SQLite directory", path.dirname(path.resolve(String(envValues.SQLITE_PATH)))]);
  }

  if (envValues.BACKUP_ROOT) {
    storageChecks.push(["Backup root", path.resolve(String(envValues.BACKUP_ROOT))]);
  }

  if (envValues.LOG_DIRECTORY) {
    storageChecks.push(["Log directory", path.resolve(String(envValues.LOG_DIRECTORY))]);
  }

  storageChecks.forEach(([label, directoryPath]) => {
    try {
      ensureWritableDirectory(directoryPath);
      results.push({ ok: true, label, detail: directoryPath });
    } catch (error) {
      results.push({ ok: false, label, detail: error instanceof Error ? error.message : String(error) });
    }
  });
}

export function checkServerConfig(results, envValues) {
  try {
    run(["run", "check:prod"], {
      env: {
        ...process.env,
        ...envValues,
        NODE_ENV: "production",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    results.push({ ok: true, label: "Server production config", detail: "check:prod passed" });
  } catch (error) {
    const stderr = String(error?.stderr || error?.message || "").trim();
    results.push({ ok: false, label: "Server production config", detail: stderr || "check:prod failed" });
  }
}

export function printResults(results) {
  const failed = results.filter((result) => !result.ok);
  console.log("JoinerFlow production preflight");
  console.log(`Platform: ${process.platform} ${os.release()}`);
  console.log("");
  results.forEach((result) => {
    console.log(`${result.ok ? "OK " : "FAIL"} ${result.label}: ${result.detail}`);
  });
  console.log("");
  if (failed.length > 0) {
    console.error(`${failed.length} production preflight check(s) failed.`);
    process.exit(1);
  }
  console.log("Production preflight passed.");
}

export function runProductionPreflight({
  envValues = {
    ...loadProductionEnv(),
    ...process.env,
  },
  includeServerConfig = true,
  fileOptions = {},
} = {}) {
  const results = [];
  checkNodeVersion(results);
  checkFiles(results, fileOptions);
  checkEnv(results, envValues);
  checkAiConfig(results, envValues);
  checkStorage(results, envValues);
  if (includeServerConfig) {
    checkServerConfig(results, envValues);
  }
  return results;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  printResults(runProductionPreflight());
}
