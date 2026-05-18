import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const repoRoot = path.resolve(__dirname, "..");

export const localServiceDefinitions = [
  {
    id: "api",
    label: "API",
    url: "http://127.0.0.1:4000",
    script: "dev:server:fixed",
    readiness: {
      type: "json",
      url: "http://127.0.0.1:4000/health",
      timeoutMs: 180_000,
    },
  },
  {
    id: "crm",
    label: "CRM app",
    url: "http://127.0.0.1:5173",
    script: "dev:crm",
    readiness: {
      type: "http",
      url: "http://127.0.0.1:5173/",
      timeoutMs: 60_000,
    },
  },
  {
    id: "timeclock",
    label: "Time clock",
    url: "http://127.0.0.1:5174",
    script: "dev:timeclock",
    readiness: {
      type: "http",
      url: "http://127.0.0.1:5174/",
      timeoutMs: 60_000,
    },
  },
];

export function getNpmCommand(platform = process.platform) {
  return platform === "win32" ? "npm.cmd" : "npm";
}

export function buildLocalServices({ platform = process.platform, root = repoRoot } = {}) {
  const npmCommand = getNpmCommand(platform);

  return localServiceDefinitions.map((service) => ({
    ...service,
    command: npmCommand,
    args: ["run", service.script],
    cwd: root,
    env: {},
    commandMatch: `npm run ${service.script}`,
  }));
}

export const localServices = buildLocalServices();

export function getRequiredPorts(services = localServices) {
  return services.map((service) => {
    const url = new URL(service.url);
    const port = Number(url.port);

    if (!Number.isInteger(port) || port <= 0) {
      throw new Error(`Local service ${service.id} has an invalid URL port: ${service.url}`);
    }

    return {
      port,
      label: service.label,
    };
  });
}

function getServiceById(services, serviceId) {
  return services.find((service) => service.id === serviceId) || null;
}

export function formatLocalStartupSummary({
  services = localServices,
  logsDirectory,
  stopCommand = "npm run stop:local",
} = {}) {
  const crm = getServiceById(services, "crm");
  const timeclock = getServiceById(services, "timeclock");
  const api = getServiceById(services, "api");

  const lines = [];

  if (crm) {
    lines.push(`CRM:        ${crm.url}`);
  }

  if (timeclock) {
    lines.push(`Time clock: ${timeclock.url}`);
  }

  if (api) {
    lines.push(`API:        ${api.url}`);
    if (api.readiness?.url) {
      lines.push(`Health:     ${api.readiness.url}`);
    }
  }

  if (logsDirectory) {
    lines.push(`Logs:       ${logsDirectory}`);
  }

  if (stopCommand) {
    lines.push(`Stop with:  ${stopCommand}`);
  }

  return lines.join("\n");
}
