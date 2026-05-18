# Backup And Restore

## What Must Be Backed Up

Always back up:

- `server/data/`
- `server/filesystem/`
- `server/.env.local` or `server/.env`

Recommended as well:

- `server/logs/`

You do not need to back up `.joinerflow-runtime/` because it only contains local launcher state and launcher logs.

## SQLite Notes

The main database file is:

```text
server/data/joinerflow.sqlite
```

If SQLite WAL mode is active, also capture these files together:

- `server/data/joinerflow.sqlite-wal`
- `server/data/joinerflow.sqlite-shm`

Do not copy only the main `.sqlite` file while the API is actively writing unless you are using a filesystem snapshot or have stopped the application first.

## Safe Backup Approach

### Local Managed Stack

For a clean offline backup of the local stack:

```bash
npm run stop:local
```

Then copy:

- `server/data/`
- `server/filesystem/`
- `server/.env.local`
- optionally `server/logs/`

Restart afterwards:

```bash
npm run start:local
```

### Production API

For production:

1. stop the API through your service manager or stop the foreground `start:prod` process
2. copy `server/data/`, `server/filesystem/`, and the active server env file
3. start the API again

If you use host-level snapshots, ensure the snapshot strategy is safe for SQLite and attachment files.

## Synology Backup Scripts

For the NAS deployment, use:

```bash
./deployment/synology/scripts/backup-joinerflow.sh
```

Restore with:

```bash
./deployment/synology/scripts/restore-joinerflow.sh /volume1/joinerflow/backups/snapshot-YYYYMMDD-HHMMSS
```

See `docs/synology-backup-recovery.md` for the Synology backup and restore flow.

## Restore Procedure

1. Stop the API and any local frontend processes that depend on it.
2. Restore `server/data/`.
3. Restore `server/filesystem/`.
4. Restore `server/.env.local` or `server/.env` if needed.
5. Start the application again.
6. Verify:
   - `/health`
   - CRM login
   - recent records
   - attachment access
   - time clock load

## Post-Restore Checks

After restore, verify at least:

```bash
curl http://127.0.0.1:4000/health
npm run smoke
```

If the restored system is used through a reverse proxy, also verify the public CRM URL and sign-in flow.

## Retention Guidance

Recommended minimums:

- daily backups
- multiple retained restore points
- at least one offline or immutable copy
- periodic restore drills

## If The Host Is Compromised

Do not restore application data back onto an untrusted machine without rebuilding or re-hardening the host first.

The application protects its own data paths, but backup safety still depends on host security, patching, and access control.
