#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
. "${SCRIPT_DIR}/lib/common.sh"

load_env_files
require_cmd rsync

stamp="$(date +%Y%m%d-%H%M%S)"
backup_root="${BACKUP_ROOT:-${JOINERFLOW_INSTALL_ROOT}/backups}"
snapshot_dir="${backup_root}/snapshot-${stamp}"

mkdir -p "${snapshot_dir}"

log_info "Creating backup snapshot at ${snapshot_dir}"

sync_dir() {
  local source="$1"
  local target="$2"
  shift 2

  if [ ! -d "$source" ]; then
    log_warn "Backup source missing, skipping: ${source}"
    return 0
  fi
  if [ ! -r "$source" ] || [ ! -x "$source" ]; then
    log_warn "Backup source not readable, skipping: ${source}"
    return 0
  fi

  mkdir -p "$target"
  rsync -a --delete "$@" "${source%/}/" "${target%/}/"
}

database_driver="$(printf '%s' "${DATABASE_DRIVER:-sqlite}" | tr '[:upper:]' '[:lower:]')"
if [ "$database_driver" = "postgres" ]; then
  compose_prod exec -T postgres pg_dump -U "${PGUSER:-joinerflow}" -d "${PGDATABASE:-joinerflow}" > "${snapshot_dir}/database.postgres.sql"
else
  if command -v sqlite3 >/dev/null 2>&1 && [ -f "${SQLITE_PATH:-}" ]; then
    sqlite3 "${SQLITE_PATH}" ".timeout 8000" ".backup '${snapshot_dir}/database.sqlite'"
  else
    cp -a "${SQLITE_PATH}" "${snapshot_dir}/database.sqlite"
  fi
fi

sync_dir "${FILESYSTEM_ROOT}" "${snapshot_dir}/filesystem"
sync_dir "${JOINERFLOW_INSTALL_ROOT}/embeddings" "${snapshot_dir}/embeddings"
if is_true "${AI_ENABLED:-true}"; then
  sync_dir "/volume1/vector-data/qdrant" "${snapshot_dir}/vector-db/qdrant"
  sync_dir "${JOINERFLOW_INSTALL_ROOT}/ai" "${snapshot_dir}/ai"
else
  log_warn "AI_ENABLED is false; skipping AI and vector database backups."
fi
sync_dir "${JOINERFLOW_INSTALL_ROOT}/imports" "${snapshot_dir}/imports"
sync_dir "${DOCKER_DIR}" "${snapshot_dir}/docker"
sync_dir "${JOINERFLOW_INSTALL_ROOT}/diagnostics" "${snapshot_dir}/diagnostics" \
  --exclude='/caddy/config/caddy/***' \
  --exclude='/caddy/data/caddy/***'
if [ "$database_driver" != "postgres" ]; then
  sync_dir "/volume1/docker/postgres" "${snapshot_dir}/postgres-data"
fi

cat > "${snapshot_dir}/manifest.env" <<EOF
CREATED_AT=$(date -Iseconds)
HOSTNAME=$(hostname)
JOINERFLOW_INSTALL_ROOT=${JOINERFLOW_INSTALL_ROOT}
SQLITE_PATH=${SQLITE_PATH}
FILESYSTEM_ROOT=${FILESYSTEM_ROOT}
BACKUP_ROOT=${backup_root}
DATABASE_DRIVER=${DATABASE_DRIVER:-sqlite}
EOF

if [ "$database_driver" != "postgres" ] && command -v sqlite3 >/dev/null 2>&1; then
  sqlite3 "${snapshot_dir}/database.sqlite" 'PRAGMA integrity_check;' > "${snapshot_dir}/sqlite-integrity.txt"
fi

log_info "Backup complete: ${snapshot_dir}"
printf '%s\n' "${snapshot_dir}"
