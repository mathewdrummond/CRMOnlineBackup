#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
. "${SCRIPT_DIR}/lib/common.sh"

load_env_files
require_cmd df

declare -a paths=(
  "${JOINERFLOW_INSTALL_ROOT}"
  "${SQLITE_PATH:-}"
  "${FILESYSTEM_ROOT:-}"
  "${BACKUP_ROOT:-}"
  "${LOG_DIRECTORY:-}"
  "${JOINERFLOW_INSTALL_ROOT}/embeddings"
  "${JOINERFLOW_INSTALL_ROOT}/imports"
)

database_driver="$(printf '%s' "${DATABASE_DRIVER:-sqlite}" | tr '[:upper:]' '[:lower:]')"
if [ "$database_driver" = "postgres" ]; then
  paths+=("/volume1/docker/postgres")
fi
if is_true "${AI_ENABLED:-true}"; then
  paths+=("/volume1/vector-data/qdrant" "${JOINERFLOW_INSTALL_ROOT}/ai")
fi

log_info "Filesystem capacity"
df -h "${JOINERFLOW_INSTALL_ROOT}"

for value in "${paths[@]}"; do
  [ -z "$value" ] && continue
  probe="$value"
  if [ ! -d "$probe" ]; then
    probe="$(dirname "$value")"
  fi
  if [ -d "$probe" ]; then
    if [ -w "$probe" ]; then
      log_info "Writable path: ${probe}"
    else
      log_error "Path not writable: ${probe}"
      exit 1
    fi
  fi
done

if [ "$database_driver" = "sqlite" ] && [ -f "${SQLITE_PATH:-}" ] && command -v sqlite3 >/dev/null 2>&1; then
  integrity="$(sqlite3 "${SQLITE_PATH}" 'PRAGMA integrity_check;' || true)"
  if [ "$integrity" != "ok" ]; then
    log_error "SQLite integrity check failed: ${integrity}"
    exit 1
  fi
  log_info "SQLite integrity check passed."
fi

used_pct="$(df -Pk "${JOINERFLOW_INSTALL_ROOT}" | awk 'NR==2 {gsub(/%/,"",$5); print $5}')"
if [ "$used_pct" -ge 90 ]; then
  log_warn "Disk usage is ${used_pct}% (high pressure)."
fi
