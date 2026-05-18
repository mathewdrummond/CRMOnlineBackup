# Synology Backup and Recovery

## What Is Backed Up

`deployment/synology/scripts/backup-joinerflow.sh` captures:

- SQLite snapshot (`database.sqlite`)
- attachment filesystem
- embeddings data
- AI model/runtime data directory
- Docker deployment config
- diagnostics directory
- manifest metadata and SQLite integrity output

Backup destination:

```text
/volume1/joinerflow/backups/snapshot-YYYYMMDD-HHMMSS
```

## Create a Backup

```bash
./deployment/synology/scripts/backup-joinerflow.sh
./deployment/synology/scripts/check-backups.sh
```

`check-backups.sh` validates required snapshot contents and SQLite integrity.

## Restore Procedure

1. Select a validated snapshot.
2. Run restore script:

```bash
./deployment/synology/scripts/restore-joinerflow.sh /volume1/joinerflow/backups/snapshot-YYYYMMDD-HHMMSS
```

Restore behavior:

1. Validates snapshot structure.
2. Runs integrity check on snapshot database.
3. Creates safety backup of current live state.
4. Stops stack, restores data, restarts stack.
5. Runs health checks post-restore.

## Rollback Strategy

If restore validation fails:

1. Use the auto-created safety snapshot from step 3 above.
2. Restore back to the safety snapshot using the same restore command.

## Scheduled Backups

Use `deployment/synology/system/joinerflow-backup.cron.example` in DSM Task Scheduler (or cron) for daily backup + verification.

## Retention Guidance

Recommended baseline:

1. Keep daily snapshots for 14 days.
2. Keep weekly snapshots for 8 weeks.
3. Keep monthly snapshots for 6 months.

Implement retention with a periodic cleanup script or DSM backup policy.
