#!/usr/bin/env bash
# 02_migration_rehearsal.sh - Prisma migrate deploy rehearsal on gym_management_dev
# Idempotent. Never touches gym_management_test.

set -euo pipefail
# shellcheck source=_common.sh
source "$(dirname "$0")/_common.sh"

LOG_FILE="$LOG_DIR/02_migration_rehearsal.log"
exec > >(tee -a "$LOG_FILE") 2>&1

log_info "=== 02_migration_rehearsal.sh ==="

cd "$BACKEND_ROOT"

# Prisma migrate deploy (idempotent - applies pending migrations only)
if npx prisma migrate deploy; then
  log_pass "02_migration_rehearsal: prisma migrate deploy succeeded"
else
  log_fail "02_migration_rehearsal: prisma migrate deploy failed"
fi
