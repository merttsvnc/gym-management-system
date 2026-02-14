#!/usr/bin/env bash
# 07_cleanup.sh - Stop gate instances, remove temp logs
# Idempotent. Never touches gym_management_test.

set -euo pipefail
# shellcheck source=_common.sh
source "$(dirname "$0")/_common.sh"

LOG_FILE="$LOG_DIR/07_cleanup.log"
exec > >(tee -a "$LOG_FILE") 2>&1

log_info "=== 07_cleanup.sh ==="

# Kill instances by port (idempotent)
for port in 3001 3002; do
  PIDS=$(lsof -ti:"$port" 2>/dev/null || true)
  if [[ -n "$PIDS" ]]; then
    echo "$PIDS" | xargs kill -9 2>/dev/null || true
    log_info "Stopped processes on port $port"
  fi
done

# Remove PID files
rm -f "$LOG_DIR/instance1.pid" "$LOG_DIR/instance2.pid"

log_pass "07_cleanup: Gate instances stopped"
