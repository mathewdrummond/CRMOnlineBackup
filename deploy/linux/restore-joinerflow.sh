#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${1:-/opt/joinerflow}"
BACKUP_PATH="${2:-}"
SAFETY_BACKUP_ROOT="${3:-/var/backups/joinerflow/pre-restore}"

if [ -z "$BACKUP_PATH" ]; then
  echo "Usage: restore-joinerflow.sh <repo-root> <backup-path> [safety-backup-root]" >&2
  exit 1
fi

if [ ! -d "$BACKUP_PATH/server/data" ]; then
  echo "Backup is missing server/data. Restore aborted before changing live data." >&2
  exit 1
fi

if [ ! -d "$BACKUP_PATH/server/filesystem" ]; then
  echo "Backup is missing server/filesystem. Restore aborted before changing live data." >&2
  exit 1
fi

if ! find "$BACKUP_PATH/server/data" -maxdepth 1 -type f -name '*.sqlite' | grep -q .; then
  echo "Backup data folder does not contain a .sqlite database. Restore aborted." >&2
  exit 1
fi

STAMP="$(date +%Y%m%d-%H%M%S)"
DATA_PATH="$REPO_ROOT/server/data"
FILESYSTEM_PATH="$REPO_ROOT/server/filesystem"
STAGED_DATA="$DATA_PATH.restore-$STAMP"
STAGED_FILESYSTEM="$FILESYSTEM_PATH.restore-$STAMP"
PREVIOUS_DATA="$DATA_PATH.previous-$STAMP"
PREVIOUS_FILESYSTEM="$FILESYSTEM_PATH.previous-$STAMP"
RESTORE_COMPLETE=0
DATA_SWAPPED=0
FILESYSTEM_SWAPPED=0

rollback_restore() {
  local exit_code=$?
  if [ "$RESTORE_COMPLETE" -eq 1 ]; then
    return "$exit_code"
  fi

  echo "Restore failed. Attempting to put the previous live data back..." >&2

  if [ "$FILESYSTEM_SWAPPED" -eq 1 ]; then
    rm -rf "$FILESYSTEM_PATH"
    if [ -d "$PREVIOUS_FILESYSTEM" ]; then
      mv "$PREVIOUS_FILESYSTEM" "$FILESYSTEM_PATH"
    fi
  fi

  if [ "$DATA_SWAPPED" -eq 1 ]; then
    rm -rf "$DATA_PATH"
    if [ -d "$PREVIOUS_DATA" ]; then
      mv "$PREVIOUS_DATA" "$DATA_PATH"
    fi
  fi

  rm -rf "$STAGED_DATA" "$STAGED_FILESYSTEM"
  echo "Rollback attempt finished. Check $SAFETY_BACKUP_ROOT before retrying." >&2
  return "$exit_code"
}

trap rollback_restore ERR

echo "Creating safety backup before restore..."
"$REPO_ROOT/deploy/linux/backup-joinerflow.sh" "$REPO_ROOT" "$SAFETY_BACKUP_ROOT"

cp -a "$BACKUP_PATH/server/data" "$STAGED_DATA"
cp -a "$BACKUP_PATH/server/filesystem" "$STAGED_FILESYSTEM"

if [ -d "$DATA_PATH" ]; then
  mv "$DATA_PATH" "$PREVIOUS_DATA"
fi
mv "$STAGED_DATA" "$DATA_PATH"
DATA_SWAPPED=1

if [ -d "$FILESYSTEM_PATH" ]; then
  mv "$FILESYSTEM_PATH" "$PREVIOUS_FILESYSTEM"
fi
mv "$STAGED_FILESYSTEM" "$FILESYSTEM_PATH"
FILESYSTEM_SWAPPED=1

if [ -f "$BACKUP_PATH/server/.env.local" ]; then
  cp "$BACKUP_PATH/server/.env.local" "$REPO_ROOT/server/.env.local"
fi

if [ -f "$BACKUP_PATH/server/.env" ]; then
  cp "$BACKUP_PATH/server/.env" "$REPO_ROOT/server/.env"
fi

rm -rf "$PREVIOUS_DATA" "$PREVIOUS_FILESYSTEM"
RESTORE_COMPLETE=1

echo "Restore complete from $BACKUP_PATH"
echo "Safety backup root: $SAFETY_BACKUP_ROOT"
