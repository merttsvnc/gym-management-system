#!/usr/bin/env bash
# 01_env_check.sh - Environment validation for production gate
# Uses ONLY gym_management_dev.

set -euo pipefail
# shellcheck source=_common.sh
source "$(dirname "$0")/_common.sh"

LOG_FILE="$LOG_DIR/01_env_check.log"
exec > >(tee -a "$LOG_FILE") 2>&1

log_info "=== 01_env_check.sh ==="

# 1) Required vars for app boot
REQUIRED=("NODE_ENV" "PORT" "DATABASE_URL" "JWT_ACCESS_SECRET")
for var in "${REQUIRED[@]}"; do
  if [[ -z "${!var:-}" ]]; then
    log_fail "Missing required env: $var"
  fi
done

# 2) JWT_ACCESS_SECRET min 32 chars
if [[ ${#JWT_ACCESS_SECRET} -lt 32 ]]; then
  log_fail "JWT_ACCESS_SECRET must be at least 32 characters"
fi

# 3) NODE_ENV valid
case "$NODE_ENV" in
  development|staging|production) ;;
  *) log_fail "NODE_ENV must be development, staging, or production" ;;
esac

# 4) PORT numeric
if ! [[ "$PORT" =~ ^[0-9]+$ ]] || [[ "$PORT" -lt 1 ]] || [[ "$PORT" -gt 65535 ]]; then
  log_fail "PORT must be 1-65535"
fi

# 5) DATABASE_URL points to dev (not test)
if [[ "$DATABASE_URL" != *"gym_management_dev"* ]]; then
  log_fail "DATABASE_URL must point to gym_management_dev (got: ${DATABASE_URL%%\?*})"
fi

log_pass "01_env_check: All env vars valid"
