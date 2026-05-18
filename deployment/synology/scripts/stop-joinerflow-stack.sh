#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
. "${SCRIPT_DIR}/lib/common.sh"

load_env_files

log_info "Graceful shutdown sequence started."
log_info "Creating pre-stop backup snapshot."
"${SCRIPT_DIR}/backup-joinerflow.sh" >/dev/null || log_warn "Backup before stop failed; continuing shutdown."

log_info "Stopping reverse proxy and frontend first."
compose_prod stop -t 20 caddy joinerflow-client joinerflow-clock-client || true

log_info "Stopping API service."
compose_prod stop -t 45 joinerflow-server || true

log_info "Stopping AI runtime."
compose_prod stop -t 20 ollama || true

if is_true "${JOINERFLOW_ENABLE_OPEN_WEBUI:-false}"; then
  log_info "Stopping optional AI sidecar services."
  compose_ai --profile ai-optional stop -t 20 open-webui || true
fi

log_info "Stopping vector and database services."
compose_prod stop -t 30 qdrant postgres || true

log_info "JoinerFlow stack stopped."
