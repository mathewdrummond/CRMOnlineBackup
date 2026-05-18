import { backfillPostgresFromSqlite, initializeDatabase } from "./db";
import { initializePostgresStore, listPostgresMigrations, postgresModeSummary, verifyPostgresSchema } from "./infrastructure/postgresStore";

async function main() {
  const command = String(process.argv[2] || "status").trim().toLowerCase();
  if (!["migrate", "status", "verify", "backfill-postgres"].includes(command)) {
    throw new Error(`Unknown command "${command}". Use migrate, status, verify, or backfill-postgres.`);
  }

  if (command === "backfill-postgres") {
    await initializeDatabase();
    const result = await backfillPostgresFromSqlite();
    console.log(JSON.stringify({
      command,
      summary: postgresModeSummary(),
      result,
    }, null, 2));
    process.exit(0);
  }

  await initializePostgresStore();
  const summary = postgresModeSummary();

  if (command === "migrate") {
    console.log(JSON.stringify({
      command,
      summary,
    }, null, 2));
    process.exit(summary.connected ? 0 : 1);
  }

  if (command === "status") {
    const applied = await listPostgresMigrations();
    console.log(JSON.stringify({
      command,
      summary,
      applied,
    }, null, 2));
    process.exit(0);
  }

  const verification = await verifyPostgresSchema();
  const skipped = !summary.enabled;
  const ok = skipped ? true : verification.ok;
  console.log(JSON.stringify({
    command,
    summary,
    verification,
    skipped,
  }, null, 2));
  process.exit(ok ? 0 : 1);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[db-migration-cli] ${message}`);
  process.exit(1);
});
