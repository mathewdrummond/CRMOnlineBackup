import fs from "node:fs";
import { spawn } from "node:child_process";
import { formatLocalStartupSummary } from "./local-startup-contract.mjs";
import { formatStartupPreflightReport, validateLocalStartupEnvironment } from "./local-startup-preflight.mjs";
import {
  ensureRuntimeDirectory,
  getServiceLogPath,
  localServices,
  runtimeLogsDirectory,
  runtimeStatePath,
  stopManagedRuntime,
  writeRuntimeState,
} from "./local-runtime.mjs";
import { isRunning, sleep } from "./runtime-ports.mjs";

const REQUEST_TIMEOUT_MS = 5_000;
const POLL_INTERVAL_MS = 1_000;

function hasFlag(name) {
  return process.argv.slice(2).includes(name);
}

function formatCommand(service) {
  return [service.command, ...service.args].join(" ");
}

function readLogTail(logPath, maxBytes = 8_192) {
  try {
    const contents = fs.readFileSync(logPath, "utf8");
    return contents.length <= maxBytes ? contents : contents.slice(-maxBytes);
  } catch {
    return "";
  }
}

function buildStartupError(service, reason) {
  const lines = [
    `${service.label} ${reason}.`,
    `Log: ${service.logPath}`,
  ];

  const logTail = readLogTail(service.logPath).trim();
  if (logTail) {
    lines.push("Recent log output:");
    lines.push(logTail);
  }

  return new Error(lines.join("\n"));
}

function spawnService(service) {
  const logPath = getServiceLogPath(service.id);
  const header = [
    `[launcher] ${new Date().toISOString()} starting ${service.label}`,
    `[launcher] command: ${formatCommand(service)}`,
    "",
  ].join("\n");

  fs.writeFileSync(logPath, header, "utf8");

  const logDescriptor = fs.openSync(logPath, "a");

  try {
    const child = spawn(service.command, service.args, {
      cwd: service.cwd,
      env: {
        ...process.env,
        ...service.env,
        FORCE_COLOR: "0",
        NO_COLOR: "1",
      },
      detached: true,
      windowsHide: true,
      stdio: ["ignore", logDescriptor, logDescriptor],
    });

    if (!child.pid) {
      throw new Error(`Failed to start ${service.label}.`);
    }

    child.unref();

    return {
      ...service,
      pid: child.pid,
      logPath,
    };
  } finally {
    fs.closeSync(logDescriptor);
  }
}

async function isServiceReady(service) {
  try {
    const response = await fetch(service.readiness.url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        "Cache-Control": "no-store",
      },
    });

    if (!response.ok) {
      return false;
    }

    if (service.readiness.type === "json") {
      const payload = await response.json().catch(() => null);
      return payload?.status === "ok";
    }

    return true;
  } catch {
    return false;
  }
}

async function waitForServiceReady(service) {
  const deadline = Date.now() + Number(service.readiness.timeoutMs || 60_000);

  while (Date.now() < deadline) {
    if (!isRunning(service.pid)) {
      throw buildStartupError(service, "exited before it became ready");
    }

    if (await isServiceReady(service)) {
      return;
    }

    await sleep(POLL_INTERVAL_MS);
  }

  throw buildStartupError(service, "did not become ready before timeout");
}

async function main() {
  console.log("[startup] Preparing local JoinerFlow services");
  const preflight = validateLocalStartupEnvironment();
  if (!preflight.ok) {
    throw new Error(formatStartupPreflightReport(preflight));
  }

  if (preflight.warnings.length > 0) {
    console.warn(formatStartupPreflightReport({ warnings: preflight.warnings }));
  }

  if (hasFlag("--check")) {
    console.log("[startup] Startup preflight passed.");
    for (const line of formatLocalStartupSummary({ logsDirectory: runtimeLogsDirectory }).split("\n")) {
      console.log(`[startup] ${line}`);
    }
    return;
  }

  ensureRuntimeDirectory();
  await stopManagedRuntime("[startup]");

  const startedServices = [];

  try {
    for (const service of localServices) {
      console.log(`[startup] Starting ${service.label} on ${service.url}`);
      startedServices.push(spawnService(service));
    }

    writeRuntimeState({
      version: 1,
      started_at: new Date().toISOString(),
      runtime_state_path: runtimeStatePath,
      logs_directory: runtimeLogsDirectory,
      services: startedServices.map((service) => ({
        id: service.id,
        label: service.label,
        pid: service.pid,
        url: service.url,
        log_path: service.logPath,
        command: service.command,
        args: service.args,
        readiness_url: service.readiness.url,
      })),
    });

    console.log("[startup] Waiting for local services to become ready");
    await Promise.all(startedServices.map(waitForServiceReady));

    console.log("[startup] Local services are ready.");
    for (const line of formatLocalStartupSummary({ logsDirectory: runtimeLogsDirectory }).split("\n")) {
      console.log(`[startup] ${line}`);
    }
  } catch (error) {
    console.error("[startup] Failed to start local services.");
    console.error(error);
    await stopManagedRuntime("[startup]");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("[startup] Failed to start local services.");
  console.error(error);
  process.exit(1);
});
