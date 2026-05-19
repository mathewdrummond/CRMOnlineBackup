# Data Protection Strategy

This application is a local-first CRM that currently keeps SQLite as the primary business store, with PostgreSQL infrastructure available for staged shadow writes and future primary operation. RAID or mirrored disks can help with a failed drive, but they do not protect against accidental deletion, application bugs, corrupted writes, ransomware, or bad imports. The recovery strategy is therefore based on verified recovery points, transactional writes, integrity checks, and safe restore promotion.

## Current Data Layer

- Database technology: SQLite via `better-sqlite3` for the primary runtime, with PostgreSQL support gated by `DATABASE_DRIVER` and `DATABASE_SHADOW_WRITE`.
- Primary database path: `SQLITE_PATH`, defaulting to `server/data/joinerflow.sqlite`.
- Local file storage: `FILESYSTEM_ROOT`, defaulting to `server/filesystem`.
- Logs: `LOG_DIRECTORY`, defaulting to `server/logs`.
- ORM: none for the active app. The runtime uses the local entity store in `server/src/db.ts` with optional PostgreSQL mirror infrastructure.
- Main database tables:
  - `entity_records`: all business entities as typed JSON records.
  - `audit_log`: create, update, and delete history.
  - `attachment_versions`: attachment version metadata.
  - `schema_migrations`: applied local schema migrations.
- Critical entities in `entity_records`: leads, quotes, quote items, quote documents, jobs, job operations, contacts, companies, suppliers, pricing items, pricing rules, price list imports, purchase orders, invoices, stock, time entries, app users, app module config, attachments, notes, tasks, reports, and export history.

## Main Risks

- Copying only the main SQLite file while WAL writes are pending.
- A cloud/offline placeholder database file appearing present but containing no resident data.
- Runtime fallback databases being mistaken for the canonical database.
- Manual-only backups that are forgotten during busy work.
- Restore directly over live data without verifying the candidate first.
- Retaining only the latest backup, which preserves bad data after a bad import or accidental deletion.
- Multi-record operations that partially succeed if not wrapped in transactions.

## Implemented Protection

- SQLite runs in WAL mode with `synchronous = FULL` and a busy timeout.
- Entity create, update, and delete operations write the record and audit entry in one SQLite transaction.
- Schema migrations run inside a transaction.
- Managed snapshots use SQLite `VACUUM INTO` where available, falling back to checkpoint-and-copy.
- Each snapshot includes:
  - database checksum
  - compressed database copy
  - SQLite integrity and quick checks
  - SQLite version
  - schema and migration versions
  - entity record counts
  - audit log count
  - filesystem and log summaries
  - app version and timestamp
- Automated scheduled snapshots are enabled by default outside test mode.
- Scheduled snapshot retention is tiered:
  - hourly recovery points for 24 hours
  - daily recovery points for 30 days
  - weekly recovery points for 12 weeks
- Manual and pre-restore safety snapshots are protected from automated tiered retention.
- Restore requires a confirmation token, validates the backup into a temporary database first, creates a pre-restore safety snapshot, then promotes the restored database/files/logs.

## Operational Defaults

Environment variables:

- `BACKUP_ROOT`: backup location. Use a disk or share outside the primary database folder.
- `BACKUP_SCHEDULE_ENABLED`: set `false` to disable the in-app scheduler.
- `BACKUP_INTERVAL_MINUTES`: default `60`, minimum `15`.
- `BACKUP_RETENTION_HOURLY_HOURS`: default `24`.
- `BACKUP_RETENTION_DAILY_DAYS`: default `30`.
- `BACKUP_RETENTION_WEEKLY_WEEKS`: default `12`.

Recommended production layout:

- Put `SQLITE_PATH` on the application data disk.
- Keep the PostgreSQL data volume under the deployment's configured Docker data path when PostgreSQL shadow or primary mode is enabled.
- Keep Qdrant vector data and Ollama models in the Synology runtime data paths when local AI is enabled.
- Put `BACKUP_ROOT` on a different physical disk, NAS share, or synced backup location.
- Copy at least one backup set off the machine each day.
- Keep at least one known-good pre-go-live snapshot permanently.

## Restore Runbook

1. Open System Health and choose the target snapshot.
2. Verify the snapshot. The app checks the database checksum and restores the database into a temporary file for validation.
3. Confirm restore. The server requires the exact token `RESTORE <snapshot-id>`.
4. The app creates a pre-restore safety snapshot of the current live state.
5. The app stages filesystem and log replacement, restores the database, and rolls back staged folders if promotion fails.
6. After restore, check:
   - Admin health database integrity is `ok`.
   - Recent quotes, contacts, jobs, pricing, and time entries are present.
   - Quote/job attachments open.
   - A fresh manual backup can be created.

## Point-In-Time Recovery

SQLite does not provide server-style point-in-time recovery like PostgreSQL WAL archiving. For this application, the practical recovery points are frequent verified snapshots. If true point-in-time recovery becomes a hard requirement, the next architecture step is a managed PostgreSQL deployment with continuous WAL archiving and tested restore drills.

## Optional Standby

A standby copy can be useful for fast inspection, reporting, or manual recovery, but it should not replace backups. If a standby is added, feed it only from verified snapshots or a controlled replication process, and keep historical backups immutable.
