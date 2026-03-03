#!/bin/bash
#
# Manual verification script for Reports SQL + Auth Guard fix
#
# Tests the fixed reports endpoints to ensure:
# 1. Unauthenticated requests return 401
# 2. Authenticated requests return 200 with correct data
# 3. SQL queries use correct column names (no Prisma error 42703)
#
# Usage: ./test-reports-fix.sh <BASE_URL> <ADMIN_EMAIL> <ADMIN_PASSWORD> <TENANT_ID> <BRANCH_ID>
#
# Example:
#   ./test-reports-fix.sh http://localhost:3000 admin@test.com password123 tenant-abc branch-xyz

set -e

BASE_URL="${1:-http://localhost:3000}"
ADMIN_EMAIL="${2}"
ADMIN_PASSWORD="${3}"
TENANT_ID="${4}"
BRANCH_ID="${5}"

if [ -z "$ADMIN_EMAIL" ] || [ -z "$ADMIN_PASSWORD" ] || [ -z "$TENANT_ID" ] || [ -z "$BRANCH_ID" ]; then
  echo "❌ Missing required arguments"
  echo "Usage: $0 <BASE_URL> <ADMIN_EMAIL> <ADMIN_PASSWORD> <TENANT_ID> <BRANCH_ID>"
  exit 1
fi

API_URL="${BASE_URL}/api/v1"
MONTH="2026-02"

echo "=================================================="
echo "Reports SQL + Auth Guard Fix - Manual Verification"
echo "=================================================="
echo "API URL: $API_URL"
echo "Test Month: $MONTH"
echo "Branch ID: $BRANCH_ID"
echo ""

# Test 1: Unauthenticated request should return 401
echo "TEST 1: Daily revenue without auth (should return 401)"
echo "------------------------------------------------------"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  -X GET "${API_URL}/reports/revenue/daily?month=${MONTH}&branchId=${BRANCH_ID}" \
  -H "Content-Type: application/json")

if [ "$HTTP_CODE" -eq 401 ]; then
  echo "✅ PASS: Returned 401 Unauthorized (JwtAuthGuard blocked request)"
else
  echo "❌ FAIL: Expected 401, got ${HTTP_CODE}"
  exit 1
fi
echo ""

# Test 2: Get auth token
echo "TEST 2: Login and get auth token"
echo "---------------------------------"
LOGIN_RESPONSE=$(curl -s -X POST "${API_URL}/auth/login" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"${ADMIN_EMAIL}\",
    \"password\": \"${ADMIN_PASSWORD}\",
    \"tenantId\": \"${TENANT_ID}\"
  }")

TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.accessToken')

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
  echo "❌ FAIL: Could not get access token"
  echo "Response: $LOGIN_RESPONSE"
  exit 1
fi

echo "✅ PASS: Got access token (${TOKEN:0:20}...)"
echo ""

# Test 3: Daily revenue with auth (should return 200)
echo "TEST 3: Daily revenue WITH auth (should return 200)"
echo "----------------------------------------------------"
DAILY_RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" \
  -X GET "${API_URL}/reports/revenue/daily?month=${MONTH}&branchId=${BRANCH_ID}" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json")

HTTP_CODE=$(echo "$DAILY_RESPONSE" | grep "HTTP_CODE:" | cut -d: -f2)
RESPONSE_BODY=$(echo "$DAILY_RESPONSE" | sed '/HTTP_CODE:/d')

if [ "$HTTP_CODE" -eq 200 ]; then
  echo "✅ PASS: Returned 200 OK"
  
  # Validate response structure
  DAYS_COUNT=$(echo "$RESPONSE_BODY" | jq '.days | length')
  if [ "$DAYS_COUNT" -eq 28 ]; then
    echo "✅ PASS: Response has 28 days for February 2026"
  else
    echo "❌ FAIL: Expected 28 days, got ${DAYS_COUNT}"
    exit 1
  fi
  
  # Check first day structure
  FIRST_DAY=$(echo "$RESPONSE_BODY" | jq '.days[0]')
  if echo "$FIRST_DAY" | jq -e '.date and .membershipRevenue and .productRevenue and .totalRevenue' > /dev/null; then
    echo "✅ PASS: Response has correct structure (date, membershipRevenue, productRevenue, totalRevenue)"
  else
    echo "❌ FAIL: Response missing required fields"
    exit 1
  fi
  
  # If we see Prisma error in response, fail
  if echo "$RESPONSE_BODY" | jq -e '.message' | grep -qi "column.*does not exist"; then
    echo "❌ FAIL: Prisma SQL error detected (column does not exist)"
    echo "$RESPONSE_BODY"
    exit 1
  fi
  
else
  echo "❌ FAIL: Expected 200, got ${HTTP_CODE}"
  echo "Response: $RESPONSE_BODY"
  exit 1
fi
echo ""

# Test 4: Monthly revenue aggregation
echo "TEST 4: Monthly revenue aggregation (should return 200)"
echo "--------------------------------------------------------"
MONTHLY_RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" \
  -X GET "${API_URL}/reports/revenue?month=${MONTH}&branchId=${BRANCH_ID}" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json")

HTTP_CODE=$(echo "$MONTHLY_RESPONSE" | grep "HTTP_CODE:" | cut -d: -f2)
RESPONSE_BODY=$(echo "$MONTHLY_RESPONSE" | sed '/HTTP_CODE:/d')

if [ "$HTTP_CODE" -eq 200 ]; then
  echo "✅ PASS: Returned 200 OK"
  
  # Validate response structure
  if echo "$RESPONSE_BODY" | jq -e '.membershipRevenue and .productRevenue and .totalRevenue and .locked' > /dev/null; then
    echo "✅ PASS: Response has correct structure"
    
    # Display revenue summary
    MEMBERSHIP=$(echo "$RESPONSE_BODY" | jq -r '.membershipRevenue')
    PRODUCT=$(echo "$RESPONSE_BODY" | jq -r '.productRevenue')
    TOTAL=$(echo "$RESPONSE_BODY" | jq -r '.totalRevenue')
    echo "   Membership Revenue: ${MEMBERSHIP}"
    echo "   Product Revenue: ${PRODUCT}"
    echo "   Total Revenue: ${TOTAL}"
  else
    echo "❌ FAIL: Response missing required fields"
    exit 1
  fi
else
  echo "❌ FAIL: Expected 200, got ${HTTP_CODE}"
  echo "Response: $RESPONSE_BODY"
  exit 1
fi
echo ""

# Test 5: Revenue trend
echo "TEST 5: Revenue trend (should return 200)"
echo "-----------------------------------------"
TREND_RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" \
  -X GET "${API_URL}/reports/revenue/trend?branchId=${BRANCH_ID}&months=3" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json")

HTTP_CODE=$(echo "$TREND_RESPONSE" | grep "HTTP_CODE:" | cut -d: -f2)
RESPONSE_BODY=$(echo "$TREND_RESPONSE" | sed '/HTTP_CODE:/d')

if [ "$HTTP_CODE" -eq 200 ]; then
  echo "✅ PASS: Returned 200 OK"
  
  MONTHS_COUNT=$(echo "$RESPONSE_BODY" | jq '.months | length')
  if [ "$MONTHS_COUNT" -eq 3 ]; then
    echo "✅ PASS: Response has 3 months"
  else
    echo "❌ FAIL: Expected 3 months, got ${MONTHS_COUNT}"
    exit 1
  fi
else
  echo "❌ FAIL: Expected 200, got ${HTTP_CODE}"
  echo "Response: $RESPONSE_BODY"
  exit 1
fi
echo ""

# Test 6: Payment method breakdown
echo "TEST 6: Payment method breakdown (should return 200)"
echo "----------------------------------------------------"
PAYMENT_METHODS_RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" \
  -X GET "${API_URL}/reports/revenue/payment-methods?month=${MONTH}&branchId=${BRANCH_ID}" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json")

HTTP_CODE=$(echo "$PAYMENT_METHODS_RESPONSE" | grep "HTTP_CODE:" | cut -d: -f2)
RESPONSE_BODY=$(echo "$PAYMENT_METHODS_RESPONSE" | sed '/HTTP_CODE:/d')

if [ "$HTTP_CODE" -eq 200 ]; then
  echo "✅ PASS: Returned 200 OK"
  
  if echo "$RESPONSE_BODY" | jq -e '.membershipByMethod and .productSalesByMethod' > /dev/null; then
    echo "✅ PASS: Response has correct structure"
  else
    echo "❌ FAIL: Response missing required fields"
    exit 1
  fi
else
  echo "❌ FAIL: Expected 200, got ${HTTP_CODE}"
  echo "Response: $RESPONSE_BODY"
  exit 1
fi
echo ""

echo "=================================================="
echo "✅ ALL TESTS PASSED"
echo "=================================================="
echo ""
echo "Summary:"
echo "- SQL column names are correct (no Prisma error 42703)"
echo "- Auth guards work properly (401 without token, 200 with token)"
echo "- All reports endpoints return valid responses"
echo ""
