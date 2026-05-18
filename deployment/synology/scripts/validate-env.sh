#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
. "${SCRIPT_DIR}/lib/common.sh"

load_env_files

errors=0

must_set() {
  local key="$1"
  local value="${!key:-}"
  if [ -z "$value" ]; then
    log_error "Missing required setting: ${key}"
    errors=$((errors + 1))
  fi
}

must_match() {
  local key="$1"
  local pattern="$2"
  local value="${!key:-}"
  if [ -n "$value" ] && ! printf '%s' "$value" | grep -Eq "$pattern"; then
    log_error "Invalid value for ${key}: ${value}"
    errors=$((errors + 1))
  fi
}

check_secret_strength() {
  local key="$1"
  local minimum="$2"
  local value="${!key:-}"
  if [ "${#value}" -lt "$minimum" ]; then
    log_error "${key} must be at least ${minimum} characters."
    errors=$((errors + 1))
  fi
}

must_set "PUBLIC_API_ORIGIN"
must_set "JOINERFLOW_PUBLIC_ORIGIN"
must_set "GOOGLE_CLIENT_ID"
must_set "AUTH_SESSION_SECRET"
must_set "AUTH_BOOTSTRAP_ADMIN_EMAILS"
must_set "TIMECLOCK_KIOSK_KEY"
must_set "FILESYSTEM_ROOT"
must_set "BACKUP_ROOT"
must_set "LOG_DIRECTORY"
must_set "AI_ENABLED"
must_set "DATABASE_DRIVER"

must_match "PUBLIC_API_ORIGIN" '^https://[^/]+$'
must_match "JOINERFLOW_PUBLIC_ORIGIN" '^https://[^/]+$'
must_match "CORS_ORIGIN" '^https://[^,]+(,https://[^,]+)*$'
must_match "GOOGLE_CLIENT_ID" '\.apps\.googleusercontent\.com$'
must_match "OLLAMA_BASE_URL" '^https?://'
must_match "QDRANT_URL" '^https?://'
must_match "AI_ENABLED" '^(true|false|1|0|yes|no|on|off|TRUE|FALSE|YES|NO|ON|OFF)$'
must_match "DATABASE_DRIVER" '^(sqlite|postgres|SQLITE|POSTGRES)$'

check_secret_strength "AUTH_SESSION_SECRET" 32
check_secret_strength "TIMECLOCK_KIOSK_KEY" 24

if [ -n "${JOINERFLOW_TIMECLOCK_ORIGIN:-}" ]; then
  must_match "JOINERFLOW_TIMECLOCK_ORIGIN" '^https://[^/]+$'
fi

if [ -n "${CORS_ORIGIN:-}" ] && [ -n "${PUBLIC_API_ORIGIN:-}" ]; then
  if ! printf '%s' "${CORS_ORIGIN}" | tr ',' '\n' | grep -Fx "${PUBLIC_API_ORIGIN}" >/dev/null 2>&1; then
    log_error "CORS_ORIGIN must include PUBLIC_API_ORIGIN."
    errors=$((errors + 1))
  fi
fi

if [ -n "${PUBLIC_API_ORIGIN:-}" ] && [ -n "${JOINERFLOW_PUBLIC_ORIGIN:-}" ]; then
  if [ "${PUBLIC_API_ORIGIN}" != "${JOINERFLOW_PUBLIC_ORIGIN}" ]; then
    log_error "PUBLIC_API_ORIGIN and JOINERFLOW_PUBLIC_ORIGIN must match."
    errors=$((errors + 1))
  fi
fi

database_driver="$(printf '%s' "${DATABASE_DRIVER:-sqlite}" | tr '[:upper:]' '[:lower:]')"

for abs_key in FILESYSTEM_ROOT BACKUP_ROOT LOG_DIRECTORY JOINERFLOW_INSTALL_ROOT; do
  if ! ensure_absolute_path "${!abs_key:-}" "$abs_key" >/dev/null 2>&1; then
    log_error "${abs_key} must be an absolute path."
    errors=$((errors + 1))
  fi
done

if [ "$database_driver" = "sqlite" ]; then
  must_set "SQLITE_PATH"
  if ! ensure_absolute_path "${SQLITE_PATH:-}" "SQLITE_PATH" >/dev/null 2>&1; then
    log_error "SQLITE_PATH must be an absolute path."
    errors=$((errors + 1))
  fi
else
  if [ -z "${DATABASE_URL:-}" ] && [ -z "${PGHOST:-}" ]; then
    log_error "When DATABASE_DRIVER=postgres set DATABASE_URL or PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD."
    errors=$((errors + 1))
  fi
fi

if ! validate_absolute_csv_paths "AI_KNOWLEDGE_ALLOWED_ROOTS"; then
  errors=$((errors + 1))
fi

if [ -n "${AI_KNOWLEDGE_ALLOWED_ROOTS:-}" ] && [ -n "${FILESYSTEM_ROOT:-}" ]; then
  if ! printf '%s' "${AI_KNOWLEDGE_ALLOWED_ROOTS}" | tr ',' '\n' | sed 's/^[[:space:]]*//; s/[[:space:]]*$//' | grep -Fx "${FILESYSTEM_ROOT}" >/dev/null 2>&1; then
    log_error "AI_KNOWLEDGE_ALLOWED_ROOTS must include FILESYSTEM_ROOT."
    errors=$((errors + 1))
  fi
fi

if is_true "${AI_ENABLED:-true}"; then
  must_set "OLLAMA_PRIMARY_MODEL"
  must_set "OLLAMA_FAST_MODEL"
  must_set "OLLAMA_EMBED_MODEL"
fi

if [ "$errors" -gt 0 ]; then
  log_error "Environment validation failed with ${errors} error(s)."
  exit 1
fi

log_info "Environment validation passed."
