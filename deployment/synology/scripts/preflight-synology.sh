#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
. "${SCRIPT_DIR}/lib/common.sh"

load_env_files

PASS=0
FAIL=0
WARN=0
declare -a REMEDIATIONS=()

pass() { PASS=$((PASS + 1)); printf 'PASS %-34s %s\n' "$1" "$2"; }
fail() { FAIL=$((FAIL + 1)); printf 'FAIL %-34s %s\n' "$1" "$2"; REMEDIATIONS+=("$3"); }
warn() { WARN=$((WARN + 1)); printf 'WARN %-34s %s\n' "$1" "$2"; [ -n "${3:-}" ] && REMEDIATIONS+=("$3"); }

check_cmd() {
  local cmd="$1"
  local label="$2"
  local remediation="$3"
  if command -v "$cmd" >/dev/null 2>&1; then
    pass "$label" "$cmd found"
  else
    fail "$label" "$cmd is missing" "$remediation"
  fi
}

check_port_free() {
  local port="$1"
  local label="$2"
  if command -v ss >/dev/null 2>&1; then
    if ss -lnt "( sport = :$port )" 2>/dev/null | grep -q ":$port"; then
      fail "$label" "port ${port} already in use" "Stop or remap the service using port ${port}."
      return
    fi
  elif command -v netstat >/dev/null 2>&1; then
    if netstat -lnt 2>/dev/null | grep -E "[\.:]${port}[[:space:]]" >/dev/null; then
      fail "$label" "port ${port} already in use" "Stop or remap the service using port ${port}."
      return
    fi
  fi
  pass "$label" "port ${port} available"
}

printf 'JoinerFlow Synology preflight\n'
printf 'Repository: %s\n' "$REPO_ROOT"
printf 'Install root: %s\n\n' "${JOINERFLOW_INSTALL_ROOT}"

if [ -f /etc.defaults/VERSION ]; then
  dsm_version="$(awk -F= '/^productversion=/{gsub(/"/,"",$2);print $2}' /etc.defaults/VERSION)"
  dsm_build="$(awk -F= '/^buildnumber=/{gsub(/"/,"",$2);print $2}' /etc.defaults/VERSION)"
  if [ -n "$dsm_version" ]; then
    pass "DSM version" "${dsm_version}-${dsm_build:-unknown}"
  else
    warn "DSM version" "Unable to parse /etc.defaults/VERSION" "Validate DSM is 7.2+ before deployment."
  fi
else
  warn "DSM version" "Not running on DSM host" "Run this preflight directly on the Synology NAS shell."
fi

if command -v synopkg >/dev/null 2>&1; then
  if synopkg status ContainerManager >/dev/null 2>&1 || synopkg status Docker >/dev/null 2>&1; then
    pass "Container Manager" "Package is installed"
  else
    fail "Container Manager" "Package not installed" "Install Synology Container Manager (DSM 7.2+) from Package Center."
  fi
else
  warn "Container Manager" "synopkg not found" "Install Docker/Container Manager and ensure Docker CLI is available."
fi

check_cmd docker "Docker CLI" "Install Container Manager and verify /usr/bin/docker exists."
check_cmd awk "Core utilities" "Install base shell utilities."
check_cmd curl "HTTP tools" "Install curl for diagnostics and health checks."
check_cmd jq "JSON tools" "Install jq for diagnostic scripts."
if command -v node >/dev/null 2>&1; then
  node_version="$(node -v | sed 's/^v//')"
  node_major="$(printf '%s' "$node_version" | cut -d. -f1)"
  node_minor="$(printf '%s' "$node_version" | cut -d. -f2)"
  if [ "$node_major" -gt 20 ] || { [ "$node_major" -eq 20 ] && [ "$node_minor" -ge 19 ]; }; then
    pass "Node runtime" "v${node_version}"
  else
    fail "Node runtime" "v${node_version} is unsupported" "Install Node 20.19+ or 22.12+ for host-side builds."
  fi
else
  warn "Node runtime" "node binary not found" "Node is required for build/test scripts on host."
fi

if command -v docker >/dev/null 2>&1; then
  if docker version >/dev/null 2>&1; then
    pass "Docker daemon" "Docker daemon is reachable"
  else
    fail "Docker daemon" "Docker daemon is unavailable" "Start Container Manager and verify dockerd is running."
  fi
fi

arch="$(uname -m)"
case "$arch" in
  aarch64|arm64|x86_64)
    pass "CPU architecture" "$arch supported"
    ;;
  *)
    warn "CPU architecture" "$arch untested" "Use arm64 or x86_64 for official deployment path."
    ;;
esac

mem_kb="$(awk '/MemTotal/ {print $2}' /proc/meminfo 2>/dev/null || echo 0)"
if [ "$mem_kb" -ge 1800000 ]; then
  pass "Memory capacity" "$(awk "BEGIN {printf \"%.1f\", $mem_kb/1024/1024}") GiB detected"
elif ! is_true "${AI_ENABLED:-true}" && [ "$mem_kb" -ge 1500000 ]; then
  warn "Memory capacity" "$(awk "BEGIN {printf \"%.1f\", $mem_kb/1024/1024}") GiB detected; AI containers disabled" "Keep AI_ENABLED=false on low-memory NAS models."
else
  fail "Memory capacity" "Less than 1.8 GiB RAM detected" "Increase memory or disable optional AI containers."
fi

avail_kb="$(df -Pk "${JOINERFLOW_INSTALL_ROOT%/*}" 2>/dev/null | awk 'NR==2 {print $4}' || echo 0)"
if [ "$avail_kb" -ge 15728640 ]; then
  pass "Storage capacity" "$(awk "BEGIN {printf \"%.1f\", $avail_kb/1024/1024}") GiB available"
else
  fail "Storage capacity" "Less than 15 GiB available" "Free space in /volume1 before installation."
fi

check_port_free "${JOINERFLOW_PROXY_HTTP_PORT:-80}" "HTTP port"
check_port_free "${JOINERFLOW_PROXY_HTTPS_PORT:-443}" "HTTPS port"
check_port_free "${JOINERFLOW_SERVER_PORT:-4000}" "API diagnostics port"
check_port_free "${JOINERFLOW_POSTGRES_PORT:-5432}" "PostgreSQL port"
if is_true "${AI_ENABLED:-true}"; then
  if uses_local_qdrant; then
    check_port_free "${JOINERFLOW_QDRANT_PORT:-6333}" "Qdrant port"
  else
    pass "Qdrant port" "remote endpoint configured; no local port required"
  fi
fi
if is_true "${JOINERFLOW_ENABLE_OPEN_WEBUI:-false}"; then
  check_port_free "${JOINERFLOW_OPEN_WEBUI_PORT:-3001}" "Open WebUI port"
fi

for path_key in JOINERFLOW_INSTALL_ROOT; do
  path_value="${!path_key:-}"
  if ensure_absolute_path "$path_value" "$path_key" >/dev/null 2>&1; then
    pass "$path_key path" "$path_value"
  else
    fail "$path_key path" "$path_value is not absolute" "Set ${path_key} to an absolute DSM volume path."
  fi
done

subdirs=(app server client clock-client filesystem backups logs embeddings imports temp diagnostics)
if is_true "${AI_ENABLED:-true}" && { uses_local_ollama || is_true "${JOINERFLOW_ENABLE_OPEN_WEBUI:-false}"; }; then
  subdirs+=(ai ai/models ai/open-webui)
fi

for subdir in "${subdirs[@]}"; do
  target="${JOINERFLOW_INSTALL_ROOT}/${subdir}"
  mkdir -p "$target" 2>/dev/null || true
  if [ -d "$target" ] && [ -w "$target" ]; then
    pass "Write path ${subdir}" "$target writable"
  else
    fail "Write path ${subdir}" "$target is not writable" "Fix ownership/permissions for ${target}."
  fi
done

if [ -n "${PUBLIC_API_ORIGIN:-}" ] && printf '%s' "${PUBLIC_API_ORIGIN}" | grep -Eq '^https://[^/]+$'; then
  pass "PUBLIC_API_ORIGIN" "${PUBLIC_API_ORIGIN}"
else
  fail "PUBLIC_API_ORIGIN" "${PUBLIC_API_ORIGIN:-missing}" "Set PUBLIC_API_ORIGIN to an HTTPS origin (no path)."
fi

if [ -n "${JOINERFLOW_PUBLIC_ORIGIN:-}" ] && printf '%s' "${JOINERFLOW_PUBLIC_ORIGIN}" | grep -Eq '^https://[^/]+$'; then
  pass "JOINERFLOW_PUBLIC_ORIGIN" "${JOINERFLOW_PUBLIC_ORIGIN}"
else
  fail "JOINERFLOW_PUBLIC_ORIGIN" "${JOINERFLOW_PUBLIC_ORIGIN:-missing}" "Set JOINERFLOW_PUBLIC_ORIGIN to the CRM HTTPS origin."
fi

if [ -n "${JOINERFLOW_TIMECLOCK_ORIGIN:-}" ]; then
  if printf '%s' "${JOINERFLOW_TIMECLOCK_ORIGIN}" | grep -Eq '^https://[^/]+$'; then
    pass "JOINERFLOW_TIMECLOCK_ORIGIN" "${JOINERFLOW_TIMECLOCK_ORIGIN}"
  else
    fail "JOINERFLOW_TIMECLOCK_ORIGIN" "${JOINERFLOW_TIMECLOCK_ORIGIN}" "Set JOINERFLOW_TIMECLOCK_ORIGIN to an HTTPS origin (no path)."
  fi
else
  warn "JOINERFLOW_TIMECLOCK_ORIGIN" "Time clock origin is unset" "Set JOINERFLOW_TIMECLOCK_ORIGIN for kiosk deployments."
fi

database_driver="$(printf '%s' "${DATABASE_DRIVER:-sqlite}" | tr '[:upper:]' '[:lower:]')"
if [ "$database_driver" = "postgres" ]; then
  pass "Database driver" "PostgreSQL"
  if [ -n "${DATABASE_URL:-}" ] || [ -n "${PGHOST:-}" ]; then
    pass "PostgreSQL config" "Connection settings configured"
  else
    fail "PostgreSQL config" "DATABASE_URL/PG* missing" "Set DATABASE_URL or PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD."
  fi
else
  pass "Database driver" "SQLite"
  if [ -n "${SQLITE_PATH:-}" ] && [ "${SQLITE_PATH#/}" != "${SQLITE_PATH}" ]; then
    sqlite_dir="$(dirname "$SQLITE_PATH")"
    mkdir -p "$sqlite_dir" 2>/dev/null || true
    if [ -w "$sqlite_dir" ]; then
      pass "SQLite path" "${SQLITE_PATH}"
    else
      fail "SQLite path" "${SQLITE_PATH} not writable" "Grant write access to SQLite directory."
    fi
  else
    fail "SQLite path" "${SQLITE_PATH:-missing}" "Set SQLITE_PATH to an absolute path."
  fi
fi

if is_true "${AI_ENABLED:-true}" && [ -n "${OLLAMA_BASE_URL:-}" ]; then
  if printf '%s' "$OLLAMA_BASE_URL" | grep -Eq '^https?://'; then
    pass "Ollama endpoint format" "$OLLAMA_BASE_URL"
  else
    fail "Ollama endpoint format" "$OLLAMA_BASE_URL" "Set OLLAMA_BASE_URL to http://ai.millbrook:11434, http://ollama:11434, or another valid HTTP(S) endpoint."
  fi
fi

if is_true "${AI_ENABLED:-true}" && [ -n "${QDRANT_URL:-}" ]; then
  if printf '%s' "$QDRANT_URL" | grep -Eq '^https?://'; then
    pass "Qdrant endpoint format" "$QDRANT_URL"
  else
    fail "Qdrant endpoint format" "$QDRANT_URL" "Set QDRANT_URL to http://ai.millbrook:6333, http://qdrant:6333, or another valid HTTP(S) endpoint."
  fi
fi

if is_true "${AI_ENABLED:-true}"; then
  if [ -n "${OLLAMA_PRIMARY_MODEL:-}" ] && [ -n "${OLLAMA_FAST_MODEL:-}" ] && [ -n "${OLLAMA_EMBED_MODEL:-}" ]; then
    pass "AI model config" "${OLLAMA_PRIMARY_MODEL}, ${OLLAMA_FAST_MODEL}, ${OLLAMA_EMBED_MODEL}"
  else
    fail "AI model config" "Required Ollama model variables are missing" "Set OLLAMA_PRIMARY_MODEL, OLLAMA_FAST_MODEL and OLLAMA_EMBED_MODEL in env/.env.ai."
  fi

  if validate_absolute_csv_paths "AI_KNOWLEDGE_ALLOWED_ROOTS"; then
    pass "AI knowledge allowlist" "${AI_KNOWLEDGE_ALLOWED_ROOTS:-<empty>}"
  else
    fail "AI knowledge allowlist" "${AI_KNOWLEDGE_ALLOWED_ROOTS:-missing}" "Set AI_KNOWLEDGE_ALLOWED_ROOTS to comma-separated absolute paths."
  fi

  if [ -n "${FILESYSTEM_ROOT:-}" ] && ! printf '%s' "${AI_KNOWLEDGE_ALLOWED_ROOTS:-}" | tr ',' '\n' | sed 's/^[[:space:]]*//; s/[[:space:]]*$//' | grep -Fx "${FILESYSTEM_ROOT}" >/dev/null 2>&1; then
    fail "AI knowledge coverage" "FILESYSTEM_ROOT not present in AI_KNOWLEDGE_ALLOWED_ROOTS" "Add FILESYSTEM_ROOT to AI_KNOWLEDGE_ALLOWED_ROOTS."
  else
    pass "AI knowledge coverage" "FILESYSTEM_ROOT is allowlisted"
  fi
else
  warn "AI subsystem" "AI_ENABLED is false; AI assist/search features will be unavailable" "Set AI_ENABLED=true to enable local inference and semantic retrieval."
fi

if command -v ping >/dev/null 2>&1; then
  if ping -c1 -W2 1.1.1.1 >/dev/null 2>&1; then
    pass "Network egress" "Internet egress available"
  else
    warn "Network egress" "Unable to reach 1.1.1.1" "Model pulls and npm install may fail without internet access."
  fi
fi

if command -v lsblk >/dev/null 2>&1; then
  if lsblk -d -o rota 2>/dev/null | tail -n +2 | grep -q '^1$'; then
    warn "Storage type" "Rotational disk detected" "Use SSD cache or SSD volume for better SQLite and embedding performance."
  else
    pass "Storage type" "Non-rotational storage detected"
  fi
fi

printf '\nSummary\n'
printf '  Passed: %s\n' "$PASS"
printf '  Warnings: %s\n' "$WARN"
printf '  Failed: %s\n' "$FAIL"

if [ "${#REMEDIATIONS[@]}" -gt 0 ]; then
  printf '\nRemediation guidance\n'
  printf '  - %s\n' "${REMEDIATIONS[@]}"
fi

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
