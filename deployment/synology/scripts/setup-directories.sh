#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
. "${SCRIPT_DIR}/lib/common.sh"

load_env_files

require_cmd mkdir

declare -a dirs=(
  "${JOINERFLOW_INSTALL_ROOT}"
  "${JOINERFLOW_INSTALL_ROOT}/app"
  "${JOINERFLOW_INSTALL_ROOT}/server"
  "${JOINERFLOW_INSTALL_ROOT}/client"
  "${JOINERFLOW_INSTALL_ROOT}/clock-client"
  "${JOINERFLOW_INSTALL_ROOT}/filesystem"
  "${JOINERFLOW_INSTALL_ROOT}/backups"
  "${JOINERFLOW_INSTALL_ROOT}/logs"
  "${JOINERFLOW_INSTALL_ROOT}/ai"
  "${JOINERFLOW_INSTALL_ROOT}/ai/models"
  "${JOINERFLOW_INSTALL_ROOT}/ai/open-webui"
  "${JOINERFLOW_INSTALL_ROOT}/embeddings"
  "${JOINERFLOW_INSTALL_ROOT}/imports"
  "${JOINERFLOW_INSTALL_ROOT}/temp"
  "${JOINERFLOW_INSTALL_ROOT}/diagnostics"
  "${JOINERFLOW_INSTALL_ROOT}/diagnostics/caddy"
  "${JOINERFLOW_INSTALL_ROOT}/diagnostics/caddy/data"
  "${JOINERFLOW_INSTALL_ROOT}/diagnostics/caddy/config"
  "/volume1/docker/postgres"
  "/volume1/vector-data/qdrant"
)

for dir in "${dirs[@]}"; do
  mkdir -p "$dir"
  if [ ! -w "$dir" ]; then
    log_error "Directory is not writable: ${dir}"
    exit 1
  fi
done

if command -v chown >/dev/null 2>&1; then
  if [ -n "${JOINERFLOW_PUID:-}" ] && [ -n "${JOINERFLOW_PGID:-}" ]; then
    chown -R "${JOINERFLOW_PUID}:${JOINERFLOW_PGID}" "${JOINERFLOW_INSTALL_ROOT}" 2>/dev/null || true
  fi
fi

log_info "Synology directory layout prepared at ${JOINERFLOW_INSTALL_ROOT}."
