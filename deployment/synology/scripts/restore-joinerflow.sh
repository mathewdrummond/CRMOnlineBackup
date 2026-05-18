#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
. "${SCRIPT_DIR}/lib/common.sh"

load_env_files
require_cmd rsync

snapshot_path="${1:-}"
if [ -z "$snapshot_path" ]; then
  log_error "Usage: restore-joinerflow.sh <snapshot-path>"
  exit 1
fi

if [ ! -d "$snapshot_path" ]; then
  log_error "Snapshot does not exist: ${snapshot_path}"
  exit 1
fi

required_components=(filesystem embeddings imports docker diagnostics manifest.env)
if is_true "${AI_ENABLED:-true}"; then
  required_components+=(vector-db ai)
fi

for required in "${required_components[@]}"; do
  if [ ! -e "${snapshot_path}/${required}" ]; then
    log_error "Snapshot missing required component: ${required}"
    exit 1
  fi
done

database_driver="$(printf '%s' "${DATABASE_DRIVER:-sqlite}" | tr '[:upper:]' '[:lower:]')"
if [ "$database_driver" = "postgres" ]; then
  if [ ! -f "${snapshot_path}/database.postgres.sql" ]; then
    log_error "Snapshot missing PostgreSQL dump: database.postgres.sql"
    exit 1
  fi
else
  if [ ! -f "${snapshot_path}/database.sqlite" ]; then
    log_error "Snapshot missing SQLite database file: database.sqlite"
    exit 1
  fi
fi

if [ "$database_driver" != "postgres" ] && command -v sqlite3 >/dev/null 2>&1; then
  integrity="$(sqlite3 "${snapshot_path}/database.sqlite" 'PRAGMA integrity_check;' || true)"
  if [ "$integrity" != "ok" ]; then
    log_error "Snapshot database integrity failed: ${integrity}"
    exit 1
  fi
fi

log_info "Creating safety backup before restore."
"${SCRIPT_DIR}/backup-joinerflow.sh" >/dev/null

log_info "Stopping JoinerFlow stack for restore."
compose_prod down

restore_dir() {
  local source="$1"
  local target="$2"

  if [ ! -d "$source" ]; then
    log_warn "Snapshot component missing, skipping restore: ${source}"
    return 0
  fi

  mkdir -p "$target"
  rsync -a --delete "${source%/}/" "${target%/}/"
}

if [ "$database_driver" = "postgres" ]; then
  compose_prod up -d postgres
  compose_prod exec -T postgres psql -U "${PGUSER:-joinerflow}" -d "${PGDATABASE:-joinerflow}" -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;"
  compose_prod exec -T postgres psql -U "${PGUSER:-joinerflow}" -d "${PGDATABASE:-joinerflow}" < "${snapshot_path}/database.postgres.sql"
else
  tmp_db="${SQLITE_PATH}.restore.$(date +%s).tmp"
  cp -a "${snapshot_path}/database.sqlite" "$tmp_db"
  mv "$tmp_db" "${SQLITE_PATH}"
fi

restore_dir "${snapshot_path}/filesystem" "${FILESYSTEM_ROOT}"
restore_dir "${snapshot_path}/embeddings" "${JOINERFLOW_INSTALL_ROOT}/embeddings"
if is_true "${AI_ENABLED:-true}"; then
  restore_dir "${snapshot_path}/vector-db/qdrant" "/volume1/vector-data/qdrant"
  restore_dir "${snapshot_path}/ai" "${JOINERFLOW_INSTALL_ROOT}/ai"
fi
restore_dir "${snapshot_path}/imports" "${JOINERFLOW_INSTALL_ROOT}/imports"
restore_dir "${snapshot_path}/diagnostics" "${JOINERFLOW_INSTALL_ROOT}/diagnostics"
restore_dir "${snapshot_path}/postgres-data" "/volume1/docker/postgres"

log_info "Starting JoinerFlow stack after restore."
compose_prod up -d

"${SCRIPT_DIR}/check-health.sh"

log_info "Restore completed successfully from ${snapshot_path}."
