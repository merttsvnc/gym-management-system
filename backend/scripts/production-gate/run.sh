#!/usr/bin/env bash
# Production Gate - Run all steps sequentially
# Uses ONLY gym_management_dev. Never touches gym_management_test.

set -euo pipefail

GATE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_ROOT="$(cd "$GATE_DIR/../.." && pwd)"
LOG_DIR="$BACKEND_ROOT/tmp/gate"

mkdir -p "$LOG_DIR"

echo "=== Production Gate (gym_management_dev only) ===" | tee "$LOG_DIR/gate.log"
echo "Started: $(date -u +%Y-%m-%dT%H:%M:%SZ)" | tee -a "$LOG_DIR/gate.log"

for script in 01_env_check 02_migration_rehearsal 03_start_two_instances 04_smoke_tests 05_rate_limit_test 06_cron_lock_test 07_cleanup; do
  "$GATE_DIR/${script}.sh" || exit 1
done

echo "=== Production Gate COMPLETE ===" | tee -a "$LOG_DIR/gate.log"
echo "Finished: $(date -u +%Y-%m-%dT%H:%M:%SZ)" | tee -a "$LOG_DIR/gate.log"
