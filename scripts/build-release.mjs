import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

function run(args) {
  execFileSync(npmCommand, args, {
    cwd: repoRoot,
    stdio: "inherit",
    env: process.env,
  });
}

console.log("[release] Building CRM frontend");
run(["run", "build", "--workspace=client"]);

console.log("[release] Building API");
run(["run", "build", "--workspace=server"]);

console.log("[release] Building time clock");
run(["run", "build", "--workspace=clock-client"]);

console.log("[release] Release build complete.");
