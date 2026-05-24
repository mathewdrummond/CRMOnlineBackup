#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
. "${SCRIPT_DIR}/lib/common.sh"

load_env_files
require_cmd find

backup_root="${BACKUP_ROOT:-${JOINERFLOW_INSTALL_ROOT}/backups}"

if [ ! -d "$backup_root" ]; then
  log_error "Backup directory not found: ${backup_root}"
  exit 1
fi

latest="$(find "$backup_root" -maxdepth 1 -type d -name 'snapshot-*' | sort | tail -n 1 || true)"
if [ -z "$latest" ]; then
  log_error "No backup snapshots found in ${backup_root}"
  exit 1
fi

log_info "Latest backup: ${latest}"

database_driver="$(printf '%s' "${DATABASE_DRIVER:-sqlite}" | tr '[:upper:]' '[:lower:]')"
required_components=(manifest.env filesystem embeddings imports docker diagnostics)
if is_true "${AI_ENABLED:-true}"; then
  if uses_local_qdrant; then
    required_components+=(vector-db)
  else
    log_warn "Qdrant endpoint is remote (${QDRANT_URL}); latest NAS snapshot is not expected to contain vector-db."
  fi
  if uses_local_ollama; then
    required_components+=(ai)
  else
    log_warn "Ollama endpoint is remote (${OLLAMA_BASE_URL}); latest NAS snapshot is not expected to contain AI model storage."
  fi
fi

for required in "${required_components[@]}"; do
  if [ ! -e "${latest}/${required}" ]; then
    log_error "Backup missing required component: ${required}"
    exit 1
  fi
done

if [ "$database_driver" = "postgres" ]; then
  if [ ! -f "${latest}/database.postgres.sql" ]; then
    log_error "Backup missing PostgreSQL dump file."
    exit 1
  fi
else
  if [ ! -f "${latest}/database.sqlite" ]; then
    log_error "Backup missing SQLite snapshot."
    exit 1
  fi
  if command -v sqlite3 >/dev/null 2>&1; then
    integrity="$(sqlite3 "${latest}/database.sqlite" 'PRAGMA integrity_check;' || true)"
    if [ "$integrity" != "ok" ]; then
      log_error "Backup SQLite integrity failed: ${integrity}"
      exit 1
    fi
  fi
fi

log_info "Backup integrity checks passed."
