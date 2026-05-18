import { execFileSync } from "node:child_process";
import { getRequiredPorts, repoRoot } from "./local-startup-contract.mjs";

export const requiredPorts = getRequiredPorts();

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function runCommand(command, args) {
  return execFileSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

function parseWindowsPids(port) {
  const command = [
    "-NoProfile",
    "-Command",
    `(Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique) -join "\\n"`,
  ];

  try {
    const output = runCommand("powershell.exe", command);
    return unique(output.split(/\r?\n/));
  } catch {
    return [];
  }
}

function parsePidList(output) {
  return unique((output.match(/\b\d+\b/g) || []));
}

function parseSsPids(output) {
  const matches = [...output.matchAll(/pid=(\d+)/g)].map((match) => match[1]);
  return unique(matches);
}

function parseNetstatPids(output) {
  const matches = [...output.matchAll(/(?:^|\s)(\d+)\/[^\s]+/gm)].map((match) => match[1]);
  return unique(matches);
}

function tryLinuxCommand(command, args, parser) {
  try {
    return parser(runCommand(command, args));
  } catch {
    return [];
  }
}

export function getListeningPids(port) {
  if (process.platform === "win32") {
    return parseWindowsPids(port);
  }

  const linuxStrategies = [
    () => tryLinuxCommand("lsof", ["-ti", `tcp:${port}`], parsePidList),
    () => tryLinuxCommand("fuser", ["-n", "tcp", String(port)], parsePidList),
    () => tryLinuxCommand("ss", ["-ltnp", `sport = :${port}`], parseSsPids),
    () => tryLinuxCommand("netstat", ["-ltnp"], (output) =>
      parseNetstatPids(
        output
          .split(/\r?\n/)
          .filter((line) => line.includes(`:${port}`))
          .join("\n")
      )
    ),
  ];

  for (const strategy of linuxStrategies) {
    const pids = strategy();
    if (pids.length > 0) {
      return pids;
    }
  }

  return [];
}

export function isRunning(pid) {
  try {
    process.kill(Number(pid), 0);
    return true;
  } catch {
    return false;
  }
}

export function getProcessCommand(pid) {
  const numericPid = Number(pid);
  if (!Number.isInteger(numericPid) || numericPid <= 0 || !isRunning(numericPid)) {
    return "";
  }

  if (process.platform === "win32") {
    const command = [
      "-NoProfile",
      "-Command",
      `(Get-CimInstance Win32_Process -Filter "ProcessId = ${numericPid}" | Select-Object -ExpandProperty CommandLine)`,
    ];

    try {
      return runCommand("powershell.exe", command);
    } catch {
      return "";
    }
  }

  try {
    return runCommand("ps", ["-p", String(numericPid), "-o", "command="]);
  } catch {
    return "";
  }
}

export function terminatePid(pid, force = false) {
  if (process.platform === "win32") {
    const args = ["/PID", String(pid), "/T"];
    if (force) {
      args.push("/F");
    }

    try {
      execFileSync("taskkill", args, {
        cwd: repoRoot,
        stdio: ["ignore", "ignore", "ignore"],
      });
    } catch {
      // Ignore already-exited processes.
    }

    return;
  }

  try {
    process.kill(Number(pid), force ? "SIGKILL" : "SIGTERM");
  } catch {
    // Ignore already-exited processes.
  }
}

export function terminateProcessTree(pid, force = false) {
  const numericPid = Number(pid);
  if (!Number.isInteger(numericPid) || numericPid <= 0) {
    return;
  }

  if (process.platform === "win32") {
    terminatePid(numericPid, force);
    return;
  }

  try {
    process.kill(-numericPid, force ? "SIGKILL" : "SIGTERM");
  } catch {
    terminatePid(numericPid, force);
  }
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function clearRequiredPorts(logPrefix = "[runtime]") {
  for (const { port, label } of requiredPorts) {
    const pids = getListeningPids(port);

    if (pids.length === 0) {
      continue;
    }

    console.log(`${logPrefix} Clearing ${label} port ${port}: ${pids.join(", ")}`);

    for (const pid of pids) {
      terminatePid(pid, false);
    }

    await sleep(1000);

    for (const pid of pids.filter(isRunning)) {
      terminatePid(pid, true);
    }
  }
}

export async function waitForRequiredPortsToClear(timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const occupiedPorts = requiredPorts.filter(({ port }) => getListeningPids(port).length > 0);
    if (occupiedPorts.length === 0) {
      return true;
    }

    await sleep(250);
  }

  return requiredPorts.every(({ port }) => getListeningPids(port).length === 0);
}
