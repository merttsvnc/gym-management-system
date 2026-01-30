# Security Fixes Verification Checklist

**Date:** January 30, 2026  
**Status:** ✅ All fixes applied

## Summary of Fixes

All critical security issues from `EMAIL_OTP_VERIFICATION_REPORT.md` have been fixed:

1. ✅ **P0-1**: Removed refreshToken generation from `login()` and `register()` methods
2. ✅ **P0-2**: Added startup validation in `main.ts` to fail when `NODE_ENV=production` and `AUTH_EMAIL_VERIFICATION_ENABLED=false`
3. ✅ **P1**: Removed `JWT_ACCESS_SECRET` fallback from `SignupTokenStrategy` - now requires `JWT_SIGNUP_SECRET`
4. ✅ **P2**: Fixed `signupStart()` to not update `passwordHash` for existing users (DoS prevention)

---

## Manual Verification Commands

### 1. Production Safety Check (P0-2)

**Test:** App should fail to start when email verification is disabled in production.

```bash
# This should FAIL immediately with error message
cd backend
NODE_ENV=production AUTH_EMAIL_VERIFICATION_ENABLED=false npm start

# Expected output:
# Error: FATAL: AUTH_EMAIL_VERIFICATION_ENABLED must be true in production...
# Process exits with non-zero code
```

**Verification:**
- [ ] Command fails immediately (before NestJS bootstrap completes)
- [ ] Error message clearly states the requirement
- [ ] Process exits with non-zero exit code

**Success Criteria:** App startup is blocked, preventing deployment with insecure configuration.

---

### 2. SignupTokenStrategy Rejects Access Tokens (P1)

**Test:** `/auth/signup/complete` should reject regular access tokens and only accept signup tokens.

```bash
# Step 1: Get a regular access token via login
ACCESS_TOKEN=$(curl -s -X POST "http://localhost:3000/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "existing@example.com",
    "password": "your-password"
  }' | jq -r '.accessToken')

# Step 2: Try to use access token on signup/complete (should FAIL with 401)
curl -w "\nHTTP Status: %{http_code}\n" \
  -X POST "http://localhost:3000/api/v1/auth/signup/complete" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "gymName": "Test Gym",
    "ownerName": "Test Owner"
  }'

# Expected: HTTP Status: 401
# Expected response: UnauthorizedException
```

**Verification:**
- [ ] Regular access token is rejected with 401 Unauthorized
- [ ] Error message indicates invalid token
- [ ] Only signup tokens (from `/auth/signup/verify-otp`) work on `/auth/signup/complete`

**Success Criteria:** SignupTokenStrategy only accepts tokens signed with `JWT_SIGNUP_SECRET`, not `JWT_ACCESS_SECRET`.

---

### 3. signupStart Does Not Update PasswordHash (P2)

**Test:** Calling `/auth/signup/start` with an existing email should NOT change the user's password.

```bash
# Step 1: Create a test user (or use existing)
# Note the current passwordHash from database

# Step 2: Call signup/start with existing email and NEW password
curl -X POST "http://localhost:3000/api/v1/auth/signup/start" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "existing@example.com",
    "password": "NewPassword123",
    "passwordConfirm": "NewPassword123"
  }'

# Step 3: Verify passwordHash in database did NOT change
# Connect to database and check:
psql -d your_database -c "SELECT email, \"passwordHash\", \"updatedAt\" FROM \"User\" WHERE email = 'existing@example.com';"
```

**Verification:**
- [ ] Response returns `ok: true` (anti-enumeration maintained)
- [ ] OTP is sent (check EmailOtp table or logs)
- [ ] User's `passwordHash` in database is UNCHANGED
- [ ] User's `updatedAt` timestamp did NOT change (or changed only due to OTP-related operations, not password update)

**Success Criteria:** Existing users' passwords cannot be changed via `/auth/signup/start` endpoint, preventing DoS attacks.

---

### 4. RefreshToken Not Generated (P0-1)

**Test:** Verify that `login()` and `register()` responses do not include `refreshToken`.

```bash
# Test login endpoint
LOGIN_RESPONSE=$(curl -s -X POST "http://localhost:3000/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }')

echo "$LOGIN_RESPONSE" | jq 'has("refreshToken")'
# Expected: false

echo "$LOGIN_RESPONSE" | jq 'has("accessToken")'
# Expected: true

# Test register endpoint (if available)
REGISTER_RESPONSE=$(curl -s -X POST "http://localhost:3000/api/v1/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "new@example.com",
    "password": "password123",
    "tenantName": "Test Gym",
    "firstName": "John",
    "lastName": "Doe"
  }')

echo "$REGISTER_RESPONSE" | jq 'has("refreshToken")'
# Expected: false

echo "$REGISTER_RESPONSE" | jq 'has("accessToken")'
# Expected: true
```

**Verification:**
- [ ] `login()` response does NOT contain `refreshToken` field
- [ ] `register()` response does NOT contain `refreshToken` field
- [ ] Both responses contain `accessToken` field
- [ ] Response structure matches expected format (user, tenant, branch for register)

**Success Criteria:** No refreshToken generation or return in login/register responses.

---

## Code Verification

### Files Modified

1. **`backend/src/auth/auth.service.ts`**
   - [ ] Removed `refreshToken` generation from `login()` method (lines ~98-101 removed)
   - [ ] Removed `refreshToken` generation from `register()` method (lines ~333-336 removed)
   - [ ] Removed `refreshExpiresIn` config reads where unused
   - [ ] Fixed `signupStart()` to not update `passwordHash` for existing users (lines ~418-424 changed)
   - [ ] Updated `signupVerifyOtp()` to require `JWT_SIGNUP_SECRET` (no fallback)

2. **`backend/src/auth/strategies/signup-token.strategy.ts`**
   - [ ] Removed fallback to `JWT_ACCESS_SECRET`
   - [ ] Added error throw when `JWT_SIGNUP_SECRET` is missing
   - [ ] Constructor validates secret before calling `super()`

3. **`backend/src/main.ts`**
   - [ ] Added production safety check BEFORE `NestFactory.create()`
   - [ ] Check throws fatal error if `NODE_ENV=production` and `AUTH_EMAIL_VERIFICATION_ENABLED !== 'true'`

### Tests Added/Updated

1. **`backend/src/auth/auth.service.spec.ts`**
   - [ ] Updated login tests to assert `refreshToken` is NOT present
   - [ ] Updated login tests to verify only 1 JWT sign call (accessToken only)
   - [ ] Added test for `signupStart()` not updating passwordHash for existing users
   - [ ] Added test for `signupStart()` creating new user correctly

2. **`backend/src/auth/strategies/signup-token.strategy.spec.ts`** (NEW)
   - [ ] Test that constructor throws when `JWT_SIGNUP_SECRET` is missing
   - [ ] Test that constructor does NOT fallback to `JWT_ACCESS_SECRET`
   - [ ] Test that constructor succeeds when `JWT_SIGNUP_SECRET` is set
   - [ ] Test `validate()` method with valid/invalid payloads

3. **`backend/src/main.spec.ts`** (NEW)
   - [ ] Test production safety check logic (manual verification test)

---

## Environment Variables Required

Ensure these are set correctly:

```bash
# Required for signup flow
JWT_SIGNUP_SECRET=<unique-secret-different-from-access-secret>

# Required for production
AUTH_EMAIL_VERIFICATION_ENABLED=true  # Must be 'true' in production

# Standard JWT secrets (already in use)
JWT_ACCESS_SECRET=<your-access-secret>
JWT_REFRESH_SECRET=<your-refresh-secret>  # Still used elsewhere if needed
```

---

## Anti-Enumeration Behavior Verification

**Important:** All fixes maintain anti-enumeration behavior:

- [ ] `/auth/signup/start` returns same response for existing vs new email
- [ ] `/auth/signup/resend-otp` returns same response regardless of email existence
- [ ] `/auth/signup/verify-otp` returns generic error messages

**Test:**
```bash
# Compare responses for existing vs new email
curl -X POST "http://localhost:3000/api/v1/auth/signup/start" \
  -H "Content-Type: application/json" \
  -d '{"email":"existing@example.com","password":"Pass123","passwordConfirm":"Pass123"}'

curl -X POST "http://localhost:3000/api/v1/auth/signup/start" \
  -H "Content-Type: application/json" \
  -d '{"email":"new@example.com","password":"Pass123","passwordConfirm":"Pass123"}'

# Both should return identical responses (status + message)
```

---

## Dev Mode OTP Bypass Verification

**Test:** OTP flow should work with dev fixed code when `AUTH_EMAIL_VERIFICATION_ENABLED=false` in non-production.

```bash
# Set dev mode
export AUTH_EMAIL_VERIFICATION_ENABLED=false
export AUTH_OTP_DEV_FIXED_CODE=000000
export NODE_ENV=development

# Start signup flow
curl -X POST "http://localhost:3000/api/v1/auth/signup/start" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Pass123","passwordConfirm":"Pass123"}'

# Verify OTP with dev code
curl -X POST "http://localhost:3000/api/v1/auth/signup/verify-otp" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","code":"000000"}'

# Should return signupToken
```

**Verification:**
- [ ] Dev fixed code `000000` works when email verification is disabled
- [ ] OTP emails are not sent in dev mode (check logs)
- [ ] Signup flow completes successfully

---

## Summary

✅ **All Critical Issues Fixed**
- P0-1: RefreshToken generation removed
- P0-2: Production safety check added
- P1: SignupTokenStrategy fallback removed
- P2: Password update DoS vector fixed

✅ **Tests Updated**
- Unit tests updated for refreshToken removal
- New tests for SignupTokenStrategy
- New tests for signupStart password update prevention
- Manual verification test for startup validation

✅ **Anti-Enumeration Maintained**
- All security fixes preserve anti-enumeration behavior
- Same responses for existing vs new emails

---

**Next Steps:**
1. Run all manual verification commands above
2. Run test suite: `npm test` in backend directory
3. Deploy to staging environment
4. Re-run verification commands in staging
5. Monitor for any regressions
