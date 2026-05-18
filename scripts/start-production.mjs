import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const serverRoot = path.join(repoRoot, "server");
const entryPath = path.join(serverRoot, "dist", "index.js");
const nodeCommand = process.execPath;

if (!fs.existsSync(entryPath)) {
  console.error("[production] Backend build not found. Run `npm run build:release` first.");
  process.exit(1);
}

try {
  execFileSync(nodeCommand, [entryPath], {
    cwd: serverRoot,
    env: {
      ...process.env,
      NODE_ENV: process.env.NODE_ENV || "production",
      JOINERFLOW_CONFIG_CHECK_ONLY: "true",
    },
    stdio: ["ignore", "ignore", "ignore"],
  });
} catch (error) {
  console.error("[production] Configuration check failed.");
  if (error instanceof Error && error.message) {
    console.error(error.message);
  }
  process.exit(1);
}

const child = spawn(nodeCommand, [entryPath], {
  cwd: serverRoot,
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_ENV: process.env.NODE_ENV || "production",
  },
});

const shutdown = (signal) => {
  if (!child.killed) {
    child.kill(signal);
  }
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
