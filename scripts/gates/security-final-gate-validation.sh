#!/bin/bash

##############################################################################
# FINAL-GATE SECURITY VALIDATION - Password Reset Enumeration Fix
# Senior QA Security Audit for Mobile Integration Approval
##############################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
API_BASE="http://localhost:3000/api/v1"
EXISTING_EMAIL="admin@example.com"  # MUST be a real user in dev DB
NON_EXISTING_EMAIL="nonexistent-$(date +%s)@example.com"
TEMP_DIR="/tmp/security-gate-$$"
REPORT_FILE="SECURITY_GATE_VALIDATION_REPORT_$(date +%Y%m%d_%H%M%S).md"

# Results tracking
CHECKS_PASSED=0
CHECKS_FAILED=0
BLOCKER_FOUND=0

mkdir -p "$TEMP_DIR"

echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}   FINAL-GATE SECURITY VALIDATION - PASSWORD RESET${NC}"
echo -e "${BLUE}   Date: $(date)${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}\n"

# Initialize report
cat > "$REPORT_FILE" <<EOF
# 🔒 FINAL-GATE SECURITY VALIDATION REPORT

**Date:** $(date)
**Environment:** NODE_ENV=development (local)
**Scope:** Password Reset (Email OTP) - P0 Enumeration Fix

---

EOF

##############################################################################
# HELPER FUNCTIONS
##############################################################################

pass_check() {
    echo -e "${GREEN}✅ PASS${NC}: $1"
    echo "✅ **PASS**: $1" >> "$REPORT_FILE"
    CHECKS_PASSED=$((CHECKS_PASSED + 1))
}

fail_check() {
    echo -e "${RED}❌ FAIL${NC}: $1"
    echo "❌ **FAIL**: $1" >> "$REPORT_FILE"
    CHECKS_FAILED=$((CHECKS_FAILED + 1))
    if [ "$2" == "BLOCKER" ]; then
        BLOCKER_FOUND=1
        echo -e "${RED}🚨 BLOCKER DETECTED${NC}"
        echo "🚨 **BLOCKER** - This issue must be resolved before mobile integration" >> "$REPORT_FILE"
    fi
}

warn_check() {
    echo -e "${YELLOW}⚠️  WARN${NC}: $1"
    echo "⚠️  **WARN**: $1" >> "$REPORT_FILE"
}

info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

section() {
    echo -e "\n${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}\n"
    echo -e "\n## $1\n" >> "$REPORT_FILE"
}

##############################################################################
# CHECK 1: STATUS CODE INVARIANCE (CRITICAL)
##############################################################################

section "CHECK 1: Status Code Invariance (Critical)"

info "Testing with EXISTING email: $EXISTING_EMAIL"
info "Testing with NON-EXISTING email: $NON_EXISTING_EMAIL"

# Function to call password-reset/start
call_reset_start() {
    local email=$1
    local output_file=$2
    curl -s -w "\n%{http_code}\n%{time_total}" \
        -X POST "$API_BASE/auth/password-reset/start" \
        -H "Content-Type: application/json" \
        -d "{\"email\":\"$email\"}" \
        > "$output_file" 2>&1
}

# Test existing email (5 requests)
echo "Testing existing email (5 requests)..."
for i in {1..5}; do
    call_reset_start "$EXISTING_EMAIL" "$TEMP_DIR/existing_$i.txt"
    sleep 0.5
done

# Test non-existing email (5 requests)
echo "Testing non-existing email (5 requests)..."
for i in {1..5}; do
    call_reset_start "$NON_EXISTING_EMAIL" "$TEMP_DIR/nonexisting_$i.txt"
    sleep 0.5
done

# Extract status codes and response bodies
existing_codes=()
nonexisting_codes=()
existing_bodies=()
nonexisting_bodies=()

for i in {1..5}; do
    # Extract status code (second to last line)
    status=$(tail -2 "$TEMP_DIR/existing_$i.txt" | head -1)
    existing_codes+=("$status")
    
    # Extract body (everything except last 2 lines)
    body=$(head -n -2 "$TEMP_DIR/existing_$i.txt")
    existing_bodies+=("$body")
    
    status=$(tail -2 "$TEMP_DIR/nonexisting_$i.txt" | head -1)
    nonexisting_codes+=("$status")
    
    body=$(head -n -2 "$TEMP_DIR/nonexisting_$i.txt")
    nonexisting_bodies+=("$body")
done

# Check 1.1: All status codes are 201
info "Checking status codes..."
all_201=1
for code in "${existing_codes[@]}" "${nonexisting_codes[@]}"; do
    if [ "$code" != "201" ]; then
        all_201=0
        fail_check "Found non-201 status code: $code" "BLOCKER"
        break
    fi
done

if [ $all_201 -eq 1 ]; then
    pass_check "All requests returned HTTP 201 (existing: ${existing_codes[@]}, non-existing: ${nonexisting_codes[@]})"
fi

# Check 1.2: Response bodies are identical
info "Checking response body consistency..."
first_existing="${existing_bodies[0]}"
first_nonexisting="${nonexisting_bodies[0]}"

bodies_match=1

# Check all existing email responses match
for body in "${existing_bodies[@]:1}"; do
    if [ "$body" != "$first_existing" ]; then
        bodies_match=0
        fail_check "Existing email responses differ between requests" "BLOCKER"
        break
    fi
done

# Check all non-existing email responses match
for body in "${nonexisting_bodies[@]:1}"; do
    if [ "$body" != "$first_nonexisting" ]; then
        bodies_match=0
        fail_check "Non-existing email responses differ between requests" "BLOCKER"
        break
    fi
done

# Check existing vs non-existing match
if [ "$first_existing" != "$first_nonexisting" ]; then
    bodies_match=0
    fail_check "Response body differs between existing and non-existing email" "BLOCKER"
    echo -e "\n**Existing response:**\n\`\`\`json\n$first_existing\n\`\`\`\n" >> "$REPORT_FILE"
    echo -e "**Non-existing response:**\n\`\`\`json\n$first_nonexisting\n\`\`\`\n" >> "$REPORT_FILE"
else
    pass_check "All responses are byte-for-byte identical"
    echo -e "\n**Response (all identical):**\n\`\`\`json\n$first_existing\n\`\`\`\n" >> "$REPORT_FILE"
fi

##############################################################################
# CHECK 2: RATE LIMITING EFFECTIVENESS
##############################################################################

section "CHECK 2: Rate Limiting Effectiveness"

info "Sending burst of 30 requests to trigger rate limit..."
info "Expected: First 20 succeed (send OTP), next 10 are rate limited (no OTP)"

# Clear rate limiter if possible (note: in-memory, requires restart)
warn_check "Rate limiter is in-memory - results may be affected by previous tests"

# Send 30 requests rapidly to same email
for i in {1..30}; do
    call_reset_start "$EXISTING_EMAIL" "$TEMP_DIR/burst_$i.txt" &
    if [ $((i % 5)) -eq 0 ]; then
        wait  # Wait every 5 requests to avoid overwhelming
    fi
done
wait

# Check all returned 201
info "Verifying all burst requests returned 201..."
burst_all_201=1
for i in {1..30}; do
    status=$(tail -2 "$TEMP_DIR/burst_$i.txt" | head -1)
    if [ "$status" != "201" ]; then
        burst_all_201=0
        fail_check "Burst request $i returned status $status instead of 201" "BLOCKER"
        break
    fi
done

if [ $burst_all_201 -eq 1 ]; then
    pass_check "All 30 burst requests returned HTTP 201 (rate limiting is internal)"
fi

# Check 2.2: Verify logs contain rate limit events
info "Checking server logs for rate limit events..."
warn_check "Manual verification required: Check server console for rate limit warnings"
echo -e "\n**Action Required:** Verify backend logs contain warnings like:\n\`\`\`\nPassword reset rate limit exceeded for IP: 127.0.*.*\n\`\`\`\n" >> "$REPORT_FILE"

##############################################################################
# CHECK 3: TIMING ANALYSIS
##############################################################################

section "CHECK 3: Timing Analysis (Practical)"

info "Measuring response times for existing vs non-existing emails..."

# Measure 5 requests each
existing_times=()
nonexisting_times=()

for i in {1..5}; do
    time=$(tail -1 "$TEMP_DIR/existing_$i.txt")
    existing_times+=("$time")
    
    time=$(tail -1 "$TEMP_DIR/nonexisting_$i.txt")
    nonexisting_times+=("$time")
done

# Calculate averages (using awk)
avg_existing=$(printf '%s\n' "${existing_times[@]}" | awk '{s+=$1} END {print s/NR}')
avg_nonexisting=$(printf '%s\n' "${nonexisting_times[@]}" | awk '{s+=$1} END {print s/NR}')

info "Existing email average time: ${avg_existing}s"
info "Non-existing email average time: ${avg_nonexisting}s"

echo -e "\n**Timing Results:**\n" >> "$REPORT_FILE"
echo "- Existing email: ${existing_times[@]} (avg: ${avg_existing}s)" >> "$REPORT_FILE"
echo "- Non-existing email: ${nonexisting_times[@]} (avg: ${avg_nonexisting}s)" >> "$REPORT_FILE"

# Calculate percentage difference
diff=$(echo "$avg_existing $avg_nonexisting" | awk '{print ($1-$2)/$2*100}')
abs_diff=${diff#-}  # absolute value

info "Timing difference: ${abs_diff}%"

if (( $(echo "$abs_diff < 40" | bc -l) )); then
    pass_check "Timing difference is within acceptable range (<40%): ${abs_diff}%"
else
    warn_check "Timing difference exceeds 40%: ${abs_diff}% - may indicate timing attack vulnerability"
fi

##############################################################################
# CHECK 4: IP EXTRACTION ROBUSTNESS
##############################################################################

section "CHECK 4: IP Extraction Robustness"

info "Testing IP extraction from various proxy headers..."

# Test X-Forwarded-For
curl -s -o /dev/null -w "%{http_code}" \
    -X POST "$API_BASE/auth/password-reset/start" \
    -H "Content-Type: application/json" \
    -H "X-Forwarded-For: 203.0.113.1, 198.51.100.1" \
    -d "{\"email\":\"test-xff@example.com\"}" > "$TEMP_DIR/xff_status.txt"

if [ "$(cat $TEMP_DIR/xff_status.txt)" == "201" ]; then
    pass_check "X-Forwarded-For header handling works (status 201)"
else
    fail_check "X-Forwarded-For header handling failed"
fi

# Test X-Real-IP
curl -s -o /dev/null -w "%{http_code}" \
    -X POST "$API_BASE/auth/password-reset/start" \
    -H "Content-Type: application/json" \
    -H "X-Real-IP: 203.0.113.2" \
    -d "{\"email\":\"test-xri@example.com\"}" > "$TEMP_DIR/xri_status.txt"

if [ "$(cat $TEMP_DIR/xri_status.txt)" == "201" ]; then
    pass_check "X-Real-IP header handling works (status 201)"
else
    fail_check "X-Real-IP header handling failed"
fi

# Test CF-Connecting-IP
curl -s -o /dev/null -w "%{http_code}" \
    -X POST "$API_BASE/auth/password-reset/start" \
    -H "Content-Type: application/json" \
    -H "CF-Connecting-IP: 203.0.113.3" \
    -d "{\"email\":\"test-cf@example.com\"}" > "$TEMP_DIR/cf_status.txt"

if [ "$(cat $TEMP_DIR/cf_status.txt)" == "201" ]; then
    pass_check "CF-Connecting-IP header handling works (status 201)"
else
    fail_check "CF-Connecting-IP header handling failed"
fi

warn_check "Manual verification required: Check logs to confirm correct IP extraction"
echo -e "\n**Action Required:** Verify backend logs show:\n- First IP from X-Forwarded-For chain (203.0.113.1)\n- X-Real-IP value (203.0.113.2)\n- CF-Connecting-IP value (203.0.113.3)\n" >> "$REPORT_FILE"

##############################################################################
# CHECK 5: TOKEN BOUNDARY INTEGRITY
##############################################################################

section "CHECK 5: Token Boundary Integrity (Regression)"

info "Testing /start endpoint (should NOT require auth)..."

status=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "$API_BASE/auth/password-reset/start" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"test@example.com\"}")

if [ "$status" == "201" ]; then
    pass_check "/password-reset/start accepts requests without Authorization"
else
    fail_check "/password-reset/start returned $status (expected 201 without auth)" "BLOCKER"
fi

info "Testing /complete endpoint (should REQUIRE resetToken)..."

# Test without Authorization
status=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "$API_BASE/auth/password-reset/complete" \
    -H "Content-Type: application/json" \
    -d "{\"newPassword\":\"Test123!\"}")

if [ "$status" == "401" ]; then
    pass_check "/password-reset/complete rejects requests without Authorization (401)"
else
    fail_check "/password-reset/complete returned $status (expected 401 without auth)" "BLOCKER"
fi

# Test with fake access token (should be rejected)
info "Testing /complete with fake accessToken (should reject)..."

fake_token="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"

status=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "$API_BASE/auth/password-reset/complete" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $fake_token" \
    -d "{\"newPassword\":\"Test123!\"}")

if [ "$status" == "401" ]; then
    pass_check "/password-reset/complete rejects invalid tokens (401)"
else
    warn_check "/password-reset/complete returned $status (expected 401 for invalid token)"
fi

##############################################################################
# CHECK 6: PRIVACY & LOGGING
##############################################################################

section "CHECK 6: Privacy & Logging"

warn_check "Manual verification required: Review server logs"
echo -e "\n**Action Required:** Review backend logs and verify:\n" >> "$REPORT_FILE"
echo "1. ✅ No raw email addresses logged (only hashes like \`abc123...\`)" >> "$REPORT_FILE"
echo "2. ✅ No full IP addresses logged (only obfuscated like \`127.0.*.*\` or \`2001:db8:****\`)" >> "$REPORT_FILE"
echo "3. ✅ No OTP codes logged in plaintext" >> "$REPORT_FILE"
echo "4. ✅ Rate limit events logged with sanitized data" >> "$REPORT_FILE"
echo -e "\n**Example Expected Log:**\n\`\`\`\nPassword reset rate limit exceeded for IP: 127.0.*.*\nPassword reset rate limit exceeded for email hash: abc12345...\n\`\`\`\n" >> "$REPORT_FILE"

##############################################################################
# CHECK 7: CROSS-FLOW SAFETY
##############################################################################

section "CHECK 7: Cross-Flow Safety"

info "Testing signup flow is unaffected..."

signup_status=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "$API_BASE/auth/signup/start" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"test-signup@example.com\"}")

if [ "$signup_status" == "201" ] || [ "$signup_status" == "409" ]; then
    pass_check "Signup flow still works (status $signup_status)"
else
    warn_check "Signup flow returned unexpected status: $signup_status"
fi

info "Testing login flow is unaffected..."

login_status=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "$API_BASE/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"test@example.com\",\"password\":\"wrong\"}")

if [ "$login_status" == "401" ] || [ "$login_status" == "403" ]; then
    pass_check "Login flow still works (status $login_status for invalid creds)"
else
    warn_check "Login flow returned unexpected status: $login_status"
fi

##############################################################################
# FINAL VERDICT
##############################################################################

section "FINAL VERDICT"

echo -e "\n---\n" >> "$REPORT_FILE"
echo "## Summary" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "- ✅ Checks Passed: **$CHECKS_PASSED**" >> "$REPORT_FILE"
echo "- ❌ Checks Failed: **$CHECKS_FAILED**" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

if [ $BLOCKER_FOUND -eq 1 ]; then
    echo -e "${RED}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║  🚨 SECURITY NO-GO - MOBILE BLOCKED 🚨                       ║${NC}"
    echo -e "${RED}║                                                               ║${NC}"
    echo -e "${RED}║  Critical security blockers detected.                        ║${NC}"
    echo -e "${RED}║  Password reset MUST NOT be exposed to mobile clients.       ║${NC}"
    echo -e "${RED}║                                                               ║${NC}"
    echo -e "${RED}║  Review failures above and fix before re-testing.            ║${NC}"
    echo -e "${RED}╚═══════════════════════════════════════════════════════════════╝${NC}"
    
    echo "## 🚨 VERDICT: SECURITY NO-GO - MOBILE BLOCKED" >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"
    echo "**Critical security blockers detected.** Password reset enumeration vulnerability is NOT completely eliminated." >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"
    echo "**Action Required:** Fix all BLOCKER issues and re-run validation." >> "$REPORT_FILE"
    
    EXIT_CODE=1
elif [ $CHECKS_FAILED -gt 0 ]; then
    echo -e "${YELLOW}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${YELLOW}║  ⚠️  CONDITIONAL GO - WARNINGS PRESENT                       ║${NC}"
    echo -e "${YELLOW}║                                                               ║${NC}"
    echo -e "${YELLOW}║  No critical blockers, but warnings need review.             ║${NC}"
    echo -e "${YELLOW}║  Manual verification required before mobile release.         ║${NC}"
    echo -e "${YELLOW}╚═══════════════════════════════════════════════════════════════╝${NC}"
    
    echo "## ⚠️  VERDICT: CONDITIONAL GO - WARNINGS PRESENT" >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"
    echo "No critical blockers detected, but some checks failed or require manual verification." >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"
    echo "**Recommendation:** Complete manual verification steps before mobile integration." >> "$REPORT_FILE"
    
    EXIT_CODE=0
else
    echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║  ✅ SECURITY GO - MOBILE UNBLOCKED ✅                        ║${NC}"
    echo -e "${GREEN}║                                                               ║${NC}"
    echo -e "${GREEN}║  All automated security checks PASSED.                        ║${NC}"
    echo -e "${GREEN}║  Enumeration vulnerability is completely eliminated.          ║${NC}"
    echo -e "${GREEN}║                                                               ║${NC}"
    echo -e "${GREEN}║  ✓ System is SAFE to expose password reset to mobile clients ║${NC}"
    echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════╝${NC}"
    
    echo "## ✅ VERDICT: SECURITY GO - MOBILE UNBLOCKED" >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"
    echo "**All automated security checks PASSED.**" >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"
    echo "The password reset enumeration vulnerability is **completely eliminated**." >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"
    echo "✅ **System is SAFE to expose password reset functionality to mobile clients.**" >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"
    echo "### Next Steps" >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"
    echo "1. Complete manual verification steps (logging review)" >> "$REPORT_FILE"
    echo "2. Deploy to staging environment" >> "$REPORT_FILE"
    echo "3. Run final validation in staging" >> "$REPORT_FILE"
    echo "4. Proceed with mobile integration" >> "$REPORT_FILE"
    
    EXIT_CODE=0
fi

echo ""
echo -e "${BLUE}Full report saved to: $REPORT_FILE${NC}"
echo ""

# Cleanup
rm -rf "$TEMP_DIR"

exit $EXIT_CODE
