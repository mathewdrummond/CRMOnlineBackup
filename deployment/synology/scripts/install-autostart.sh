#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
. "${SCRIPT_DIR}/lib/common.sh"

export PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/syno/bin:/usr/syno/sbin:${PATH:-}"

load_env_files

cron_file="/etc/crontab"
start_script="${SCRIPT_DIR}/start-joinerflow-stack.sh"
watchdog_script="${SCRIPT_DIR}/watchdog-joinerflow-stack.sh"
log_dir="${LOG_DIRECTORY:-${JOINERFLOW_INSTALL_ROOT}/logs}"
cron_marker="# JoinerFlow autostart/watchdog"
start_command="${start_script} >> ${log_dir}/autostart.log 2>&1"
watchdog_command="${watchdog_script} >> ${log_dir}/watchdog-cron.log 2>&1"

if [ "$(id -u)" -ne 0 ]; then
  log_error "install-autostart.sh must run as root on Synology DSM."
  exit 1
fi

mkdir -p "$log_dir"
chmod +x "$start_script" "$watchdog_script"

tmp_file="$(mktemp /tmp/joinerflow-crontab.XXXXXX)"
trap 'rm -f "$tmp_file"' EXIT

if [ -f "$cron_file" ]; then
  awk '
    $0 == "# JoinerFlow autostart/watchdog" { skip = 1; next }
    skip && $0 == "# End JoinerFlow autostart/watchdog" { skip = 0; next }
    !skip { print }
  ' "$cron_file" > "$tmp_file"
else
  cat > "$tmp_file" <<'EOF'
MAILTO=""
PATH=/sbin:/bin:/usr/sbin:/usr/bin:/usr/syno/sbin:/usr/syno/bin:/usr/local/sbin:/usr/local/bin
#minute	hour	mday	month	wday	who	command
EOF
fi

cat >> "$tmp_file" <<EOF
${cron_marker}
@reboot root ${start_command}
*/5 * * * * root ${watchdog_command}
# End JoinerFlow autostart/watchdog
EOF

cp "$cron_file" "${cron_file}.backup.$(date +%Y%m%d-%H%M%S)" 2>/dev/null || true
cp "$tmp_file" "$cron_file"
chmod 644 "$cron_file"

if command -v synosystemctl >/dev/null 2>&1; then
  synosystemctl restart crond >/dev/null 2>&1 || true
elif command -v synoservice >/dev/null 2>&1; then
  synoservice --restart crond >/dev/null 2>&1 || true
elif [ -x /etc/rc.d/S04crond.sh ]; then
  /etc/rc.d/S04crond.sh restart >/dev/null 2>&1 || true
fi

log_info "Installed JoinerFlow root cron autostart and watchdog entries."
log_info "Boot start command: ${start_command}"
log_info "Watchdog command: ${watchdog_command}"
