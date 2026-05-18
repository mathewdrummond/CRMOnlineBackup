#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cd "$ROOT_DIR"

if ! command -v npm >/dev/null 2>&1; then
  echo "npm was not found in PATH."
  echo "Install Node.js 20.19+ or 22.12+ and rerun this script."
  exit 1
fi

echo "Starting JoinerFlow local services with npm run start:local..."
echo "Service URLs, readiness status, and log paths will be printed by the shared launcher."
echo

exec npm run start:local
