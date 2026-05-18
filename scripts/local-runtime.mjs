import fs from "node:fs";
import path from "node:path";
import {
  clearRequiredPorts,
  getProcessCommand,
  isRunning,
  sleep,
  terminateProcessTree,
  waitForRequiredPortsToClear,
} from "./runtime-ports.mjs";
export { localServices, repoRoot } from "./local-startup-contract.mjs";
import { localServices, repoRoot } from "./local-startup-contract.mjs";

export const runtimeDirectory = path.join(repoRoot, ".joinerflow-runtime");
export const runtimeLogsDirectory = path.join(runtimeDirectory, "logs");
export const runtimeStatePath = path.join(runtimeDirectory, "local-stack.json");

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function ensureRuntimeDirectory() {
  fs.mkdirSync(runtimeLogsDirectory, { recursive: true });
}

export function getServiceLogPath(serviceId) {
  return path.join(runtimeLogsDirectory, `${serviceId}.log`);
}

export function readRuntimeState() {
  if (!fs.existsSync(runtimeStatePath)) {
    return null;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(runtimeStatePath, "utf8"));
    if (!isObject(parsed)) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function writeRuntimeState(state) {
  ensureRuntimeDirectory();
  fs.writeFileSync(runtimeStatePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export function removeRuntimeState() {
  if (!fs.existsSync(runtimeStatePath)) {
    return;
  }

  fs.rmSync(runtimeStatePath, { force: true });
}

function getStateServices(state) {
  if (!Array.isArray(state?.services)) {
    return [];
  }

  return state.services.filter((service) => isObject(service));
}

function findServiceDefinition(serviceId) {
  return localServices.find((service) => service.id === serviceId) || null;
}

async function waitForManagedPidsToExit(serviceRecords, timeoutMs) {
  const trackedPids = serviceRecords
    .map((service) => Number(service.pid || 0))
    .filter((pid) => Number.isInteger(pid) && pid > 0);

  if (trackedPids.length === 0) {
    return true;
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (trackedPids.every((pid) => !isRunning(pid))) {
      return true;
    }

    await sleep(250);
  }

  return trackedPids.every((pid) => !isRunning(pid));
}

export async function stopManagedRuntime(logPrefix = "[runtime]") {
  ensureRuntimeDirectory();

  const state = readRuntimeState();
  const managedServices = getStateServices(state).reverse();

  for (const service of managedServices) {
    const pid = Number(service.pid || 0);
    if (!Number.isInteger(pid) || pid <= 0 || !isRunning(pid)) {
      continue;
    }

    const definition = findServiceDefinition(service.id);
    const commandLine = getProcessCommand(pid);

    if (definition?.commandMatch && commandLine && !commandLine.includes(definition.commandMatch)) {
      console.log(
        `${logPrefix} Skipping stale PID ${pid} for ${service.label || definition.label} because it no longer matches the managed command.`
      );
      continue;
    }

    console.log(`${logPrefix} Stopping ${service.label || definition?.label || service.id} (PID ${pid})`);
    terminateProcessTree(pid, false);
  }

  await waitForManagedPidsToExit(managedServices, 2_500);

  for (const service of managedServices) {
    const pid = Number(service.pid || 0);
    if (!Number.isInteger(pid) || pid <= 0 || !isRunning(pid)) {
      continue;
    }

    console.log(`${logPrefix} Force stopping ${service.label || service.id} (PID ${pid})`);
    terminateProcessTree(pid, true);
  }

  await waitForManagedPidsToExit(managedServices, 2_500);
  await clearRequiredPorts(logPrefix);

  const portsCleared = await waitForRequiredPortsToClear(10_000);
  removeRuntimeState();

  if (!portsCleared) {
    throw new Error("Timed out waiting for the local service ports to clear.");
  }

  return state;
}
