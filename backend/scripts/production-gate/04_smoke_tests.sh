#!/usr/bin/env bash
# 04_smoke_tests.sh - CORS + health check verification
# Requires instances from 03. Uses gym_management_dev.

set -euo pipefail
# shellcheck source=_common.sh
source "$(dirname "$0")/_common.sh"

LOG_FILE="$LOG_DIR/04_smoke_tests.log"
exec > >(tee -a "$LOG_FILE") 2>&1

log_info "=== 04_smoke_tests.sh ==="

BASE="http://127.0.0.1:3001"

# 1) Health check - 200
HTTP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/health" 2>/dev/null || echo "000")
if [[ "$HTTP" != "200" ]]; then
  log_fail "04_smoke_tests: GET /health returned $HTTP (expected 200)"
fi

# 2) Health response has db: ok
DB_STATUS=$(curl -s "$BASE/health" 2>/dev/null | grep -o '"db":"[^"]*"' || echo "")
if [[ "$DB_STATUS" != '"db":"ok"' ]]; then
  log_fail "04_smoke_tests: Health db status not ok (got: $DB_STATUS)"
fi

# 3) X-Request-Id header present
if ! curl -s -i "$BASE/health" 2>/dev/null | grep -qi "x-request-id"; then
  log_fail "04_smoke_tests: X-Request-Id header missing"
fi

# 4) Security headers (Helmet)
if ! curl -s -i "$BASE/health" 2>/dev/null | grep -qi "x-content-type-options"; then
  log_fail "04_smoke_tests: X-Content-Type-Options header missing"
fi
if ! curl -s -i "$BASE/health" 2>/dev/null | grep -qi "x-frame-options"; then
  log_fail "04_smoke_tests: X-Frame-Options header missing"
fi

# 5) CORS - check Access-Control-Allow-Origin when Origin sent
CORS_ORIGIN="${CORS_ORIGINS:-http://localhost:5173}"
FIRST_ORIGIN="${CORS_ORIGIN%%,*}"
CORS_HEADER=$(curl -s -i -H "Origin: $FIRST_ORIGIN" "$BASE/health" 2>/dev/null | grep -i "access-control-allow-origin" || echo "")
if [[ -z "$CORS_HEADER" ]]; then
  log_fail "04_smoke_tests: CORS Access-Control-Allow-Origin header missing"
fi

log_pass "04_smoke_tests: Health, CORS, security headers OK"
