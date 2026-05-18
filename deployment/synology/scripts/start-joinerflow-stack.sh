#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
. "${SCRIPT_DIR}/lib/common.sh"

load_env_files
require_cmd curl

log_info "Starting JoinerFlow core containers."
if is_true "${AI_ENABLED:-true}"; then
  compose_prod up -d --remove-orphans postgres qdrant ollama joinerflow-server joinerflow-client joinerflow-clock-client caddy
else
  compose_prod up -d --remove-orphans postgres joinerflow-server joinerflow-client joinerflow-clock-client caddy
fi

if is_true "${JOINERFLOW_ENABLE_OPEN_WEBUI:-false}"; then
  log_info "Starting optional AI sidecar containers."
  compose_ai --profile ai-optional up -d open-webui
fi

log_info "Waiting for server health endpoint."
for i in {1..30}; do
  if curl -fsS "http://127.0.0.1:${JOINERFLOW_SERVER_PORT:-4000}/health" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

"${SCRIPT_DIR}/check-health.sh"
if is_true "${AI_ENABLED:-true}"; then
  "${SCRIPT_DIR}/check-ai.sh"
fi
