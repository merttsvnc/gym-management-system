#!/bin/bash

# OTP Dev Mode Verification Commands
# Run these commands to verify the fix works correctly

BASE_URL="http://localhost:3000/api/v1"

echo "======================================"
echo "OTP Dev Mode Fix - Verification Tests"
echo "======================================"
echo ""

# Test 1: Direct OTP verification (no signup/start) - THE FIX
echo "TEST 1: Direct OTP verification with fixed code (without signup/start)"
echo "----------------------------------------------------------------------"
TEST1_EMAIL="direct-test-$(date +%s)@example.com"
echo "Email: $TEST1_EMAIL"
echo "Command:"
echo "curl -X POST $BASE_URL/auth/signup/verify-otp \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{\"email\": \"$TEST1_EMAIL\", \"code\": \"123456\"}'"
echo ""
echo "Executing..."
RESULT1=$(curl -s -w "\nHTTP_CODE:%{http_code}" -X POST "$BASE_URL/auth/signup/verify-otp" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$TEST1_EMAIL\", \"code\": \"123456\"}")

HTTP_CODE1=$(echo "$RESULT1" | grep "HTTP_CODE" | cut -d: -f2)
BODY1=$(echo "$RESULT1" | sed '$d')

echo "HTTP Status: $HTTP_CODE1"
echo "Response: $BODY1"
echo ""

if [ "$HTTP_CODE1" -eq 201 ]; then
  echo "✅ TEST 1 PASSED: Fixed OTP accepted without signup/start"
else
  echo "❌ TEST 1 FAILED: Expected HTTP 201, got $HTTP_CODE1"
fi
echo ""
echo "======================================"
echo ""

# Test 2: Wrong OTP code
echo "TEST 2: Wrong OTP code should fail"
echo "-----------------------------------"
TEST2_EMAIL="wrong-otp-$(date +%s)@example.com"
echo "Email: $TEST2_EMAIL"
echo "Using wrong code: 999999"
echo ""
echo "Executing..."
RESULT2=$(curl -s -w "\nHTTP_CODE:%{http_code}" -X POST "$BASE_URL/auth/signup/verify-otp" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$TEST2_EMAIL\", \"code\": \"999999\"}")

HTTP_CODE2=$(echo "$RESULT2" | grep "HTTP_CODE" | cut -d: -f2)
BODY2=$(echo "$RESULT2" | sed '$d')

echo "HTTP Status: $HTTP_CODE2"
echo "Response: $BODY2"
echo ""

if [ "$HTTP_CODE2" -eq 400 ]; then
  echo "✅ TEST 2 PASSED: Wrong OTP rejected"
else
  echo "❌ TEST 2 FAILED: Expected HTTP 400, got $HTTP_CODE2"
fi
echo ""
echo "======================================"
echo ""

# Test 3: Full flow (signup/start → verify-otp)
echo "TEST 3: Complete flow with signup/start"
echo "----------------------------------------"
TEST3_EMAIL="full-flow-$(date +%s)@example.com"
PASSWORD="Test123456!"
echo "Email: $TEST3_EMAIL"
echo ""

echo "Step 1: POST /auth/signup/start"
START_RESULT=$(curl -s -w "\nHTTP_CODE:%{http_code}" -X POST "$BASE_URL/auth/signup/start" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$TEST3_EMAIL\", \"password\": \"$PASSWORD\", \"passwordConfirm\": \"$PASSWORD\"}")

START_HTTP=$(echo "$START_RESULT" | grep "HTTP_CODE" | cut -d: -f2)
START_BODY=$(echo "$START_RESULT" | sed '$d')

echo "HTTP Status: $START_HTTP"
echo "Response: $START_BODY"
echo ""

if [ "$START_HTTP" -eq 200 ] || [ "$START_HTTP" -eq 201 ]; then
  echo "Step 2: POST /auth/signup/verify-otp"
  VERIFY_RESULT=$(curl -s -w "\nHTTP_CODE:%{http_code}" -X POST "$BASE_URL/auth/signup/verify-otp" \
    -H "Content-Type: application/json" \
    -d "{\"email\": \"$TEST3_EMAIL\", \"code\": \"123456\"}")
  
  VERIFY_HTTP=$(echo "$VERIFY_RESULT" | grep "HTTP_CODE" | cut -d: -f2)
  VERIFY_BODY=$(echo "$VERIFY_RESULT" | sed '$d')
  
  echo "HTTP Status: $VERIFY_HTTP"
  echo "Response: $VERIFY_BODY"
  echo ""
  
  if [ "$VERIFY_HTTP" -eq 201 ]; then
    echo "✅ TEST 3 PASSED: Complete flow works"
  else
    echo "❌ TEST 3 FAILED: Expected HTTP 201, got $VERIFY_HTTP"
  fi
else
  echo "❌ TEST 3 FAILED: signup/start failed with HTTP $START_HTTP"
fi
echo ""
echo "======================================"
echo ""

# Summary
echo "SUMMARY"
echo "-------"
echo "Test 1 (Direct OTP): $([ "$HTTP_CODE1" -eq 201 ] && echo "✅ PASS" || echo "❌ FAIL")"
echo "Test 2 (Wrong OTP): $([ "$HTTP_CODE2" -eq 400 ] && echo "✅ PASS" || echo "❌ FAIL")"
echo "Test 3 (Full Flow): $([ "$VERIFY_HTTP" -eq 201 ] && echo "✅ PASS" || echo "❌ FAIL")"
echo ""
echo "All tests completed!"
