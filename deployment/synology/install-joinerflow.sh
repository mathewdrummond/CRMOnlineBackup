#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPTS_DIR="${SCRIPT_DIR}/scripts"

# shellcheck source=scripts/lib/common.sh
. "${SCRIPTS_DIR}/lib/common.sh"

load_env_files

upsert_env() {
  local key="$1"
  local value="$2"
  local file="$3"
  if grep -q "^${key}=" "$file" 2>/dev/null; then
    sed -i'' -e "s#^${key}=.*#${key}=${value}#g" "$file"
  else
    printf '\n%s=%s\n' "$key" "$value" >> "$file"
  fi
}

log_info "Checking base dependency prerequisites."
bash "${SCRIPT_DIR}/installers/install-dependencies-synology.sh"

log_info "Syncing production env defaults from Synology base config."
bash "${SCRIPTS_DIR}/sync-production-defaults.sh"

log_info "Running Synology preflight checks."
bash "${SCRIPTS_DIR}/preflight-synology.sh"

log_info "Preparing filesystem layout."
bash "${SCRIPTS_DIR}/setup-directories.sh"

if [ -z "${AUTH_SESSION_SECRET:-}" ]; then
  AUTH_SESSION_SECRET="$(generate_secret 64)"
  export AUTH_SESSION_SECRET
  upsert_env "AUTH_SESSION_SECRET" "${AUTH_SESSION_SECRET}" "${ENV_DIR}/.env.production"
  log_info "Generated AUTH_SESSION_SECRET in env/.env.production."
fi

if [ -z "${TIMECLOCK_KIOSK_KEY:-}" ]; then
  TIMECLOCK_KIOSK_KEY="$(generate_secret 48)"
  export TIMECLOCK_KIOSK_KEY
  upsert_env "TIMECLOCK_KIOSK_KEY" "${TIMECLOCK_KIOSK_KEY}" "${ENV_DIR}/.env.production"
  log_info "Generated TIMECLOCK_KIOSK_KEY in env/.env.production."
fi

log_info "Validating environment safety constraints."
bash "${SCRIPTS_DIR}/validate-env.sh"

log_info "Building release artifacts."
bash "${SCRIPTS_DIR}/sync-build-artifacts.sh"

log_info "Running production preflight contract checks."
(cd "${REPO_ROOT}" && npm run preflight:prod)

log_info "Building and starting production containers."
compose_prod build
if is_true "${AI_ENABLED:-true}"; then
  compose_prod up -d --remove-orphans
else
  compose_prod up -d --remove-orphans postgres joinerflow-server joinerflow-client joinerflow-clock-client caddy
fi

if is_true "${AI_ENABLED:-true}"; then
  log_info "Installing Ollama models."
  bash "${SCRIPTS_DIR}/install-ollama-models.sh"
else
  log_warn "AI_ENABLED is false; skipping model installation."
fi

if is_true "${JOINERFLOW_ENABLE_OPEN_WEBUI:-false}"; then
  log_info "Starting optional AI services."
  compose_ai --profile ai-optional up -d open-webui
fi

if [ "$(id -u)" -eq 0 ]; then
  log_info "Installing Synology autostart and watchdog cron entries."
  bash "${SCRIPTS_DIR}/install-autostart.sh"
else
  log_warn "Not running as root; skipping autostart cron installation. Run scripts/install-autostart.sh with sudo on the NAS."
fi

log_info "Running startup diagnostics."
bash "${SCRIPTS_DIR}/check-health.sh"
if is_true "${AI_ENABLED:-true}"; then
  bash "${SCRIPTS_DIR}/check-ai.sh"
fi
bash "${SCRIPTS_DIR}/check-storage.sh"

log_info "Creating initial backup snapshot."
bash "${SCRIPTS_DIR}/backup-joinerflow.sh" >/dev/null
bash "${SCRIPTS_DIR}/check-backups.sh"

log_info "Synology installation completed."
printf 'CRM URL:   %s\n' "${PUBLIC_API_ORIGIN}"
printf 'Clock URL: %s\n' "${JOINERFLOW_TIMECLOCK_ORIGIN:-<configure in env/.env.synology>}"
