#!/usr/bin/env bash
# Production Gate - shared setup (sourced by all scripts)
# Uses ONLY gym_management_dev. Never touches gym_management_test.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
GATE_DIR="$SCRIPT_DIR"
LOG_DIR="$BACKEND_ROOT/tmp/gate"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"

mkdir -p "$LOG_DIR"

log_pass() { echo "[PASS] $*" | tee -a "$LOG_DIR/gate.log"; }
log_fail() { echo "[FAIL] $*" | tee -a "$LOG_DIR/gate.log"; exit 1; }
log_info() { echo "[INFO] $*" | tee -a "$LOG_DIR/gate.log"; }

# Load env: ONLY .env.gate by default.
# Set GATE_LOAD_BACKEND_ENV=true to also load backend/.env (before .env.gate).
if [[ "${GATE_LOAD_BACKEND_ENV:-}" == "true" ]] && [[ -f "$BACKEND_ROOT/.env" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$BACKEND_ROOT/.env"
  set +a
fi
if [[ -f "$GATE_DIR/.env.gate" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$GATE_DIR/.env.gate"
  set +a
fi

# Use DEV database for all operations
if [[ -z "${DATABASE_URL_DEV:-}" ]]; then
  log_fail "DATABASE_URL_DEV is not set. Copy .env.gate.example to .env.gate and fill values."
fi
export DATABASE_URL="$DATABASE_URL_DEV"

# Ensure we never touch test DB
if [[ "$DATABASE_URL" == *"gym_management_test"* ]]; then
  log_fail "DATABASE_URL must NOT point to gym_management_test. Use gym_management_dev only."
fi
