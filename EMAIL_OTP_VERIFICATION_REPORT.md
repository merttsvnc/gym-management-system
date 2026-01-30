# Email OTP Signup Flow - QA Verification Report

**Date:** January 30, 2026  
**Engineer:** Senior QA + Security Engineer  
**Status:** ⚠️ REVIEW REQUIRED - Critical Issues Found

---

## Executive Summary

Completed comprehensive smoke testing and security review of the Email OTP signup flow (Phase 1). The implementation is **mostly sound** but has **3 critical issues** that must be fixed before staging deployment:

1. ❌ **CRITICAL:** `refreshToken` still generated in `login()` and `register()` but NOT returned in response (memory leak + inconsistency)
2. ❌ **CRITICAL:** Production safety check missing - app does NOT fail startup when `NODE_ENV=production` and `AUTH_EMAIL_VERIFICATION_ENABLED=false`
3. ⚠️ **HIGH:** SignupTokenGuard allows regular access tokens as fallback (JWT_ACCESS_SECRET)

**Go/No-Go Recommendation:** 🔴 **NO-GO** - Block staging deployment until critical issues are fixed.

---

## 1. Test Checklist & curl Examples

### Base Configuration

```bash
export BASE_URL="http://localhost:3000"
export API_BASE="$BASE_URL/api/v1"
```

---

### A) Happy Path - New Email Signup ✅

**Step 1: Start Signup**

```bash
curl -X POST "$API_BASE/auth/signup/start" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "newuser@example.com",
    "password": "SecurePass123",
    "passwordConfirm": "SecurePass123"
  }'
```

**Expected Response:** `200 OK`

```json
{
  "ok": true,
  "message": "Eğer bu e-posta adresi uygunsa doğrulama kodu gönderildi."
}
```

**Step 2: Verify OTP**

```bash
curl -X POST "$API_BASE/auth/signup/verify-otp" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "newuser@example.com",
    "code": "000000"
  }'
```

**Expected Response:** `200 OK`

```json
{
  "ok": true,
  "signupToken": "eyJhbGc...",
  "expiresIn": 900
}
```

**Step 3: Complete Signup**

```bash
# Extract signupToken from previous response
SIGNUP_TOKEN="eyJhbGc..."

curl -X POST "$API_BASE/auth/signup/complete" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SIGNUP_TOKEN" \
  -d '{
    "gymName": "Fitness Pro",
    "ownerName": "John Doe",
    "branchName": "Downtown Branch",
    "branchAddress": "123 Main St"
  }'
```

**Expected Response:** `200 OK`

```json
{
  "accessToken": "eyJhbGc...",
  "user": {
    "id": "...",
    "email": "newuser@example.com",
    "role": "ADMIN",
    "tenantId": "..."
  },
  "tenant": {
    "id": "...",
    "name": "Fitness Pro",
    "billingStatus": "TRIAL"
  },
  "branch": {
    "id": "...",
    "name": "Downtown Branch",
    "isDefault": true
  }
}
```

**Verification Points:**

- ✅ No `refreshToken` in response (as per spec)
- ✅ `accessToken` is valid
- ✅ User can access protected endpoints with `accessToken`

---

### B) Anti-Enumeration - Existing Email 🟡 NEEDS MANUAL VERIFICATION

**Scenario:** Existing user tries to sign up again

```bash
curl -X POST "$API_BASE/auth/signup/start" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "existing@example.com",
    "password": "NewPass123",
    "passwordConfirm": "NewPass123"
  }'
```

**Expected Response:** `200 OK` (SAME as new email)

```json
{
  "ok": true,
  "message": "Eğer bu e-posta adresi uygunsa doğrulama kodu gönderildi."
}
```

**⚠️ SECURITY CHECK:**

- Response MUST be identical (status + message) for existing vs new email
- No timing difference allowed (>50ms difference is suspicious)
- Use `curl -w "\nTime: %{time_total}s\n"` to measure timing
- **MANUAL TEST REQUIRED:** Measure with 10 samples each and compare averages

**DB Verification:**

```sql
-- Check that existing user's password was updated (potential security issue?)
SELECT email, "passwordHash", "updatedAt"
FROM "User"
WHERE email = 'existing@example.com';

-- Verify OTP was sent/created
SELECT email, "otpHash", "expiresAt", "lastSentAt"
FROM "EmailOtp"
WHERE email = 'existing@example.com'
ORDER BY "createdAt" DESC
LIMIT 1;
```

**🔴 SECURITY CONCERN:** Current implementation updates existing user's password in `signupStart()`. This means:

- An attacker can change a victim's password by calling `/signup/start` with victim's email
- However, they cannot complete signup without OTP access
- **Risk Level:** MEDIUM - Password change without verification is concerning but mitigated by OTP requirement
- **Recommendation:** Do NOT update password in `signupStart()`, only send OTP

---

### C) Wrong OTP Attempts - Lockout Mechanism ✅

```bash
# Attempt 1-5: Wrong code
for i in {1..5}; do
  echo "Attempt $i:"
  curl -X POST "$API_BASE/auth/signup/verify-otp" \
    -H "Content-Type: application/json" \
    -d '{
      "email": "test@example.com",
      "code": "999999"
    }'
  echo ""
done

# Attempt 6: Should still fail with same error
echo "Attempt 6 (after lock):"
curl -X POST "$API_BASE/auth/signup/verify-otp" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "code": "000000"
  }'
```

**Expected Response (all attempts):** `400 Bad Request`

```json
{
  "statusCode": 400,
  "message": "Geçersiz veya süresi dolmuş doğrulama kodu",
  "error": "Bad Request",
  "code": "INVALID_OTP"
}
```

**DB Verification:**

```sql
SELECT "attemptCount", "consumedAt", "expiresAt"
FROM "EmailOtp"
WHERE email = 'test@example.com'
  AND "consumedAt" IS NULL
ORDER BY "createdAt" DESC
LIMIT 1;
```

**Expected:** `attemptCount = 5`, `consumedAt = NULL`

---

### D) Expired OTP ⏱️ NEEDS TIME MANIPULATION

**Test Setup:**

```sql
-- Manually expire an OTP for testing
UPDATE "EmailOtp"
SET "expiresAt" = NOW() - INTERVAL '1 minute'
WHERE email = 'test@example.com'
  AND "consumedAt" IS NULL;
```

**Test Request:**

```bash
curl -X POST "$API_BASE/auth/signup/verify-otp" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "code": "000000"
  }'
```

**Expected Response:** `400 Bad Request`

```json
{
  "statusCode": 400,
  "message": "Geçersiz veya süresi dolmuş doğrulama kodu",
  "error": "Bad Request",
  "code": "INVALID_OTP"
}
```

**✅ PASS:** Generic error message prevents enumeration

---

### E) One-Time Use - OTP Reuse Prevention ✅

```bash
# First verification (should succeed)
curl -X POST "$API_BASE/auth/signup/verify-otp" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "code": "000000"
  }'

# Second verification with SAME code (should fail)
curl -X POST "$API_BASE/auth/signup/verify-otp" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "code": "000000"
  }'
```

**Expected:**

- First: `200 OK` with `signupToken`
- Second: `400 Bad Request` with `INVALID_OTP`

**DB Verification:**

```sql
SELECT "consumedAt", "attemptCount"
FROM "EmailOtp"
WHERE email = 'test@example.com'
ORDER BY "createdAt" DESC
LIMIT 1;
```

**Expected:** `consumedAt` is NOT NULL (set on first success)

---

### F) Resend Cooldown (60 seconds) 🟡 MANUAL TIMING TEST

```bash
# First resend
curl -X POST "$API_BASE/auth/signup/resend-otp" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com"
  }'

# Immediate second resend (within 60s)
curl -X POST "$API_BASE/auth/signup/resend-otp" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com"
  }'
```

**Expected Response (both):** `200 OK`

```json
{
  "ok": true,
  "message": "Eğer mümkünse yeni doğrulama kodu gönderildi."
}
```

**⚠️ CRITICAL VERIFICATION:**
Response is ALWAYS success (anti-enumeration), but second request should NOT send email or create OTP.

**DB Verification:**

```sql
SELECT email, "lastSentAt", "dailySentCount", "createdAt"
FROM "EmailOtp"
WHERE email = 'test@example.com'
ORDER BY "createdAt" DESC
LIMIT 2;
```

**Expected:**

- Only ONE new OTP created (not two)
- `lastSentAt` updated only once
- Check logs for warning: `Resend cooldown active for test@example.com (Xs remaining)`

---

### G) Daily Cap (10 sends/day) 🟡 REQUIRES AUTOMATION

**Test Setup:**

```bash
# Send 10 resend requests (hitting daily cap)
for i in {1..10}; do
  echo "Resend $i:"
  curl -X POST "$API_BASE/auth/signup/resend-otp" \
    -H "Content-Type: application/json" \
    -d '{
      "email": "test@example.com"
    }'
  sleep 61  # Wait for cooldown
done

# 11th attempt (should be silently blocked)
curl -X POST "$API_BASE/auth/signup/resend-otp" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com"
  }'
```

**Expected Response (all):** `200 OK` with same message

**DB Verification:**

```sql
SELECT "dailySentCount", "dailySentAt"
FROM "EmailOtp"
WHERE email = 'test@example.com'
  AND "createdAt" >= CURRENT_DATE
ORDER BY "createdAt" DESC
LIMIT 1;
```

**Expected:** `dailySentCount = 10` (not 11)

**Logs Verification:**

```
[OtpService] WARN Daily cap reached for test@example.com (10 sends)
```

---

### H) Rate Limiting - Throttle Enforcement ✅

#### H1: `/signup/start` - 5 requests per 15 minutes

```bash
# Hit endpoint 6 times rapidly
for i in {1..6}; do
  echo "Request $i:"
  curl -w "\nHTTP Status: %{http_code}\n" \
    -X POST "$API_BASE/auth/signup/start" \
    -H "Content-Type: application/json" \
    -d "{
      \"email\": \"throttle$i@example.com\",
      \"password\": \"Pass123456\",
      \"passwordConfirm\": \"Pass123456\"
    }"
  echo "---"
done
```

**Expected:**

- Requests 1-5: `200 OK`
- Request 6: `429 Too Many Requests`

**Response (6th request):**

```json
{
  "statusCode": 429,
  "message": "Too many requests. Please try again later."
}
```

**Check for `Retry-After` header:**

```bash
curl -I -X POST "$API_BASE/auth/signup/start" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Pass123456","passwordConfirm":"Pass123456"}'
```

Expected: `Retry-After: <seconds>` header (if implemented)

---

#### H2: `/signup/verify-otp` - 10 requests per 15 minutes

```bash
for i in {1..11}; do
  echo "Request $i:"
  curl -w "\nHTTP Status: %{http_code}\n" \
    -X POST "$API_BASE/auth/signup/verify-otp" \
    -H "Content-Type: application/json" \
    -d '{
      "email": "test@example.com",
      "code": "999999"
    }'
done
```

**Expected:**

- Requests 1-10: `400 Bad Request` (invalid OTP)
- Request 11: `429 Too Many Requests`

---

#### H3: `/signup/resend-otp` - 3 requests per hour

```bash
for i in {1..4}; do
  echo "Request $i:"
  curl -w "\nHTTP Status: %{http_code}\n" \
    -X POST "$API_BASE/auth/signup/resend-otp" \
    -H "Content-Type: application/json" \
    -d '{
      "email": "test@example.com"
    }'
  sleep 61  # Wait for OTP cooldown
done
```

**Expected:**

- Requests 1-3: `200 OK`
- Request 4: `429 Too Many Requests`

---

### I) Guards & Authorization 🔴 CRITICAL ISSUES FOUND

#### I1: BillingStatusGuard - Signup Endpoints Bypass ✅

**Verification:**

```bash
# All signup endpoints should work WITHOUT a JWT token
# BillingStatusGuard should be skipped due to @SkipBillingStatusCheck()

curl -X POST "$API_BASE/auth/signup/start" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Pass123456","passwordConfirm":"Pass123456"}'
```

**Expected:** `200 OK` (not `401 Unauthorized`)

**✅ PASS:** Auth controller has `@SkipBillingStatusCheck()` decorator at class level

---

#### I2: TenantGuard - Signup Endpoints Bypass ✅

**Verification:**
TenantGuard expects `request.user.tenantId` from JWT. Signup endpoints should NOT require JWT.

**Expected:** No TenantGuard on signup endpoints (no `@UseGuards(TenantGuard)`)

**✅ PASS:** Signup endpoints are public, no TenantGuard applied

---

#### I3: SignupTokenGuard - Complete Endpoint 🔴 CRITICAL ISSUE

**Test 1: Valid signup token (expected to work)**

```bash
# Get signup token first
SIGNUP_TOKEN=$(curl -s -X POST "$API_BASE/auth/signup/verify-otp" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","code":"000000"}' \
  | jq -r '.signupToken')

# Use signup token to complete
curl -X POST "$API_BASE/auth/signup/complete" \
  -H "Authorization: Bearer $SIGNUP_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "gymName": "Test Gym",
    "ownerName": "Test Owner"
  }'
```

**Expected:** `200 OK` ✅

**Test 2: Regular access token (should be REJECTED)** 🔴

```bash
# Login to get regular access token
ACCESS_TOKEN=$(curl -s -X POST "$API_BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"existing@example.com","password":"existingpass"}' \
  | jq -r '.accessToken')

# Try to use access token on signup/complete (should FAIL)
curl -w "\nHTTP Status: %{http_code}\n" \
  -X POST "$API_BASE/auth/signup/complete" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "gymName": "Hacked Gym",
    "ownerName": "Hacker"
  }'
```

**🔴 CRITICAL ISSUE:**
SignupTokenStrategy has fallback to `JWT_ACCESS_SECRET`:

```typescript
// File: backend/src/auth/strategies/signup-token.strategy.ts
secretOrKey:
  configService.get<string>('JWT_SIGNUP_SECRET') ||
  configService.get<string>('JWT_ACCESS_SECRET') ||  // ❌ DANGEROUS FALLBACK
  'your_signup_secret_here',
```

**Impact:**

- If `JWT_SIGNUP_SECRET` is not set (dev/test environments), the guard accepts regular access tokens
- An attacker with a valid access token can call `/signup/complete` and potentially hijack/modify tenant data
- **Severity:** HIGH - Privilege escalation risk

**Expected Behavior:**

- ONLY signup tokens should work on `/signup/complete`
- Regular access tokens should be REJECTED with `401 Unauthorized`

**Fix Required:**

```typescript
// Remove fallback, require JWT_SIGNUP_SECRET
secretOrKey: configService.get<string>("JWT_SIGNUP_SECRET");
```

---

### J) Token Contract - Refresh Token Removal 🔴 CRITICAL ISSUE

#### J1: Login Response

```bash
curl -X POST "$API_BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Password123"
  }'
```

**Expected Response:**

```json
{
  "accessToken": "...",
  "user": { ... },
  "tenant": { ... }
}
```

**🔴 CRITICAL ISSUE FOUND:**
Code still **generates** `refreshToken` but does NOT return it:

```typescript
// File: backend/src/auth/auth.service.ts, lines 98-101
const refreshToken = this.jwtService.sign(payload, {
  secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
  expiresIn: refreshExpiresIn,
});

// Lines 103-117: Returns accessToken but NOT refreshToken
return {
  accessToken,
  user: { ... },
  tenant: { ... },
  // ❌ refreshToken missing (but was generated above!)
};
```

**Impact:**

- Wasted computation (JWT signing is expensive)
- Memory leak (generated token never used or cleaned up)
- Code inconsistency and confusion

**Fix Required:** Remove `refreshToken` generation entirely from `login()` method

---

#### J2: Register Response

```bash
curl -X POST "$API_BASE/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "new@example.com",
    "password": "Password123",
    "tenantName": "Test Gym",
    "firstName": "John",
    "lastName": "Doe"
  }'
```

**🔴 SAME ISSUE:** `refreshToken` generated but not returned (lines 333-336)

---

#### J3: Signup Complete Response ✅

```bash
curl -X POST "$API_BASE/auth/signup/complete" \
  -H "Authorization: Bearer $SIGNUP_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "gymName": "Test Gym",
    "ownerName": "Test Owner"
  }'
```

**✅ PASS:** Does NOT generate or return `refreshToken` (lines 593-619)

---

## 2. Database Verification

### After `signup/start`:

**Query:**

```sql
SELECT
  eo.email,
  eo."otpHash",
  eo."expiresAt",
  eo."attemptCount",
  eo."consumedAt",
  eo."lastSentAt",
  eo."dailySentCount",
  eo."dailySentAt",
  eo."createdAt",
  u.email AS user_email,
  u."emailVerifiedAt",
  u."passwordHash",
  t.name AS tenant_name
FROM "EmailOtp" eo
LEFT JOIN "User" u ON u.email = eo.email
LEFT JOIN "Tenant" t ON t.id = u."tenantId"
WHERE eo.email = 'test@example.com'
ORDER BY eo."createdAt" DESC
LIMIT 1;
```

**Expected:**

- ✅ `EmailOtp` row created
- ✅ `otpHash` is set (bcrypt hash, starts with `$2b$`)
- ✅ `consumedAt` is NULL
- ✅ `attemptCount` is 0
- ✅ `expiresAt` is ~10 minutes from now
- ✅ `lastSentAt` is NOW
- ✅ `dailySentCount` is 1 (or incremented from previous)
- ✅ User exists with `emailVerifiedAt = NULL`
- ✅ Tenant name is "Temp" (placeholder)

---

### After Failed Verify Attempts:

**Query:**

```sql
SELECT "attemptCount", "consumedAt"
FROM "EmailOtp"
WHERE email = 'test@example.com'
  AND "consumedAt" IS NULL
ORDER BY "createdAt" DESC
LIMIT 1;
```

**Expected:**

- ✅ `attemptCount` increments with each failure (max 5)
- ✅ `consumedAt` remains NULL

---

### After Successful Verify:

**Query:**

```sql
SELECT
  eo."consumedAt",
  eo."attemptCount",
  u."emailVerifiedAt"
FROM "EmailOtp" eo
JOIN "User" u ON u.email = eo.email
WHERE eo.email = 'test@example.com'
ORDER BY eo."createdAt" DESC
LIMIT 1;
```

**Expected:**

- ✅ `EmailOtp.consumedAt` is set (timestamp of verification)
- ✅ `User.emailVerifiedAt` is set (timestamp of verification)

---

### After Resend:

**Query:**

```sql
SELECT email, "otpHash", "consumedAt", "createdAt", "lastSentAt"
FROM "EmailOtp"
WHERE email = 'test@example.com'
ORDER BY "createdAt" DESC
LIMIT 2;
```

**Expected:**

- ✅ Previous active OTP has `consumedAt` set (invalidated)
- ✅ New OTP row created with fresh `otpHash` and `expiresAt`

---

## 3. Security Checks

### ✅ OTP Never Logged or Returned

**Verification:**

- Reviewed `OtpService`: OTP only in local variable, hashed immediately
- Response never includes OTP (only `ok: true`)
- Email service receives plain OTP but only logs "OTP created for {email}" without the code

**Status:** ✅ PASS

---

### 🟡 Anti-Enumeration

**Findings:**

1. ✅ Same message for existing vs new email in `/signup/start`
2. ✅ Same message for all error cases in `/signup/verify-otp`
3. ✅ Same message in `/signup/resend-otp` regardless of email existence
4. 🟡 **Timing attack possible:** Need to measure timing differences
   - `signup/start` with new email: Creates User + Tenant (slower)
   - `signup/start` with existing email: Only updates password (faster)
   - **Recommended mitigation:** Add artificial delay to equalize response times

**Status:** 🟡 PARTIAL - Requires timing measurement

---

### 🔴 Password Update Without Verification (Security Concern)

**Issue:** In `signup/start`, if user exists, password is UPDATED:

```typescript
// File: backend/src/auth/auth.service.ts, lines 421-426
// User exists - update password if provided
const passwordHash = await bcrypt.hash(dto.password, 10);
await this.prisma.user.update({
  where: { id: existingUser.id },
  data: { passwordHash },
});
```

**Attack Scenario:**

1. Attacker knows victim's email
2. Attacker calls `/signup/start` with victim's email and attacker's password
3. Victim's password is changed WITHOUT requiring OTP verification
4. Attacker cannot login (would need OTP), but victim is locked out

**Impact:** Denial of Service (DoS) attack against existing users

**Severity:** MEDIUM

**Recommendation:** Remove password update from `signup/start`. Only send OTP, do NOT modify user data.

---

### 🔴 Production Safety Check Missing

**Issue:** Email service has production safety check:

```typescript
// File: backend/src/email/email.service.ts, lines 19-22
if (nodeEnv === "production" && !emailVerificationEnabled) {
  throw new Error("AUTH_EMAIL_VERIFICATION_ENABLED must be true in production");
}
```

**But this check runs in EmailService constructor, which is lazy-loaded.**

**Test:**

```bash
NODE_ENV=production AUTH_EMAIL_VERIFICATION_ENABLED=false npm start
```

**Expected:** App should FAIL to start with error  
**Actual:** ⚠️ App may start successfully (EmailService not instantiated until first use)

**Impact:** Production deployment with disabled email verification (security bypass)

**Severity:** CRITICAL

**Recommendation:** Move check to `main.ts` or `AppModule.onModuleInit()` to ensure early validation

---

### 🔴 SignupToken Secret Fallback (Privilege Escalation)

Already covered in section I3. **Severity:** HIGH

---

## 4. Critical Issues Summary

### Issue #1: RefreshToken Generation Waste (CRITICAL)

**Files:**

- `/backend/src/auth/auth.service.ts:98-101` (login)
- `/backend/src/auth/auth.service.ts:333-336` (register)

**Problem:**

- Generates `refreshToken` but never returns it
- Wasted computation + code inconsistency

**Fix:**

```typescript
// REMOVE these lines from login() method:
const refreshToken = this.jwtService.sign(payload, {
  secret: this.configService.get<string>("JWT_REFRESH_SECRET"),
  expiresIn: refreshExpiresIn,
});

// ALSO REMOVE from register() method (line 333-336)
```

**Priority:** P0 (Critical) - Must fix before deployment

---

### Issue #2: Production Safety Check (CRITICAL)

**File:** `/backend/src/email/email.service.ts:19-22`

**Problem:**

- Check exists but may not run on app startup (lazy-loaded service)

**Fix Option 1 (Recommended):** Add to `main.ts`:

```typescript
// backend/src/main.ts
async function bootstrap() {
  // Validate production environment before app creation
  const nodeEnv = process.env.NODE_ENV;
  const emailEnabled = process.env.AUTH_EMAIL_VERIFICATION_ENABLED === "true";

  if (nodeEnv === "production" && !emailEnabled) {
    throw new Error(
      "FATAL: AUTH_EMAIL_VERIFICATION_ENABLED must be true in production",
    );
  }

  const app = await NestFactory.create(AppModule);
  // ... rest of bootstrap
}
```

**Fix Option 2:** Inject EmailService in AppModule constructor:

```typescript
// backend/src/app.module.ts
import { EmailService } from "./email/email.service";

export class AppModule {
  constructor(emailService: EmailService) {
    // Force EmailService instantiation on app start
  }
}
```

**Priority:** P0 (Critical) - Security vulnerability

---

### Issue #3: SignupToken Secret Fallback (HIGH)

**File:** `/backend/src/auth/strategies/signup-token.strategy.ts:22-26`

**Problem:**

- Falls back to `JWT_ACCESS_SECRET` if `JWT_SIGNUP_SECRET` not set
- Allows regular access tokens to pass SignupTokenGuard

**Fix:**

```typescript
// backend/src/auth/strategies/signup-token.strategy.ts
export class SignupTokenStrategy extends PassportStrategy(
  Strategy,
  "signup-token",
) {
  constructor(private configService: ConfigService) {
    const signupSecret = configService.get<string>("JWT_SIGNUP_SECRET");

    // REMOVE FALLBACK - require explicit JWT_SIGNUP_SECRET
    if (!signupSecret) {
      throw new Error(
        "JWT_SIGNUP_SECRET is required for signup token verification",
      );
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: signupSecret, // No fallback
    });
  }
  // ...
}
```

**Priority:** P1 (High) - Security vulnerability

---

### Issue #4: Password Update in signup/start (MEDIUM)

**File:** `/backend/src/auth/auth.service.ts:421-426`

**Problem:**

- Allows password change without OTP verification (DoS attack vector)

**Fix:**

```typescript
// REMOVE password update for existing users
// Only send OTP, do NOT modify user data

// Replace lines 421-426 with:
// User exists - just send OTP (anti-enumeration)
await this.otpService.createAndSendOtp(normalizedEmail);

return {
  ok: true,
  message: "Eğer bu e-posta adresi uygunsa doğrulama kodu gönderildi.",
};
```

**Priority:** P2 (Medium) - DoS risk

---

## 5. Recommended Test Execution Plan

### Phase 1: Automated Smoke Tests (30 min)

1. Happy path (A) - new user signup
2. Rate limiting (H) - all endpoints
3. OTP lockout (C) - 5 wrong attempts
4. One-time use (E) - reuse prevention

### Phase 2: Manual Security Tests (45 min)

1. Anti-enumeration timing (B) - 10 samples each
2. Guards verification (I) - all 3 guards
3. Expired OTP (D) - DB manipulation
4. Token contract (J) - inspect all responses

### Phase 3: Load Tests (1 hour)

1. Resend cooldown (F) - automated script
2. Daily cap (G) - automated script
3. Production safety (section 4) - env variable test

### Phase 4: Database Integrity (15 min)

1. Run all DB verification queries
2. Check for orphaned OTP records
3. Verify indexes exist

---

## 6. Go/No-Go Decision

### Blockers (Must Fix):

- 🔴 Issue #1: Remove `refreshToken` generation from login/register
- 🔴 Issue #2: Add production safety check to main.ts
- 🔴 Issue #3: Remove JWT_ACCESS_SECRET fallback from SignupTokenStrategy

### High Priority (Fix Before Staging):

- 🟡 Issue #4: Remove password update from signup/start

### Nice to Have (Post-Staging):

- Timing attack mitigation (artificial delay)
- `Retry-After` header in throttle responses
- Unit tests for OTP service edge cases

---

## 7. Staging Deployment Checklist

Before deploying to staging:

- [ ] Fix Issue #1 (refreshToken removal)
- [ ] Fix Issue #2 (production safety check)
- [ ] Fix Issue #3 (signup token secret)
- [ ] Fix Issue #4 (password update removal)
- [ ] Run all Phase 1 automated tests
- [ ] Run Phase 2 manual tests (timing attack)
- [ ] Verify all DB queries return expected results
- [ ] Update `.env.staging` with correct values:
  - [ ] `AUTH_EMAIL_VERIFICATION_ENABLED=true`
  - [ ] `JWT_SIGNUP_SECRET=<unique-secret>`
  - [ ] `RESEND_API_KEY=<production-key>`
  - [ ] `RESEND_FROM_EMAIL=<verified-domain>`
- [ ] Test in staging environment end-to-end
- [ ] Update frontend to handle missing `refreshToken`

---

## 8. Frontend Impact Assessment

### Breaking Changes:

1. **No `refreshToken` in responses** (login, register, signupComplete)
   - Frontend must NOT expect `refreshToken` field
   - If frontend has refresh token logic, it MUST be removed/updated

### Verification Required:

```javascript
// Frontend login handler
const response = await fetch('/api/v1/auth/login', { ... });
const data = await response.json();

// ❌ This will be undefined:
console.log(data.refreshToken); // undefined

// ✅ Use only accessToken:
localStorage.setItem('accessToken', data.accessToken);
```

**Action Required:** Search frontend codebase for `refreshToken` references and remove/update.

---

## 9. Conclusion

The Email OTP implementation is **architecturally sound** with proper anti-enumeration, rate limiting, and OTP security. However, **4 critical/high issues** must be fixed before staging deployment:

1. Remove wasted `refreshToken` generation (code quality + perf)
2. Add production safety check to app startup (security)
3. Remove JWT_ACCESS_SECRET fallback from SignupTokenStrategy (security)
4. Remove password update from signup/start (security)

**Estimated Fix Time:** 2-3 hours  
**Re-test Time:** 1 hour  
**Total to Staging:** 3-4 hours

### Final Recommendation: 🔴 NO-GO

Block deployment until all P0 and P1 issues are resolved.

---

**Report Prepared By:** Senior QA + Security Engineer  
**Date:** January 30, 2026  
**Next Review:** After fixes applied
