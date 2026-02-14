#!/usr/bin/env bash
# 06_cron_lock_test.sh - Cron advisory lock verification
# Validates: 1) Acquire (true) 2) Same lock from other session (false) 3) Release (true) 4) Acquire again (true)
# Uses Prisma $queryRaw (no new deps). Optional psql pg_locks on failure.

set -euo pipefail
# shellcheck source=_common.sh
source "$(dirname "$0")/_common.sh"

LOG_FILE="$LOG_DIR/06_cron_lock_test.log"
exec > >(tee -a "$LOG_FILE") 2>&1

log_info "=== 06_cron_lock_test.sh ==="

cd "$BACKEND_ROOT"

LOCK_NAME="gate:test:advisory-lock-$(date +%s)"
export LOCK_NAME

# Run 4-step validation via Node (Prisma $queryRaw - two PrismaClient instances)
RESULT=$(node "$BACKEND_ROOT/scripts/production-gate/06_cron_lock_test.cjs" 2>&1) || true

if [[ "$RESULT" == *"ok"* ]]; then
  log_pass "06_cron_lock_test: Advisory lock 4-step validation OK"
else
  # Node script prints diagnostics to stderr; capture and show
  echo "$RESULT" | tee -a "$LOG_DIR/gate.log"
  if command -v psql &>/dev/null; then
    log_info "=== pg_locks (advisory) via psql ==="
    psql "$DATABASE_URL" -tAc "SELECT pid, locktype, classid, objid, objsubid, granted FROM pg_locks WHERE locktype='advisory';" 2>/dev/null || true
  fi
  log_fail "06_cron_lock_test: Advisory lock validation failed"
fi
