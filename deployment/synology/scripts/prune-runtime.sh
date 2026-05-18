#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
. "${SCRIPT_DIR}/lib/common.sh"

load_env_files

diag_root="${JOINERFLOW_INSTALL_ROOT}/diagnostics"
backup_root="${BACKUP_ROOT:-${JOINERFLOW_INSTALL_ROOT}/backups}"

diag_keep_days="${DIAGNOSTICS_RETENTION_DAYS:-14}"
backup_keep_days="${BACKUP_RETENTION_DAYS:-60}"

log_info "Pruning diagnostics older than ${diag_keep_days} days."
find "${diag_root}" -type f -mtime +"${diag_keep_days}" -delete 2>/dev/null || true

log_info "Pruning backup snapshots older than ${backup_keep_days} days."
find "${backup_root}" -maxdepth 1 -mindepth 1 -type d -name 'snapshot-*' -mtime +"${backup_keep_days}" -exec rm -rf {} + 2>/dev/null || true

log_info "Removing orphan containers."
compose_prod down --remove-orphans || true
compose_prod up -d

log_info "Runtime prune complete."
