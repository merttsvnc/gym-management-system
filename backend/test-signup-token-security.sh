#!/bin/bash

# Test #2: Validate signup/complete REJECTS normal access tokens and ONLY accepts signupToken
# QA Security Test - Senior QA Engineer

set -e

BASE_URL="http://localhost:3000/api/v1"

echo "=================================="
echo "Test #2: Signup Token Security"
echo "=================================="
echo ""

# Step 1: Create fresh random credentials
EMAIL="signup-$(date +%s)@example.com"
PASS="SecurePass123!@#"

echo "Test Credentials:"
echo "  Email: $EMAIL"
echo "  Password: $PASS"
echo ""

# Step 2: Start Signup
echo "Step 2: Starting signup..."
START_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/auth/signup/start" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\",\"passwordConfirm\":\"$PASS\"}")

START_STATUS=$(echo "$START_RESPONSE" | tail -n 1)
START_BODY=$(echo "$START_RESPONSE" | sed '$d')

echo "  Status: $START_STATUS"
echo "  Response: $START_BODY"

if [ "$START_STATUS" != "201" ]; then
  echo "❌ FAIL: Signup start failed with status $START_STATUS"
  exit 1
fi

echo "  ✓ Signup started successfully"
echo ""
sleep 2

# Step 3: Verify OTP with fixed code
echo "Step 3: Verifying OTP..."
VERIFY_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/auth/signup/verify-otp" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"code\":\"123456\"}")

VERIFY_STATUS=$(echo "$VERIFY_RESPONSE" | tail -n 1)
VERIFY_BODY=$(echo "$VERIFY_RESPONSE" | sed '$d')

echo "  Status: $VERIFY_STATUS"
echo "  Response: $VERIFY_BODY"

if [ "$VERIFY_STATUS" != "200" ] && [ "$VERIFY_STATUS" != "201" ]; then
  echo "❌ FAIL: OTP verification failed with status $VERIFY_STATUS"
  exit 1
fi

SIGNUP_TOKEN=$(echo "$VERIFY_BODY" | jq -r '.signupToken // .data.signupToken // empty')

if [ -z "$SIGNUP_TOKEN" ] || [ "$SIGNUP_TOKEN" = "null" ]; then
  echo "❌ FAIL: No signupToken received in OTP verification"
  echo "  Full response: $VERIFY_BODY"
  exit 1
fi

echo "  ✓ OTP verified successfully"
echo "  SignupToken (first 20 chars): ${SIGNUP_TOKEN:0:20}..."
echo ""
sleep 2

# Step 4: Complete signup using signupToken (SHOULD SUCCEED)
echo "Step 4: Completing signup with signupToken..."
COMPLETE_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/auth/signup/complete" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SIGNUP_TOKEN" \
  -d "{\"gymName\":\"Test Gym QA\",\"ownerName\":\"QA Owner\"}")

COMPLETE_STATUS=$(echo "$COMPLETE_RESPONSE" | tail -n 1)
COMPLETE_BODY=$(echo "$COMPLETE_RESPONSE" | sed '$d')

echo "  Status: $COMPLETE_STATUS"
echo "  Response: $COMPLETE_BODY"

if [ "$COMPLETE_STATUS" != "201" ] && [ "$COMPLETE_STATUS" != "200" ]; then
  echo "❌ FAIL: Signup completion with signupToken failed with status $COMPLETE_STATUS"
  exit 1
fi

ACCESS_TOKEN=$(echo "$COMPLETE_BODY" | jq -r '.accessToken // .data.accessToken // .access_token // empty')

if [ -z "$ACCESS_TOKEN" ] || [ "$ACCESS_TOKEN" = "null" ]; then
  echo "❌ FAIL: No accessToken received after signup completion"
  echo "  Full response: $COMPLETE_BODY"
  exit 1
fi

echo "  ✓ Signup completed successfully with signupToken"
echo "  AccessToken (first 20 chars): ${ACCESS_TOKEN:0:20}..."
echo ""
sleep 2

# Step 5: MALICIOUS ATTEMPT - Try to complete signup AGAIN using normal accessToken
echo "Step 5: 🚨 SECURITY TEST - Attempting signup/complete with normal accessToken..."
echo "  (This MUST be rejected)"
MALICIOUS_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/auth/signup/complete" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d "{\"gymName\":\"Malicious Gym\",\"ownerName\":\"Malicious Owner\"}")

MALICIOUS_STATUS=$(echo "$MALICIOUS_RESPONSE" | tail -n 1)
MALICIOUS_BODY=$(echo "$MALICIOUS_RESPONSE" | sed '$d')

echo "  Status: $MALICIOUS_STATUS"
echo "  Response: $MALICIOUS_BODY"
echo ""

# Step 6: Verdict
echo "=================================="
echo "TEST RESULTS"
echo "=================================="
echo ""

echo "Expected Behavior:"
echo "  Step 4 (signupToken):  ✓ Accept (201/200)"
echo "  Step 5 (accessToken):  ✓ Reject (401/403)"
echo ""

echo "Actual Results:"
echo "  Step 4 (signupToken):  Status $COMPLETE_STATUS"
echo "  Step 5 (accessToken):  Status $MALICIOUS_STATUS"
echo ""

# Final validation
if [ "$MALICIOUS_STATUS" = "401" ] || [ "$MALICIOUS_STATUS" = "403" ]; then
  echo "✅ PASS: Normal access tokens are properly REJECTED"
  echo ""
  echo "Security Validation:"
  echo "  ✓ signupToken accepted for signup completion"
  echo "  ✓ accessToken rejected for signup completion"
  echo "  ✓ Endpoint properly validates token type"
  echo ""
  echo "Evidence:"
  echo "  - signupToken result: HTTP $COMPLETE_STATUS (success)"
  echo "  - accessToken result: HTTP $MALICIOUS_STATUS (rejected)"
  exit 0
else
  echo "❌ FAIL: Security vulnerability detected!"
  echo ""
  echo "CRITICAL ISSUE:"
  echo "  The endpoint accepted a normal accessToken for signup completion."
  echo "  This allows authenticated users to create multiple tenants."
  echo ""
  echo "Evidence:"
  echo "  - Expected: 401 or 403"
  echo "  - Actual: $MALICIOUS_STATUS"
  echo "  - Response: $MALICIOUS_BODY"
  exit 1
fi
