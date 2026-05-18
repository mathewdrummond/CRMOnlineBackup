import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import BetterSqlite3 from "better-sqlite3";

const testRoot = path.join(os.tmpdir(), "joinerflow-persistence-vitest");
const sqlitePath = path.join(testRoot, "joinerflow.persistence.sqlite");
const filesystemRoot = path.join(testRoot, "filesystem");

function getResolvedSqlitePath() {
  const workerId = String(process.env.VITEST_WORKER_ID || "").trim();
  if (!workerId) {
    return sqlitePath;
  }

  const parsed = path.parse(sqlitePath);
  return path.join(parsed.dir, `${parsed.name}.worker-${workerId}${parsed.ext || ".sqlite"}`);
}

function writeSchemaMigrationHistory(rows: Array<{ version: number; name: string }>) {
  const resolvedSqlitePath = getResolvedSqlitePath();
  fs.mkdirSync(path.dirname(resolvedSqlitePath), { recursive: true });
  const database = new BetterSqlite3(resolvedSqlitePath);
  try {
    database.exec(`
      CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );
    `);
    const insertMigration = database.prepare(`
      INSERT INTO schema_migrations (version, name, applied_at)
      VALUES (?, ?, ?)
    `);
    for (const row of rows) {
      insertMigration.run(row.version, row.name, "2026-01-01T00:00:00.000Z");
    }
  } finally {
    database.close();
  }
}

function removeResolvedDatabaseFiles() {
  const resolvedSqlitePath = getResolvedSqlitePath();
  fs.rmSync(resolvedSqlitePath, { force: true });
  fs.rmSync(`${resolvedSqlitePath}-wal`, { force: true });
  fs.rmSync(`${resolvedSqlitePath}-shm`, { force: true });
}

function readSchemaMigrationHistory() {
  const resolvedSqlitePath = getResolvedSqlitePath();
  const database = new BetterSqlite3(resolvedSqlitePath);
  try {
    return database
      .prepare("SELECT version, name FROM schema_migrations ORDER BY version ASC")
      .all() as Array<{ version: number; name: string }>;
  } finally {
    database.close();
  }
}

let dbModule: typeof import("./db");
let createApp: typeof import("./index")["createApp"];

beforeAll(async () => {
  fs.mkdirSync(testRoot, { recursive: true });
  process.env.NODE_ENV = "test";
  process.env.ENABLE_TEST_AUTH = "true";
  process.env.AUTH_SESSION_SECRET = "joinerflow-test-session-secret";
  process.env.SQLITE_PATH = sqlitePath;
  process.env.FILESYSTEM_ROOT = filesystemRoot;

  dbModule = await import("./db");
  createApp = (await import("./index")).createApp;
});

beforeEach(() => {
  dbModule.closeDatabase();
  const resolvedSqlitePath = getResolvedSqlitePath();
  fs.rmSync(resolvedSqlitePath, { force: true });
  fs.rmSync(`${resolvedSqlitePath}-wal`, { force: true });
  fs.rmSync(`${resolvedSqlitePath}-shm`, { force: true });
  fs.rmSync(filesystemRoot, { recursive: true, force: true });
});

afterAll(() => {
  dbModule.closeDatabase();
  fs.rmSync(testRoot, { recursive: true, force: true });
});

describe("local persistence", () => {
  test("rejects unsupported future migration history before mutating the database", async () => {
    writeSchemaMigrationHistory([
      { version: 99, name: "future_schema_change" },
    ]);

    await expect(dbModule.initializeDatabase()).rejects.toThrow(/Unsupported schema migration version 99/);

    removeResolvedDatabaseFiles();
    await expect(dbModule.initializeDatabase()).resolves.toBeUndefined();
    expect(dbModule.getDatabaseDiagnostics().schema_version).toBeGreaterThanOrEqual(4);
  });

  test("rejects mismatched migration metadata before applying pending migrations", async () => {
    writeSchemaMigrationHistory([
      { version: 1, name: "renamed_baseline" },
    ]);

    await expect(dbModule.initializeDatabase()).rejects.toThrow(/Schema migration 1 metadata mismatch/);

    removeResolvedDatabaseFiles();
    await expect(dbModule.initializeDatabase()).resolves.toBeUndefined();
    expect(dbModule.listSchemaMigrations().map((migration) => migration.version)).toEqual([1, 2, 3, 4]);
  });

  test("rejects incomplete migration history before applying pending migrations", async () => {
    writeSchemaMigrationHistory([
      { version: 1, name: "baseline_local_entity_store" },
      { version: 3, name: "pricing_model_entities" },
    ]);

    await expect(dbModule.initializeDatabase()).rejects.toThrow(/Schema migration history is incomplete/);

    removeResolvedDatabaseFiles();
    await expect(dbModule.initializeDatabase()).resolves.toBeUndefined();
    expect(dbModule.listSchemaMigrations().map((migration) => migration.version)).toEqual([1, 2, 3, 4]);
  });

  test("does not record pending migration metadata when a migration fails", async () => {
    writeSchemaMigrationHistory([
      { version: 1, name: "baseline_local_entity_store" },
    ]);

    await expect(dbModule.initializeDatabase()).rejects.toThrow(/no such table: main\.entity_records/);

    expect(readSchemaMigrationHistory()).toEqual([
      {
        version: 1,
        name: "baseline_local_entity_store",
      },
    ]);
  });

  test("creates the SQLite database, migration metadata, and required system defaults without demo data", async () => {
    await createApp();
    const resolvedSqlitePath = getResolvedSqlitePath();

    expect(fs.existsSync(resolvedSqlitePath)).toBe(true);
    expect(fs.existsSync(path.join(filesystemRoot, "jobs"))).toBe(true);
    expect(fs.existsSync(path.join(filesystemRoot, "quotes"))).toBe(true);
    expect(fs.existsSync(path.join(filesystemRoot, ".versions"))).toBe(true);

    const diagnostics = dbModule.getDatabaseDiagnostics();
    expect(diagnostics.path).toBe(resolvedSqlitePath);
    expect(diagnostics.schema_version).toBeGreaterThanOrEqual(1);
    expect(diagnostics.integrity_check).toBe("ok");
    expect(diagnostics.migrations).toEqual([
      expect.objectContaining({
        version: 1,
        name: "baseline_local_entity_store",
      }),
      expect.objectContaining({
        version: 2,
        name: "entity_query_indexes_and_plans",
      }),
      expect.objectContaining({
        version: 3,
        name: "pricing_model_entities",
      }),
      expect.objectContaining({
        version: 4,
        name: "supplier_linked_pricing_items",
      }),
    ]);

    const seededCategories = dbModule.listEntityRecords("LeadCategory", { sort: "sort_order" });
    expect(seededCategories.length).toBeGreaterThan(0);
    expect(seededCategories.some((category) => category.is_default === true)).toBe(true);

    expect(dbModule.listEntityRecords("Lead")).toHaveLength(0);
    expect(dbModule.listEntityRecords("Company")).toHaveLength(0);
    expect(dbModule.listEntityRecords("Staff")).toHaveLength(0);
  });

  test("repairs legacy quote workflow tasks on startup instead of recreating duplicate ids", async () => {
    await dbModule.initializeDatabase();
    const actor = dbModule.getLocalUser();

    dbModule.createEntityRecord("JobOperation", {
      id: "quotetask-quote-penthouse-quote_brief_review",
      quote_id: "quote-penthouse",
      task_name: "Review client brief and scope gaps",
      operation: "design",
      status: "ready",
      workflow_phase: "enquiry",
      workflow_role: "management",
      workflow_template_key: "quote_brief_review",
      workflow_template_id: "quote-template-brief-review",
      dependency_template_keys: [],
      dependency_task_ids: [],
      assigned_role: "management",
      assigned_to: "",
      lane_id: "workflow-lane-management",
      is_workflow_task: true,
      is_template_enabled: true,
      is_system_generated: true,
      is_unassigned_placeholder: true,
      sort_order: 0,
      start_date: "2026-04-20",
      end_date: "2026-04-20",
    }, {
      actor,
      request_source: "test",
      skip_audit: true,
    });

    await expect(createApp()).resolves.toBeTruthy();

    const repairedTask = dbModule.getEntityRecord("JobOperation", "quotetask-quote-penthouse-quote_brief_review");
    expect(repairedTask).toEqual(expect.objectContaining({
      id: "quotetask-quote-penthouse-quote_brief_review",
      quote_id: "quote-penthouse",
      is_workflow_task: true,
      workflow_template_key: "quote_brief_review",
    }));
  });

  test("persists customer, enquiry, job, timesheet, note, and export history records across restart", async () => {
    await dbModule.initializeDatabase();
    const actor = dbModule.getLocalUser();

    const company = dbModule.createEntityRecord("Company", {
      name: "Persistence Joinery Ltd",
      type: "client",
    }, {
      actor,
      request_source: "test",
    });

    const contact = dbModule.createEntityRecord("Contact", {
      company_id: company.id,
      first_name: "Casey",
      last_name: "Local",
      email: "casey.local@example.test",
      type: "client",
    }, {
      actor,
      request_source: "test",
    });

    const enquiry = dbModule.createEntityRecord("Lead", {
      title: "Kitchen refresh enquiry",
      contact_id: contact.id,
      contact_name: "Casey Local",
      company_id: company.id,
      company_name: company.name,
      stage: "new_enquiry",
    }, {
      actor,
      request_source: "test",
    });

    const job = dbModule.createEntityRecord("Job", {
      title: "Kitchen refresh",
      job_number: "PERS-0001",
      contact_id: contact.id,
      contact_name: "Casey Local",
      company_id: company.id,
      company_name: company.name,
    }, {
      actor,
      request_source: "test",
    });

    const clockIn = dbModule.createEntityRecord("ClockIn", {
      staff_id: "staff-1",
      staff_name: "Jamie McAnulty",
      date: "2026-04-04",
      clock_in_time: "2026-04-04T07:30:00.000Z",
      clock_out_time: "2026-04-04T15:30:00.000Z",
      total_hours: 8,
    }, {
      actor,
      request_source: "test",
    });

    const timeEntry = dbModule.createEntityRecord("TimeEntry", {
      staff_id: "staff-1",
      staff_name: "Jamie McAnulty",
      employee_id: "EMP001",
      date: "2026-04-04",
      job_id: job.id,
      job_number: job.job_number,
      activity: "Labour",
      hours: 8,
      status: "completed",
    }, {
      actor,
      request_source: "test",
    });

    const note = dbModule.createEntityRecord("Note", {
      related_id: job.id,
      related_type: "job",
      content: "Local persistence note",
    }, {
      actor,
      request_source: "test",
    });

    const exportHistory = dbModule.createEntityRecord("ExportHistory", {
      export_type: "timesheets",
      source_type: "daily_attendance",
      source_id: clockIn.id,
      staff_name: "Jamie McAnulty",
      employee_id: "EMP001",
      date: "2026-04-04",
      hours: 7.5,
    }, {
      actor,
      request_source: "test",
    });

    dbModule.closeDatabase();
    await dbModule.initializeDatabase();

    expect(dbModule.getEntityRecord("Company", company.id)?.name).toBe("Persistence Joinery Ltd");
    expect(dbModule.getEntityRecord("Contact", contact.id)?.email).toBe("casey.local@example.test");
    expect(dbModule.getEntityRecord("Lead", enquiry.id)?.title).toBe("Kitchen refresh enquiry");
    expect(dbModule.getEntityRecord("Job", job.id)?.job_number).toBe("PERS-0001");
    expect(dbModule.getEntityRecord("ClockIn", clockIn.id)?.total_hours).toBe(8);
    expect(dbModule.getEntityRecord("TimeEntry", timeEntry.id)?.activity).toBe("Labour");
    expect(dbModule.getEntityRecord("Note", note.id)?.content).toBe("Local persistence note");
    expect(dbModule.getEntityRecord("ExportHistory", exportHistory.id)?.export_type).toBe("timesheets");
  });

  test("uses indexed query plans for common filtered and sorted entity lists at higher volumes", async () => {
    await dbModule.initializeDatabase();
    const actor = dbModule.getLocalUser();

    dbModule.runInTransaction(() => {
      for (let index = 0; index < 2500; index += 1) {
        dbModule.createEntityRecord("TimeEntry", {
          id: `perf-time-entry-${index}`,
          staff_id: index % 5 === 0 ? "staff-target" : `staff-${index % 11}`,
          staff_name: index % 5 === 0 ? "Target Staff" : `Staff ${index % 11}`,
          employee_id: `EMP${String(index % 11).padStart(3, "0")}`,
          date: `2026-04-${String((index % 28) + 1).padStart(2, "0")}`,
          job_id: `job-${index % 17}`,
          job_number: `JOB-${String(index % 17).padStart(4, "0")}`,
          activity: "Labour",
          hours: 1 + (index % 8),
          status: "completed",
        }, {
          actor,
          request_source: "test",
          skip_audit: true,
        });
      }

      for (let index = 0; index < 1200; index += 1) {
        dbModule.createEntityRecord("PricingItem", {
          id: `perf-pricing-item-${index}`,
          name: `Pricing item ${index}`,
          supplier_id: index % 3 === 0 ? "supplier-target" : `supplier-${index % 23}`,
          product_number: `SKU-${String(index).padStart(5, "0")}`,
          category: "hardware",
          unit: "ea",
          buy_price: 10,
        }, {
          actor,
          request_source: "test",
          skip_audit: true,
        });
      }
    });

    const timeEntryPlan = dbModule.explainEntityListQuery("TimeEntry", {
      filters: { staff_id: "staff-target" },
      sort: "-date",
      limit: 25,
    });
    expect(timeEntryPlan.some((row) =>
      String(row.detail || "").includes("entity_records_staff_date_idx")
      || String(row.detail || "").includes("entity_records_staff_idx")
    )).toBe(true);

    const filteredTimeEntries = dbModule.listEntityRecords("TimeEntry", {
      filters: { staff_id: "staff-target" },
      sort: "-date",
      limit: 25,
    });
    expect(filteredTimeEntries).toHaveLength(25);
    expect(filteredTimeEntries.every((entry) => entry.staff_id === "staff-target")).toBe(true);
    expect(filteredTimeEntries.map((entry) => entry.date)).toEqual(
      [...filteredTimeEntries.map((entry) => entry.date)].sort((left, right) => String(right).localeCompare(String(left)))
    );

    const filteredPricingItems = dbModule.listEntityRecords("PricingItem", {
      filters: { supplier_id: "supplier-target" },
      sort: "name",
    });
    expect(filteredPricingItems.every((item) => item.supplier_id === "supplier-target")).toBe(true);
    expect(filteredPricingItems.map((item) => String(item.name || ""))).toEqual(
      [...filteredPricingItems.map((item) => String(item.name || ""))].sort((left, right) => left.localeCompare(right))
    );
  });
});
