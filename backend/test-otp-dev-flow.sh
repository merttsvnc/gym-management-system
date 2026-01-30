#!/bin/bash

# Test OTP flow in dev mode with fixed code
# This script verifies the complete signup flow

set -e

BASE_URL="http://localhost:3000/api/v1"
EMAIL="test-$(date +%s)@example.com"
PASSWORD="Test123456!"
FIXED_OTP="123456"

echo "================================"
echo "Testing OTP Dev Flow"
echo "================================"
echo "Email: $EMAIL"
echo "Fixed OTP: $FIXED_OTP"
echo ""

# Step 1: Start signup (creates user + sends OTP)
echo "Step 1: POST /auth/signup/start"
START_RESPONSE=$(curl -s -X POST "$BASE_URL/auth/signup/start" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$EMAIL\",
    \"password\": \"$PASSWORD\",
    \"passwordConfirm\": \"$PASSWORD\"
  }")

echo "Response: $START_RESPONSE"
echo ""

# Step 2: Verify OTP with fixed code
echo "Step 2: POST /auth/signup/verify-otp"
VERIFY_RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$BASE_URL/auth/signup/verify-otp" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$EMAIL\",
    \"code\": \"$FIXED_OTP\"
  }")

HTTP_STATUS=$(echo "$VERIFY_RESPONSE" | grep "HTTP_STATUS" | cut -d: -f2)
BODY=$(echo "$VERIFY_RESPONSE" | sed '$d')

echo "HTTP Status: $HTTP_STATUS"
echo "Response: $BODY"
echo ""

if [ "$HTTP_STATUS" -eq 200 ] || [ "$HTTP_STATUS" -eq 201 ]; then
  echo "✅ SUCCESS: Fixed OTP accepted in dev mode!"
  
  # Extract signupToken
  SIGNUP_TOKEN=$(echo "$BODY" | grep -o '"signupToken":"[^"]*"' | cut -d'"' -f4)
  
  if [ -n "$SIGNUP_TOKEN" ]; then
    echo "SignupToken received: ${SIGNUP_TOKEN:0:20}..."
    
    # Step 3: Complete signup
    echo ""
    echo "Step 3: POST /auth/signup/complete"
    COMPLETE_RESPONSE=$(curl -s -X POST "$BASE_URL/auth/signup/complete" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $SIGNUP_TOKEN" \
      -d "{
        \"firstName\": \"Test\",
        \"lastName\": \"User\",
        \"tenantName\": \"Test Gym\",
        \"branchName\": \"Main Branch\"
      }")
    
    echo "Response: $COMPLETE_RESPONSE"
    echo ""
    echo "✅ COMPLETE FLOW SUCCESS!"
  fi
else
  echo "❌ FAILED: Fixed OTP NOT accepted in dev mode"
  echo "This means the dev fixed OTP code is not working properly"
fi
