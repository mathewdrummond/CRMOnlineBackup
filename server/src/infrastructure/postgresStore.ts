import { Pool, PoolClient, QueryResult } from "pg";
import { AttachmentVersionRecord, EntityData, EntityRecord, MutationActor } from "../types";
import { isPostgresEnabledForRuntime, isPostgresPrimary } from "./databaseMode";

type PostgresMigration = {
  version: number;
  name: string;
  apply: (client: PoolClient) => Promise<void>;
};

const MIGRATIONS: PostgresMigration[] = [
  {
    version: 1,
    name: "baseline_local_entity_store",
    async apply(client) {
      await client.query(`
        CREATE TABLE IF NOT EXISTS entity_records (
          id TEXT PRIMARY KEY,
          entity TEXT NOT NULL,
          data JSONB NOT NULL,
          created_date TIMESTAMPTZ NOT NULL,
          updated_date TIMESTAMPTZ NOT NULL,
          row_version INTEGER NOT NULL DEFAULT 1
        );
        CREATE INDEX IF NOT EXISTS entity_records_entity_idx ON entity_records(entity);
        CREATE INDEX IF NOT EXISTS entity_records_entity_updated_idx ON entity_records(entity, updated_date DESC);
        CREATE INDEX IF NOT EXISTS entity_records_entity_created_idx ON entity_records(entity, created_date DESC);

        CREATE TABLE IF NOT EXISTS audit_log (
          id TEXT PRIMARY KEY,
          entity TEXT NOT NULL,
          record_id TEXT NOT NULL,
          action TEXT NOT NULL,
          actor_id TEXT NOT NULL DEFAULT '',
          actor_email TEXT NOT NULL DEFAULT '',
          actor_name TEXT NOT NULL DEFAULT '',
          actor_role TEXT NOT NULL DEFAULT '',
          request_source TEXT NOT NULL DEFAULT '',
          summary_json JSONB NOT NULL,
          previous_data JSONB,
          next_data JSONB,
          created_date TIMESTAMPTZ NOT NULL
        );
        CREATE INDEX IF NOT EXISTS audit_log_entity_record_idx ON audit_log(entity, record_id, created_date DESC);
        CREATE INDEX IF NOT EXISTS audit_log_created_date_idx ON audit_log(created_date DESC);

        CREATE TABLE IF NOT EXISTS attachment_versions (
          id TEXT PRIMARY KEY,
          attachment_id TEXT NOT NULL,
          version_number INTEGER NOT NULL,
          related_id TEXT NOT NULL,
          related_type TEXT NOT NULL,
          name TEXT NOT NULL,
          stored_name TEXT NOT NULL,
          mime_type TEXT NOT NULL,
          size INTEGER NOT NULL,
          relative_path TEXT NOT NULL,
          url TEXT NOT NULL,
          checksum TEXT NOT NULL DEFAULT '',
          source TEXT NOT NULL DEFAULT '',
          actor_id TEXT NOT NULL DEFAULT '',
          actor_email TEXT NOT NULL DEFAULT '',
          actor_name TEXT NOT NULL DEFAULT '',
          created_date TIMESTAMPTZ NOT NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS attachment_versions_attachment_version_idx ON attachment_versions(attachment_id, version_number);
        CREATE INDEX IF NOT EXISTS attachment_versions_attachment_idx ON attachment_versions(attachment_id, created_date DESC);

        CREATE TABLE IF NOT EXISTS schema_migrations (
          version INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          applied_at TIMESTAMPTZ NOT NULL
        );
      `);
    },
  },
  {
    version: 2,
    name: "entity_query_indexes_and_plans",
    async apply(client) {
      await client.query(`
        CREATE INDEX IF NOT EXISTS entity_records_related_idx ON entity_records(entity, (data->>'related_id'));
        CREATE INDEX IF NOT EXISTS entity_records_related_type_idx ON entity_records(entity, (data->>'related_type'));
        CREATE INDEX IF NOT EXISTS entity_records_job_idx ON entity_records(entity, (data->>'job_id'));
        CREATE INDEX IF NOT EXISTS entity_records_quote_idx ON entity_records(entity, (data->>'quote_id'));
        CREATE INDEX IF NOT EXISTS entity_records_lead_idx ON entity_records(entity, (data->>'lead_id'));
        CREATE INDEX IF NOT EXISTS entity_records_contact_idx ON entity_records(entity, (data->>'contact_id'));
        CREATE INDEX IF NOT EXISTS entity_records_company_idx ON entity_records(entity, (data->>'company_id'));
        CREATE INDEX IF NOT EXISTS entity_records_staff_idx ON entity_records(entity, (data->>'staff_id'));
        CREATE INDEX IF NOT EXISTS entity_records_status_idx ON entity_records(entity, (data->>'status'));
        CREATE INDEX IF NOT EXISTS entity_records_start_date_idx ON entity_records(entity, (data->>'start_date'));
        CREATE INDEX IF NOT EXISTS entity_records_due_date_idx ON entity_records(entity, (data->>'due_date'));
        CREATE INDEX IF NOT EXISTS entity_records_assigned_to_idx ON entity_records(entity, (data->>'assigned_to'));
        CREATE INDEX IF NOT EXISTS entity_records_sort_order_idx ON entity_records(entity, (data->>'sort_order'));
        CREATE INDEX IF NOT EXISTS entity_records_name_idx ON entity_records(entity, (data->>'name'));
        CREATE INDEX IF NOT EXISTS entity_records_last_name_idx ON entity_records(entity, (data->>'last_name'));
        CREATE INDEX IF NOT EXISTS entity_records_email_idx ON entity_records(entity, (data->>'email'));
        CREATE INDEX IF NOT EXISTS entity_records_job_number_idx ON entity_records(entity, (data->>'job_number'));
        CREATE INDEX IF NOT EXISTS entity_records_quote_number_idx ON entity_records(entity, (data->>'quote_number'));
      `);
    },
  },
  {
    version: 3,
    name: "pricing_model_entities",
    async apply(client) {
      await client.query(`
        CREATE INDEX IF NOT EXISTS entity_records_pricing_import_idx ON entity_records(entity, (data->>'import_id'));
        CREATE INDEX IF NOT EXISTS entity_records_pricing_category_idx ON entity_records(entity, (data->>'category'));
        CREATE INDEX IF NOT EXISTS entity_records_pricing_active_idx ON entity_records(entity, (data->>'is_active'));
        CREATE INDEX IF NOT EXISTS entity_records_pricing_default_idx ON entity_records(entity, (data->>'is_default'));
        CREATE INDEX IF NOT EXISTS entity_records_pricing_job_type_idx ON entity_records(entity, (data->>'job_type'));
        CREATE INDEX IF NOT EXISTS entity_records_pricing_supplier_idx ON entity_records(entity, (data->>'supplier_id'));
      `);
    },
  },
  {
    version: 4,
    name: "supplier_linked_pricing_items",
    async apply(client) {
      await client.query(`
        CREATE INDEX IF NOT EXISTS entity_records_pricing_supplier_sku_idx ON entity_records(entity, (data->>'supplier_id'), (data->>'product_number'));
        CREATE INDEX IF NOT EXISTS entity_records_pricing_supplier_item_code_idx ON entity_records(entity, (data->>'supplier_id'), (data->>'supplier_item_code'));
        CREATE INDEX IF NOT EXISTS entity_records_pricing_barcode_idx ON entity_records(entity, (data->>'barcode'));
        CREATE INDEX IF NOT EXISTS entity_records_price_list_source_idx ON entity_records(entity, (data->>'price_list_import_id'));
      `);
    },
  },
];

let pool: Pool | null = null;
let migrationSummary: {
  configured: boolean;
  connected: boolean;
  appliedVersions: number[];
  latestVersion: number;
  lastError: string;
} = {
  configured: false,
  connected: false,
  appliedVersions: [],
  latestVersion: 0,
  lastError: "",
};

function readConnectionString() {
  const explicit = String(process.env.DATABASE_URL || "").trim();
  if (explicit) return explicit;

  const host = String(process.env.PGHOST || "").trim();
  if (!host) return "";
  const port = Number(process.env.PGPORT || 5432) || 5432;
  const database = String(process.env.PGDATABASE || "").trim();
  const user = encodeURIComponent(String(process.env.PGUSER || "").trim());
  const password = encodeURIComponent(String(process.env.PGPASSWORD || "").trim());
  if (!database || !user) return "";
  return `postgresql://${user}:${password}@${host}:${port}/${database}`;
}

function readPoolLimits() {
  const max = Number(process.env.PGPOOL_MAX || 8);
  const idleTimeoutMillis = Number(process.env.PGPOOL_IDLE_TIMEOUT_MS || 30_000);
  const connectionTimeoutMillis = Number(process.env.PGPOOL_CONNECTION_TIMEOUT_MS || 10_000);
  return {
    max: Number.isFinite(max) && max > 0 ? Math.min(max, 30) : 8,
    idleTimeoutMillis: Number.isFinite(idleTimeoutMillis) && idleTimeoutMillis > 0 ? idleTimeoutMillis : 30_000,
    connectionTimeoutMillis: Number.isFinite(connectionTimeoutMillis) && connectionTimeoutMillis > 0
      ? connectionTimeoutMillis
      : 10_000,
  };
}

function assertPool() {
  if (!pool) {
    throw new Error("PostgreSQL pool is not initialized.");
  }
  return pool;
}

export function postgresModeSummary() {
  const configured = Boolean(readConnectionString());
  return {
    enabled: isPostgresEnabledForRuntime(),
    primary: isPostgresPrimary(),
    configured: migrationSummary.configured || configured,
    connected: migrationSummary.connected,
    appliedVersions: migrationSummary.appliedVersions,
    latestVersion: migrationSummary.latestVersion,
    lastError: migrationSummary.lastError,
  };
}

export async function initializePostgresStore() {
  if (!isPostgresEnabledForRuntime()) {
    migrationSummary = {
      configured: false,
      connected: false,
      appliedVersions: [],
      latestVersion: 0,
      lastError: "",
    };
    return;
  }

  if (pool) {
    return;
  }

  const connectionString = readConnectionString();
  if (!connectionString) {
    const message = "PostgreSQL runtime enabled but DATABASE_URL/PG* is not configured.";
    migrationSummary = {
      configured: false,
      connected: false,
      appliedVersions: [],
      latestVersion: 0,
      lastError: message,
    };
    if (isPostgresPrimary()) {
      throw new Error(message);
    }
    return;
  }

  const limits = readPoolLimits();
  pool = new Pool({
    connectionString,
    ...limits,
    ssl: readSslMode(),
  });
  pool.on("error", (error: Error) => {
    migrationSummary.lastError = error.message;
  });

  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await MIGRATIONS[0].apply(client);
      const existingRows = await client.query<{ version: number; name: string }>(
        "SELECT version, name FROM schema_migrations ORDER BY version ASC"
      );
      const existing = new Map<number, string>(
        existingRows.rows.map((row: { version: number; name: string }) => [Number(row.version), String(row.name)])
      );
      for (const migration of MIGRATIONS) {
        const existingName = existing.get(migration.version);
        if (existingName && existingName !== migration.name) {
          throw new Error(`PostgreSQL migration ${migration.version} name mismatch: expected ${migration.name}, got ${existingName}.`);
        }
        if (!existingName) {
          await migration.apply(client);
          await client.query(
            "INSERT INTO schema_migrations (version, name, applied_at) VALUES ($1, $2, NOW())",
            [migration.version, migration.name]
          );
        }
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    const rows = await pool.query<{ version: number }>("SELECT version FROM schema_migrations ORDER BY version ASC");
    migrationSummary = {
      configured: true,
      connected: true,
      appliedVersions: rows.rows.map((row: { version: number }) => Number(row.version || 0)),
      latestVersion: Number(rows.rows[rows.rows.length - 1]?.version || 0),
      lastError: "",
    };
  } catch (error) {
    migrationSummary = {
      configured: true,
      connected: false,
      appliedVersions: [],
      latestVersion: 0,
      lastError: error instanceof Error ? error.message : String(error),
    };
    if (isPostgresPrimary()) {
      throw error;
    }
  }
}

export async function closePostgresStore() {
  if (!pool) return;
  const target = pool;
  pool = null;
  await target.end();
}

export async function writeEntityRecordToPostgres(entity: string, record: EntityRecord) {
  if (!isPostgresEnabledForRuntime() || !pool) return;
  const data = stripEntityMetadata(record);
  await pool.query(
    `
      INSERT INTO entity_records (id, entity, data, created_date, updated_date, row_version)
      VALUES ($1, $2, $3::jsonb, $4::timestamptz, $5::timestamptz, $6)
      ON CONFLICT (id) DO UPDATE SET
        entity = EXCLUDED.entity,
        data = EXCLUDED.data,
        created_date = EXCLUDED.created_date,
        updated_date = EXCLUDED.updated_date,
        row_version = EXCLUDED.row_version
    `,
    [
      String(record.id || ""),
      entity,
      JSON.stringify(data),
      String(record.created_date || new Date().toISOString()),
      String(record.updated_date || new Date().toISOString()),
      Number(record.row_version || 1),
    ]
  );
}

export async function deleteEntityRecordFromPostgres(entity: string, recordId: string) {
  if (!isPostgresEnabledForRuntime() || !pool) return;
  await pool.query("DELETE FROM entity_records WHERE entity = $1 AND id = $2", [entity, recordId]);
}

export async function writeAuditLogToPostgres(input: {
  id: string;
  entity: string;
  recordId: string;
  action: string;
  actor?: MutationActor | null;
  requestSource?: string;
  summary: Record<string, unknown>;
  previousRecord: EntityData | null;
  nextRecord: EntityData | null;
  createdDate: string;
}) {
  if (!isPostgresEnabledForRuntime() || !pool) return;
  await pool.query(
    `
      INSERT INTO audit_log (
        id, entity, record_id, action, actor_id, actor_email, actor_name, actor_role, request_source,
        summary_json, previous_data, next_data, created_date
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12::jsonb, $13::timestamptz)
      ON CONFLICT (id) DO UPDATE SET
        entity = EXCLUDED.entity,
        record_id = EXCLUDED.record_id,
        action = EXCLUDED.action,
        actor_id = EXCLUDED.actor_id,
        actor_email = EXCLUDED.actor_email,
        actor_name = EXCLUDED.actor_name,
        actor_role = EXCLUDED.actor_role,
        request_source = EXCLUDED.request_source,
        summary_json = EXCLUDED.summary_json,
        previous_data = EXCLUDED.previous_data,
        next_data = EXCLUDED.next_data,
        created_date = EXCLUDED.created_date
    `,
    [
      input.id,
      input.entity,
      input.recordId,
      input.action,
      input.actor?.id || "",
      input.actor?.email || "",
      input.actor?.full_name || "",
      input.actor?.role || "",
      input.requestSource || "",
      JSON.stringify(input.summary || {}),
      input.previousRecord ? JSON.stringify(input.previousRecord) : null,
      input.nextRecord ? JSON.stringify(input.nextRecord) : null,
      input.createdDate,
    ]
  );
}

export async function writeAttachmentVersionToPostgres(record: AttachmentVersionRecord) {
  if (!isPostgresEnabledForRuntime() || !pool) return;
  await pool.query(
    `
      INSERT INTO attachment_versions (
        id, attachment_id, version_number, related_id, related_type, name, stored_name,
        mime_type, size, relative_path, url, checksum, source, actor_id, actor_email,
        actor_name, created_date
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17::timestamptz)
      ON CONFLICT (id) DO UPDATE SET
        attachment_id = EXCLUDED.attachment_id,
        version_number = EXCLUDED.version_number,
        related_id = EXCLUDED.related_id,
        related_type = EXCLUDED.related_type,
        name = EXCLUDED.name,
        stored_name = EXCLUDED.stored_name,
        mime_type = EXCLUDED.mime_type,
        size = EXCLUDED.size,
        relative_path = EXCLUDED.relative_path,
        url = EXCLUDED.url,
        checksum = EXCLUDED.checksum,
        source = EXCLUDED.source,
        actor_id = EXCLUDED.actor_id,
        actor_email = EXCLUDED.actor_email,
        actor_name = EXCLUDED.actor_name,
        created_date = EXCLUDED.created_date
    `,
    [
      record.id,
      record.attachment_id,
      Number(record.version_number || 1),
      record.related_id,
      record.related_type,
      record.name,
      record.stored_name,
      record.mime_type,
      Number(record.size || 0),
      record.relative_path,
      record.url,
      record.checksum || "",
      record.source || "",
      record.actor_id || "",
      record.actor_email || "",
      record.actor_name || "",
      record.created_date,
    ]
  );
}

export async function deleteAttachmentVersionsFromPostgres(attachmentId: string) {
  if (!isPostgresEnabledForRuntime() || !pool) return;
  await pool.query("DELETE FROM attachment_versions WHERE attachment_id = $1", [attachmentId]);
}

export async function queryPostgresTableCounts() {
  if (!pool || !isPostgresEnabledForRuntime()) {
    return {
      entity_rows: 0,
      audit_rows: 0,
      attachment_version_rows: 0,
    };
  }

  const [entityRows, auditRows, attachmentVersionRows] = await Promise.all([
    pool.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM entity_records"),
    pool.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM audit_log"),
    pool.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM attachment_versions"),
  ]);

  return {
    entity_rows: Number(entityRows.rows[0]?.count || 0),
    audit_rows: Number(auditRows.rows[0]?.count || 0),
    attachment_version_rows: Number(attachmentVersionRows.rows[0]?.count || 0),
  };
}

export async function queryPostgresParitySnapshot(options: { limit?: number; entity?: string } = {}) {
  const snapshot = {
    enabled: isPostgresEnabledForRuntime(),
    primary: isPostgresPrimary(),
    connected: Boolean(pool),
    entity_rows: 0,
    audit_rows: 0,
    sampled: [] as Array<{ id: string; entity: string; row_version: number }>,
  };
  if (!pool || !isPostgresEnabledForRuntime()) return snapshot;

  const entityFilter = String(options.entity || "").trim();
  const limit = Math.max(1, Math.min(200, Number(options.limit || 50)));
  const entityCount = await pool.query<{ count: string }>(
    entityFilter
      ? "SELECT COUNT(*)::text AS count FROM entity_records WHERE entity = $1"
      : "SELECT COUNT(*)::text AS count FROM entity_records",
    entityFilter ? [entityFilter] : []
  );
  const auditCount = await pool.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM audit_log");
  const sampleRows = await pool.query<{ id: string; entity: string; row_version: number }>(
    entityFilter
      ? "SELECT id, entity, row_version FROM entity_records WHERE entity = $1 ORDER BY updated_date DESC LIMIT $2"
      : "SELECT id, entity, row_version FROM entity_records ORDER BY updated_date DESC LIMIT $1",
    entityFilter ? [entityFilter, limit] : [limit]
  );

  snapshot.entity_rows = Number(entityCount.rows[0]?.count || 0);
  snapshot.audit_rows = Number(auditCount.rows[0]?.count || 0);
  snapshot.sampled = sampleRows.rows.map((row: { id: string; entity: string; row_version: number }) => ({
    id: String(row.id || ""),
    entity: String(row.entity || ""),
    row_version: Number(row.row_version || 0),
  }));
  return snapshot;
}

export async function runPostgresQuery(sql: string, values: unknown[] = []) {
  return assertPool().query(sql, values);
}

export async function runPostgresTransaction<T>(fn: (client: PoolClient) => Promise<T>) {
  const targetPool = assertPool();
  const client = await targetPool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function listPostgresMigrations() {
  if (!pool) return [];
  const result = await pool.query<{ version: number; name: string; applied_at: string }>(
    "SELECT version, name, applied_at FROM schema_migrations ORDER BY version ASC"
  );
  return result.rows.map((row: { version: number; name: string; applied_at: string }) => ({
    version: Number(row.version || 0),
    name: String(row.name || ""),
    applied_at: String(row.applied_at || ""),
  }));
}

export async function verifyPostgresSchema() {
  const expected = MIGRATIONS.map((migration) => `${migration.version}:${migration.name}`).join(",");
  const rows = await listPostgresMigrations();
  const actual = rows.map((row: { version: number; name: string }) => `${row.version}:${row.name}`).join(",");
  return {
    ok: expected === actual,
    expected,
    actual,
  };
}

export function getPostgresLatestMigrationVersion() {
  return MIGRATIONS[MIGRATIONS.length - 1]?.version || 0;
}

export function getPostgresExpectedMigrations() {
  return MIGRATIONS.map((migration) => ({
    version: migration.version,
    name: migration.name,
  }));
}

function readSslMode() {
  const mode = String(process.env.PGSSL || "").trim().toLowerCase();
  if (["1", "true", "require", "yes", "on"].includes(mode)) {
    return { rejectUnauthorized: false };
  }
  return undefined;
}

function stripEntityMetadata(record: EntityRecord): EntityData {
  const {
    id,
    created_date,
    updated_date,
    row_version,
    ...rest
  } = record;
  void id;
  void created_date;
  void updated_date;
  void row_version;
  return rest;
}

export async function runPostgresMaintenanceQuery(sql: string, values: unknown[] = []) {
  if (!pool) {
    return null as QueryResult<Record<string, unknown>> | null;
  }
  return pool.query(sql, values);
}
