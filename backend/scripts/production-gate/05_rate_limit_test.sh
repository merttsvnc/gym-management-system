#!/usr/bin/env bash
# 05_rate_limit_test.sh - Rate limit verification (auth login 10/min)
# Requires instances from 03. Uses gym_management_dev.

set -euo pipefail
# shellcheck source=_common.sh
source "$(dirname "$0")/_common.sh"

LOG_FILE="$LOG_DIR/05_rate_limit_test.log"
exec > >(tee -a "$LOG_FILE") 2>&1

log_info "=== 05_rate_limit_test.sh ==="

BASE="http://127.0.0.1:3001"

# 1) Health is NOT rate limited (excluded via @SkipThrottle)
log_info "Verifying /health is not rate limited..."
OK=0
for i in {1..15}; do
  HTTP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/health" 2>/dev/null || echo "000")
  if [[ "$HTTP" == "200" ]]; then
    ((OK++)) || true
  fi
done
if [[ $OK -lt 15 ]]; then
  log_fail "05_rate_limit_test: /health should not be rate limited (got $OK/15 ok)"
fi
log_info "Health: $OK/15 requests returned 200 (not rate limited)"

# 2) Auth login returns 429 after exceeding limit (10/min per IP)
log_info "Verifying POST /api/v1/auth/login rate limit (10/min)..."
FOUND_429=0
for i in {1..15}; do
  HTTP=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/v1/auth/login" \
    -H "Content-Type: application/json" \
    -H "X-Request-Id: gate-rate-limit-$i" \
    -d '{"email":"rate-limit@example.com","password":"wrong"}' 2>/dev/null || echo "000")
  if [[ "$HTTP" == "429" ]]; then
    FOUND_429=1
    break
  fi
done
if [[ $FOUND_429 -ne 1 ]]; then
  log_fail "05_rate_limit_test: Expected 429 from auth/login after exceeding limit"
fi

log_pass "05_rate_limit_test: Rate limits verified (health excluded, auth limited)"
