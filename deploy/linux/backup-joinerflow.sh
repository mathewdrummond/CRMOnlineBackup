#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${1:-/opt/joinerflow}"
BACKUP_ROOT="${2:-/var/backups/joinerflow}"
STAMP="$(date +%Y%m%d-%H%M%S)"
DEST="$BACKUP_ROOT/joinerflow-backup-$STAMP"

mkdir -p "$DEST"
mkdir -p "$DEST/server"

copy_if_exists() {
  local source="$1"
  local target="$2"
  if [ -e "$source" ]; then
    cp -a "$source" "$target"
  fi
}

copy_if_exists "$REPO_ROOT/server/data" "$DEST/server/"
copy_if_exists "$REPO_ROOT/server/filesystem" "$DEST/server/"
copy_if_exists "$REPO_ROOT/server/logs" "$DEST/server/"
copy_if_exists "$REPO_ROOT/server/.env.local" "$DEST/server/.env.local"
copy_if_exists "$REPO_ROOT/server/.env" "$DEST/server/.env"

SQLITE_FILE=""
if [ -f "$REPO_ROOT/server/.env" ]; then
  SQLITE_FILE="$(grep -E '^SQLITE_PATH=' "$REPO_ROOT/server/.env" | tail -n 1 | cut -d '=' -f 2- || true)"
fi

if [ -f "$REPO_ROOT/server/.env.local" ]; then
  SQLITE_FILE="$(grep -E '^SQLITE_PATH=' "$REPO_ROOT/server/.env.local" | tail -n 1 | cut -d '=' -f 2- || true)"
fi

SQLITE_FILE="${SQLITE_FILE%\"}"
SQLITE_FILE="${SQLITE_FILE#\"}"
SQLITE_FILE="${SQLITE_FILE%\'}"
SQLITE_FILE="${SQLITE_FILE#\'}"

if [ -n "$SQLITE_FILE" ] && [ "${SQLITE_FILE#/}" = "$SQLITE_FILE" ]; then
  SQLITE_FILE="$REPO_ROOT/server/$SQLITE_FILE"
fi

if [ -n "$SQLITE_FILE" ] && [ -f "$SQLITE_FILE" ] && command -v sqlite3 >/dev/null 2>&1; then
  sqlite3 "$SQLITE_FILE" "PRAGMA integrity_check;" > "$DEST/sqlite-integrity.txt"
fi

cat > "$DEST/manifest.txt" <<MANIFEST
created_at=$(date -Iseconds)
repo_root=$REPO_ROOT
backup_root=$BACKUP_ROOT
sqlite_file=$SQLITE_FILE
MANIFEST

echo "Backup created at $DEST"
