import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  buildLocalServices,
  formatLocalStartupSummary,
  getNpmCommand,
  getRequiredPorts,
  localServiceDefinitions,
} from "./local-startup-contract.mjs";
import {
  formatStartupPreflightReport,
  getRequiredRootScripts,
  isSupportedNodeVersion,
  validateLocalStartupEnvironment,
  validatePackageScripts,
} from "./local-startup-preflight.mjs";

const tempRoots = [];

function makeTempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "joinerflow-startup-preflight-"));
  tempRoots.push(root);
  return root;
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeWorkspacePackages(root) {
  for (const workspace of ["client", "server", "clock-client"]) {
    writeJson(path.join(root, workspace, "package.json"), {
      name: workspace,
      scripts: {},
    });
  }
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("local startup preflight", () => {
  test("builds platform-specific managed service commands from one contract", () => {
    expect(getNpmCommand("win32")).toBe("npm.cmd");
    expect(getNpmCommand("linux")).toBe("npm");
    expect(getNpmCommand("darwin")).toBe("npm");

    const windowsServices = buildLocalServices({ platform: "win32", root: "C:\\JoinerFlow" });
    expect(windowsServices.map((service) => service.command)).toEqual(["npm.cmd", "npm.cmd", "npm.cmd"]);
    expect(windowsServices.map((service) => service.args.join(" "))).toEqual([
      "run dev:server:fixed",
      "run dev:crm",
      "run dev:timeclock",
    ]);
    expect(windowsServices.map((service) => service.commandMatch)).toEqual([
      "npm run dev:server:fixed",
      "npm run dev:crm",
      "npm run dev:timeclock",
    ]);
  });

  test("derives required ports and startup summary from managed service definitions", () => {
    const services = buildLocalServices({ platform: "linux", root: "/repo" });

    expect(getRequiredPorts(services)).toEqual([
      { port: 4000, label: "API" },
      { port: 5173, label: "CRM app" },
      { port: 5174, label: "Time clock" },
    ]);

    expect(formatLocalStartupSummary({
      services,
      logsDirectory: "/repo/.joinerflow-runtime/logs",
    })).toBe([
      "CRM:        http://127.0.0.1:5173",
      "Time clock: http://127.0.0.1:5174",
      "API:        http://127.0.0.1:4000",
      "Health:     http://127.0.0.1:4000/health",
      "Logs:       /repo/.joinerflow-runtime/logs",
      "Stop with:  npm run stop:local",
    ].join("\n"));
  });

  test("keeps managed local service identity, ports, and root scripts centralized", () => {
    const services = buildLocalServices({ platform: "linux", root: "/repo" });
    const serviceIds = services.map((service) => service.id);
    const servicePorts = getRequiredPorts(services).map((entry) => entry.port);

    expect(serviceIds).toEqual(["api", "crm", "timeclock"]);
    expect(new Set(serviceIds).size).toBe(serviceIds.length);
    expect(new Set(servicePorts).size).toBe(servicePorts.length);
    expect(getRequiredRootScripts(services)).toEqual(
      localServiceDefinitions.map((service) => service.script).sort()
    );
  });

  test("matches the repository Node engine window used by local launchers", () => {
    expect(isSupportedNodeVersion("20.19.0")).toBe(true);
    expect(isSupportedNodeVersion("22.12.0")).toBe(true);
    expect(isSupportedNodeVersion("24.3.0")).toBe(true);
    expect(isSupportedNodeVersion("26.0.0")).toBe(true);

    expect(isSupportedNodeVersion("20.18.1")).toBe(false);
    expect(isSupportedNodeVersion("21.7.0")).toBe(false);
    expect(isSupportedNodeVersion("27.0.0")).toBe(false);
  });

  test("derives required root scripts from managed service definitions", () => {
    expect(getRequiredRootScripts([
      { command: "npm", args: ["run", "dev:server:fixed"] },
      { command: "npm", args: ["run", "dev:crm"] },
      { command: "npm", args: ["run", "dev:timeclock"] },
    ])).toEqual(["dev:crm", "dev:server:fixed", "dev:timeclock"]);
  });

  test("reports missing startup scripts", () => {
    expect(validatePackageScripts({
      scripts: {
        "dev:crm": "vite",
      },
    }, ["dev:crm", "dev:server:fixed"])).toEqual(["dev:server:fixed"]);
  });

  test("fails before startup when dependencies or required scripts are missing", () => {
    const root = makeTempRoot();
    writeWorkspacePackages(root);
    writeJson(path.join(root, "package.json"), {
      scripts: {
        "dev:crm": "vite",
      },
    });

    const result = validateLocalStartupEnvironment({
      root,
      nodeVersion: "22.12.0",
      services: [
        { command: "npm", args: ["run", "dev:crm"] },
        { command: "npm", args: ["run", "dev:server:fixed"] },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("package.json is missing required startup script(s): dev:server:fixed.");
    expect(result.errors).toContain("Dependencies are not installed. Run npm install from the repository root before starting JoinerFlow.");
  });

  test("formats actionable errors and warnings for launcher output", () => {
    expect(formatStartupPreflightReport({
      errors: ["Install Node.js."],
      warnings: ["Lockfile missing."],
    })).toBe([
      "Startup preflight failed:",
      "- Install Node.js.",
      "",
      "Startup preflight warnings:",
      "- Lockfile missing.",
    ].join("\n"));
  });
});
