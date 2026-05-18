# JoinerFlow Upgrade Guide

Use this process for every live upgrade.

## Before Upgrade

1. Tell staff the system will be briefly unavailable.
2. Confirm no imports/document generation are running.
3. Create a backup.
4. Confirm backup exists and includes database plus filesystem.
5. Record current version/commit.

## Upgrade Steps

```bash
git pull
npm install
npm run build:release
npm run preflight:prod
sudo systemctl restart joinerflow-api
```

Synology NAS:

```bash
./deployment/synology/scripts/backup-joinerflow.sh
./deployment/synology/restart-joinerflow-synology.sh
./deployment/synology/scripts/check-health.sh
```

## After Upgrade

Check:

- login
- dashboard/operations
- leads
- quote detail
- pricing model
- import wizard
- document generation
- quote list printing
- production handover pack
- Time Clock
- workshop board
- install planner
- backup page/admin health

## Rollback

If an upgrade fails:

1. Stop backend.
2. Restore the pre-upgrade backup.
3. Rebuild or revert code to the previous known-good commit.
4. Run production preflight.
5. Start backend.
6. Validate with the go-live checklist.

Do not keep trying migrations against the same live database without a fresh backup.
