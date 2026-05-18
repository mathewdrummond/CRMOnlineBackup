#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
. "${SCRIPT_DIR}/lib/common.sh"

load_env_files
require_cmd curl
require_cmd jq
require_cmd docker

log_info "Container status"
compose_prod ps

server_health="$(curl -fsS "http://127.0.0.1:${JOINERFLOW_SERVER_PORT:-4000}/health")"
printf '%s\n' "$server_health" | jq .

api_health="$(curl -fsS "http://127.0.0.1:${JOINERFLOW_SERVER_PORT:-4000}/api/health")"
printf '%s\n' "$api_health" | jq .

if is_true "${AI_ENABLED:-true}"; then
  curl -fsS "http://127.0.0.1:${JOINERFLOW_QDRANT_PORT:-6333}/healthz" >/dev/null
fi
compose_prod exec -T postgres pg_isready -U "${PGUSER:-joinerflow}" -d "${PGDATABASE:-joinerflow}" -h 127.0.0.1 -p 5432 >/dev/null

log_info "JoinerFlow health checks passed."
