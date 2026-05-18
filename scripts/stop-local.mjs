import { runtimeLogsDirectory, stopManagedRuntime } from "./local-runtime.mjs";

async function main() {
  console.log("[shutdown] Stopping local JoinerFlow services");
  await stopManagedRuntime("[shutdown]");
  console.log("[shutdown] Local service ports are clear.");
  console.log(`[shutdown] Logs retained at ${runtimeLogsDirectory}`);
}

main().catch((error) => {
  console.error("[shutdown] Failed to stop local services.");
  console.error(error);
  process.exit(1);
});
