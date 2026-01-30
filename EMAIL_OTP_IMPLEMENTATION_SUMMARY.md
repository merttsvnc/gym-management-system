# Email OTP Verification Implementation Summary

## Phase 1: Email OTP Verification for Signup

**Status:** ✅ Complete

---

## Files Changed/Added

### Database Schema (Prisma)
- **`backend/prisma/schema.prisma`**
  - Added `emailVerifiedAt DateTime?` to `User` model
  - Created new `EmailOtp` model with all required fields

### Email Service
- **`backend/src/email/email.service.ts`** (NEW)
  - Resend email integration wrapper
  - Turkish email template for OTP
  - Dev/QA bypass support
- **`backend/src/email/email.module.ts`** (NEW)
  - Email module configuration

### OTP Service
- **`backend/src/auth/services/otp.service.ts`** (NEW)
  - OTP generation (6-digit numeric)
  - OTP hashing with bcrypt
  - OTP verification logic
  - Resend cooldown enforcement (60 seconds)
  - Daily cap enforcement (10 sends/day)
  - Attempt count tracking (max 5 attempts)
  - Anti-enumeration support
- **`backend/src/auth/services/otp.service.spec.ts`** (NEW)
  - Unit tests for OTP logic

### Authentication Service
- **`backend/src/auth/auth.service.ts`** (MODIFIED)
  - Added `signupStart()` method
  - Added `signupVerifyOtp()` method
  - Added `signupComplete()` method
  - Added `signupResendOtp()` method
  - Removed `refreshToken` from `login()` response
  - Removed `refreshToken` from `register()` response

### DTOs
- **`backend/src/auth/dto/signup-start.dto.ts`** (NEW)
- **`backend/src/auth/dto/signup-verify-otp.dto.ts`** (NEW)
- **`backend/src/auth/dto/signup-complete.dto.ts`** (NEW)
- **`backend/src/auth/dto/signup-resend-otp.dto.ts`** (NEW)
- **`backend/src/auth/validators/match-constraint.validator.ts`** (NEW)
  - Password confirmation validator

### Authentication Strategy & Guards
- **`backend/src/auth/strategies/signup-token.strategy.ts`** (NEW)
  - Separate JWT strategy for signup completion tokens
- **`backend/src/auth/guards/signup-token.guard.ts`** (NEW)
  - Guard for signup completion endpoint

### Controller
- **`backend/src/auth/auth.controller.ts`** (MODIFIED)
  - Added `POST /api/v1/auth/signup/start` endpoint
  - Added `POST /api/v1/auth/signup/verify-otp` endpoint
  - Added `POST /api/v1/auth/signup/complete` endpoint
  - Added `POST /api/v1/auth/signup/resend-otp` endpoint

### Module Configuration
- **`backend/src/auth/auth.module.ts`** (MODIFIED)
  - Added `EmailModule` import
  - Added `OtpService` provider
  - Added `SignupTokenStrategy` provider

### Environment Variables
- **`backend/.env`** (MODIFIED)
  - Added `AUTH_EMAIL_VERIFICATION_ENABLED`
  - Added `AUTH_OTP_DEV_FIXED_CODE`
  - Added `RESEND_API_KEY`
  - Added `RESEND_FROM_EMAIL`
  - Added `JWT_SIGNUP_SECRET`

---

## Prisma Migration Notes

### Migration Required
Run the following command to create and apply the migration:

```bash
cd backend
npx prisma migrate dev --name add_email_otp_verification
```

### Schema Changes
1. **User Model:**
   - Added `emailVerifiedAt DateTime?` (nullable)

2. **EmailOtp Model (NEW):**
   - `id String @id @default(cuid())`
   - `email String` (indexed)
   - `otpHash String` (hashed, never plain)
   - `expiresAt DateTime` (10 minutes TTL)
   - `attemptCount Int @default(0)` (max 5)
   - `consumedAt DateTime?` (one-time use)
   - `lastSentAt DateTime @default(now())` (resend cooldown)
   - `dailySentCount Int @default(0)` (daily cap tracking)
   - `dailySentAt DateTime?` (daily reset tracking)
   - `createdAt DateTime @default(now())`

### Indexes
- `@@index([email])` on EmailOtp
- `@@index([email, consumedAt])` on EmailOtp
- `@@index([email, expiresAt])` on EmailOtp

---

## API Endpoints

### 1. POST `/api/v1/auth/signup/start`

**Purpose:** Start signup process, create user (if not exists), send OTP

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123",
  "passwordConfirm": "SecurePass123"
}
```

**Response:**
```json
{
  "ok": true,
  "message": "Eğer bu e-posta adresi uygunsa doğrulama kodu gönderildi."
}
```

**Rate Limit:** 5 requests per 15 minutes per IP

**Security:**
- Anti-enumeration: Always returns success (doesn't reveal if email exists)
- Password validation: Min 10 chars, must contain letter and number
- Password confirmation must match

---

### 2. POST `/api/v1/auth/signup/verify-otp`

**Purpose:** Verify OTP code and issue signup completion token

**Request:**
```json
{
  "email": "user@example.com",
  "code": "123456"
}
```

**Response (Success):**
```json
{
  "ok": true,
  "signupToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 900
}
```

**Response (Failure):**
```json
{
  "code": "INVALID_OTP",
  "message": "Geçersiz veya süresi dolmuş doğrulama kodu"
}
```

**Rate Limit:** 10 requests per 15 minutes per IP

**Security:**
- Anti-enumeration: Generic error messages
- Max 5 attempts per OTP (locks after 5 failures)
- OTP expires after 10 minutes
- One-time use (consumed on success)

---

### 3. POST `/api/v1/auth/signup/complete`

**Purpose:** Complete signup by creating tenant/gym and finalizing user

**Authentication:** Requires `signupToken` in Authorization header as Bearer token

**Request:**
```json
{
  "gymName": "FitLife Gym",
  "ownerName": "John Doe",
  "branchName": "Ana Şube",
  "branchAddress": "123 Fitness St"
}
```

**Response:**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "clx123...",
    "email": "user@example.com",
    "role": "ADMIN",
    "tenantId": "clx456..."
  },
  "tenant": {
    "id": "clx456...",
    "name": "FitLife Gym",
    "billingStatus": "TRIAL"
  },
  "branch": {
    "id": "clx789...",
    "name": "Ana Şube",
    "isDefault": true
  }
}
```

**Note:** No `refreshToken` in response (Phase 1 decision)

---

### 4. POST `/api/v1/auth/signup/resend-otp`

**Purpose:** Resend OTP code

**Request:**
```json
{
  "email": "user@example.com"
}
```

**Response:**
```json
{
  "ok": true,
  "message": "Eğer mümkünse yeni doğrulama kodu gönderildi."
}
```

**Rate Limit:** 3 requests per hour per IP

**Security:**
- Anti-enumeration: Always returns success
- Resend cooldown: 60 seconds since last send
- Daily cap: 10 sends per day per email
- Invalidates previous active OTPs

---

## Environment Variables

### Required Variables

```env
# Email OTP Verification
AUTH_EMAIL_VERIFICATION_ENABLED=true
RESEND_API_KEY=re_your_api_key_here
RESEND_FROM_EMAIL=noreply@yourdomain.com

# Signup Token (optional, falls back to JWT_ACCESS_SECRET)
JWT_SIGNUP_SECRET=your_signup_secret_here
```

### Optional Variables (Dev/QA Only)

```env
# Dev/QA Bypass (never enable in production)
AUTH_OTP_DEV_FIXED_CODE=000000
```

### Production Safety

- If `NODE_ENV=production` and `AUTH_EMAIL_VERIFICATION_ENABLED=false`, the application will **throw an error at startup** (prevents accidental disable in production)

---

## Security Features

### 1. Anti-Enumeration
- **signup/start:** Always returns success (doesn't reveal if email exists)
- **verify-otp:** Generic error messages (doesn't reveal if email/OTP exists)
- **resend-otp:** Always returns success

### 2. Rate Limiting (NestJS Throttler)
- **signup/start:** 5 per 15 minutes per IP
- **verify-otp:** 10 per 15 minutes per IP
- **resend-otp:** 3 per hour per IP

### 3. OTP Security
- **Format:** 6-digit numeric
- **TTL:** 10 minutes
- **Storage:** Only hashed (bcrypt), never plain
- **Max Attempts:** 5 per OTP (locks after 5 failures)
- **One-time Use:** Consumed on successful verification

### 4. Resend Protection
- **Cooldown:** 60 seconds between resends
- **Daily Cap:** 10 sends per day per email
- **Previous OTP Invalidation:** New OTP invalidates previous active ones

### 5. Brute-Force Protection
- Attempt count tracking per OTP
- OTP locked after 5 failed attempts
- Rate limiting at IP level

### 6. Logging
- `otp_sent` - OTP created and sent
- `otp_verify_success` - Successful verification
- `otp_verify_failed` - Failed verification (with attempt count)
- `otp_resend` - OTP resent
- `cooldown_hit` - Resend cooldown active
- `daily_cap_hit` - Daily cap reached
- **No sensitive data logged** (no OTP codes, no passwords)

---

## Dev/QA Bypass Mechanism

### Configuration
- Set `AUTH_EMAIL_VERIFICATION_ENABLED=false` in non-production environments
- Optionally set `AUTH_OTP_DEV_FIXED_CODE=000000` for predictable E2E tests

### Behavior
- **Email sending:** Disabled (no Resend API calls)
- **OTP verification:** Accepts fixed code (`000000` or value from `AUTH_OTP_DEV_FIXED_CODE`)
- **Production safety:** Application throws error if disabled in production

### Usage Example
```env
# Development
NODE_ENV=development
AUTH_EMAIL_VERIFICATION_ENABLED=false
AUTH_OTP_DEV_FIXED_CODE=000000
```

---

## Removed Features (Phase 1)

### Refresh Token Removal
- **Removed from:** `POST /api/v1/auth/login` response
- **Removed from:** `POST /api/v1/auth/register` response
- **Removed from:** `POST /api/v1/auth/signup/complete` response

**Note:** Refresh token secrets (`JWT_REFRESH_SECRET`) remain in env for future use, but tokens are no longer issued.

---

## Testing

### Unit Tests
- **File:** `backend/src/auth/services/otp.service.spec.ts`
- **Coverage:**
  - OTP creation and sending
  - Daily cap enforcement
  - Resend cooldown enforcement
  - OTP verification (success/failure)
  - Attempt count increment
  - OTP locking after max attempts
  - Anti-enumeration behavior

### Test Commands
```bash
# Run unit tests
cd backend
npm test otp.service.spec

# Run with coverage
npm test -- --coverage otp.service.spec
```

---

## Follow-Up Tasks for Frontend/Mobile

### 1. Update Signup Flow
- Replace direct `/auth/register` call with new OTP flow:
  1. Call `/auth/signup/start` with email/password
  2. Show OTP input form
  3. Call `/auth/signup/verify-otp` with email/code
  4. Store `signupToken` from response
  5. Call `/auth/signup/complete` with gym details and `signupToken` in Authorization header
  6. Store `accessToken` from response

### 2. Remove Refresh Token Handling
- Remove `refreshToken` from login/register response handling
- Remove refresh token storage
- Remove refresh token refresh logic (if any)

### 3. Error Handling
- Handle `INVALID_OTP` error code
- Show appropriate messages for rate limiting
- Handle resend cooldown (show countdown)

### 4. UI Components Needed
- OTP input component (6 digits)
- Resend OTP button (with cooldown timer)
- Signup completion form (gym name, owner name, branch details)

---

## Migration Checklist

- [ ] Run Prisma migration: `npx prisma migrate dev --name add_email_otp_verification`
- [ ] Set environment variables in production
- [ ] Configure Resend API key
- [ ] Set `RESEND_FROM_EMAIL` to verified domain
- [ ] Test OTP flow in staging
- [ ] Update frontend/mobile to use new signup flow
- [ ] Remove refresh token handling from frontend
- [ ] Deploy backend changes
- [ ] Monitor OTP send rates and errors

---

## Notes

- **Multi-tenant:** Users are created with temporary tenant in `signupStart`, finalized in `signupComplete`
- **Email Language:** All OTP emails are in Turkish
- **Token Expiry:** Signup completion token expires in 15 minutes (900 seconds)
- **Access Token:** Normal access tokens expire in 15 minutes (as configured)
- **No Refresh Endpoint:** Refresh token endpoint not implemented (Phase 1 decision)

---

## Support

For issues or questions:
1. Check logs for OTP-related events
2. Verify Resend API key is valid
3. Check rate limiting isn't blocking legitimate requests
4. Verify environment variables are set correctly
