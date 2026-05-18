import fs from "node:fs";
import path from "node:path";
import { localServices, repoRoot } from "./local-runtime.mjs";

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function parseNodeVersion(rawVersion) {
  const match = String(rawVersion || "").trim().replace(/^v/, "").match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    return null;
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

export function isSupportedNodeVersion(rawVersion) {
  const version = parseNodeVersion(rawVersion);
  if (!version) {
    return false;
  }

  if (version.major === 20) {
    return version.minor > 19 || (version.minor === 19 && version.patch >= 0);
  }

  if (version.major === 22) {
    return version.minor > 12 || (version.minor === 12 && version.patch >= 0);
  }

  return version.major > 22 && version.major < 27;
}

export function getRequiredRootScripts(services = localServices) {
  return services
    .filter((service) => service.command && service.args?.[0] === "run" && service.args?.[1])
    .map((service) => service.args[1])
    .sort();
}

export function validatePackageScripts(packageJson, requiredScripts = getRequiredRootScripts()) {
  const scripts = isObject(packageJson?.scripts) ? packageJson.scripts : {};

  return requiredScripts.filter((scriptName) => typeof scripts[scriptName] !== "string" || scripts[scriptName].trim() === "");
}

export function validateLocalStartupEnvironment({
  root = repoRoot,
  nodeVersion = process.versions.node,
  services = localServices,
} = {}) {
  const errors = [];
  const warnings = [];
  const packagePath = path.join(root, "package.json");

  if (!isSupportedNodeVersion(nodeVersion)) {
    errors.push(`Node.js ${nodeVersion || "unknown"} is not supported. Install Node.js 20.19+ or 22.12+ before starting JoinerFlow.`);
  }

  if (!fs.existsSync(packagePath)) {
    errors.push(`package.json was not found at ${packagePath}. Run startup from the repository root.`);
  } else {
    try {
      const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
      const missingScripts = validatePackageScripts(packageJson, getRequiredRootScripts(services));
      if (missingScripts.length > 0) {
        errors.push(`package.json is missing required startup script(s): ${missingScripts.join(", ")}.`);
      }
    } catch (error) {
      errors.push(`package.json could not be parsed: ${error instanceof Error ? error.message : String(error)}.`);
    }
  }

  if (!fs.existsSync(path.join(root, "node_modules"))) {
    errors.push("Dependencies are not installed. Run npm install from the repository root before starting JoinerFlow.");
  }

  for (const workspace of ["client", "server", "clock-client"]) {
    const workspacePackagePath = path.join(root, workspace, "package.json");
    if (!fs.existsSync(workspacePackagePath)) {
      errors.push(`Workspace package is missing: ${workspacePackagePath}.`);
    }
  }

  if (!fs.existsSync(path.join(root, "package-lock.json"))) {
    warnings.push("package-lock.json was not found; npm install may resolve dependency versions differently across machines.");
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}

export function formatStartupPreflightReport(report) {
  const lines = [];

  if (report.errors?.length) {
    lines.push("Startup preflight failed:");
    for (const error of report.errors) {
      lines.push(`- ${error}`);
    }
  }

  if (report.warnings?.length) {
    if (lines.length > 0) {
      lines.push("");
    }
    lines.push("Startup preflight warnings:");
    for (const warning of report.warnings) {
      lines.push(`- ${warning}`);
    }
  }

  return lines.join("\n");
}
