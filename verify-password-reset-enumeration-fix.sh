#!/bin/bash
# Verification script for password reset enumeration fix
# Tests that both existing and non-existing emails return identical responses

set -e

API_BASE="${API_BASE:-http://localhost:3000/api/v1/auth}"
EXISTING_EMAIL="${EXISTING_EMAIL:-admin@example.com}"
NONEXISTENT_EMAIL="${NONEXISTENT_EMAIL:-nonexistent-$(date +%s)@example.com}"

echo "========================================="
echo "Password Reset Enumeration Fix - Verification"
echo "========================================="
echo ""
echo "API Base: $API_BASE"
echo "Testing with:"
echo "  - Existing email: $EXISTING_EMAIL"
echo "  - Non-existing email: $NONEXISTENT_EMAIL"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
PASS=0
FAIL=0

function test_case() {
    local name="$1"
    echo -e "${YELLOW}TEST:${NC} $name"
}

function pass() {
    echo -e "${GREEN}✓ PASS${NC}"
    ((PASS++))
    echo ""
}

function fail() {
    local msg="$1"
    echo -e "${RED}✗ FAIL: $msg${NC}"
    ((FAIL++))
    echo ""
}

# Test 1: Single request for existing email
test_case "Single request for existing email returns 201"
RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$API_BASE/password-reset/start" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$EXISTING_EMAIL\"}")
STATUS=$(echo "$RESPONSE" | grep HTTP_STATUS | cut -d: -f2)
BODY=$(echo "$RESPONSE" | grep -v HTTP_STATUS)

if [ "$STATUS" = "201" ]; then
    pass
else
    fail "Expected 201, got $STATUS"
fi

# Test 2: Single request for non-existing email
test_case "Single request for non-existing email returns 201"
RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$API_BASE/password-reset/start" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$NONEXISTENT_EMAIL\"}")
STATUS=$(echo "$RESPONSE" | grep HTTP_STATUS | cut -d: -f2)

if [ "$STATUS" = "201" ]; then
    pass
else
    fail "Expected 201, got $STATUS"
fi

# Test 3: Response body consistency
test_case "Response body is identical for existing and non-existing emails"
EXISTING_BODY=$(curl -s -X POST "$API_BASE/password-reset/start" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$EXISTING_EMAIL\"}")
NONEXISTENT_BODY=$(curl -s -X POST "$API_BASE/password-reset/start" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$NONEXISTENT_EMAIL\"}")

if [ "$EXISTING_BODY" = "$NONEXISTENT_BODY" ]; then
    pass
else
    fail "Response bodies differ"
    echo "Existing: $EXISTING_BODY"
    echo "Non-existing: $NONEXISTENT_BODY"
fi

# Test 4: Rate limiting doesn't reveal user existence
test_case "Rate limited requests (30 requests) always return 201 for existing email"
ALL_201=true
for i in {1..30}; do
    STATUS=$(curl -s -w "%{http_code}" -o /dev/null -X POST "$API_BASE/password-reset/start" \
        -H "Content-Type: application/json" \
        -d "{\"email\":\"$EXISTING_EMAIL\"}")
    if [ "$STATUS" != "201" ]; then
        ALL_201=false
        fail "Request $i returned $STATUS instead of 201"
        break
    fi
done

if [ "$ALL_201" = true ]; then
    pass
fi

# Test 5: Rate limiting doesn't reveal user existence (non-existing email)
test_case "Rate limited requests (30 requests) always return 201 for non-existing email"
ALL_201=true
for i in {1..30}; do
    STATUS=$(curl -s -w "%{http_code}" -o /dev/null -X POST "$API_BASE/password-reset/start" \
        -H "Content-Type: application/json" \
        -d "{\"email\":\"$NONEXISTENT_EMAIL\"}")
    if [ "$STATUS" != "201" ]; then
        ALL_201=false
        fail "Request $i returned $STATUS instead of 201"
        break
    fi
done

if [ "$ALL_201" = true ]; then
    pass
fi

# Test 6: After rate limit, response body is still identical
test_case "After rate limiting, response body remains identical"
# Send many requests first
for i in {1..25}; do
    curl -s -o /dev/null -X POST "$API_BASE/password-reset/start" \
        -H "Content-Type: application/json" \
        -d "{\"email\":\"$EXISTING_EMAIL\"}"
    curl -s -o /dev/null -X POST "$API_BASE/password-reset/start" \
        -H "Content-Type: application/json" \
        -d "{\"email\":\"$NONEXISTENT_EMAIL\"}"
done

# Now check responses
EXISTING_BODY=$(curl -s -X POST "$API_BASE/password-reset/start" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$EXISTING_EMAIL\"}")
NONEXISTENT_BODY=$(curl -s -X POST "$API_BASE/password-reset/start" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$NONEXISTENT_EMAIL\"}")

if [ "$EXISTING_BODY" = "$NONEXISTENT_BODY" ]; then
    pass
else
    fail "Response bodies differ after rate limiting"
fi

# Test 7: No 429 status codes
test_case "Never returns 429 (Too Many Requests)"
HAS_429=false
for i in {1..50}; do
    STATUS=$(curl -s -w "%{http_code}" -o /dev/null -X POST "$API_BASE/password-reset/start" \
        -H "Content-Type: application/json" \
        -d "{\"email\":\"test-$i@example.com\"}")
    if [ "$STATUS" = "429" ]; then
        HAS_429=true
        fail "Received 429 on request $i"
        break
    fi
done

if [ "$HAS_429" = false ]; then
    pass
fi

# Summary
echo "========================================="
echo "Summary"
echo "========================================="
echo -e "${GREEN}Passed: $PASS${NC}"
if [ $FAIL -gt 0 ]; then
    echo -e "${RED}Failed: $FAIL${NC}"
    echo ""
    echo "❌ Enumeration vulnerability still exists!"
    exit 1
else
    echo "Failed: 0"
    echo ""
    echo "✅ All tests passed! Enumeration fix verified."
    exit 0
fi
