#!/usr/bin/env bash
# 03_start_two_instances.sh - Start two app instances for concurrency test
# Uses gym_management_dev. Idempotent: kills existing gate instances first.

set -euo pipefail
# shellcheck source=_common.sh
source "$(dirname "$0")/_common.sh"

LOG_FILE="$LOG_DIR/03_start_two_instances.log"
exec > >(tee -a "$LOG_FILE") 2>&1

log_info "=== 03_start_two_instances.sh ==="

cd "$BACKEND_ROOT"

# Cleanup any previous gate instances (idempotent)
lsof -ti:3001 | xargs kill -9 2>/dev/null || true
lsof -ti:3002 | xargs kill -9 2>/dev/null || true
sleep 2

# Build first
log_info "Building..."
npm run build || log_fail "Build failed"

# Detect built entry file
ENTRY="$(find dist -type f -name 'main.js' 2>/dev/null | head -n 1)"
if [[ -z "$ENTRY" ]]; then
  log_info "find dist -name main.js output:"
  find dist -name 'main.js' 2>/dev/null || true
  log_fail "No main.js found under dist. Check build output."
fi
log_info "Using entry: $ENTRY"

# Start instance 1 on 3001
(PORT=3001 DATABASE_URL="$DATABASE_URL" node "$ENTRY") > "$LOG_DIR/instance1.log" 2>&1 &
echo $! > "$LOG_DIR/instance1.pid"
log_info "Started instance 1 (PID $(cat "$LOG_DIR/instance1.pid")) on port 3001"

# Start instance 2 on 3002
(PORT=3002 DATABASE_URL="$DATABASE_URL" node "$ENTRY") > "$LOG_DIR/instance2.log" 2>&1 &
echo $! > "$LOG_DIR/instance2.pid"
log_info "Started instance 2 (PID $(cat "$LOG_DIR/instance2.pid")) on port 3002"

# Wait for both to be ready
for i in {1..30}; do
  if curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:3001/health" 2>/dev/null | grep -q 200; then
    if curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:3002/health" 2>/dev/null | grep -q 200; then
      log_pass "03_start_two_instances: Both instances running (3001, 3002)"
      exit 0
    fi
  fi
  sleep 1
done

# Diagnostics on readiness failure
log_info "--- DIAGNOSTICS (instances did not become ready) ---"
log_info "=== tail -120 instance1.log ==="
tail -120 "$LOG_DIR/instance1.log" 2>/dev/null || true
log_info "=== tail -120 instance2.log ==="
tail -120 "$LOG_DIR/instance2.log" 2>/dev/null || true
log_info "=== curl -i http://127.0.0.1:3001/health ==="
curl -i -s -m 5 "http://127.0.0.1:3001/health" 2>/dev/null || true
log_info "=== curl -i http://127.0.0.1:3002/health ==="
curl -i -s -m 5 "http://127.0.0.1:3002/health" 2>/dev/null || true
log_info "=== lsof LISTEN for 3001, 3002 ==="
lsof -i :3001 -i :3002 -sTCP:LISTEN 2>/dev/null || true

log_fail "03_start_two_instances: Instances did not become ready in 30s"
