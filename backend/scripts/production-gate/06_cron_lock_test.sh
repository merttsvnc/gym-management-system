#!/usr/bin/env bash
# 06_cron_lock_test.sh - Cron advisory lock verification
# Verifies pg_try_advisory_lock works with gym_management_dev.
# Uses Prisma to run raw SQL (same as PgAdvisoryLockService).

set -euo pipefail
# shellcheck source=_common.sh
source "$(dirname "$0")/_common.sh"

LOG_FILE="$LOG_DIR/06_cron_lock_test.log"
exec > >(tee -a "$LOG_FILE") 2>&1

log_info "=== 06_cron_lock_test.sh ==="

cd "$BACKEND_ROOT"

LOCK_NAME="gate:test:advisory-lock-$(date +%s)"

if command -v psql &>/dev/null; then
  ACQUIRED=$(psql "$DATABASE_URL" -tAc "SELECT pg_try_advisory_lock(hashtext('$LOCK_NAME'));" 2>/dev/null || echo "f")
  if [[ "$ACQUIRED" == "t" ]]; then
    # Release lock
    psql "$DATABASE_URL" -tAc "SELECT pg_advisory_unlock(hashtext('$LOCK_NAME'));" 2>/dev/null || true
    log_pass "06_cron_lock_test: Advisory lock acquire/release OK"
  else
    log_fail "06_cron_lock_test: Failed to acquire advisory lock"
  fi
else
  # Fallback: node script using Prisma (lockName is safe - we generate it)
  RESULT=$(cd "$BACKEND_ROOT" && node -e "
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    const lockName = '$LOCK_NAME';
    (async () => {
      const r = await prisma.\$queryRawUnsafe(\`SELECT pg_try_advisory_lock(hashtext('\${lockName}')) as acquired\`);
      const acquired = r[0]?.acquired ?? false;
      if (acquired) {
        await prisma.\$queryRawUnsafe(\`SELECT pg_advisory_unlock(hashtext('\${lockName}'))\`);
      }
      console.log(acquired ? 'ok' : 'fail');
      await prisma.\$disconnect();
    })();
  " 2>/dev/null || echo "fail")
  if [[ "$RESULT" == "ok" ]]; then
    log_pass "06_cron_lock_test: Advisory lock acquire/release OK (node fallback)"
  else
    log_fail "06_cron_lock_test: Advisory lock test failed"
  fi
fi
